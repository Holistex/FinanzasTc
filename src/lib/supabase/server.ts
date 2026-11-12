import dns from "node:dns";
import net from "node:net";
import { cache } from "react";
import { Agent, fetch as undiciFetch } from "undici";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const RETRY_BACKOFF_MS = [150, 400];
const SUPABASE_ANYCAST_IPV4 = "104.18.38.10";
const DEFAULT_SUPABASE_HOST = "yarmvjkhyovtyoecdpi.supabase.co";

const SUPABASE_HOST = (() => {
  try {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (rawUrl) {
      const host = new URL(rawUrl).hostname;
      if (host.endsWith(".supabase.co")) {
        return host;
      }
    }
  } catch {
    // Fallback al host por defecto
  }
  return DEFAULT_SUPABASE_HOST;
})();

function replyLookup(
  address: string,
  family: number,
  options: { all?: boolean } | undefined,
  callback: (...args: any[]) => void
) {
  if (options?.all) {
    callback(null, [{ address, family }]);
  } else {
    callback(null, address, family);
  }
}

// Cloudflare requiere el dominio original en el handshake TLS (servername / SNI)
// y en la cabecera HTTP Host cuando se resuelve directamente hacia la IP Anycast 104.18.38.10.
const supabaseAgent = new Agent({
  connect: {
    servername: SUPABASE_HOST,
    lookup: (hostname, options, callback) => {
      if (hostname.endsWith(".supabase.co")) {
        replyLookup(SUPABASE_ANYCAST_IPV4, 4, options, callback);
        return;
      }

      const ipFamily = net.isIP(hostname);
      if (ipFamily !== 0) {
        replyLookup(hostname, ipFamily, options, callback);
        return;
      }

      if (hostname === "localhost") {
        replyLookup("127.0.0.1", 4, options, callback);
        return;
      }

      dns.lookup(hostname, options, callback);
    },
  },
});

/**
 * Fetch personalizado para Supabase en entorno Node.js / Vercel Serverless:
 * - Usa undici Agent con resolución estática IPv4 Anycast para *.supabase.co (0 consultas DNS)
 *   y servername TLS/SNI explícito.
 * - Fuerza cabecera Host hacia el proyecto Supabase para evitar "Project not specified".
 * - Fuerza cache: 'no-store' y Connection: 'close'.
 * - Reintenta hasta 3 veces con backoff escalonado (150ms y 400ms) ante fallos transitorios.
 */
async function safeSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const targetUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  const headers = new Headers(init?.headers);
  if (!headers.has("Connection")) {
    headers.set("Connection", "close");
  }

  let effectiveHost = SUPABASE_HOST;
  try {
    const parsedHost = new URL(targetUrl).hostname;
    if (parsedHost.endsWith(".supabase.co")) {
      effectiveHost = parsedHost;
    }
  } catch {
    // Mantener SUPABASE_HOST
  }
  headers.set("Host", effectiveHost);

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
      const isTransient =
        causeCode === "ENOTFOUND" ||
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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key =
    serviceRoleKey ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-key";

  // Si existe SUPABASE_SERVICE_ROLE_KEY o no hay contexto de cookies, usar cliente directo
  // sin @supabase/ssr para evitar que cookies anónimas/expiradas activen restricciones RLS.
  if (serviceRoleKey || !cookieStore) {
    return createSupabaseClient(url, key, {
      global: { fetch: safeSupabaseFetch },
      auth: { persistSession: false, autoRefreshToken: false },
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
