/**
 * Vendor module — master data, project assignment, vendor price and vendor
 * comparison (PRD §10–§12, Phase 3 §10–§11).
 *
 * Every derived number (PPN, ALL IN) comes from the calculation engine
 * (registry formulas F001 / F002A / F002B). Nothing is computed in React.
 *
 * Missing components stay NULL and are rendered "-" — an empty Excel cell is
 * never turned into Rp 0 (PRD §11).
 */

import { can } from "../auth/permissions";
import type { Actor } from "../auth/session";
import { calculateVendorAllIn, calculateVendorPpn } from "../calculations/vendor";
import { validateVendorPrice } from "../calculations/validation";
import { CalculationError } from "../calculations/errors";
import { eq, searchAcross, type Database } from "../data/db";
import { createVendorRepository } from "../data/repositories/vendor-repository";
import { parseNumericInput, toNumber } from "../format";
import type { ProjectVendor, Vendor, VendorPrice } from "../types/domain";
import { isActionErr, loadProjectContext } from "./access";
import { buildImpact, recordHistory } from "./history";
import { buildPage, normalisePage, normalisePageSize, toRange, type Page } from "./pagination";
import { err, forbidden, notFound, ok, toActionResultError, type ActionResult } from "./result";

export interface VendorListRowView {
  vendor: Vendor;
  project_count: number;
  price_count: number;
}

export interface VendorListFilters {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function listVendors(
  db: Database,
  _actor: Actor,
  filters: VendorListFilters = {},
): Promise<ActionResult<Page<VendorListRowView>>> {
  try {
    const repo = createVendorRepository(db);
    const { rows, count } = await repo.list(filters);

    const vendorIds = rows.map((v) => v.id);
    const [links, prices] = await Promise.all([
      repo.getProjectLinks(vendorIds),
      repo.getPrices(vendorIds),
    ]);

    const projectCount = new Map<string, number>();
    for (const l of links) {
      projectCount.set(l.vendor_id, (projectCount.get(l.vendor_id) ?? 0) + 1);
    }
    const priceCount = new Map<string, number>();
    for (const p of prices) {
      priceCount.set(p.vendor_id, (priceCount.get(p.vendor_id) ?? 0) + 1);
    }

    const views: VendorListRowView[] = rows.map((vendor) => ({
      vendor,
      project_count: projectCount.get(vendor.id) ?? 0,
      price_count: priceCount.get(vendor.id) ?? 0,
    }));

    const page = normalisePage(filters.page);
    const pageSize = normalisePageSize(filters.pageSize);
    return ok(buildPage(views, count, page, pageSize));
  } catch (e) {
    return toActionResultError(e, "vendors");
  }
}

export async function getVendor(db: Database, vendorId: string): Promise<ActionResult<Vendor>> {
  try {
    const repo = createVendorRepository(db);
    const vendor = await repo.getById(vendorId);
    if (!vendor) return notFound("Vendor");
    return ok(vendor);
  } catch (e) {
    return toActionResultError(e, "vendors");
  }
}

export interface VendorFormInput {
  name: string;
  contact?: string | null;
  armada?: string | null;
  stock?: string | null;
  permit?: string | null;
  address?: string | null;
  notes?: string | null;
  status: string;
}

export function validateVendorForm(input: VendorFormInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name || input.name.trim() === "") errors.name = "Nama vendor wajib diisi.";
  else if (input.name.trim().length > 200) errors.name = "Nama vendor maksimal 200 karakter.";
  if (input.status !== "ACTIVE" && input.status !== "INACTIVE") {
    errors.status = "Status vendor harus ACTIVE atau INACTIVE.";
  }
  return errors;
}

