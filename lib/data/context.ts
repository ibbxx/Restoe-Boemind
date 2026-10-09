import { getActor, DEMO_ACTOR, type Actor } from "../auth/session";
import { isLocalDemoMode, MISSING_ENV_MESSAGE, supabaseEnv } from "../env";
import { createSupabaseDatabase } from "./supabase-db";
import { getLocalDatabase } from "./local-db";
import { createSupabaseServerClient } from "../supabase/server";
import type { Database } from "./db";
import { err, type ActionErr } from "../services/result";

import { createRepositories, type Repositories } from "./repositories";

export interface RequestContext {
  db: Database;
  actor: Actor;
  repositories: Repositories;
}

export type RequestContextResult = RequestContext | ActionErr;

/**
 * Resolve the actor AND the database for a server render or a server action.
 *
 * In LOCAL_DEMO_MODE, it uses the local persistent database without Supabase.
 * Otherwise, the actor is re-read from Supabase Auth and queries run through PostgREST.
 */
export async function requestContext(): Promise<RequestContextResult> {
  if (isLocalDemoMode) {
    const actor = (await getActor()) ?? DEMO_ACTOR;
    const db = getLocalDatabase();
    return { db, actor, repositories: createRepositories(db) };
  }

  if (!supabaseEnv) {
    return err(MISSING_ENV_MESSAGE, { errorCode: "DATABASE_ERROR" });
  }
  const actor = await getActor();
  if (!actor) {
    return err("Sesi Anda sudah berakhir. Silakan login kembali.", { errorCode: "FORBIDDEN" });
  }
  const client = await createSupabaseServerClient();
  const db = createSupabaseDatabase(client);
  return { db, actor, repositories: createRepositories(db) };
}

export function isContextError(value: RequestContextResult): value is ActionErr {
  return "ok" in value && value.ok === false;
}
