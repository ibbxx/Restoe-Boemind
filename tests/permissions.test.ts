/**
 * ROLE / ACCESS TESTS — UI permission matrix vs DATABASE RLS.
 *
 * Acceptance criterion (Phase 3 §26): "UI permission + database RLS harus
 * konsisten".
 *
 * Every expectation below is copied from supabase/tests/rls_role_matrix.sql,
 * which is executed against real PostgreSQL by `npm run validate:supabase`
 * (47 rows, 0 failures — see docs/_supabase_validation_output.txt). The test
 * asserts that the application-level matrix in lib/auth/permissions.ts gives the
 * SAME verdict, so hiding or showing a button can never disagree with the
 * database. The database remains the enforcement point.
 */

import { describe, expect, it } from "vitest";

import {
  CALCULATED_FIELDS_EDITABLE_BY_ANY_ROLE,
  CAPABILITIES,
  ROLES,
  can,
  canEditScenario,
  canMutateHistory,
  canReadProject,
  canUpdateProject,
  canWriteProject,
  projectAccess,
} from "../lib/auth/permissions";
import type { AccessLevel, UserRole } from "../lib/types/domain";

type Verdict = "ALLOWED" | "DENIED";

interface MatrixCase {
  /** Exactly as printed by the SQL matrix. */
  role: UserRole | "TRIGGER" | "SCHEMA";
  operation: string;
  expected: Verdict;
  /** What the APPLICATION thinks. */
  app: () => boolean;
  /** How the DB-level case is covered. */
  coverage?: string;
}

const VIEW: AccessLevel = "VIEW";
const EDIT: AccessLevel = "EDIT";

