/**
 * Project service — the container of the whole workflow (PRD §9, Phase 3 §6–§8).
 *
 * Everything here runs on the server against the real database. No mock rows,
 * no hardcoded KPI (Phase 3 §22).
 */

import { can } from "../auth/permissions";
import type { Actor } from "../auth/session";
import { eq, searchAcross, type Database, type Filter } from "../data/db";
import { toNumber } from "../format";
import type { Project, ProjectStatus } from "../types/domain";
import { PROJECT_STATUSES } from "../types/domain";
import { isActionErr, loadProjectContext } from "./access";
import { recordHistory } from "./history";
import { buildPage, normalisePage, normalisePageSize, toRange, type Page } from "./pagination";
import { err, forbidden, ok, toActionResultError, type ActionResult } from "./result";
import { createProjectSheetsTemplate } from "./sheets";

export const PROJECT_SORT_KEYS = ["updated_at", "name", "code", "status", "period_label"] as const;
export type ProjectSortKey = (typeof PROJECT_SORT_KEYS)[number];

export const PROJECT_SORT_LABELS: Record<ProjectSortKey, string> = {
  updated_at: "Updated",
  name: "Project Name",
  code: "Project Code",
  status: "Status",
  period_label: "Period",
};

export function parseProjectStatus(value: string | undefined): ProjectStatus | "" {
  return value && PROJECT_STATUSES.includes(value as ProjectStatus) ? (value as ProjectStatus) : "";
}

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
  scenario_count: number;
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
  actor: Actor,
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

    const [memberships, scenarios, ahsRows] = await Promise.all([
      projectIds.length
        ? db.select<{ project_id: string; vendor_id: string }>("project_vendors", {
            where: [{ column: "project_id", op: "in", value: projectIds }],
          })
        : Promise.resolve({ rows: [], count: 0 }),
      projectIds.length
        ? db.select<{ id: string; project_id: string; created_at: string }>("price_scenarios", {
            where: [{ column: "project_id", op: "in", value: projectIds }],
            order: [{ column: "created_at", ascending: false }],
          })
        : Promise.resolve({ rows: [], count: 0 }),
      projectIds.length
        ? db.select<{ project_id: string; volume: number | string | null }>("ahs", {
            where: [{ column: "project_id", op: "in", value: projectIds }],
            order: [{ column: "created_at", ascending: false }],
          })
        : Promise.resolve({ rows: [], count: 0 }),
    ]);

    const latestScenario = new Map<string, string>();
    const scenarioCount = new Map<string, number>();
    for (const s of scenarios.rows) {
      if (!latestScenario.has(s.project_id)) latestScenario.set(s.project_id, s.id);
      scenarioCount.set(s.project_id, (scenarioCount.get(s.project_id) ?? 0) + 1);
    }

    const scenarioIds = [...latestScenario.values()];
    const volumes = scenarioIds.length
      ? (
          await db.select<{ scenario_id: string; value_num: number | string | null }>("scenario_inputs", {
            where: [
              { column: "scenario_id", op: "in", value: scenarioIds },
              eq("field_key", "volume"),
            ],
          })
        ).rows
      : [];
    const volumeByScenario = new Map(volumes.map((v) => [v.scenario_id, toNumber(v.value_num)]));

    const ahsVolume = new Map<string, number | null>();
    for (const row of ahsRows.rows) {
      if (!ahsVolume.has(row.project_id)) ahsVolume.set(row.project_id, toNumber(row.volume));
    }

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
      const scenarioId = latestScenario.get(row.id) ?? null;
      const volume = scenarioId
        ? volumeByScenario.get(scenarioId) ?? ahsVolume.get(row.id) ?? null
        : ahsVolume.get(row.id) ?? null;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        customer_name: row.customer_id ? refs.customerById.get(row.customer_id) ?? null : null,
        product_label: row.product_id ? refs.productById.get(row.product_id) ?? null : null,
        location: row.location,
        period_label: row.period_label,
        volume,
        status: row.status,
        pic_name: row.pic_id ? refs.profileById.get(row.pic_id) ?? null : null,
        updated_at: row.updated_at,
        scenario_count: scenarioCount.get(row.id) ?? 0,
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
  scenario_count: number;
  vendor_count: number;
  latest_scenario_id: string | null;
  latest_scenario_name: string | null;
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

    const [customers, products, markets, profiles, vendors, scenarios, ahsRows] = await Promise.all([
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
      db.select<{ id: string; name: string; created_at: string }>("price_scenarios", {
        where: [eq("project_id", projectId)],
        order: [{ column: "created_at", ascending: false }],
      }),
      db.select<{ project_id: string; volume: number | string | null }>("ahs", {
        where: [eq("project_id", projectId)],
        order: [{ column: "created_at", ascending: false }],
        limit: 1,
      }),
    ]);

    const latestScenario = scenarios.rows[0] ?? null;
    let volume: number | null = toNumber(ahsRows.rows[0]?.volume);
    if (latestScenario) {
      const { rows } = await db.select<{ value_num: number | string | null; field_key: string }>(
        "scenario_inputs",
        { where: [eq("scenario_id", latestScenario.id), eq("field_key", "volume")], limit: 1 },
      );
      volume = toNumber(rows[0]?.value_num) ?? volume;
    }

    const product = products.rows[0];
    return ok({
      project,
      customer_name: customers.rows[0]?.name ?? null,
      product_label: product ? `${product.code} — ${product.name}` : null,
      market_name: markets.rows[0]?.name ?? null,
      pic_name: profiles.rows[0]?.full_name ?? profiles.rows[0]?.email ?? null,
      access,
      scenario_count: scenarios.rows.length,
      vendor_count: vendors.rows.length,
      latest_scenario_id: latestScenario?.id ?? null,
      latest_scenario_name: latestScenario?.name ?? null,
      volume,
    });
  } catch (e) {
    return toActionResultError(e, "projects");
  }
}

