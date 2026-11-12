import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_SUPABASE_URL = "https://yarmvjkhxyovtyoecdpi.supabase.co";

function sanitizeEnvValue(val?: string | null): string {
  if (!val) return "";
  return val.replace(/['"\s\r\n]+/g, "").replace(/\/+$/, "");
}

export function getSanitizedBrowserSupabaseUrl(): string {
  const sanitized = sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!sanitized) return FALLBACK_SUPABASE_URL;
  if (sanitized.includes("yarmvjkhyovtyoecdpi")) {
    return FALLBACK_SUPABASE_URL;
  }
  return sanitized;
}

export function getSanitizedBrowserSupabaseAnonKey(): string {
  return sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export const SUPABASE_URL = getSanitizedBrowserSupabaseUrl();
export const SUPABASE_ANON_KEY = getSanitizedBrowserSupabaseAnonKey();

export function isSupabaseConfigured(): boolean {
  const url = getSanitizedBrowserSupabaseUrl();
  const key = getSanitizedBrowserSupabaseAnonKey();
  return Boolean(
    url &&
      key &&
      url.startsWith("http") &&
      !url.includes("your-project-id.supabase.co")
  );
}

export function createClient() {
  return createBrowserClient(
    getSanitizedBrowserSupabaseUrl(),
    getSanitizedBrowserSupabaseAnonKey() || "placeholder-key"
  );
}

export const createBrowserSupabaseClient = createClient;