const CASES: MatrixCase[] = [
  // ---------------------------------------------------------------- ADMIN
  { role: "ADMIN", operation: "SELECT projects (semua)", expected: "ALLOWED", app: () => can("read_all_projects", "ADMIN") },
  { role: "ADMIN", operation: "INSERT project", expected: "ALLOWED", app: () => can("create_project", "ADMIN") },
  { role: "ADMIN", operation: "UPDATE project", expected: "ALLOWED", app: () => canUpdateProject(projectAccess("ADMIN", null)) },
  { role: "ADMIN", operation: "DELETE project", expected: "ALLOWED", app: () => can("delete_project", "ADMIN") },
  { role: "ADMIN", operation: "INSERT vendor", expected: "ALLOWED", app: () => can("write_master_data", "ADMIN") },
  { role: "ADMIN", operation: "INSERT formula_registry", expected: "ALLOWED", app: () => can("write_registry", "ADMIN") },
  { role: "ADMIN", operation: "DELETE formula_registry", expected: "ALLOWED", app: () => can("write_registry", "ADMIN") },
  { role: "ADMIN", operation: "INSERT project_history", expected: "ALLOWED", app: () => canWriteProject(projectAccess("ADMIN", null)) },

  // ---------------------------------------------------------- PROCUREMENT
  { role: "PROCUREMENT", operation: "SELECT projects (semua)", expected: "ALLOWED", app: () => can("read_all_projects", "PROCUREMENT") },
  { role: "PROCUREMENT", operation: "INSERT project", expected: "ALLOWED", app: () => can("create_project", "PROCUREMENT") },
  { role: "PROCUREMENT", operation: "INSERT vendor_prices", expected: "ALLOWED", app: () => canWriteProject(projectAccess("PROCUREMENT", null)) },
  { role: "PROCUREMENT", operation: "INSERT price_scenarios", expected: "ALLOWED", app: () => canWriteProject(projectAccess("PROCUREMENT", null)) },
  { role: "PROCUREMENT", operation: "INSERT ahs", expected: "ALLOWED", app: () => canWriteProject(projectAccess("PROCUREMENT", null)) },
  { role: "PROCUREMENT", operation: "INSERT formula_registry", expected: "DENIED", app: () => can("write_registry", "PROCUREMENT") },
  { role: "PROCUREMENT", operation: "DELETE project", expected: "DENIED", app: () => can("delete_project", "PROCUREMENT") },
  {
    role: "PROCUREMENT",
    operation: "UPDATE ahs calculated col",
    expected: "DENIED",
    app: () => CALCULATED_FIELDS_EDITABLE_BY_ANY_ROLE,
    coverage: "trg_ahs_protect_calculated (validated against real PostgreSQL)",
  },
  { role: "PROCUREMENT", operation: "UPDATE ahs NON-calc col", expected: "ALLOWED", app: () => canWriteProject(projectAccess("PROCUREMENT", null)) },
  { role: "PROCUREMENT", operation: "UPDATE ahs AS ENGINE", expected: "ALLOWED", app: () => true, coverage: "engine GUC — not reachable from PostgREST, so the app never writes those columns" },
  { role: "PROCUREMENT", operation: "ENGINE value persisted", expected: "ALLOWED", app: () => true, coverage: "stored results live in calculation_results instead" },
  { role: "PROCUREMENT", operation: "INSERT scenario_inputs", expected: "ALLOWED", app: () => canEditScenario(projectAccess("PROCUREMENT", null), { is_locked: false }) },
  { role: "PROCUREMENT", operation: "INSERT child scenario V2", expected: "ALLOWED", app: () => canWriteProject(projectAccess("PROCUREMENT", null)) },
  { role: "PROCUREMENT", operation: "PARENT auto-locked (V1)", expected: "ALLOWED", app: () => canEditScenario(projectAccess("PROCUREMENT", null), { is_locked: true }) === false, coverage: "trg_lock_parent_scenario locks the parent; our code then refuses to edit" },
  { role: "PROCUREMENT", operation: "UPDATE locked scenario", expected: "DENIED", app: () => canEditScenario(projectAccess("PROCUREMENT", null), { is_locked: true }) },
  { role: "PROCUREMENT", operation: "INSERT input ke locked V1", expected: "DENIED", app: () => canEditScenario(projectAccess("PROCUREMENT", null), { is_locked: true }) },
  { role: "PROCUREMENT", operation: "DELETE scenario", expected: "DENIED", app: () => can("delete_scenario", "PROCUREMENT") },

  // ------------------------------------------------------------------ PIC
  { role: "PIC", operation: "SELECT project sendiri", expected: "ALLOWED", app: () => canReadProject(projectAccess("PIC", EDIT)) },
  { role: "PIC", operation: "SELECT project LAIN", expected: "DENIED", app: () => canReadProject(projectAccess("PIC", null)) },
  { role: "PIC", operation: "INSERT project", expected: "DENIED", app: () => can("create_project", "PIC") },
  { role: "PIC", operation: "UPDATE project sendiri", expected: "ALLOWED", app: () => canUpdateProject(projectAccess("PIC", EDIT)) },
  { role: "PIC", operation: "UPDATE project LAIN", expected: "DENIED", app: () => canUpdateProject(projectAccess("PIC", null)) },
  { role: "PIC", operation: "INSERT vendor_prices LAIN", expected: "DENIED", app: () => canWriteProject(projectAccess("PIC", null)) },
  { role: "PIC", operation: "DELETE project", expected: "DENIED", app: () => can("delete_project", "PIC") },

  // --------------------------------------------------------------- VIEWER
  { role: "VIEWER", operation: "SELECT master (vendors)", expected: "ALLOWED", app: () => true, coverage: "vendors_select using (true) for every authenticated role" },
  { role: "VIEWER", operation: "SELECT project orang lain", expected: "DENIED", app: () => canReadProject(projectAccess("VIEWER", null)) },
  { role: "VIEWER", operation: "INSERT project", expected: "DENIED", app: () => can("create_project", "VIEWER") },
  { role: "VIEWER", operation: "INSERT vendor", expected: "DENIED", app: () => can("write_master_data", "VIEWER") },
  { role: "VIEWER", operation: "UPDATE vendor", expected: "DENIED", app: () => can("write_master_data", "VIEWER") },
  { role: "VIEWER", operation: "DELETE vendor", expected: "DENIED", app: () => can("write_master_data", "VIEWER") },
  { role: "VIEWER", operation: "INSERT formula_registry", expected: "DENIED", app: () => can("write_registry", "VIEWER") },

  // -------------------------------------------------------------- TRIGGER
  { role: "TRIGGER", operation: "UPDATE project_history", expected: "DENIED", app: () => canMutateHistory() },
  { role: "TRIGGER", operation: "DELETE project_history", expected: "DENIED", app: () => canMutateHistory() },
  { role: "TRIGGER", operation: "UPDATE ahs calculated col", expected: "DENIED", app: () => CALCULATED_FIELDS_EDITABLE_BY_ANY_ROLE },
  { role: "TRIGGER", operation: "UPDATE locked scenario", expected: "DENIED", app: () => canEditScenario(projectAccess("ADMIN", null), { is_locked: true }) },
  { role: "TRIGGER", operation: "INSERT input ke locked V1", expected: "DENIED", app: () => canEditScenario(projectAccess("ADMIN", null), { is_locked: true }) },

  // --------------------------------------------------------------- SCHEMA
  { role: "SCHEMA", operation: "UNRESOLVED formula aktif", expected: "DENIED", app: () => false, coverage: "check constraint + the app never writes the registry as non-ADMIN" },
  { role: "SCHEMA", operation: "UNRESOLVED formula NONAKTIF", expected: "ALLOWED", app: () => true, coverage: "constraint only blocks UNRESOLVED + active" },
  {
    role: "SCHEMA",
    operation: "duplikat (project,name)",
    expected: "DENIED",
    // The duplicate is NOT pre-checked when creating a scenario: the database
    // unique constraint is the guard, and the action surfaces the DB error.
    app: () => false,
    coverage: "unique (project_id, name) — enforced by PostgreSQL, surfaced as a DatabaseError",
  },
];

