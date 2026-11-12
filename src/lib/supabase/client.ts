import { createBrowserClient } from "@supabase/ssr";

const REAL_SUPABASE_DOMAIN = "yarmvjkhxyovtyoecdpi.supabase.co";
const FALLBACK_SUPABASE_URL = `https://${REAL_SUPABASE_DOMAIN}`;

function sanitizeEnvValue(val?: string | null): string {
  if (!val) return "";
  return val.replace(/['"\s\r\n]+/g, "").replace(/\/+$/, "");
}

function normalizeSupabaseDomain(input: string): string {
  return input
    .replace("yarmvjkhyxovtyoecdpi.supabase.co", REAL_SUPABASE_DOMAIN)
    .replace("yarmvkhyxovtyoecdpi.supabase.co", REAL_SUPABASE_DOMAIN)
    .replace("yarmvjkhyovtyoecdpi.supabase.co", REAL_SUPABASE_DOMAIN)
    .replace("yarmvkhyovtyoecdpi.supabase.co", REAL_SUPABASE_DOMAIN);
}

export function getSanitizedBrowserSupabaseUrl(): string {
  const sanitized = sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!sanitized) return FALLBACK_SUPABASE_URL;
  return normalizeSupabaseDomain(sanitized);
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
