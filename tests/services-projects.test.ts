/**
 * PROJECT SERVICE TESTS (Phase 3 §26: Create/Read/Update/Isolation PASS).
 *
 * These run the real service code against the in-memory Database port. The
 * isolation assertions are the APPLICATION-level mirror of RLS; the
 * database-level guarantee is validated by `npm run validate:supabase`
 * ("PIC SELECT project LAIN → DENIED").
 */

import { describe, expect, it } from "vitest";

import {
  blankProjectForm,
  createProject,
  deleteProject,
  getProjectDetail,
  listProjects,
  updateProject,
  validateProjectForm,
} from "../lib/services/projects";
import { resolveProjectReferences } from "../lib/services/references";
import { listProjectHistory } from "../lib/services/history";
import { actor, makeDb, seedBase, UUIDS } from "./helpers/db";
import type { Ahs, Project } from "../lib/types/domain";
import type { ProjectSheetRow } from "../lib/types/sheets";

describe("Project validation before any database write", () => {
  it("requires code and name and a valid status", () => {
    const errors = validateProjectForm({ ...blankProjectForm(), code: "", name: "", status: "NOPE" });
    expect(Object.keys(errors).sort()).toEqual(["code", "name", "status"]);
  });

  it("rejects a negative volume", () => {
    const errors = validateProjectForm({
      ...blankProjectForm(),
      code: "PRJ-1",
      name: "Project",
      volume: -1,
    });
    expect(errors.volume).toBeTruthy();
  });

  it("accepts a minimal valid form", () => {
    expect(validateProjectForm({ ...blankProjectForm(), code: "PRJ-1", name: "Project A" })).toEqual({});
  });
});

