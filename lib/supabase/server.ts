import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { MISSING_ENV_MESSAGE, supabaseEnv } from "../env";

/**
 * Server-side Supabase client (Server Components, Server Actions, Route
 * Handlers). Authentication is Supabase Auth — never a custom implementation
 * (Phase 3 §4).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = supabaseEnv;
  if (!env) throw new Error(MISSING_ENV_MESSAGE);

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (read-only cookie store). The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
