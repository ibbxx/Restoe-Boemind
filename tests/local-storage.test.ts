import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
import { createSqliteDatabase } from "../lib/data/sqlite-db";
import { buildFixtureSeed } from "../lib/data/local-db";
import type { Database } from "../lib/data/db";
import { createProject } from "../lib/services/projects";
import { DEMO_ACTOR } from "../lib/auth/session";
import { loadProjectEditor } from "../lib/services/editor";
import { saveUniverWorkbook } from "../lib/services/sheets";
import { bindingPosition, writeBoundValue } from "../lib/workbook/bindings";

const opened: Database[] = [];
afterEach(async () => { for (const db of opened.splice(0)) await db.close?.(); });
async function newDb() {
  const dir = await mkdtemp(join(tmpdir(), "project-storage-"));
  const db = createSqliteDatabase({ path: join(dir, "store.sqlite"), backupDir: join(dir, "backups"), seed: buildFixtureSeed() });
  opened.push(db);
  return { db, dir };
}

describe("local project storage", () => {
  it("persists volume and arbitrary workbook cells with revision checks", async () => {
    const { db } = await newDb();
    const created = await createProject(db, DEMO_ACTOR, { name: "Project", status: "ACTIVE", volume: 250 });
    expect(created.ok).toBe(true); if (!created.ok) return;
    const editor = await loadProjectEditor(db, DEMO_ACTOR, created.data.id);
    expect(editor.ok).toBe(true); if (!editor.ok) return;
    const snapshot = editor.data.univerWorkbook;
    expect(bindingPosition(snapshot, "ahs.volume")).toMatchObject({ sheetId: "ahs", row: 9, col: 13 });
    const sheet = (snapshot.sheets as Record<string, { cellData: Record<number, Record<number, { v: unknown }>> }>).ahs;
    sheet!.cellData[12] = { ...sheet!.cellData[12], 9: { v: "custom data" } };
    writeBoundValue(snapshot, "project.volume", 300);
    const saved = await saveUniverWorkbook(db, DEMO_ACTOR, created.data.id, snapshot, { baseRevision: 0, mutationId: "one" });
    expect(saved.ok).toBe(true);
    const repeated = await saveUniverWorkbook(db, DEMO_ACTOR, created.data.id, snapshot, { baseRevision: 0, mutationId: "one" });
    expect(repeated).toEqual(saved);
    const conflict = await saveUniverWorkbook(db, DEMO_ACTOR, created.data.id, snapshot, { baseRevision: 0, mutationId: "two" });
    expect(conflict.ok).toBe(false);
    const row = (await db.select<{ volume: number }>("projects", { where: [{ column: "id", op: "eq", value: created.data.id }] })).rows[0]!;
    expect(row.volume).toBe(300);
    const reloaded = await loadProjectEditor(db, DEMO_ACTOR, created.data.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect((reloaded.data.univerWorkbook.sheets as typeof snapshot.sheets as Record<string, {cellData: Record<number, Record<number, {v: unknown}>>}>).ahs!.cellData[12]![9]!.v).toBe("custom data");
  }, 15000);

  it("backs up and migrates old AHS rows while preserving supplier and custom cells", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ahs-removal-"));
    const path = join(dir, "store.sqlite");
    const old = new DatabaseSync(path);
    old.exec("CREATE TABLE projects (id TEXT PRIMARY KEY,code TEXT,name TEXT,active_ahs_id TEXT,volume REAL,updated_at TEXT,_extra TEXT); CREATE TABLE ahs (id TEXT PRIMARY KEY,project_id TEXT,volume REAL,created_at TEXT,updated_at TEXT); CREATE TABLE ahs_cost_items (id TEXT PRIMARY KEY,ahs_id TEXT); CREATE TABLE project_sheets (id TEXT PRIMARY KEY,project_id TEXT,doc TEXT,revision INTEGER,updated_at TEXT); INSERT INTO projects VALUES ('p','OLD','Old project','a',NULL,'2026-01-01','{}'); INSERT INTO ahs VALUES ('a','p',420,'2026-01-01','2026-01-01'); INSERT INTO ahs_cost_items VALUES ('c','a');");
    const doc = { version: 5, sheets: [{ key: "custom", title: "Custom", columns: [], rows: [] }], univerWorkbook: { sheetOrder: ["ahs", "procurement_inputs", "custom"], sheets: { ahs: { id: "ahs", name: "AHS", rowCount: 200, columnCount: 50, cellData: { 2: { 1: { v: "Supplier" }, 10: { v: "AHS value" } } } }, procurement_inputs: { id: "procurement_inputs", name: "Data proyek", rowCount: 200, columnCount: 50, cellData: {} }, custom: { id: "custom", name: "Custom", rowCount: 200, columnCount: 50, cellData: { 5: { 5: { v: "keep" } } } } }, resources: [] } };
    old.prepare("INSERT INTO project_sheets VALUES ('s','p',?,0,'2026-01-01')").run(JSON.stringify(doc)); old.close();
    const db = createSqliteDatabase({ path, backupDir: join(dir, "backups") }); opened.push(db);
    const project = (await db.select<{ volume: number }>("projects", { where: [{ column: "id", op: "eq", value: "p" }] })).rows[0]!;
    expect(project.volume).toBe(420);
    const saved = (await db.select<{ doc: { univerWorkbook: { sheets: Record<string, { cellData: Record<number, Record<number, { v: unknown }>> }> } } }>("project_sheets")).rows[0]!.doc;
    expect(saved.univerWorkbook.sheets.vendor_evaluation!.cellData[2]![1]!.v).toBe("Supplier");
    expect(saved.univerWorkbook.sheets.vendor_evaluation!.cellData[2]![10]).toBeUndefined();
    expect(saved.univerWorkbook.sheets.custom!.cellData[5]![5]!.v).toBe("keep");
    expect((await readdir(join(dir, "backups"))).some((name) => name.includes("before-ahs-removal"))).toBe(true);
    await db.close?.(); opened.splice(opened.indexOf(db), 1);
    const migrated = new DatabaseSync(path, { readOnly: true });
    expect(migrated.prepare("SELECT 1 FROM sqlite_master WHERE name='ahs'").get()).toBeUndefined();
    expect(migrated.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    migrated.close();
  });
});
