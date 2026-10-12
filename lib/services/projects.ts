/**
 * Project service — the container of the whole workflow (PRD §9, Phase 3 §6–§8).
 *
 * Everything here runs on the server against the real database. No mock rows,
 * no hardcoded KPI (Phase 3 §22).
 */

import { can } from "../auth/permissions";
import type { Actor } from "../auth/session";
import { atomic, eq, searchAcross, type Database, type Filter } from "../data/db";
import { toNumber } from "../format";
import type { Project, ProjectStatus } from "../types/domain";
import { PROJECT_STATUSES } from "../types/domain";
import { isActionErr, loadProjectContext } from "./access";
import { buildPage, normalisePage, normalisePageSize, toRange, type Page } from "./pagination";
import { err, forbidden, ok, toActionResultError, type ActionResult } from "./result";
import { createProjectSheetsTemplate } from "./sheets";
import { cache } from "react";

export const PROJECT_SORT_KEYS = ["updated_at", "name", "code", "status", "period_label"] as const;
export type ProjectSortKey = (typeof PROJECT_SORT_KEYS)[number];

export const PROJECT_SORT_LABELS: Record<ProjectSortKey, string> = {
  updated_at: "Diperbarui",
  name: "Nama proyek",
  code: "Kode proyek",
  status: "Status",
  period_label: "Periode",
};

export function parseProjectStatus(value: string | undefined): ProjectStatus | "" {
  return value && PROJECT_STATUSES.includes(value as ProjectStatus) ? (value as ProjectStatus) : "";
}

/** Resolve the public project URL token without exposing the database UUID. */
export const resolveProjectCode = cache(async function resolveProjectCode(
  db: Database,
  code: string,
): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const { rows } = await db.select<Pick<Project, "id" | "code">>("projects", {
      where: [eq("code", decodeURIComponent(code))],
      limit: 1,
    });
    const project = rows[0];
    return project ? ok(project) : err("proyek tidak ditemukan.", { errorCode: "NOT_FOUND" });
  } catch (e) {
    return toActionResultError(e, "projects");
  }
});

export interface ProjectListFilters {
  search?: string;
  status?: ProjectStatus | "";
  sort?: ProjectSortKey;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ProjectListRowView {
  id: string;
  code: string;
  name: string;
  customer_name: string | null;
  product_label: string | null;
  location: string | null;
  period_label: string | null;
  volume: number | null;
  status: string;
  pic_name: string | null;
  updated_at: string;
  vendor_count: number;
}

async function referenceMaps(db: Database, customerIds: string[], productIds: string[], profileIds: string[]) {
  const [customers, products, profiles] = await Promise.all([
    customerIds.length
      ? db.select<{ id: string; name: string }>("customers", {
          where: [{ column: "id", op: "in", value: customerIds }],
        })
      : Promise.resolve({ rows: [], count: 0 }),
    productIds.length
      ? db.select<{ id: string; code: string; name: string }>("products", {
          where: [{ column: "id", op: "in", value: productIds }],
        })
      : Promise.resolve({ rows: [], count: 0 }),
    profileIds.length
      ? db.select<{ id: string; full_name: string | null; email: string }>("profiles", {
          where: [{ column: "id", op: "in", value: profileIds }],
        })
      : Promise.resolve({ rows: [], count: 0 }),
  ]);

  return {
    customerById: new Map(customers.rows.map((c) => [c.id, c.name])),
    productById: new Map(products.rows.map((p) => [p.id, `${p.code} — ${p.name}`])),
    profileById: new Map(profiles.rows.map((p) => [p.id, p.full_name ?? p.email])),
  };
}

export async function listProjects(
  db: Database,
  _actor: Actor,
  filters: ProjectListFilters = {},
): Promise<ActionResult<Page<ProjectListRowView>>> {
  try {
    const page = normalisePage(filters.page);
    const pageSize = normalisePageSize(filters.pageSize);
    const sortKey: ProjectSortKey = PROJECT_SORT_KEYS.includes(filters.sort as ProjectSortKey)
      ? (filters.sort as ProjectSortKey)
      : "updated_at";

    const where: Filter[] = [];
    if (filters.status) where.push(eq("status", filters.status));
    const or = searchAcross(["code", "name"], filters.search ?? "");

    const { rows, count } = await db.select<Project & { period_label: string | null }>("projects", {
      where,
      ...(or ? { or } : {}),
      order: [{ column: sortKey, ascending: filters.direction === "asc" }],
      range: toRange(page, pageSize),
      count: true,
    });

    const projectIds = rows.map((r) => r.id);

    const memberships = projectIds.length
      ? await db.select<{ project_id: string; vendor_id: string }>("project_vendors", {
          where: [{ column: "project_id", op: "in", value: projectIds }],
        })
      : { rows: [], count: 0 };

    const vendorCount = new Map<string, number>();
    for (const v of memberships.rows) {
      vendorCount.set(v.project_id, (vendorCount.get(v.project_id) ?? 0) + 1);
    }

    const refs = await referenceMaps(
      db,
      rows.map((r) => r.customer_id).filter((v): v is string => Boolean(v)),
      rows.map((r) => r.product_id).filter((v): v is string => Boolean(v)),
      rows.map((r) => r.pic_id).filter((v): v is string => Boolean(v)),
    );

    const views: ProjectListRowView[] = rows.map((row) => {
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        customer_name: row.customer_id ? refs.customerById.get(row.customer_id) ?? null : null,
        product_label: row.product_id ? refs.productById.get(row.product_id) ?? null : null,
        location: row.location,
        period_label: row.period_label,
        volume: toNumber(row.volume),
        status: row.status,
        pic_name: row.pic_id ? refs.profileById.get(row.pic_id) ?? null : null,
        updated_at: row.updated_at,
        vendor_count: vendorCount.get(row.id) ?? 0,
      };
    });

    return ok(buildPage(views, count, page, pageSize));
  } catch (e) {
    return toActionResultError(e, "projects");
  }
}

