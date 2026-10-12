import type { Actor } from "../auth/session";
import { canWriteProject, can } from "../auth/permissions";
import { atomic, eq, type Database } from "../data/db";
import type { ProjectSheetRow, ProjectSheetsDoc } from "../types/sheets";
import { defaultSheetsDoc, createProjectSheetsTemplate, parseSheetsDoc, saveUniverWorkbook } from "./sheets";
import { loadProjectContext, isActionErr } from "./access";
import { ok, err, toActionResultError, type ActionResult } from "./result";
import { bindings, bindingId, writeBoundValue, bindingPosition, bindField } from "../workbook/bindings";
import { calculateWorkbook } from "../workbook/calculation";
import { resolveProjectReferences } from "./references";

export interface EditorView { univerWorkbook: Record<string, unknown>; canWrite: boolean; revision: number; needsMapping: boolean }
type Row = Record<string, unknown> & { id: string };
const VENDOR_FIELDS = ["name", "base_price", "ppn_rate", "ppn_amount", "pbbkb_amount", "pph_amount", "oat_amount", "ppn_oat_amount", "bph_amount", "all_in_amount", "extra_component_label", "note"];
function ensureVendorBindings(snapshot: Record<string, unknown>, group: string, index: number): void {
  const sheets = snapshot.sheets as Record<string, { name: string; rowCount: number; columnCount: number; cellData: Record<number, Record<number, Record<string, unknown>>> }>;
  const sheet = sheets.procurement_inputs;
  if (!sheet) throw new Error("Hubungkan isian pemasok ke lembar kerja terlebih dahulu.");
  VENDOR_FIELDS.forEach((field, row) => {
    const key = `vendor.${group}.${field}`;
    if (bindingPosition(snapshot, key)) return;
    const position = 40 + index * 16 + row;
    sheet.cellData[position] ??= {};
    sheet.cellData[position]![9] = { v: `${index + 1}. ${field}` };
    sheet.rowCount = Math.max(sheet.rowCount, position + 1);
    bindField(snapshot, key, sheet.name, `K${position + 1}`);
  });
}
export async function loadProjectEditor(db: Database, actor: Actor, projectId: string): Promise<ActionResult<EditorView>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;
    let { rows } = await db.select<ProjectSheetRow>("project_sheets", { where: [eq("project_id", projectId)], limit: 1 });
    let doc: ProjectSheetsDoc;
    if (!rows[0]) {
      doc = createProjectSheetsTemplate({ code: ctx.project.code, name: ctx.project.name, location: ctx.project.location, periodLabel: ctx.project.period_label });
      if (db.local && canWriteProject(ctx.access)) {
        const created = await atomic(db, async (tx) => {
          const existing = await tx.select<ProjectSheetRow>("project_sheets", { where: [eq("project_id", projectId)], limit: 1 });
          if (existing.rows[0]) return existing.rows[0];
          await hydrateNewWorkbook(tx, projectId, doc);
          return tx.insert<ProjectSheetRow>("project_sheets", { project_id: projectId, doc, revision: 0 });
        });
        rows = [created]; doc = parseSheetsDoc(created.doc);
      }
    } else doc = parseSheetsDoc(rows[0].doc);
    return ok({ univerWorkbook: doc.univerWorkbook!, canWrite: canWriteProject(ctx.access), revision: rows[0]?.revision ?? doc.revision ?? 0, needsMapping: !Object.keys(bindings(doc.univerWorkbook!)).length });
  } catch (error) { return toActionResultError(error, "project_sheets"); }
}

