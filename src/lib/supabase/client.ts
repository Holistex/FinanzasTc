import { createBrowserClient } from "@supabase/ssr";

const CORRECT_SUPABASE_URL = "https://yarmvjkhxyovtyoecdpi.supabase.co";

function getNormalizedBrowserSupabaseUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return undefined;
  return raw.includes("yarmvjkhyovtyoecdpi") ? CORRECT_SUPABASE_URL : raw;
}

export function isSupabaseConfigured(): boolean {
  const url = getNormalizedBrowserSupabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      url.startsWith("http") &&
      !url.includes("your-project-id.supabase.co")
  );
}

export function createClient() {
  return createBrowserClient(
    getNormalizedBrowserSupabaseUrl() || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
  );
}

export const createBrowserSupabaseClient = createClient;