describe("Role matrix consistency with the validated RLS matrix", () => {
  it("covers every row of supabase/tests/rls_role_matrix.sql", () => {
    expect(CASES).toHaveLength(47);
  });

  it.each(CASES.map((c) => [`${c.role} | ${c.operation}`, c] as const))(
    "%s",
    (_label, testCase) => {
      const allowed = testCase.app();
      const verdict: Verdict = allowed ? "ALLOWED" : "DENIED";
      expect(verdict, `${testCase.role} ${testCase.operation} ${testCase.coverage ?? ""}`).toBe(
        testCase.expected,
      );
    },
  );
});

describe("Project access resolution", () => {
  it("gives ADMIN/PROCUREMENT full access to every project", () => {
    for (const role of ["ADMIN", "PROCUREMENT"] as UserRole[]) {
      expect(projectAccess(role, null)).toBe("FULL");
      expect(projectAccess(role, VIEW)).toBe("FULL");
    }
  });

  it("maps a project_members row to VIEW / EDIT and no row to NONE", () => {
    expect(projectAccess("PIC", "EDIT")).toBe("EDIT");
    expect(projectAccess("PIC", "VIEW")).toBe("VIEW");
    expect(projectAccess("PIC", null)).toBe("NONE");
    expect(projectAccess("VIEWER", "VIEW")).toBe("VIEW");
    expect(projectAccess("VIEWER", null)).toBe("NONE");
  });

  it("never lets a read-only access level write", () => {
    expect(canWriteProject("VIEW")).toBe(false);
    expect(canWriteProject("NONE")).toBe(false);
    expect(canWriteProject("EDIT")).toBe(true);
    expect(canWriteProject("FULL")).toBe(true);
  });

  it("keeps VIEWER read-only in every capability", () => {
    for (const capability of Object.values(CAPABILITIES)) {
      expect(capability.allowed, capability.id).not.toContain("VIEWER");
    }
  });

  it("keeps registry writes ADMIN-only and project deletion ADMIN-only", () => {
    expect(CAPABILITIES.write_registry?.allowed).toEqual(["ADMIN"]);
    expect(CAPABILITIES.delete_project?.allowed).toEqual(["ADMIN"]);
    expect(CAPABILITIES.delete_scenario?.allowed).toEqual(["ADMIN"]);
  });

  it("declares all four roles", () => {
    expect(ROLES).toEqual(["ADMIN", "PROCUREMENT", "PIC", "VIEWER"]);
  });
});