/** Only a newly created template may be filled from the old structured data. */
export async function hydrateNewWorkbook(db: Database, projectId: string, doc: ProjectSheetsDoc): Promise<void> {
  const project = (await db.select<Row>("projects", { where: [eq("id", projectId)], limit: 1 })).rows[0]!;
  const snapshot = doc.univerWorkbook!;
  for (const [field, table, label] of [["customer", "customers", "name"], ["product", "products", "name"], ["pic", "profiles", "email"]] as const) {
    const id = project[`${field}_id`];
    const row = id ? (await db.select<Row>(table, { where: [eq("id", id)], limit: 1 })).rows[0] : null;
    writeBoundValue(snapshot, `project.${field}`, row?.[label] ?? null);
    if (field === "customer") writeBoundValue(snapshot, "ahs.customer", row?.[label] ?? null);
  }
  for (const field of ["name", "location", "period_label", "status", "volume"]) writeBoundValue(snapshot, `project.${field}`, project[field]);
  writeBoundValue(snapshot, "ahs.pekerjaan", project.name);
  writeBoundValue(snapshot, "ahs.lokasi", project.location);
  writeBoundValue(snapshot, "ahs.lokasi_ahs", project.location);
  writeBoundValue(snapshot, "ahs.volume", project.volume);
  const links = (await db.select<Row>("project_vendors", { where: [eq("project_id", projectId)] })).rows;
  for (const [index, link] of links.entries()) {
    const vendor = (await db.select<Row>("vendors", { where: [eq("id", link.vendor_id)], limit: 1 })).rows[0];
    const price = (await db.select<Row>("vendor_prices", { where: [eq("project_id", projectId), eq("vendor_id", link.vendor_id)], order: [{ column: "updated_at", ascending: false }], limit: 1 })).rows[0];
    const group = index < 4 ? `slot${index}` : `item_${link.id}`;
    ensureVendorBindings(snapshot, group, index);
    writeBoundValue(snapshot, `vendor.${group}.name`, vendor?.name);
    for (const [key, value] of Object.entries(price ?? {})) writeBoundValue(snapshot, `vendor.${group}.${key}`, value);
    await db.update("project_vendors", link.id, { workbook_binding: group });
  }
  doc.businessProjection = await calculateWorkbook(snapshot);
}

function setBoundFormula(snapshot: Record<string, unknown>, key: string, formula: string): void {
  const position = bindingPosition(snapshot, key); if (!position) return;
  const sheet = (snapshot.sheets as Record<string, { cellData: Record<number, Record<number, Record<string, unknown>>> }>)[position.sheetId]!;
  const row = sheet.cellData[position.row] ??= {};
  const { v: _v, si: _si, ...style } = row[position.col] ?? {};
  row[position.col] = { ...style, f: formula };
}

export async function syncStructuredWorkbook(db: Database, actor: Actor, projectId: string, fields: Record<string, unknown>): Promise<ActionResult<{ revision: number; calculationErrors: string[] }>> {
  const loaded = await loadProjectEditor(db, actor, projectId); if (!loaded.ok) return loaded;
  const snapshot = loaded.data.univerWorkbook;
  if (!Object.keys(bindings(snapshot)).length) return err("Hubungkan isian lembar kerja terlebih dahulu.", { errorCode: "INVALID_INPUT" });
  const sheets = snapshot.sheets as Record<string, { name: string; cellData: Record<number, Record<number, Record<string, unknown>>> }>;
  let extra = Object.keys(sheets.procurement_inputs?.cellData ?? {}).reduce((max, row) => Math.max(max, Number(row)), 20) + 2;
  const newCostGroups = new Set<string>();
  for (const [key, value] of Object.entries(fields)) {
    if (!bindingPosition(snapshot, key) && key.startsWith("cost.")) {
      const group = key.split(".")[1]!;
      if (!newCostGroups.has(group)) {
        newCostGroups.add(group);
        if (!sheets.procurement_inputs) {
          sheets.procurement_inputs = { name: "Data proyek", cellData: {} };
          Object.assign(sheets.procurement_inputs, { id: "procurement_inputs", rowCount: 200, columnCount: 50 });
          (snapshot.sheetOrder as string[]).push("procurement_inputs");
        }
        for (const [field, col] of [["description", "D"], ["rate", "E"], ["qty", "F"], ["total", "G"]]) bindField(snapshot, `cost.${group}.${field}`, "Data proyek", `${col}${extra}`);
        setBoundFormula(snapshot, `cost.${group}.total`, `=${bindingId(`cost.${group}.rate`)}*${bindingId(`cost.${group}.qty`)}`);
        extra++;
      }
    }
    if (!bindingPosition(snapshot, key)) return err("Hubungkan isian ini ke sel lembar kerja terlebih dahulu.", { errorCode: "INVALID_INPUT" });
    if (!key.endsWith(".total")) writeBoundValue(snapshot, key, value);
  }
  if (newCostGroups.size) {
    const position = bindingPosition(snapshot, "result.total_cost");
    const cell = position ? sheets[position.sheetId]?.cellData[position.row]?.[position.col] : null;
    if (typeof cell?.f === "string" && (/^=SUM\(N15:N31\)$/i.test(cell.f) || /^=SUM\(proc_cost_[a-zA-Z0-9_,]+\)$/i.test(cell.f))) {
      const extraRefs = [...newCostGroups].map((group) => bindingId(`cost.${group}.total`));
      setBoundFormula(snapshot, "result.total_cost", cell.f.slice(0, -1) + "," + extraRefs.join(",") + ")");
    }
  }
  return saveUniverWorkbook(db, actor, projectId, snapshot, { baseRevision: loaded.data.revision, mutationId: crypto.randomUUID() });
}

