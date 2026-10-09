// @vitest-environment jsdom

/**
 * Project history regression tests.
 *
 * Bug: `/projects/[id]/history` crashed with "Objects are not valid as a React
 * child (found: object with keys {name})". Older local stores wrote
 * `project_history` rows with `change_type` / `table_name` / `record_id` /
 * `created_at` and stored `new_value` as a JSON OBJECT, which the service passed
 * straight to React.
 *
 * These tests reproduce that stored shape and assert the view layer only ever
 * hands strings to the renderer.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { createProject } from "../lib/services/projects";
import {
  formatHistoryValue,
  historyEntityLabel,
  listProjectHistory,
  toDisplayText,
} from "../lib/services/history";
import { HistoryTable } from "../components/history/history-table";
import { actor, makeDb, UUIDS } from "./helpers/db";

const PROC = actor("PROCUREMENT", UUIDS.procurement);
const LEGACY_PROJECT_NAME = "Pengadaan HSD Cianjur — PT Cikondang Kencana Prima";
const LEGACY_CREATED_AT = "2026-10-07T00:00:00.000Z";

async function seedLegacyHistoryRow() {
  const db = makeDb();
  const project = await createProject(db, PROC, {
    code: "HIST-1",
    name: "Pengadaan HSD Cianjur",
    status: "ACTIVE",
  });
  if (!project.ok) throw new Error(project.error);

  // Exactly what older local/demo stores wrote — object value, legacy columns.
  await db.insert("project_history", {
    id: "hist-legacy-1",
    project_id: project.data.id,
    changed_by: UUIDS.procurement,
    change_type: "CREATE_PROJECT",
    table_name: "projects",
    record_id: project.data.id,
    old_value: null,
    new_value: { name: LEGACY_PROJECT_NAME },
    reason: "Initial project setup in Local MVP Mode",
    created_at: LEGACY_CREATED_AT,
  });

  return { db, projectId: project.data.id };
}

describe("History rows are normalised before they reach React", () => {
  it("turns a legacy object value into a display string and maps legacy columns", async () => {
    const { db, projectId } = await seedLegacyHistoryRow();
    const history = await listProjectHistory(db, PROC, projectId);
    expect(history.ok).toBe(true);
    if (!history.ok) return;

    const legacy = history.data.rows.find((row) => row.id === "hist-legacy-1");
    expect(legacy).toBeDefined();
    if (!legacy) return;

    expect(typeof legacy.new_value).toBe("string");
    expect(legacy.new_value).toBe(LEGACY_PROJECT_NAME);
    expect(legacy.old_value).toBeNull();
    expect(legacy.action).toBe("CREATE_PROJECT");
    expect(legacy.entity).toBe("projects");
    expect(historyEntityLabel(legacy.entity)).toBe("Project");
    expect(legacy.changed_at).toBe(LEGACY_CREATED_AT);

    // Every cell the table renders must be safe for React.
    for (const value of [
      legacy.changed_at,
      legacy.changed_by_name,
      legacy.action,
      legacy.entity,
      legacy.reason ?? "",
      legacy.new_value,
    ]) {
      expect(typeof value).toBe("string");
    }
  });

  it("renders the history table (legacy row) without throwing", async () => {
    const { db, projectId } = await seedLegacyHistoryRow();
    const history = await listProjectHistory(db, PROC, projectId);
    if (!history.ok) throw new Error(history.error);

    render(<HistoryTable rows={history.data.rows} />);

    expect(screen.getByText(LEGACY_PROJECT_NAME)).toBeTruthy();
    expect(screen.getAllByText("Project").length).toBeGreaterThan(0);

    const body = document.body.textContent ?? "";
    expect(body).not.toContain("[object Object]");
    expect(body).not.toContain("Objects are not valid as a React child");
  });

  it("formatHistoryValue / toDisplayText never return a non-primitive", () => {
    expect(formatHistoryValue({ name: "X" })).toBe("X");
    expect(formatHistoryValue("16396.39")).toBe("16.396,39");
    expect(formatHistoryValue(null)).toBe("—");
    expect(formatHistoryValue({ full_name: "Procurement Lead" })).toBe(
      JSON.stringify({ full_name: "Procurement Lead" }),
    );

    expect(toDisplayText({ label: "Y" })).toBe("Y");
    expect(toDisplayText(42)).toBe("42");
    expect(toDisplayText("")).toBeNull();
    expect(toDisplayText(undefined)).toBeNull();
  });
});
