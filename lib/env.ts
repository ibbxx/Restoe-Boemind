/**
 * Environment access (single place).
 *
 * Phase 3.5 is deliberately local-first. Supabase remains a later adapter,
 * never a prerequisite for the procurement workflow.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

function read(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const supabaseEnv: SupabaseEnv | null = (() => {
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
})();

export const isSupabaseConfigured = supabaseEnv !== null;

export const isLocalDemoMode: boolean = (() => {
  const val = read("LOCAL_DEMO_MODE") ?? read("NEXT_PUBLIC_LOCAL_DEMO_MODE");
  if (val === "false" || val === "0") return false;
  return val === "true" || val === "1";
})();

export const MISSING_ENV_MESSAGE =
  "Aplikasi belum siap digunakan. Hubungi penanggung jawab aplikasi.";
