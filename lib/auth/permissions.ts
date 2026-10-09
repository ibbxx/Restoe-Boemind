/**
 * Role -> capability matrix.
 *
 * Every entry mirrors a REAL row of supabase/migrations/0002_rls.sql and
 * 0003_protection.sql, which are validated against PostgreSQL by
 * `npm run validate:supabase` (supabase/tests/rls_role_matrix.sql, 47 rows,
 * 0 failures). The UI follows RLS — it never invents a permission, and hiding a
 * button is NEVER the security boundary: the database is (Phase 3 §21).
 *
 * `policy` on each capability names the exact policy/trigger it mirrors so a
 * reviewer can diff UI behaviour against the database without guessing.
 */

import type { AccessLevel, PriceScenario, UserRole } from "../types/domain";

export const ROLES: UserRole[] = ["ADMIN", "PROCUREMENT", "PIC", "VIEWER"];

/** Project access level resolved from role + project_members row. */
export type ProjectAccess = "NONE" | "VIEW" | "EDIT" | "FULL";

export interface Capability {
  id: string;
  label: string;
  /** Roles for which the DATABASE allows the operation globally. */
  allowed: UserRole[];
  policy: string;
}

/**
 * Global (not project-scoped) capabilities. These map 1:1 to the SQL matrix
 * rows that are evaluated without a project context.
 */
export const CAPABILITIES: Record<string, Capability> = {
  create_project: {
    id: "create_project",
    label: "Create project",
    allowed: ["ADMIN", "PROCUREMENT"],
    policy: "projects_insert with check (can_write())",
  },
  delete_project: {
    id: "delete_project",
    label: "Delete project (cascades)",
    allowed: ["ADMIN"],
    policy: "projects_delete using (is_admin())",
  },
  write_master_data: {
    id: "write_master_data",
    label: "Create/update vendors, products, customers, markets",
    allowed: ["ADMIN", "PROCUREMENT"],
    policy: "vendors_write / products_write / customers_write / markets_write using (can_write())",
  },
  write_registry: {
    id: "write_registry",
    label: "Edit Formula Registry / Calculation Templates",
    allowed: ["ADMIN"],
    policy: "formula_registry_write / calculation_templates_write using (is_admin())",
  },
  delete_scenario: {
    id: "delete_scenario",
    label: "Delete scenario",
    allowed: ["ADMIN"],
    policy: "price_scenarios_delete using (is_admin())",
  },
  delete_calculation_result: {
    id: "delete_calculation_result",
    label: "Delete stored calculation result",
    allowed: ["ADMIN"],
    policy: "calculation_results_delete using (is_admin())",
  },
  read_all_projects: {
    id: "read_all_projects",
    label: "Read every project (not only assigned ones)",
    allowed: ["ADMIN", "PROCUREMENT"],
    policy: "has_project_access() -> current_role_name() in ('ADMIN','PROCUREMENT')",
  },
};

/** Does the global capability hold for this role? (Mirrors the SQL matrix.) */
export function can(capabilityId: keyof typeof CAPABILITIES | string, role: UserRole): boolean {
  const cap = CAPABILITIES[capabilityId];
  if (!cap) return false;
  return cap.allowed.includes(role);
}

/**
 * Resolve project access from role + the user's project_members row.
 * Mirrors `has_project_access()` and `can_write_project()`.
 */
export function projectAccess(
  role: UserRole,
  membership: AccessLevel | null | undefined,
): ProjectAccess {
  if (role === "ADMIN") return "FULL";
  if (role === "PROCUREMENT") return "FULL";
  if (membership === "EDIT") return "EDIT";
  if (membership === "VIEW") return "VIEW";
  return "NONE";
}

export function canReadProject(access: ProjectAccess): boolean {
  return access !== "NONE";
}

/** has_project_access() || can_write_project(). */
export function canWriteProject(access: ProjectAccess): boolean {
  return access === "EDIT" || access === "FULL";
}

/**
 * Updating the project row itself. PIC is allowed on a project it is a member
 * of with EDIT (SQL matrix: "PIC | UPDATE project sendiri | ALLOWED").
 * Deleting is a separate, ADMIN-only capability.
 */
export function canUpdateProject(access: ProjectAccess): boolean {
  return canWriteProject(access);
}

/** Scenario mutation is refused once the database locks a scenario. */
export function canEditScenario(access: ProjectAccess, scenario: Pick<PriceScenario, "is_locked">): boolean {
  return canWriteProject(access) && !scenario.is_locked;
}

/**
 * Calculated fields are written ONLY by the calculation engine.
 * The database enforces this with trg_ahs_protect_calculated, so no role — not
 * even ADMIN — may type a calculated value (SQL matrix: DENIED for every role).
 */
export const CALCULATED_FIELDS_EDITABLE_BY_ANY_ROLE = false;

/**
 * history is append-only: UPDATE and DELETE are rejected by
 * trg_history_append_only for every role, including ADMIN. So the UI must not
 * offer an edit/delete affordance at all.
 */
export function canMutateHistory(): boolean {
  return false;
}

export const PROJECT_ACCESS_LABELS: Record<ProjectAccess, string> = {
  NONE: "No access",
  VIEW: "Read only",
  EDIT: "Read + write",
  FULL: "Full access",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrator",
  PROCUREMENT: "Procurement",
  PIC: "PIC",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: "Full access, termasuk Formula Registry dan penghapusan project.",
  PROCUREMENT: "Buat/ubah project dan seluruh data komersial; tidak bisa menghapus project.",
  PIC: "Akses hanya pada project yang di-assign, sesuai access_level (EDIT/VIEW).",
  VIEWER: "Read-only.",
};