export interface ProjectDetailView {
  project: Project;
  customer_name: string | null;
  product_label: string | null;
  market_name: string | null;
  pic_name: string | null;
  access: string;
  vendor_count: number;
  volume: number | null;
}

export async function getProjectDetail(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<ProjectDetailView>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;
    const { project, access } = ctx;

    const [customers, products, markets, profiles, vendors] = await Promise.all([
      project.customer_id
        ? db.select<{ id: string; name: string }>("customers", { where: [eq("id", project.customer_id)], limit: 1 })
        : Promise.resolve({ rows: [], count: 0 }),
      project.product_id
        ? db.select<{ id: string; code: string; name: string }>("products", {
            where: [eq("id", project.product_id)],
            limit: 1,
          })
        : Promise.resolve({ rows: [], count: 0 }),
      project.market_id
        ? db.select<{ id: string; name: string }>("markets", { where: [eq("id", project.market_id)], limit: 1 })
        : Promise.resolve({ rows: [], count: 0 }),
      project.pic_id
        ? db.select<{ id: string; full_name: string | null; email: string }>("profiles", {
            where: [eq("id", project.pic_id)],
            limit: 1,
          })
        : Promise.resolve({ rows: [], count: 0 }),
      db.select<{ id: string }>("project_vendors", { where: [eq("project_id", projectId)] }),
    ]);

    const product = products.rows[0];
    return ok({
      project,
      customer_name: customers.rows[0]?.name ?? null,
      product_label: product ? `${product.code} — ${product.name}` : null,
      market_name: markets.rows[0]?.name ?? null,
      pic_name: profiles.rows[0]?.full_name ?? profiles.rows[0]?.email ?? null,
      access,
      vendor_count: vendors.rows.length,
      volume: toNumber(project.volume),
    });
  } catch (e) {
    return toActionResultError(e, "projects");
  }
}

export interface ProjectFormInput {
  /** Optional for the user-facing create form; legacy callers may still set it. */
  code?: string | null;
  name: string;
  customer_id?: string | null;
  product_id?: string | null;
  market_id?: string | null;
  location?: string | null;
  period_label?: string | null;
  pic_id?: string | null;
  status: string;
  notes?: string | null;
  volume?: number | null;
}

/** Validation BEFORE any database write (Phase 3 §7). */
export function validateProjectForm(input: ProjectFormInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const code = input.code?.trim() ?? "";
  const name = input.name?.trim() ?? "";

  if (code !== "" && !/^[A-Za-z0-9._/-]{2,40}$/.test(code)) {
    errors.code = "Kode proyek hanya boleh berisi huruf, angka, titik, garis miring, dan garis bawah (2–40 karakter).";
  }

  if (name === "") errors.name = "Nama proyek wajib diisi.";
  else if (name.length > 200) errors.name = "Nama proyek maksimal 200 karakter.";

  if (!PROJECT_STATUSES.includes(input.status as ProjectStatus)) {
    errors.status = "Pilih status proyek yang tersedia.";
  }

  if (input.volume !== null && input.volume !== undefined) {
    if (!Number.isFinite(input.volume)) errors.volume = "Volume harus berupa angka.";
    else if (input.volume < 0) errors.volume = "Volume tidak boleh negatif.";
  }

  return errors;
}

