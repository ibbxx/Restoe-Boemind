import { describe, expect, it } from "vitest";

import { resolveProjectReferences } from "../lib/services/references";
import { createProject, generateProjectCode } from "../lib/services/projects";
import { actor, makeDb, seedBase, UUIDS } from "./helpers/db";

const PROCUREMENT = actor("PROCUREMENT", UUIDS.procurement);

function projectInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Project otomatis",
    status: "ACTIVE",
    ...overrides,
  };
}

describe("project creation form workflow", () => {
  it("generates monthly PRJ codes, increments the next project, and creates a workbook", async () => {
    const db = makeDb();
    const first = await createProject(db, PROCUREMENT, projectInput({ location: "Jakarta" }));
    const second = await createProject(db, PROCUREMENT, projectInput({ name: "Project kedua" }));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const month = `${parts.find((part) => part.type === "year")!.value}${parts.find((part) => part.type === "month")!.value}`;
    expect(first.data.code).toMatch(new RegExp(`^PRJ-${month}-001$`));
    expect(second.data.code).toMatch(new RegExp(`^PRJ-${month}-002$`));
    expect((await db.select("project_sheets", { count: true })).count).toBe(2);
  });

  it("continues after the highest existing monthly code", async () => {
    const db = makeDb({
      projects: [
        {
          id: "existing-project",
          code: "PRJ-202610-007",
          name: "Existing",
          status: "ACTIVE",
        },
      ],
    });

    expect(await generateProjectCode(db, new Date("2026-10-11T00:00:00.000Z"))).toBe("PRJ-202610-008");
  });

  it("allows empty PIC and volume while persisting location and market", async () => {
    const db = makeDb(seedBase());
    const references = await resolveProjectReferences(db, { market: "Makassar" }, PROCUREMENT);
    expect(references.fieldErrors).toEqual({});

    const result = await createProject(db, PROCUREMENT, projectInput({
      location: "Makassar",
      market_id: references.ids.market_id,
      pic_id: null,
      volume: null,
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await db.select<{
      location: string | null;
      market_id: string | null;
    }>("projects", { where: [{ column: "id", op: "eq", value: result.data.id }], limit: 1 });
    expect(rows.rows[0]).toMatchObject({ location: "Makassar", market_id: references.ids.market_id });
    expect((await db.select("ahs", { count: true })).count).toBe(0);
  });

  it("rejects a missing market for an actor that cannot create master data", async () => {
    const db = makeDb(seedBase());
    const result = await resolveProjectReferences(db, { market: "Market Baru" }, actor("PIC", UUIDS.pic));
    expect(result.ids.market_id).toBeNull();
    expect(result.fieldErrors.market).toContain("tidak ditemukan");
  });
});
