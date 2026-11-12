import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import net from "node:net";
import { cache } from "react";
import { Agent, fetch as undiciFetch } from "undici";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Prioriza IPv4 para evitar fallos DNS / sockets en Node.js y Vercel Serverless
dns.setDefaultResultOrder("ipv4first");

const RETRY_BACKOFF_MS = [150, 400];
const DNS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Resolver DNS explícito usando Cloudflare (1.1.1.1) y Google (8.8.8.8)
// para evitar el resolver local del contenedor en Vercel cuando devuelve ENOTFOUND
const publicDnsResolver = new dnsPromises.Resolver();
publicDnsResolver.setServers(["1.1.1.1", "8.8.8.8"]);

const dnsCache = new Map<string, { address: string; expiresAt: number }>();
const inFlightDnsLookups = new Map<string, Promise<string>>();

async function resolveHostnameIPv4(hostname: string): Promise<string> {
  if (net.isIP(hostname) !== 0) {
    return hostname;
  }

  const now = Date.now();
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    return cached.address;
  }

  const existingLookup = inFlightDnsLookups.get(hostname);
  if (existingLookup) {
    return existingLookup;
  }

  const lookupPromise = (async () => {
    try {
      const addresses = await publicDnsResolver.resolve4(hostname);
      const address = addresses[0];
      if (!address) {
        throw new Error(`No IPv4 A records found for ${hostname}`);
      }
      dnsCache.set(hostname, {
        address,
        expiresAt: Date.now() + DNS_CACHE_TTL_MS,
      });
      return address;
    } catch {
      // Fallback al resolver del sistema si fuera un host local (ej. localhost)
      const fallback = await dnsPromises.lookup(hostname, { family: 4 });
      dnsCache.set(hostname, {
        address: fallback.address,
        expiresAt: Date.now() + DNS_CACHE_TTL_MS,
      });
      return fallback.address;
    } finally {
      inFlightDnsLookups.delete(hostname);
    }
  })();

  inFlightDnsLookups.set(hostname, lookupPromise);
  return lookupPromise;
}

const supabaseAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      resolveHostnameIPv4(hostname)
        .then((address) => {
          if (options && (options as { all?: boolean }).all) {
            (callback as (err: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void)(
              null,
              [{ address, family: 4 }]
            );
          } else {
            callback(null, address, 4);
          }
        })
        .catch((err) => {
          callback(err as NodeJS.ErrnoException, "", 4);
        });
    },
  },
});

/**
 * Fetch personalizado para Supabase en entorno Node.js / Vercel Serverless:
 * - Usa undici Agent con lookup DNS público (1.1.1.1 / 8.8.8.8) y caché IPv4 de 5 min.
 * - Fuerza cache: 'no-store' para evitar respuestas cacheadas obsoletas.
 * - Fuerza Connection: 'close' para evitar reutilizar sockets keep-alive cerrados.
 * - Reintenta hasta 3 veces con backoff escalonado (150ms y 400ms) ante fallos transitorios.
 */
async function safeSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Connection")) {
    headers.set("Connection", "close");
  }

  const targetUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  const requestInit = {
    ...init,
    headers,
    cache: "no-store" as const,
    dispatcher: supabaseAgent,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return (await undiciFetch(targetUrl, requestInit as any)) as unknown as Response;
    } catch (err) {
      lastError = err;
      const causeCode = (err as any)?.cause?.code;
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      const isDnsNotFound = causeCode === "ENOTFOUND" || msg.includes("enotfound");
      const isTransient =
        isDnsNotFound ||
        err instanceof TypeError ||
        msg.includes("fetch failed") ||
        msg.includes("econnreset") ||
        msg.includes("socket") ||
        msg.includes("etimedout");

      const hasMoreAttempts = attempt < RETRY_BACKOFF_MS.length;
      if (!isTransient || !hasMoreAttempts) {
        console.error("[safeSupabaseFetch] Error al ejecutar fetch hacia Supabase:", {
          url: targetUrl,
          attempt: attempt + 1,
          cause: (err as any)?.cause,
          errorDetail: JSON.stringify(err, Object.getOwnPropertyNames(err)),
        });
        throw err;
      }

      if (isDnsNotFound) {
        try {
          const { hostname } = new URL(targetUrl);
          dnsCache.delete(hostname);
          await resolveHostnameIPv4(hostname);
        } catch {
          // Si falla la resolución en reintento, continuar con el backoff
        }
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS[attempt]));
    }
  }

  throw lastError;
}

export function isServerSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      url.startsWith("http") &&
      !url.includes("your-project-id.supabase.co")
  );
}

/**
 * Retorna una única instancia reutilizable de Supabase por petición HTTP (vía React cache).
 */
export const createServerSupabaseClient = cache(async () => {
  let cookieStore: any = null;
  try {
    cookieStore = await cookies();
  } catch {
    // Fuera de contexto de request HTTP
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-key";

  if (!cookieStore) {
    return createSupabaseClient(url, key, {
      global: { fetch: safeSupabaseFetch },
      auth: { persistSession: false },
    }) as any;
  }

  return createServerClient(
    url,
    key,
    {
      global: {
        fetch: safeSupabaseFetch,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored when called from Server Component
          }
        },
      },
    }
  );
});