export function blankProjectForm(): ProjectFormInput {
  return {
    name: "",
    customer_id: null,
    product_id: null,
    market_id: null,
    location: null,
    period_label: null,
    pic_id: null,
    status: "ACTIVE",
    notes: null,
    volume: null,
  };
}

const PROJECT_CODE_ATTEMPTS = 8;

/** Build the next public project code for a calendar month. */
export async function generateProjectCode(
  db: Database,
  now = new Date(),
): Promise<string> {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).formatToParts(now);
  const month = `${parts.find((p) => p.type === "year")!.value}${parts.find((p) => p.type === "month")!.value}`;
  const prefix = `PRJ-${month}-`;
  const existing = await db.select<{ code: string }>("projects", {
    where: [{ column: "code", op: "gte", value: prefix }, { column: "code", op: "lt", value: `${prefix}\uffff` }],
  });
  const numbers = existing.rows
    .map(({ code }) => new RegExp(`^PRJ-${month}-(\\d{3,})$`, "i").exec(code)?.[1])
    .map((value) => (value ? Number(value) : 0))
    .filter((value) => Number.isInteger(value) && value > 0);
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function isProjectCodeCollision(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /duplicate|unique|23505|projects_code_key|projects\.code/i.test(message);
}

export async function createProject(
  db: Database,
  actor: Actor,
  input: ProjectFormInput,
): Promise<ActionResult<{ id: string; code: string }>> {
  try { return await atomic(db, (tx) => createProjectInTransaction(tx, actor, input)); }
  catch (error) { return toActionResultError(error, "projects"); }
}