export async function createVendor(
  db: Database,
  actor: Actor,
  input: VendorFormInput,
): Promise<ActionResult<Vendor>> {
  if (!can("write_master_data", actor.role)) return forbidden("menambah vendor");

  const fieldErrors = validateVendorForm(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali isian form.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  try {
    const repo = createVendorRepository(db);
    const duplicate = await repo.findByName(input.name.trim());
    if (duplicate) {
      return err("Nama vendor sudah terdaftar.", {
        fieldErrors: { name: "Nama vendor sudah terdaftar." },
        errorCode: "INVALID_INPUT",
      });
    }

    const vendor = await repo.create({
      name: input.name.trim(),
      contact: input.contact ?? null,
      armada: input.armada ?? null,
      stock: input.stock ?? null,
      permit: input.permit ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      status: input.status,
      created_by: actor.id,
    });
    return ok(vendor);
  } catch (e) {
    return toActionResultError(e, "vendors");
  }
}

export async function updateVendor(
  db: Database,
  actor: Actor,
  vendorId: string,
  input: VendorFormInput,
): Promise<ActionResult<Vendor>> {
  if (!can("write_master_data", actor.role)) return forbidden("mengubah vendor");

  const fieldErrors = validateVendorForm(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali isian form.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  try {
    const repo = createVendorRepository(db);
    const vendor = await repo.update(vendorId, {
      name: input.name.trim(),
      contact: input.contact ?? null,
      armada: input.armada ?? null,
      stock: input.stock ?? null,
      permit: input.permit ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      status: input.status,
    });
    return ok(vendor);
  } catch (e) {
    return toActionResultError(e, "vendors");
  }
}

// ---------------------------------------------------------------- project vendors

export interface ProjectVendorView {
  link: ProjectVendor;
  vendor: Vendor;
  price: VendorPriceRowView | null;
  /** Human-readable availability, taken from the vendor master (never invented). */
  availability: string | null;
}

export interface VendorPriceRowView {
  id: string;
  project_id: string;
  vendor_id: string;
  scenario_id: string | null;
  base_price: number | null;
  ppn_rate: number | null;
  ppn_amount: number | null;
  pbbkb_amount: number | null;
  pph_amount: number | null;
  oat_amount: number | null;
  ppn_oat_amount: number | null;
  bph_amount: number | null;
  extra_component_label: string | null;
  all_in_amount: number | null;
  all_in_formula_id: string | null;
  ppn_is_formula: boolean;
  note: string | null;
  updated_at: string;
}

export function toVendorPriceView(row: VendorPrice): VendorPriceRowView {
  return {
    id: row.id,
    project_id: row.project_id,
    vendor_id: row.vendor_id,
    scenario_id: row.scenario_id,
    base_price: toNumber(row.base_price),
    ppn_rate: toNumber(row.ppn_rate),
    ppn_amount: toNumber(row.ppn_amount),
    pbbkb_amount: toNumber(row.pbbkb_amount),
    pph_amount: toNumber(row.pph_amount),
    oat_amount: toNumber(row.oat_amount),
    ppn_oat_amount: toNumber(row.ppn_oat_amount),
    bph_amount: toNumber(row.bph_amount),
    extra_component_label: row.extra_component_label,
    all_in_amount: toNumber(row.all_in_amount),
    all_in_formula_id: row.all_in_formula_id,
    ppn_is_formula: row.ppn_is_formula,
    note: row.note,
    updated_at: row.updated_at,
  };
}

export function vendorAvailability(vendor: Vendor): string | null {
  const parts = [vendor.stock, vendor.armada].filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export async function listProjectVendors(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<ProjectVendorView[]>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;

    const repo = createVendorRepository(db);
    const links = await repo.listProjectVendors(projectId);
    if (links.length === 0) return ok([]);

    const vendorIds = links.map((l) => l.vendor_id);
    const [vendorsRows, pricesRows] = await Promise.all([
      repo.listProjectVendorsData(vendorIds),
      repo.listProjectVendorPrices(projectId, vendorIds),
    ]);

    const vendorById = new Map(vendorsRows.map((v) => [v.id, v]));
    const latestPrice = new Map<string, VendorPrice>();
    for (const price of pricesRows) {
      if (!latestPrice.has(price.vendor_id)) latestPrice.set(price.vendor_id, price);
    }

    const views: ProjectVendorView[] = [];
    for (const link of links) {
      const vendor = vendorById.get(link.vendor_id);
      if (!vendor) continue;
      const price = latestPrice.get(link.vendor_id);
      views.push({
        link,
        vendor,
        price: price ? toVendorPriceView(price) : null,
        availability: vendorAvailability(vendor),
      });
    }
    return ok(views);
  } catch (e) {
    return toActionResultError(e, "project_vendors");
  }
}

export async function addVendorToProject(
  db: Database,
  actor: Actor,
  projectId: string,
  vendorId: string,
  evaluationNote?: string | null,
): Promise<ActionResult<ProjectVendor>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("menambahkan vendor ke project (akses read-only)");

  try {
    const repo = createVendorRepository(db);
    const vendor = await repo.getById(vendorId);
    if (!vendor) return notFound("Vendor");

    const existing = await repo.getProjectLink(projectId, vendorId);
    if (existing) {
      return err("Vendor sudah ada pada project ini.", {
        fieldErrors: { vendor_id: "Vendor sudah ada pada project ini." },
        errorCode: "INVALID_INPUT",
      });
    }

    const link = await repo.createProjectLink({
      project_id: projectId,
      vendor_id: vendorId,
      is_selected: false,
      evaluation_note: evaluationNote ?? null,
    });

    const warnings: string[] = [];
    const audited = await recordHistory(db, {
      projectId,
      entity: "project_vendors",
      entityId: link.id,
      action: "INSERT",
      field: "vendor",
      oldValue: null,
      newValue: vendor.name,
      reason: "Vendor ditambahkan ke project",
      changedBy: actor.id,
    });
    if (!audited) warnings.push("History tidak dapat ditulis.");

    return ok(link, warnings);
  } catch (e) {
    return toActionResultError(e, "project_vendors");
  }
}

/**
 * KOLOM VENDOR LANGSUNG DI WORKSPACE.
 *
 * User cukup MENGETIK nama vendor — tidak ada master data yang perlu diisi,
 * tidak ada halaman vendor terpisah. Baris vendor dibuat/ditemukan di belakang
 * layar dan langsung ditautkan ke project, sehingga harga bisa diisi di kolom
 * itu seperti di Excel.
 */
export async function addVendorColumnByName(
  db: Database,
  actor: Actor,
  projectId: string,
  name: string,
): Promise<ActionResult<{ link: ProjectVendor; vendor: Vendor }>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("menambah kolom vendor (akses lihat saja)");

  const trimmed = name.trim();
  if (trimmed === "") {
    return err("Nama vendor wajib diisi.", {
      errorCode: "INVALID_INPUT",
      fieldErrors: { name: "Nama vendor wajib diisi." },
    });
  }
  if (trimmed.length > 120) {
    return err("Nama vendor maksimal 120 karakter.", {
      errorCode: "INVALID_INPUT",
      fieldErrors: { name: "Nama vendor terlalu panjang." },
    });
  }

  try {
    const repo = createVendorRepository(db);
    let vendor = await repo.findByName(trimmed);
    if (!vendor) {
      vendor = await repo.create({ name: trimmed, status: "ACTIVE" });
    }

    const existing = await repo.getProjectLink(projectId, vendor.id);
    if (existing) return ok({ link: existing, vendor });

    const added = await addVendorToProject(db, actor, projectId, vendor.id);
    if (!added.ok) return added;
    return ok({ link: added.data, vendor }, added.warnings);
  } catch (e) {
    return toActionResultError(e, "project_vendors");
  }
}

