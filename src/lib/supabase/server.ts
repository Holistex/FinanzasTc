import dns from "node:dns";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Priorizar resolución IPv4 en Node.js (evita ENOTFOUND por IPv6 no ruteable en contenedores)
try {
  dns.setDefaultResultOrder?.("ipv4first");
} catch {
  // Ignore si no está soportado
}

const RETRY_BACKOFF_MS = [150, 400];
const FALLBACK_SUPABASE_URL = "https://yarmvjkhxyovtyoecdpi.supabase.co";

function sanitizeEnvValue(val?: string | null): string {
  if (!val) return "";
  return val.replace(/['"\s\r\n]+/g, "").replace(/\/+$/, "");
}

export function getSanitizedSupabaseUrl(): string {
  const sanitized = sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!sanitized) return FALLBACK_SUPABASE_URL;

  // Corrección si falta la letra 'x' o hay un error tipográfico en el subdominio
  if (sanitized.includes("yarmvjkhyovtyoecdpi")) {
    return FALLBACK_SUPABASE_URL;
  }
  return sanitized;
}

export function getSanitizedSupabaseAnonKey(): string {
  return sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSanitizedSupabaseServiceRoleKey(): string {
  return sanitizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export const SUPABASE_URL = getSanitizedSupabaseUrl();
export const SUPABASE_ANON_KEY = getSanitizedSupabaseAnonKey();

/**
 * Fetch personalizado para Supabase en entorno Node.js / Vercel Serverless:
 * - Sanitiza y valida la URL de destino para prevenir ENOTFOUND por caracteres espurios.
 * - Usa el fetch nativo de Node.js con cache: 'no-store'.
 * - Reintenta ante errores de red transitorios con backoff escalonado.
 */
async function safeSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let targetUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  // Sanitizar URL ante comillas, espacios o caracteres de escape accidentales
  targetUrl = targetUrl.trim().replace(/['"\r\n]+/g, "");
  if (targetUrl.includes("yarmvjkhyovtyoecdpi.supabase.co")) {
    targetUrl = targetUrl.replace(
      "yarmvjkhyovtyoecdpi.supabase.co",
      "yarmvjkhxyovtyoecdpi.supabase.co"
    );
  }

  const requestInit: RequestInit = {
    ...init,
    cache: "no-store",
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return await fetch(targetUrl, requestInit);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      const isTransient =
        err instanceof TypeError ||
        msg.includes("fetch failed") ||
        msg.includes("enotfound") ||
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
  const url = getSanitizedSupabaseUrl();
  const key =
    getSanitizedSupabaseServiceRoleKey() ||
    getSanitizedSupabaseAnonKey();
  return Boolean(
    url &&
      key &&
      url.startsWith("http") &&
      !url.includes("placeholder.supabase.co") &&
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

  const url = getSanitizedSupabaseUrl();
  const serviceRoleKey = getSanitizedSupabaseServiceRoleKey();
  const key =
    serviceRoleKey ||
    getSanitizedSupabaseAnonKey() ||
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