export interface ProjectFormInput {
  code: string;
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

  if (code === "") errors.code = "Project Code wajib diisi.";
  else if (!/^[A-Za-z0-9._/-]{2,40}$/.test(code)) {
    errors.code = "Project Code hanya boleh huruf, angka, titik, garis miring, - dan _ (2–40 karakter).";
  }

  if (name === "") errors.name = "Project Name wajib diisi.";
  else if (name.length > 200) errors.name = "Project Name maksimal 200 karakter.";

  if (!PROJECT_STATUSES.includes(input.status as ProjectStatus)) {
    errors.status = `Status harus salah satu dari: ${PROJECT_STATUSES.join(", ")}.`;
  }

  if (input.volume !== null && input.volume !== undefined) {
    if (!Number.isFinite(input.volume)) errors.volume = "Volume harus berupa angka.";
    else if (input.volume < 0) errors.volume = "Volume tidak boleh negatif.";
  }

  return errors;
}

export function blankProjectForm(): ProjectFormInput {
  return {
    code: "",
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

export async function createProject(
  db: Database,
  actor: Actor,
  input: ProjectFormInput,
): Promise<ActionResult<{ id: string; code: string }>> {
  if (!can("create_project", actor.role)) {
    return forbidden("membuat project");
  }

  const fieldErrors = validateProjectForm(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali isian form.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  const code = input.code.trim();

  try {
    const existing = await db.select<{ id: string }>("projects", {
      where: [eq("code", code)],
      limit: 1,
    });
    if (existing.rows.length > 0) {
      return err("Project Code sudah dipakai.", {
        fieldErrors: { code: "Project Code sudah dipakai." },
        errorCode: "INVALID_INPUT",
      });
    }

    const project = await db.insert<Project>("projects", {
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
      created_by: actor.id,
    });

    // A project is never allowed to exist without its physical workbook.
    // Insert this before optional AHS/member setup so a failure can be safely
    // compensated without leaving dependent rows behind.
    try {
      await db.insert("project_sheets", {
        project_id: project.id,
        doc: createProjectSheetsTemplate({
          code: project.code,
          name: project.name,
          location: project.location,
          periodLabel: project.period_label,
          volume: input.volume ?? null,
        }),
      });
    } catch (templateError) {
      await db.remove("projects", project.id);
      throw templateError;
    }

    const warnings: string[] = [];

    // Volume is not a column of `projects`; it belongs to the AHS block. Create
    // the project's first AHS row so the workflow has a real starting point.
    if (input.volume !== null && input.volume !== undefined) {
      await db.insert("ahs", {
        project_id: project.id,
        template_id: "T_A_AHS_STANDARD",
        title: "ANALISIS HARGA SATUAN (AHS)",
        volume: input.volume,
        created_by: actor.id,
      });
    }

    // The assigned PIC must be able to open the project: membership is the
    // mechanism RLS uses (has_project_access -> project_members).
    if (input.pic_id) {
      try {
        await db.insert("project_members", {
          project_id: project.id,
          profile_id: input.pic_id,
          access_level: "EDIT",
        });
      } catch {
        warnings.push(
          "PIC tersimpan pada project, tetapi baris project_members gagal dibuat — PIC belum tentu punya akses.",
        );
      }
    }

    const audited = await recordHistory(db, {
      projectId: project.id,
      entity: "projects",
      entityId: project.id,
      action: "INSERT",
      field: "project",
      oldValue: null,
      newValue: `${project.code} — ${project.name}`,
      reason: "Project dibuat",
      changedBy: actor.id,
    });
    if (!audited) warnings.push("History project tidak dapat ditulis.");

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
  db: Database,
  actor: Actor,
  projectId: string,
  input: ProjectFormInput & { reason?: string | null },
): Promise<ActionResult<UpdateProjectResult>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;

  if (ctx.access === "VIEW") return forbidden("mengubah project (akses read-only)");

  const fieldErrors = validateProjectForm(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali isian form.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  const patch: Record<string, unknown> = {
    code: input.code.trim(),
    name: input.name.trim(),
    customer_id: input.customer_id ?? null,
    product_id: input.product_id ?? null,
    market_id: input.market_id ?? null,
    location: input.location ?? null,
    period_label: input.period_label ?? null,
    pic_id: input.pic_id ?? null,
    status: input.status,
    notes: input.notes ?? null,
  };

  try {
    const previous = ctx.project;
    const codeOwner = await db.select<{ id: string }>("projects", {
      where: [eq("code", patch.code as string)],
      limit: 1,
    });
    if (codeOwner.rows.length > 0 && codeOwner.rows[0]!.id !== projectId) {
      return err("Project Code sudah dipakai project lain.", {
        fieldErrors: { code: "Project Code sudah dipakai project lain." },
        errorCode: "INVALID_INPUT",
      });
    }

    await db.update<Project>("projects", projectId, patch);

    const changed: Array<{ field: string; old: string | null; new: string | null }> = [];
    for (const [field, next] of Object.entries(patch)) {
      const before = (previous as unknown as Record<string, unknown>)[field];
      const a = before === null || before === undefined ? null : String(before);
      const b = next === null || next === undefined ? null : String(next);
      if (a !== b) changed.push({ field, old: a, new: b });
    }

    const warnings: string[] = [];
    if (changed.length > 0) {
      for (const c of changed) {
        const wrote = await recordHistory(db, {
          projectId,
          entity: "projects",
          entityId: projectId,
          action: "UPDATE",
          field: c.field,
          oldValue: c.old,
          newValue: c.new,
          reason: input.reason ?? "Project diubah",
          changedBy: actor.id,
        });
        if (!wrote) {
          warnings.push("Sebagian history tidak dapat ditulis.");
          break;
        }
      }
    }

    // Keep the PIC membership in sync when the PIC is reassigned: without a
    // project_members row the new PIC could not open the project (RLS).
    const newPic = input.pic_id ?? null;
    if (newPic && newPic !== previous.pic_id) {
      try {
        await db.insert("project_members", {
          project_id: projectId,
          profile_id: newPic,
          access_level: "EDIT",
        });
      } catch {
        warnings.push("PIC baru tersimpan, tetapi project_members gagal dibuat.");
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
    return forbidden("menghapus project (hanya ADMIN)");
  }
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;
    await db.remove("projects", projectId);
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