/** Ganti nama kolom vendor langsung dari header kolom di workspace. */
export async function renameVendorColumn(
  db: Database,
  actor: Actor,
  projectId: string,
  vendorId: string,
  name: string,
): Promise<ActionResult<Vendor>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("mengubah nama vendor (akses lihat saja)");

  const trimmed = name.trim();
  if (trimmed === "") {
    return err("Nama vendor tidak boleh kosong.", { errorCode: "INVALID_INPUT" });
  }

  try {
    const repo = createVendorRepository(db);
    const vendor = await repo.getById(vendorId);
    if (!vendor) return notFound("Vendor");
    if (vendor.name === trimmed) return ok(vendor);

    const updated = await repo.update(vendorId, { name: trimmed });
    await recordHistory(db, {
      projectId,
      entity: "vendors",
      entityId: vendorId,
      action: "UPDATE",
      field: "name",
      oldValue: vendor.name,
      newValue: trimmed,
      reason: "Nama vendor diubah dari workspace",
      changedBy: actor.id,
    });
    return ok(updated);
  } catch (e) {
    return toActionResultError(e, "vendors");
  }
}

export async function removeVendorFromProject(
  db: Database,
  actor: Actor,
  projectId: string,
  linkId: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("menghapus vendor dari project (akses read-only)");

  try {
    const repo = createVendorRepository(db);
    const link = await repo.getProjectLinkById(linkId);
    if (!link || link.project_id !== projectId) return notFound("Vendor pada project");

    await repo.removeProjectLink(linkId);

    const warnings: string[] = [];
    const audited = await recordHistory(db, {
      projectId,
      entity: "project_vendors",
      entityId: linkId,
      action: "DELETE",
      field: "vendor",
      oldValue: link.vendor_id,
      newValue: null,
      reason: "Vendor dihapus dari project",
      changedBy: actor.id,
    });
    if (!audited) warnings.push("History tidak dapat ditulis.");

    return ok({ id: linkId }, warnings);
  } catch (e) {
    return toActionResultError(e, "project_vendors");
  }
}

