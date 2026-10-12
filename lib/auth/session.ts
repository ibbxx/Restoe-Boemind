import { redirect } from "next/navigation";

import { isLocalDemoMode, supabaseEnv } from "../env";
import { createSupabaseServerClient } from "../supabase/server";
import type { UserRole } from "../types/domain";

export interface Actor {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  /**
   * True when auth.users has a session but `profiles` has no row. The database
   * coerces such a user to VIEWER (see current_role_name()), and without a
   * project_members row it can read nothing — the UI states this explicitly
   * instead of pretending the user has access.
   */
  profileMissing: boolean;
  isActive: boolean;
}

export const DEMO_ACTOR: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "procurement@demo.local",
  full_name: "Tim Procurement",
  role: "ADMIN",
  profileMissing: false,
  isActive: true,
};

/**
 * Resolve the current actor from the Supabase session. Returns null when there
 * is no session OR when Supabase is not configured.
 */
export async function getActor(): Promise<Actor | null> {
  if (isLocalDemoMode) return DEMO_ACTOR;
  if (!supabaseEnv) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return {
      id: user.id,
      email: user.email ?? "",
      full_name: null,
      role: "VIEWER",
      profileMissing: true,
      isActive: false,
    };
  }

  const row = profile as {
    id: string;
    email: string;
    full_name: string | null;
    role: UserRole;
    is_active: boolean;
  };

  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    profileMissing: false,
    isActive: row.is_active,
  };
}

/** Same as getActor() but sends unauthenticated visitors to /login. */
export async function requireActor(nextPath?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return actor;
}