async function createProjectInTransaction(db: Database, actor: Actor, input: ProjectFormInput): Promise<ActionResult<{ id: string; code: string }>> {
  if (!actor.isActive || !can("create_project", actor.role)) {
    return forbidden("membuat proyek");
  }

  const fieldErrors = validateProjectForm(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali isian form.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  try {
    let project: Project | null = null;
    for (let attempt = 0; attempt < PROJECT_CODE_ATTEMPTS; attempt += 1) {
      const code = input.code?.trim() || (await generateProjectCode(db));
      const existing = await db.select<{ id: string }>("projects", {
        where: [eq("code", code)],
        limit: 1,
      });
      if (existing.rows.length > 0) {
        if (input.code?.trim()) {
          return err("Kode proyek sudah dipakai.", {
            fieldErrors: { code: "Kode proyek sudah dipakai." },
            errorCode: "INVALID_INPUT",
          });
        }
        continue;
      }
      try {
        project = await db.insert<Project>("projects", {
          code,
          name: input.name.trim(),
          customer_id: input.customer_id ?? null,
          product_id: input.product_id ?? null,
          market_id: input.market_id ?? null,
          location: input.location ?? null,
          period_label: input.period_label ?? null,
          pic_id: input.pic_id ?? null,
          status: input.status,
          notes: input.notes ?? null,
          volume: input.volume ?? null,
          created_by: actor.id,
        });
        break;
      } catch (error) {
        if (!input.code?.trim() && isProjectCodeCollision(error)) continue;
        throw error;
      }
    }
    if (!project) {
      return err("Kode proyek belum dapat dibuat. Coba simpan lagi.", {
        errorCode: "DATABASE_ERROR",
      });
    }

    // A project is never allowed to exist without its physical workbook.
    // Insert this before optional AHS/member setup so a failure can be safely
    // compensated without leaving dependent rows behind.
    try {
      const doc = createProjectSheetsTemplate({ code: project.code, name: project.name, location: project.location, periodLabel: project.period_label, volume: input.volume ?? null });
      if (db.local) {
        const { writeBoundValue } = await import("../workbook/bindings");
        for (const [field, table, key] of [["customer", "customers", "name"], ["product", "products", "name"], ["pic", "profiles", "email"]] as const) {
          const id = input[`${field}_id`];
          const label = id ? (await db.select<Record<string, unknown>>(table, { where: [eq("id", id)], limit: 1 })).rows[0]?.[key] : null;
          writeBoundValue(doc.univerWorkbook!, `project.${field}`, label);
          if (field === "customer") writeBoundValue(doc.univerWorkbook!, "ahs.customer", label);
        }
        writeBoundValue(doc.univerWorkbook!, "project.status", input.status);
      }
      await db.insert("project_sheets", {
        project_id: project.id,
        doc,
      });
    } catch (templateError) {
      await db.remove("projects", project.id);
      throw templateError;
    }

    const warnings: string[] = [];

    // The assigned PIC must be able to open the project: membership is the
    // mechanism RLS uses (has_project_access -> project_members).
    if (input.pic_id) {
      await db.insert("project_members", {
          project_id: project.id,
          profile_id: input.pic_id,
          access_level: "EDIT",
      });
    }

    return ok({ id: project.id, code: project.code }, warnings);
  } catch (e) {
    return toActionResultError(e, "projects");
  }
}

export interface UpdateProjectResult {
  id: string;
  changed: Array<{ field: string; old: string | null; new: string | null }>;
}

export async function updateProject(
  db: Database, actor: Actor, projectId: string, input: ProjectFormInput,
): Promise<ActionResult<UpdateProjectResult>> {
  return atomic(db, (tx) => updateProjectInternal(tx, actor, projectId, input));
}

async function updateProjectInternal(
  db: Database,
  actor: Actor,
  projectId: string,
  input: ProjectFormInput,
): Promise<ActionResult<UpdateProjectResult>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;

  if (ctx.access === "VIEW") return forbidden("mengubah proyek (akses read-only)");

  const fieldErrors = validateProjectForm(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali isian form.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  const patch: Record<string, unknown> = {
    code: input.code?.trim() || ctx.project.code,
    name: input.name.trim(),
    customer_id: input.customer_id ?? null,
    product_id: input.product_id ?? null,
    market_id: input.market_id ?? null,
    location: input.location ?? null,
    period_label: input.period_label ?? null,
    pic_id: input.pic_id ?? null,
    status: input.status,
    volume: input.volume ?? null,
    // The simplified form does not expose Notes; preserve existing notes on edit.
    notes: input.notes === undefined ? ctx.project.notes : input.notes,
  };

  try {
    const previous = ctx.project;
    const codeOwner = await db.select<{ id: string }>("projects", {
      where: [eq("code", patch.code as string)],
      limit: 1,
    });
    if (codeOwner.rows.length > 0 && codeOwner.rows[0]!.id !== projectId) {
      return err("Kode proyek sudah dipakai proyek lain.", {
        fieldErrors: { code: "Kode proyek sudah dipakai proyek lain." },
        errorCode: "INVALID_INPUT",
      });
    }

    await db.update<Project>("projects", projectId, patch);

    if (db.local) {
      const label = async (table: "customers" | "products" | "profiles", id: string | null | undefined, field: string) => id
        ? (await db.select<Record<string, unknown>>(table, { where: [eq("id", id)], limit: 1 })).rows[0]?.[field] ?? null : null;
      const { patchWorkbookFields } = await import("./editor");
      const saved = await patchWorkbookFields(db, actor, projectId, {
        "project.name": patch.name, "project.location": patch.location,
        "project.customer": await label("customers", input.customer_id, "name"),
        "project.product": await label("products", input.product_id, "name"),
        "project.pic": await label("profiles", input.pic_id, "email"),
        "project.period_label": patch.period_label, "project.status": patch.status,
        "project.volume": input.volume ?? null,
      });
      if (!saved.ok) return saved;
    }

    const changed: Array<{ field: string; old: string | null; new: string | null }> = [];
    for (const [field, next] of Object.entries(patch)) {
      const before = (previous as unknown as Record<string, unknown>)[field];
      const a = before === null || before === undefined ? null : String(before);
      const b = next === null || next === undefined ? null : String(next);
      if (a !== b) changed.push({ field, old: a, new: b });
    }

    const warnings: string[] = [];

    // Keep the PIC membership in sync when the PIC is reassigned: without a
    // project_members row the new PIC could not open the project (RLS).
    const newPic = input.pic_id ?? null;
    if (newPic && newPic !== previous.pic_id) {
      const membership = await db.select("project_members", { where: [eq("project_id", projectId), eq("profile_id", newPic)], limit: 1 });
      if (!membership.rows.length) {
        await db.insert("project_members", {
          project_id: projectId,
          profile_id: newPic,
          access_level: "EDIT",
        });
      }
    }

    return ok({ id: projectId, changed }, warnings);
  } catch (e) {
    return toActionResultError(e, "projects");
  }
}

export async function deleteProject(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!can("delete_project", actor.role)) {
    return forbidden("menghapus proyek (hanya ADMIN)");
  }
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;
    if (db.backup) await db.backup("before-delete");
    await atomic(db, async (tx) => { await tx.remove("projects", projectId); });
    return ok({ id: projectId });
  } catch (e) {
    return toActionResultError(e, "projects");
  }
}

export async function requireProject(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<{ project: Project; access: string }>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  return ok({ project: ctx.project, access: ctx.access });
}

export function statusTone(status: string): "positive" | "neutral" | "caution" | "negative" {
  switch (status) {
    case "ACTIVE":
      return "positive";
    case "COMPLETED":
      return "neutral";
    case "ON_HOLD":
      return "caution";
    case "CANCELLED":
      return "negative";
    default:
      return "neutral";
  }
}