export async function applyWorkbookProjection(db: Database, actor: Actor, projectId: string, projection: NonNullable<ProjectSheetsDoc["businessProjection"]>): Promise<void> {
  const values = projection.values;
  if (!Object.keys(values).length) return;
  const has = (key: string) => Object.hasOwn(values, key);
  const text = (key: string) => typeof values[key] === "string" ? String(values[key]).trim() || null : null;
  if (has("project.name") && !text("project.name")) throw new Error("Nama proyek wajib diisi.");
  if (has("project.status") && !["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"].includes(text("project.status") ?? "")) throw new Error("Pilih status proyek yang tersedia.");
  const refs = await resolveProjectReferences(db, { customer: text("project.customer"), product: text("project.product"), market: text("project.location"), pic: text("project.pic") }, actor);
  if (Object.keys(refs.fieldErrors).length) throw new Error(Object.values(refs.fieldErrors).join(" "));
  const patch: Record<string, unknown> = {};
  for (const field of ["name", "location", "period_label"]) if (has(`project.${field}`)) patch[field] = text(`project.${field}`) ?? (field === "name" ? "" : null);
  for (const [field, id] of Object.entries(refs.ids)) {
    const key = field === "market_id" ? "project.location" : `project.${field.replace("_id", "")}`;
    if (has(key)) patch[field] = id;
  }
  const status = text("project.status");
  if (status && ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"].includes(status)) patch.status = status;
  await db.update("projects", projectId, patch);
  if (patch.pic_id) {
    const members = await db.select("project_members", { where: [eq("project_id", projectId), eq("profile_id", patch.pic_id)], limit: 1 });
    if (!members.rows.length) await db.insert("project_members", { project_id: projectId, profile_id: patch.pic_id, access_level: "EDIT" });
  }
  if (has("project.volume")) {
    const volume = values["project.volume"];
    const number = volume == null || volume === "" ? null : Number(volume);
    if (number !== null && (!Number.isFinite(number) || number < 0)) throw new Error("Volume tidak valid.");
    await db.update("projects", projectId, { volume: number });
  }
  const vendorGroups = new Set(Object.keys(values).filter((key) => key.startsWith("vendor.")).map((key) => key.split(".")[1]!));
  const links = (await db.select<Row>("project_vendors", { where: [eq("project_id", projectId)] })).rows;
  for (const group of vendorGroups) {
    const name = text(`vendor.${group}.name`);
    const bound = links.find((link) => link.workbook_binding === group);
    if (!name || /^(Vendor|Pemasok) \d+$/i.test(name)) {
      if (bound) await db.remove("project_vendors", bound.id);
      continue;
    }
    const candidates = (await db.select<Row>("vendors", { where: [{ column: "name", op: "ilike", value: name }] })).rows;
    let vendor = candidates.find((row) => String(row.name).trim().toLowerCase() === name.toLowerCase());
    if (!vendor) {
      if (!can("write_master_data", actor.role)) throw new Error("Pemasok belum terdaftar. Hubungi penanggung jawab data pemasok.");
      vendor = await db.insert<Row>("vendors", { name, status: "ACTIVE", created_by: actor.id });
    }
    const link = (await db.select<Row>("project_vendors", { where: [eq("project_id", projectId), eq("vendor_id", vendor.id)], limit: 1 })).rows[0];
    if (bound && bound.vendor_id !== vendor.id) await db.remove("project_vendors", bound.id);
    if (!link) await db.insert("project_vendors", { project_id: projectId, vendor_id: vendor.id, is_selected: bound?.is_selected ?? false, workbook_binding: group });
    else await db.update("project_vendors", link.id, { workbook_binding: group });
    const previous = (await db.select<Row>("vendor_prices", { where: [eq("project_id", projectId), eq("vendor_id", vendor.id)], order: [{ column: "updated_at", ascending: false }], limit: 1 })).rows[0];
    const data = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith(`vendor.${group}.`) && !key.endsWith(".name")).map(([key, value]) => [key.split(".")[2]!, value]));
    if (previous) await db.update("vendor_prices", previous.id, data);
    else await db.insert("vendor_prices", { ...data, project_id: projectId, vendor_id: vendor.id, created_by: actor.id });
  }
}