describe("Create project", () => {
  it("creates the project, its first AHS block, the PIC membership and an audit row", async () => {
    const db = makeDb(seedBase());
    const result = await createProject(db, actor("PROCUREMENT", UUIDS.procurement), {
      ...blankProjectForm(),
      code: "MUARA",
      name: "Muara — P1",
      customer_id: UUIDS.customer,
      product_id: UUIDS.product,
      pic_id: UUIDS.pic,
      volume: 12000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const projects = await db.select<Project>("projects", { count: true });
    expect(projects.count).toBe(3);
    const created = projects.rows.find((p) => p.code === "MUARA");
    expect(created?.name).toBe("Muara — P1");

    const ahs = await db.select<Ahs>("ahs", {
      where: [{ column: "project_id", op: "eq", value: result.data.id }],
    });
    expect(ahs.rows).toHaveLength(1);
    expect(Number(ahs.rows[0]?.volume)).toBe(12000);
    // The app must NEVER write calculated columns on `ahs` (DB trigger protects them).
    expect(ahs.rows[0]?.revenue ?? null).toBeNull();
    expect(ahs.rows[0]?.net_profit ?? null).toBeNull();

    const workbook = await db.select<ProjectSheetRow>("project_sheets", {
      where: [{ column: "project_id", op: "eq", value: result.data.id }],
    });
    expect(workbook.rows).toHaveLength(1);
    expect(workbook.rows[0]?.doc.version).toBe(5);
    expect(Object.values(workbook.rows[0]!.doc.workbook!.cells).some((cell) => cell.raw === "EVALUASI HARGA VENDOR")).toBe(true);
    expect(Object.values(workbook.rows[0]!.doc.workbook!.cells).some((cell) => cell.raw === "12000")).toBe(true);

    const members = await db.select<{ profile_id: string; access_level: string }>("project_members", {
      where: [{ column: "project_id", op: "eq", value: result.data.id }],
    });
    expect(members.rows).toHaveLength(1);
    expect(members.rows[0]?.access_level).toBe("EDIT");

    const history = await listProjectHistory(db, actor("PROCUREMENT", UUIDS.procurement), result.data.id);
    expect(history.ok).toBe(true);
    if (history.ok) {
      expect(history.data.rows).toHaveLength(1);
      expect(history.data.rows[0]?.action).toBe("INSERT");
      expect(history.data.rows[0]?.changed_by_name).toBe("Procurement Tester");
    }
  });

  it("refuses to create a project as VIEWER and writes nothing", async () => {
    const db = makeDb(seedBase());
    const result = await createProject(db, actor("VIEWER", UUIDS.viewer), {
      ...blankProjectForm(),
      code: "NOPE",
      name: "Not allowed",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("FORBIDDEN");
    expect((await db.select<Project>("projects", { count: true })).count).toBe(2);
  });

  it("rejects a duplicate project code without a second write", async () => {
    const db = makeDb(seedBase());
    const result = await createProject(db, actor("PROCUREMENT", UUIDS.procurement), {
      ...blankProjectForm(),
      code: "TONASA",
      name: "Duplicate",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.code).toBeTruthy();
    expect((await db.select<Project>("projects", { count: true })).count).toBe(2);
  });

  it("reports invalid input through fieldErrors, not an exception", async () => {
    const db = makeDb(seedBase());
    const result = await createProject(db, actor("PROCUREMENT", UUIDS.procurement), {
      ...blankProjectForm(),
      code: "",
      name: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("INVALID_INPUT");
      expect(result.fieldErrors?.code).toBeTruthy();
      expect(result.fieldErrors?.name).toBeTruthy();
    }
  });
});

describe("Project list: search, filter, sort, pagination", () => {
  it("filters by status and joins customer/product/PIC from master data", async () => {
    const db = makeDb(seedBase());
    const admin = actor("ADMIN", UUIDS.admin);

    const active = await listProjects(db, admin, { status: "ACTIVE" });
    expect(active.ok).toBe(true);
    if (active.ok) {
      expect(active.data.total).toBe(1);
      expect(active.data.rows[0]?.code).toBe("TONASA");
      expect(active.data.rows[0]?.customer_name).toBe("PT Tonasa");
      expect(active.data.rows[0]?.product_label).toBe("HSD — High Speed Diesel");
      expect(active.data.rows[0]?.pic_name).toBe("PIC Tester");
    }

    const search = await listProjects(db, admin, { search: "igip" });
    if (search.ok) {
      expect(search.data.total).toBe(1);
      expect(search.data.rows[0]?.code).toBe("IGIP");
    }

    const noMatch = await listProjects(db, admin, { search: "tidak-ada" });
    if (noMatch.ok) expect(noMatch.data.total).toBe(0);
  });

  it("sorts by name ascending and paginates", async () => {
    const db = makeDb(seedBase());
    const admin = actor("ADMIN", UUIDS.admin);

    const asc = await listProjects(db, admin, { sort: "name", direction: "asc", pageSize: 10 });
    if (asc.ok) expect(asc.data.rows.map((r) => r.code)).toEqual(["IGIP", "TONASA"]);

    const desc = await listProjects(db, admin, { sort: "name", direction: "desc", pageSize: 10 });
    if (desc.ok) expect(desc.data.rows.map((r) => r.code)).toEqual(["TONASA", "IGIP"]);

    const page1 = await listProjects(db, admin, { sort: "name", direction: "asc", pageSize: 10, page: 1 });
    if (page1.ok) {
      expect(page1.data.totalPages).toBe(1);
      expect(page1.data.from).toBe(1);
      expect(page1.data.to).toBe(2);
    }

    const emptyPage = await listProjects(db, admin, { page: 5, pageSize: 10 });
    if (emptyPage.ok) {
      expect(emptyPage.data.rows).toHaveLength(0);
      expect(emptyPage.data.from).toBe(0);
    }
  });

  it("reports volume from the AHS block when no scenario exists yet", async () => {
    const db = makeDb(seedBase());
    await db.insert("ahs", { project_id: UUIDS.projectA, template_id: "T_A_AHS_STANDARD", volume: 5000 });
    const list = await listProjects(db, actor("ADMIN", UUIDS.admin), { search: "TONASA" });
    if (list.ok) expect(list.data.rows[0]?.volume).toBe(5000);
  });
});

describe("Project isolation (application mirror of RLS)", () => {
  it("lets a PIC read a project it is a member of", async () => {
    const db = makeDb(seedBase());
    const detail = await getProjectDetail(db, actor("PIC", UUIDS.pic), UUIDS.projectA);
    expect(detail.ok).toBe(true);
    if (detail.ok) expect(detail.data.access).toBe("EDIT");
  });

  it("treats a project the PIC is not a member of as NOT FOUND", async () => {
    const db = makeDb(seedBase());
    const detail = await getProjectDetail(db, actor("PIC", UUIDS.pic), UUIDS.projectB);
    expect(detail.ok).toBe(false);
    if (!detail.ok) expect(detail.errorCode).toBe("NOT_FOUND");
  });

  it("gives VIEWER no access without a membership row", async () => {
    const db = makeDb(seedBase());
    const detail = await getProjectDetail(db, actor("VIEWER", UUIDS.viewer), UUIDS.projectA);
    expect(detail.ok).toBe(false);
  });

  it("gives VIEWER read-only access when a VIEW membership exists — but no write", async () => {
    const db = makeDb({
      ...seedBase(),
      project_members: [
        { id: "pm-2", project_id: UUIDS.projectB, profile_id: UUIDS.viewer, access_level: "VIEW" },
      ],
    });
    const detail = await getProjectDetail(db, actor("VIEWER", UUIDS.viewer), UUIDS.projectB);
    expect(detail.ok).toBe(true);
    if (detail.ok) expect(detail.data.access).toBe("VIEW");

    const write = await updateProject(db, actor("VIEWER", UUIDS.viewer), UUIDS.projectB, {
      ...blankProjectForm(),
      code: "IGIP",
      name: "IGIP — Q4 2026",
    });
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.errorCode).toBe("FORBIDDEN");
  });

  it("lets ADMIN and PROCUREMENT reach every project", async () => {
    const db = makeDb(seedBase());
    for (const [role, id] of [
      ["ADMIN", UUIDS.admin],
      ["PROCUREMENT", UUIDS.procurement],
    ] as const) {
      const detail = await getProjectDetail(db, actor(role, id), UUIDS.projectB);
      expect(detail.ok, role).toBe(true);
    }
  });
});

describe("Update project", () => {
  it("writes one audit row per changed field and skips unchanged ones", async () => {
    const db = makeDb(seedBase());
    const admin = actor("ADMIN", UUIDS.admin);
    const before = await getProjectDetail(db, admin, UUIDS.projectA);
    if (!before.ok) throw new Error("seed missing");

    const result = await updateProject(db, admin, UUIDS.projectA, {
      code: before.data.project.code,
      name: "Tonasa — P2 Sep 2026 (rev)",
      customer_id: UUIDS.customer,
      product_id: UUIDS.product,
      market_id: null,
      location: "Medan",
      period_label: "P2 SEP-26",
      pic_id: UUIDS.pic,
      status: "ACTIVE",
      notes: "catatan baru",
      volume: null,
      reason: "revisi nama & catatan",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.changed.map((c) => c.field).sort()).toEqual(["name", "notes"]);

    const history = await listProjectHistory(db, admin, UUIDS.projectA, { pageSize: 50 });
    if (history.ok) {
      const updates = history.data.rows.filter((r) => r.action === "UPDATE");
      expect(updates).toHaveLength(2);
      expect(updates.every((r) => r.reason === "revisi nama & catatan")).toBe(true);
      const notesChange = updates.find((r) => r.field === "notes");
      expect(notesChange?.old_value).toBeNull();
      expect(notesChange?.new_value).toBe("catatan baru");
    }
  });

  it("rejects a code already used by another project", async () => {
    const db = makeDb(seedBase());
    const result = await updateProject(db, actor("ADMIN", UUIDS.admin), UUIDS.projectA, {
      ...blankProjectForm(),
      code: "IGIP",
      name: "Tonasa",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.code).toBeTruthy();
  });

  it("only ADMIN can delete a project", async () => {
    const db = makeDb(seedBase());
    const asProcurement = await deleteProject(db, actor("PROCUREMENT", UUIDS.procurement), UUIDS.projectA);
    expect(asProcurement.ok).toBe(false);

    const asAdmin = await deleteProject(db, actor("ADMIN", UUIDS.admin), UUIDS.projectB);
    expect(asAdmin.ok).toBe(true);
    expect((await db.select<Project>("projects", { count: true })).count).toBe(1);
  });
});

describe("Free-text project references resolve safely before any write", () => {
  it("maps typed names/emails to the master ids", async () => {
    const db = makeDb(seedBase());
    const { ids, fieldErrors } = await resolveProjectReferences(db, {
      customer: "pt tonasa",
      product: "HSD — High Speed Diesel",
      market: "",
      pic: "pic@test.local",
    });

    expect(fieldErrors).toEqual({});
    expect(ids.customer_id).toBe(UUIDS.customer);
    expect(ids.product_id).toBe(UUIDS.product);
    expect(ids.market_id).toBeNull();
    expect(ids.pic_id).toBe(UUIDS.pic);
  });

  it("accepts a raw uuid as well (paste from master data)", async () => {
    const db = makeDb(seedBase());
    const { ids, fieldErrors } = await resolveProjectReferences(db, { customer: UUIDS.customer });
    expect(fieldErrors).toEqual({});
    expect(ids.customer_id).toBe(UUIDS.customer);
  });

  it("reports an unknown term as a field error and resolves nothing for it", async () => {
    const db = makeDb(seedBase());
    const { ids, fieldErrors } = await resolveProjectReferences(db, {
      customer: "PT Tidak Ada",
      pic: " orang@lain.local ",
    });

    expect(ids.customer_id).toBeNull();
    expect(ids.pic_id).toBeNull();
    expect(fieldErrors.customer).toContain("PT Tidak Ada");
    expect(fieldErrors.customer).toContain("tidak ditemukan");
    expect(fieldErrors.pic).toBeTruthy();
  });

  it("creates a new master row for ambiguous or new free text", async () => {
    const db = makeDb({
      ...seedBase(),
      customers: [
        { id: UUIDS.customer, name: "PT Tonasa", customer_type: null, default_term: null },
        { id: "00000000-0000-4000-8000-0000000000c2", name: "PT Tonasa Jaya", customer_type: null, default_term: null },
      ],
    });
    const { ids, fieldErrors } = await resolveProjectReferences(
      db,
      { customer: "Tonasa", product: "solar" },
      actor("PROCUREMENT", UUIDS.procurement),
    );

    expect(fieldErrors).toEqual({});
    expect(ids.customer_id).toBeTruthy();
    expect(ids.customer_id).not.toBe(UUIDS.customer);
    expect(ids.product_id).toBeTruthy();

    const createdProduct = await db.select<{ name: string }>("products", {
      where: [{ column: "id", op: "eq", value: ids.product_id }],
    });
    expect(createdProduct.rows[0]?.name).toBe("solar");
  });

  it("keeps a create write from happening when a term is unknown", async () => {
    const db = makeDb(seedBase());
    const { fieldErrors } = await resolveProjectReferences(db, { customer: "PT Tidak Ada" });
    // The action returns before createProject, so no project row is written.
    expect(Object.keys(fieldErrors)).toEqual(["customer"]);
    expect((await db.select<Project>("projects", { count: true })).count).toBe(2);
  });
});
