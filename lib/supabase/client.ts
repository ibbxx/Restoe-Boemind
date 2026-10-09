"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { MISSING_ENV_MESSAGE, supabaseEnv } from "../env";

let cached: SupabaseClient | null = null;

/** Browser client — used only for sign-in / sign-out. All data goes through the server. */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  const env = supabaseEnv;
  if (!env) throw new Error(MISSING_ENV_MESSAGE);
  cached = createBrowserClient(env.url, env.anonKey);
  return cached;
}