/** Structured forms update the same bound cells; they never rewrite the template. */
export async function patchWorkbookFields(db: Database, actor: Actor, projectId: string, fields: Record<string, unknown>): Promise<ActionResult<{ revision: number; calculationErrors: string[] }>> {
  const loaded = await loadProjectEditor(db, actor, projectId);
  if (!loaded.ok) return loaded;
  const snapshot = loaded.data.univerWorkbook;
  for (const [key, value] of Object.entries(fields)) {
    if (!bindingPosition(snapshot, key)) return err("Hubungkan isian ini ke sel lembar kerja terlebih dahulu.", { errorCode: "INVALID_INPUT" });
    writeBoundValue(snapshot, key, value);
  }
  return saveUniverWorkbook(db, actor, projectId, snapshot, { baseRevision: loaded.data.revision, mutationId: crypto.randomUUID() });
}

export function emptyEditorDocument(): ProjectSheetsDoc { return defaultSheetsDoc(); }

export async function patchVendorWorkbook(db: Database, actor: Actor, projectId: string, vendorId: string, fields: Record<string, unknown>, options: { ppnFormula?: boolean; allInVariant?: "F002A" | "F002B" } = {}): Promise<ActionResult<{ revision: number; calculationErrors: string[] }>> {
  const loaded = await loadProjectEditor(db, actor, projectId); if (!loaded.ok) return loaded;
  const snapshot = loaded.data.univerWorkbook;
  if (loaded.data.needsMapping) return err("Hubungkan isian pemasok ke lembar kerja terlebih dahulu.", { errorCode: "INVALID_INPUT" });
  const links = (await db.select<Row>("project_vendors", { where: [eq("project_id", projectId)] })).rows;
  const link = links.find((item) => item.vendor_id === vendorId);
  if (!link) return err("Pemasok belum ditambahkan pada proyek ini.", { errorCode: "NOT_FOUND" });
  const vendor = (await db.select<Row>("vendors", { where: [eq("id", vendorId)], limit: 1 })).rows[0]!;
  const index = links.indexOf(link);
  const group = typeof link.workbook_binding === "string" ? link.workbook_binding : `item_${link.id}`;
  ensureVendorBindings(snapshot, group, index);
  writeBoundValue(snapshot, `vendor.${group}.name`, vendor.name);
  for (const [key, value] of Object.entries(fields)) {
    if (!writeBoundValue(snapshot, `vendor.${group}.${key}`, value)) return err("Isian pemasok belum terhubung ke lembar kerja.", { errorCode: "INVALID_INPUT" });
  }
  const cellValue = (field: string) => {
    const at = bindingPosition(snapshot, `vendor.${group}.${field}`)!;
    return (snapshot.sheets as Record<string, { cellData: Record<number, Record<number, Record<string, unknown>>> }>)[at.sheetId]?.cellData[at.row]?.[at.col];
  };
  if (options.ppnFormula && !cellValue("ppn_amount")?.f && cellValue("ppn_amount")?.v == null) {
    setBoundFormula(snapshot, `vendor.${group}.ppn_amount`, `=${bindingId(`vendor.${group}.base_price`)}*${bindingId(`vendor.${group}.ppn_rate`)}`);
  }
  if (!cellValue("all_in_amount")?.f && cellValue("all_in_amount")?.v == null) {
    const components = ["base_price", "ppn_amount", "pbbkb_amount", "pph_amount", "oat_amount", "ppn_oat_amount", ...(options.allInVariant === "F002A" ? [] : ["bph_amount"])];
    setBoundFormula(snapshot, `vendor.${group}.all_in_amount`, `=SUM(${components.map((field) => bindingId(`vendor.${group}.${field}`)).join(",")})`);
  }
  await db.update("project_vendors", link.id, { workbook_binding: group });
  return saveUniverWorkbook(db, actor, projectId, snapshot, { baseRevision: loaded.data.revision, mutationId: crypto.randomUUID() });
}
