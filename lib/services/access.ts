/**
 * Project access resolution — the application-level mirror of
 * `has_project_access()` / `can_write_project()` (supabase/migrations/0002_rls.sql).
 *
 * This is NOT the security boundary. It exists so the UI can render the correct
 * state (hide/label actions) and so a server action fails fast with a clear
 * message. The database still refuses the write if the matrix here ever drifts.
 */

import { projectAccess, type ProjectAccess } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Database } from "../data/db";
import { eq } from "../data/db";
import type { AccessLevel, Project } from "../types/domain";
import { notFound, type ActionErr } from "./result";

export interface ProjectContext {
  project: Project;
  access: ProjectAccess;
}

export async function resolveProjectAccess(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ProjectAccess> {
  if (actor.role === "ADMIN" || actor.role === "PROCUREMENT") return "FULL";

  const { rows } = await db.select<{ access_level: AccessLevel }>("project_members", {
    where: [eq("project_id", projectId), eq("profile_id", actor.id)],
    limit: 1,
  });
  const membership = rows[0]?.access_level ?? null;
  return projectAccess(actor.role, membership);
}

/** Loads the project row plus the caller's access level, or a NOT_FOUND error. */
export async function loadProjectContext(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ProjectContext | ActionErr> {
  const { rows } = await db.select<Project>("projects", {
    where: [eq("id", projectId)],
    limit: 1,
  });
  const project = rows[0];
  if (!project) return notFound("Project");

  const access = await resolveProjectAccess(db, actor, projectId);
  if (access === "NONE") return notFound("Project");

  return { project, access };
}

export function isActionErr(value: unknown): value is ActionErr {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    (value as { ok: unknown }).ok === false
  );
}
