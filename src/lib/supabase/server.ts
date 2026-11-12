import dns from "node:dns";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Prioriza IPv4 para evitar fallos DNS / sockets en Node.js y Vercel Serverless
dns.setDefaultResultOrder("ipv4first");

const RETRY_BACKOFF_MS = [150, 400];

/**
 * Fetch personalizado para Supabase en entorno Node.js / Vercel Serverless:
 * - Fuerza cache: 'no-store' para evitar respuestas cacheadas obsoletas.
 * - Fuerza Connection: 'close' para evitar reutilizar sockets keep-alive cerrados.
 * - Ante getaddrinfo ENOTFOUND o fallos transitorios de red/socket, realiza
 *   lookup IPv4 explícito con dns.promises.lookup y reintenta hasta 3 veces
 *   con backoff escalonado (150ms y 400ms).
 */
async function safeSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Connection")) {
    headers.set("Connection", "close");
  }

  const requestInit: RequestInit = {
    ...init,
    headers,
    cache: "no-store",
  };

  const targetUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return await fetch(input, requestInit);
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
          await dns.promises.lookup(hostname, { family: 4 });
        } catch {
          // Si el warm-up DNS falla, continuar con el backoff antes del reintento
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