export async function setSelectedVendor(
  db: Database,
  actor: Actor,
  projectId: string,
  linkId: string,
  isSelected: boolean,
): Promise<ActionResult<ProjectVendor>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("mengubah vendor terpilih (akses read-only)");
  try {
    const repo = createVendorRepository(db);
    const link = await repo.updateProjectLink(linkId, {
      is_selected: isSelected,
    });
    return ok(link);
  } catch (e) {
    return toActionResultError(e, "project_vendors");
  }
}

// ---------------------------------------------------------------- vendor price

export interface VendorPriceInput {
  base_price: number | null;
  ppn_rate?: number | null;
  /** Excel sometimes types the PPN amount directly (data, not formula). */
  ppn_amount?: number | null;
  ppn_is_formula?: boolean;
  pbbkb_amount?: number | null;
  pph_amount?: number | null;
  oat_amount?: number | null;
  ppn_oat_amount?: number | null;
  bph_amount?: number | null;
  extra_component_label?: string | null;
  all_in_variant?: "F002A" | "F002B";
  note?: string | null;
  reason?: string | null;
}

export interface VendorPriceComputation {
  ppn: number;
  plus: number[];
  all_in: number;
  all_in_formula_id: string;
  ppn_formula_id: string;
}

/**
 * Pure computation helper (no I/O) so the vendor arithmetic can be unit-tested
 * directly against the registry.
 */
export function computeVendorPrice(input: VendorPriceInput): ActionResult<VendorPriceComputation> {
  const invalid = validateVendorPrice(input.base_price);
  if (invalid) {
    return err(invalid.message, {
      errorCode: invalid.errorCode,
      fieldErrors: { base_price: invalid.message },
    });
  }

  const basePrice = input.base_price as number;
  const ppnRate = input.ppn_rate ?? 0.11;
  const ppnIsFormula = input.ppn_is_formula !== false;

  try {
    const ppn = ppnIsFormula ? calculateVendorPpn(basePrice, ppnRate) : (input.ppn_amount ?? 0);
    const components = {
      base_price: basePrice,
      ppn,
      pbbkb: input.pbbkb_amount ?? 0,
      pph: input.pph_amount ?? 0,
      oat: input.oat_amount ?? 0,
      ppn_oat: input.ppn_oat_amount ?? 0,
      bph: input.bph_amount ?? 0,
    };
    const variant = input.all_in_variant ?? "F002B";
    const allIn = calculateVendorAllIn(components, variant);
    return ok({
      ppn,
      plus: [components.pbbkb, components.pph, components.oat, components.ppn_oat, components.bph],
      all_in: allIn,
      all_in_formula_id: variant,
      ppn_formula_id: ppnIsFormula ? "F001" : "TYPED_LITERAL",
    });
  } catch (e) {
    if (e instanceof CalculationError) {
      return err(e.message, { errorCode: e.errorCode });
    }
    return err(e instanceof Error ? e.message : String(e), { errorCode: "EXPRESSION_ERROR" });
  }
}

export async function saveVendorPrice(
  db: Database,
  actor: Actor,
  projectId: string,
  vendorId: string,
  input: VendorPriceInput,
): Promise<ActionResult<VendorPriceRowView>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("menyimpan harga vendor (akses read-only)");

  const computed = computeVendorPrice(input);
  if (!computed.ok) return computed;

  try {
    const repo = createVendorRepository(db);
    const vendor = await repo.getById(vendorId);
    if (!vendor) return notFound("Vendor");

    const previous = await repo.getLatestPrice(projectId, vendorId);

    const payload: Record<string, unknown> = {
      project_id: projectId,
      vendor_id: vendorId,
      base_price: input.base_price,
      ppn_rate: input.ppn_rate ?? 0.11,
      ppn_amount: computed.data.ppn,
      ppn_is_formula: input.ppn_is_formula !== false,
      pbbkb_amount: input.pbbkb_amount ?? null,
      pph_amount: input.pph_amount ?? null,
      oat_amount: input.oat_amount ?? null,
      ppn_oat_amount: input.ppn_oat_amount ?? null,
      bph_amount: input.bph_amount ?? null,
      extra_component_label: input.extra_component_label ?? null,
      all_in_amount: computed.data.all_in,
      all_in_formula_id: computed.data.all_in_formula_id,
      note: input.note ?? null,
      created_by: actor.id,
    };

    const saved = previous
      ? await repo.updatePrice(previous.id, payload)
      : await repo.createPrice(payload);

    const warnings: string[] = [];
    const before = previous ? toNumber(previous.all_in_amount) : null;
    const audited = await recordHistory(db, {
      projectId,
      entity: "vendor_prices",
      entityId: saved.id,
      action: previous ? "UPDATE" : "INSERT",
      field: "base_price",
      oldValue: previous ? toNumber(previous.base_price) : null,
      newValue: input.base_price,
      reason: input.reason ?? (previous ? "Harga vendor diubah" : "Harga vendor ditambahkan"),
      impact: buildImpact(
        { all_in: before },
        { all_in: computed.data.all_in },
      ),
      changedBy: actor.id,
    });
    if (!audited) warnings.push("History tidak dapat ditulis.");

    return ok(toVendorPriceView(saved), warnings);
  } catch (e) {
    return toActionResultError(e, "vendor_prices");
  }
}

// ------------------------------------------------- inline (spreadsheet) edits

/** Kolom harga vendor yang bisa diubah langsung dari satu sel spreadsheet. */
export const VENDOR_PRICE_CELL_FIELDS = [
  "base_price",
  "ppn_amount",
  "pbbkb_amount",
  "pph_amount",
  "oat_amount",
  "ppn_oat_amount",
  "bph_amount",
  "extra_component_label",
  "note",
] as const;

const VENDOR_TEXT_CELL_FIELDS = new Set<string>(["extra_component_label", "note"]);

/**
 * SPREADSHEET CELL EDIT — ubah SATU sel harga vendor (kolom vendor di grid
 * evaluasi). Harga yang belum pernah diisi akan dibuat; komponen lain disalin
 * dari baris harga terakhir supaya tidak tertimpa.
 */
export async function updateVendorPriceCell(
  db: Database,
  actor: Actor,
  projectId: string,
  vendorId: string,
  field: string,
  raw: string,
): Promise<ActionResult<VendorPriceRowView>> {
  if (!(VENDOR_PRICE_CELL_FIELDS as readonly string[]).includes(field)) {
    return err(`Kolom "${field}" tidak dapat diisi dari grid.`, { errorCode: "INVALID_INPUT" });
  }

  try {
    const repo = createVendorRepository(db);
    const previous = await repo.getLatestPrice(projectId, vendorId);
    const current = previous ? toVendorPriceView(previous) : null;

    const merged: VendorPriceInput = {
      base_price: current?.base_price ?? null,
      ppn_rate: current?.ppn_rate ?? 0.11,
      ppn_amount: current?.ppn_amount ?? null,
      ppn_is_formula: current?.ppn_is_formula ?? true,
      pbbkb_amount: current?.pbbkb_amount ?? null,
      pph_amount: current?.pph_amount ?? null,
      oat_amount: current?.oat_amount ?? null,
      ppn_oat_amount: current?.ppn_oat_amount ?? null,
      bph_amount: current?.bph_amount ?? null,
      extra_component_label: current?.extra_component_label ?? null,
      all_in_variant: current?.all_in_formula_id === "F002A" ? "F002A" : "F002B",
      note: current?.note ?? null,
      reason: "Sel harga vendor diubah dari grid spreadsheet",
    };

    if (VENDOR_TEXT_CELL_FIELDS.has(field)) {
      (merged as unknown as Record<string, unknown>)[field] = raw.trim() === "" ? null : raw.trim();
    } else {
      const parsed = parseNumericInput(raw);
      if (parsed === null && raw.trim() !== "") {
        return err(`Nilai "${raw}" bukan angka.`, {
          errorCode: "INVALID_INPUT",
          fieldErrors: { [field]: "Bukan angka." },
        });
      }
      (merged as unknown as Record<string, unknown>)[field] = parsed;
      // Harga dasar yang diisi langsung menggantikan perhitungan PPN? Tidak:
      // PPN tetap dihitung engine dari rate yang berlaku (F001).
    }

    return saveVendorPrice(db, actor, projectId, vendorId, merged);
  } catch (e) {
    return toActionResultError(e, "vendor_prices");
  }
}

// ---------------------------------------------------------------- comparison

export const VENDOR_COMPONENT_ROWS: Array<{
  key: keyof VendorPriceRowView;
  label: string;
}> = [
  { key: "base_price", label: "Base Price" },
  { key: "ppn_amount", label: "PPN" },
  { key: "pbbkb_amount", label: "PBBKB" },
  { key: "pph_amount", label: "PPH" },
  { key: "oat_amount", label: "OAT" },
  { key: "ppn_oat_amount", label: "PPN OAT" },
  { key: "bph_amount", label: "BPH" },
  { key: "all_in_amount", label: "ALL IN" },
];

export interface VendorComparisonVendor {
  vendor_id: string;
  link_id: string;
  name: string;
  is_selected: boolean;
  availability: string | null;
  note: string | null;
  has_price: boolean;
}

export interface VendorComparisonRow {
  key: string;
  label: string;
  /** One cell per vendor, in the same order as `vendors`. */
  cells: Array<{ value: number | null; formula_id: string | null }>;
  /** Cheapest non-null ALL IN cell per row (used for highlighting only). */
  best_index?: number;
}

export interface VendorComparisonView {
  project_id: string;
  vendors: VendorComparisonVendor[];
  rows: VendorComparisonRow[];
  /** Indexes (into `vendors`) with a complete ALL IN price. */
  priced_indexes: number[];
  unpriced_indexes: number[];
}

export async function buildVendorComparison(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<VendorComparisonView>> {
  const listed = await listProjectVendors(db, actor, projectId);
  if (!listed.ok) return listed;
  const entries = listed.data;

  const vendors: VendorComparisonVendor[] = entries.map((e) => ({
    vendor_id: e.vendor.id,
    link_id: e.link.id,
    name: e.vendor.name,
    is_selected: e.link.is_selected,
    availability: e.availability,
    note: e.link.evaluation_note,
    has_price: e.price !== null && e.price.base_price !== null,
  }));

  const rows: VendorComparisonRow[] = VENDOR_COMPONENT_ROWS.map(({ key, label }) => {
    const cells = entries.map((e) => {
      if (!e.price) return { value: null, formula_id: null };
      const raw = e.price[key];
      const formulaId =
        key === "ppn_amount"
          ? e.price.ppn_is_formula
            ? "F001"
            : "TYPED_LITERAL"
          : key === "all_in_amount"
            ? e.price.all_in_formula_id
            : null;
      return { value: typeof raw === "number" ? raw : null, formula_id: formulaId };
    });
    return { key: String(key), label, cells };
  });

  const allInRow = rows.find((r) => r.key === "all_in_amount");
  if (allInRow) {
    let bestIndex: number | undefined;
    let bestValue = Number.POSITIVE_INFINITY;
    allInRow.cells.forEach((cell, index) => {
      if (cell.value !== null && cell.value < bestValue) {
        bestValue = cell.value;
        bestIndex = index;
      }
    });
    if (bestIndex !== undefined) allInRow.best_index = bestIndex;
  }

  const pricedIndexes: number[] = [];
  const unpricedIndexes: number[] = [];
  vendors.forEach((v, index) => {
    // A vendor with no price is NOT zero — it is simply not comparable yet.
    if (v.has_price) pricedIndexes.push(index);
    else unpricedIndexes.push(index);
  });

  return ok({ project_id: projectId, vendors, rows, priced_indexes: pricedIndexes, unpriced_indexes: unpricedIndexes });
}

export async function listProjectVendorPrices(
  db: Database,
  projectId: string,
): Promise<ActionResult<VendorPriceRowView[]>> {
  try {
    const repo = createVendorRepository(db);
    const prices = await repo.listAllProjectVendorPrices(projectId);
    return ok(prices.map(toVendorPriceView));
  } catch (e) {
    return toActionResultError(e, "vendor_prices");
  }
}
