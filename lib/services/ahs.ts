/**
 * AHS module — selling price, revenue, dynamic cost items and the calculation
 * result (PRD §15–§21, Phase 3 §12/§14).
 *
 * ARCHITECTURE NOTE (important):
 *   The `ahs` table holds INPUT columns only. Its calculated columns
 *   (revenue, total_cost, gross_profit, ...) are protected in the database by
 *   trg_ahs_protect_calculated, which requires the `app.calculation_engine`
 *   setting that only a database session can raise. PostgREST cannot set it, so
 *   the application NEVER writes those columns — the engine's output is
 *   persisted in `calculation_results` (one row per scenario, written once).
 *   `previewAhsCalculation()` returns the same engine output WITHOUT writing,
 *   which is what powers live recalculation (Phase 3 §14).
 *
 * Cost item totals are written, because `ahs_cost_items.total` is not a
 * protected column and the value still comes from the engine (F007).
 */

import { can } from "../auth/permissions";
import type { Actor } from "../auth/session";
import { calculateAhs } from "../calculations/ahs";
import { validateCostLine } from "../calculations/validation";
import { evaluateExpression } from "../calculations/expression";
import type { AhsInput, AhsResult, CostLineInput, CostLineResult } from "../calculations/types";
import { eq, type Database } from "../data/db";
import { parseNumericInput, toNumber } from "../format";
import type { Ahs, AhsCostItem, CalculationTemplateRow } from "../types/domain";
import { isActionErr, loadProjectContext } from "./access";
import { buildImpact, recordHistory } from "./history";
import { err, forbidden, notFound, ok, toActionResultError, type ActionResult } from "./result";
import { fromCalcFailure } from "./result";

/** Cost categories present in the workbook (mapping doc §C.1.4). Suggested, not enforced. */
export const COST_CATEGORIES = [
  "HPP",
  "PAJAK",
  "COST OF FUND",
  "OPERATIONAL",
  "ASSET",
  "COORDINATION",
  "RELATION",
  "RISK",
  "OTHER",
] as const;

export const DEFAULT_TEMPLATE_ID = "T_A_AHS_STANDARD";

export interface AhsInputsView {
  volume: number | null;
  harga_jual_include: number | null;
  include_divisor: number | null;
  ppn_rate: number | null;
  pbbkb_rate: number | null;
  pph_inu_rate: number | null;
  bph_migas_rate: number | null;
  harga_keekonomian: number | null;
  marketing: string | null;
  payment_term: string | null;
  document_scheme: string | null;
  analysis_date: string | null;
  notes: string | null;
}

export interface CostItemView {
  id: string;
  ahs_id: string;
  scenario_id: string | null;
  line_no: number;
  category: string | null;
  description: string;
  unit: string | null;
  rate: number | null;
  qty: number | null;
  total: number | null;
  formula_id: string | null;
  is_summed_in_total: boolean;
}

export interface AhsBundle {
  ahs: Ahs | null;
  template: CalculationTemplateRow | null;
  inputs: AhsInputsView | null;
  costItems: CostItemView[];
  /** Engine preview of the CURRENT inputs (null when inputs are incomplete). */
  preview: AhsResult | null;
  /** Engine failure for the current inputs (never NaN — the engine's message). */
  previewError: { errorCode: string; message: string; field?: string } | null;
}

export function toCostItemView(row: AhsCostItem): CostItemView {
  return {
    id: row.id,
    ahs_id: row.ahs_id,
    scenario_id: row.scenario_id,
    line_no: row.line_no,
    category: row.category,
    description: row.description,
    unit: row.unit,
    rate: toNumber(row.rate),
    qty: toNumber(row.qty),
    total: toNumber(row.total),
    formula_id: row.formula_id,
    is_summed_in_total: row.is_summed_in_total,
  };
}

export function toInputsView(ahs: Ahs): AhsInputsView {
  return {
    volume: toNumber(ahs.volume),
    harga_jual_include: toNumber(ahs.harga_jual_include),
    include_divisor: toNumber(ahs.include_divisor),
    ppn_rate: toNumber(ahs.ppn_rate),
    pbbkb_rate: toNumber(ahs.pbbkb_rate),
    pph_inu_rate: toNumber(ahs.pph_inu_rate),
    bph_migas_rate: toNumber(ahs.bph_migas_rate),
    harga_keekonomian: toNumber(ahs.harga_keekonomian),
    marketing: ahs.marketing,
    payment_term: ahs.payment_term,
    document_scheme: ahs.document_scheme,
    analysis_date: ahs.analysis_date,
    notes: ahs.notes,
  };
}

/** Cost rows -> engine input. `null` rate/qty stays null (NOT APPLICABLE, not 0). */
export function toCostLineInputs(rows: CostItemView[]): CostLineInput[] {
  return rows
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((r) => ({
      line_no: r.line_no,
      category: r.category ?? "",
      description: r.description,
      ...(r.unit ? { unit: r.unit } : {}),
      rate: r.rate,
      qty: r.qty,
    }));
}

export interface BuildAhsInputOptions {
  inputs: AhsInputsView;
  costItems: CostItemView[];
  templateId: string;
  overrides?: Partial<AhsInput>;
}

/** Assemble the engine input for a project's AHS block. */
export function buildAhsInput(options: BuildAhsInputOptions): AhsInput {
  const { inputs, costItems, templateId, overrides } = options;
  const ppnRate = inputs.ppn_rate ?? 0.11;

  return {
    template_id: templateId,
    volume: inputs.volume,
    harga_jual_include: inputs.harga_jual_include,
    include_divisor: inputs.include_divisor ?? 1.11,
    ppn_rate: ppnRate,
    sale_ppn_rate: ppnRate,
    ppn_input_rate: ppnRate,
    pbbkb_rate: inputs.pbbkb_rate ?? 0,
    pph_inu_rate: inputs.pph_inu_rate ?? 0,
    bph_migas_rate: inputs.bph_migas_rate ?? 0,
    harga_keekonomian: inputs.harga_keekonomian,
    cost_lines: toCostLineInputs(costItems),
    ...overrides,
  };
}

/** Engine wrapper: never throws, always returns a structured result. */
export function runEngine(input: AhsInput): ActionResult<AhsResult> {
  const result = calculateAhs(input);
  if (!result.success) return fromCalcFailure(result);
  return ok(result as unknown as AhsResult);
}

export async function getTemplate(
  db: Database,
  templateId: string,
): Promise<CalculationTemplateRow | null> {
  const { rows } = await db.select<CalculationTemplateRow>("calculation_templates", {
    where: [eq("template_id", templateId)],
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function loadCostItems(
  db: Database,
  ahsId: string,
  scenarioId: string | null,
): Promise<CostItemView[]> {
  const { rows } = await db.select<AhsCostItem>("ahs_cost_items", {
    where: [
      eq("ahs_id", ahsId),
      scenarioId === null ? { column: "scenario_id", op: "is", value: null } : eq("scenario_id", scenarioId),
    ],
    order: [{ column: "line_no", ascending: true }],
  });
  return rows.map(toCostItemView);
}

export async function getAhsBundle(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<AhsBundle>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;

    const { rows } = await db.select<Ahs>("ahs", {
      where: [eq("project_id", projectId)],
      order: [{ column: "created_at", ascending: true }],
      limit: 1,
    });
    const ahs = rows[0] ?? null;

    if (!ahs) {
      // "project without AHS" is a valid state, not an error (Phase 3 §23).
      return ok({ ahs: null, template: null, inputs: null, costItems: [], preview: null, previewError: null });
    }

    const [template, costItems] = await Promise.all([
      getTemplate(db, ahs.template_id),
      loadCostItems(db, ahs.id, null),
    ]);

    const inputs = toInputsView(ahs);
    if (costItems.length === 0) {
      return ok({ ahs, template, inputs, costItems, preview: null, previewError: null });
    }

    const result = runEngine(buildAhsInput({ inputs, costItems, templateId: ahs.template_id }));
    return ok({
      ahs,
      template,
      inputs,
      costItems,
      preview: result.ok ? result.data : null,
      previewError: result.ok ? null : { errorCode: result.errorCode ?? "EXPRESSION_ERROR", message: result.error },
    });
  } catch (e) {
    return toActionResultError(e, "ahs");
  }
}

export async function ensureAhs(
  db: Database,
  actor: Actor,
  projectId: string,
  templateId: string = DEFAULT_TEMPLATE_ID,
): Promise<ActionResult<Ahs>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("membuat AHS (akses read-only)");

  try {
    const { rows } = await db.select<Ahs>("ahs", {
      where: [eq("project_id", projectId)],
      order: [{ column: "created_at", ascending: true }],
      limit: 1,
    });
    if (rows[0]) return ok(rows[0]);

    const created = await db.insert<Ahs>("ahs", {
      project_id: projectId,
      template_id: templateId,
      title: "ANALISIS HARGA SATUAN (AHS)",
      created_by: actor.id,
    });
    return ok(created);
  } catch (e) {
    return toActionResultError(e, "ahs");
  }
}

export interface AhsInputFormValue {
  volume: number | null;
  harga_jual_include: number | null;
  /**
   * F005B/F005C — Excel types the sale DPP directly (no include price, no
   * divisor). Mirrors lib/calculations/validation.ts: when this is present the
   * include price is NOT required, otherwise those blocks could never be saved.
   */
  harga_jual_dpp_input?: number | null;
  include_divisor: number | null;
  ppn_rate: number | null;
  pbbkb_rate?: number | null;
  pph_inu_rate?: number | null;
  bph_migas_rate?: number | null;
  harga_keekonomian?: number | null;
  marketing?: string | null;
  payment_term?: string | null;
  document_scheme?: string | null;
  analysis_date?: string | null;
  notes?: string | null;
  reason?: string | null;
}

export function validateAhsInputs(input: AhsInputFormValue): Record<string, string> {
  const errors: Record<string, string> = {};

  if (input.volume === null || input.volume === undefined) {
    errors.volume = "Volume wajib diisi (sel kosong di Excel bukan 0).";
  } else if (input.volume <= 0) {
    errors.volume = "Volume harus lebih besar dari 0.";
  }

  const usesDirectDpp = input.harga_jual_dpp_input !== undefined && input.harga_jual_dpp_input !== null;
  if (usesDirectDpp) {
    if (input.harga_jual_dpp_input === 0) {
      errors.harga_jual_dpp_input = "Harga jual DPP harus lebih besar dari 0.";
    }
  } else {
    if (input.harga_jual_include === null || input.harga_jual_include === undefined) {
      errors.harga_jual_include = "Harga jual (include) wajib diisi.";
    } else if (input.harga_jual_include <= 0) {
      errors.harga_jual_include = "Harga jual harus lebih besar dari 0.";
    }

    if (input.include_divisor !== null && input.include_divisor !== undefined && input.include_divisor <= 0) {
      errors.include_divisor = "Divisor harus lebih besar dari 0.";
    }
  }

  for (const key of ["ppn_rate", "pbbkb_rate", "pph_inu_rate", "bph_migas_rate"] as const) {
    const value = input[key];
    if (value !== null && value !== undefined && value < 0) {
      errors[key] = "Rate tidak boleh negatif.";
    }
  }

  return errors;
}

/**
 * Persist INPUT columns only (calculated columns are engine-owned).
 *
 * `options.onlyFields` dipakai oleh grid spreadsheet: satu sel diubah, jadi hanya
 * field itu yang dilaporkan gagal — sel lain yang belum diisi tidak menghalangi
 * penyimpanan sel pertama (validasi engine tetap berlaku penuh saat menghitung).
 */
export async function saveAhsInputs(
  db: Database,
  actor: Actor,
  projectId: string,
  input: AhsInputFormValue,
  options: { onlyFields?: readonly string[] } = {},
): Promise<ActionResult<{ id: string; preview: AhsResult | null }>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("mengubah AHS (akses read-only)");

  const allErrors = validateAhsInputs(input);
  const fieldErrors = options.onlyFields
    ? Object.fromEntries(
        Object.entries(allErrors).filter(([key]) => options.onlyFields!.includes(key)),
      )
    : allErrors;
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali isian AHS.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  try {
    const ensured = await ensureAhs(db, actor, projectId);
    if (!ensured.ok) return ensured;
    const ahs = ensured.data;

    const previous = toInputsView(ahs);
    const patch: Record<string, unknown> = {
      volume: input.volume,
      harga_jual_include: input.harga_jual_include,
      include_divisor: input.include_divisor ?? 1.11,
      ppn_rate: input.ppn_rate ?? 0.11,
      pbbkb_rate: input.pbbkb_rate ?? null,
      pph_inu_rate: input.pph_inu_rate ?? null,
      bph_migas_rate: input.bph_migas_rate ?? null,
      harga_keekonomian: input.harga_keekonomian ?? null,
      marketing: input.marketing ?? null,
      payment_term: input.payment_term ?? null,
      document_scheme: input.document_scheme ?? null,
      analysis_date: input.analysis_date ?? null,
      notes: input.notes ?? null,
    };

    const updated = await db.update<Ahs>("ahs", ahs.id, patch);

    const warnings: string[] = [];
    const changedFields = Object.entries(patch).filter(([key, value]) => {
      const before = (previous as unknown as Record<string, unknown>)[key];
      const a = before === null || before === undefined ? null : String(before);
      const b = value === null || value === undefined ? null : String(value);
      return a !== b;
    });

    for (const [field, value] of changedFields) {
      const before = (previous as unknown as Record<string, unknown>)[field];
      const audited = await recordHistory(db, {
        projectId,
        entity: "ahs",
        entityId: ahs.id,
        action: "UPDATE",
        field,
        oldValue: before === null || before === undefined ? null : String(before),
        newValue: value === null || value === undefined ? null : String(value),
        reason: input.reason ?? "AHS diubah",
        changedBy: actor.id,
      });
      if (!audited) {
        warnings.push("Sebagian history tidak dapat ditulis.");
        break;
      }
    }

    const costItems = await loadCostItems(db, ahs.id, null);
    const preview =
      costItems.length === 0
        ? null
        : (() => {
            const result = runEngine(
              buildAhsInput({
                inputs: toInputsView(updated),
                costItems,
                templateId: updated.template_id,
              }),
            );
            return result.ok ? result.data : null;
          })();

    return ok({ id: ahs.id, preview }, warnings);
  } catch (e) {
    return toActionResultError(e, "ahs");
  }
}

// ------------------------------------------------- inline (spreadsheet) edits

/** Field input AHS yang bisa diubah langsung dari satu sel spreadsheet. */
export const AHS_INPUT_CELL_FIELDS = [
  "volume",
  "harga_jual_include",
  "include_divisor",
  "ppn_rate",
  "pbbkb_rate",
  "pph_inu_rate",
  "bph_migas_rate",
  "harga_keekonomian",
  "marketing",
  "payment_term",
  "document_scheme",
  "analysis_date",
  "notes",
] as const;

export type AhsInputCellField = (typeof AHS_INPUT_CELL_FIELDS)[number];

const AHS_TEXT_CELL_FIELDS = new Set<string>([
  "marketing",
  "payment_term",
  "document_scheme",
  "analysis_date",
  "notes",
]);

/**
 * SPREADSHEET CELL EDIT — ubah SATU sel input AHS.
 * Nilai lain dibaca dari baris AHS saat ini (merge), jadi grid tidak perlu
 * mengirim ulang seluruh form. `raw` kosong = null (bukan 0).
 */
export async function updateAhsInputCell(
  db: Database,
  actor: Actor,
  projectId: string,
  field: string,
  raw: string,
): Promise<ActionResult<{ id: string; preview: AhsResult | null }>> {
  if (!(AHS_INPUT_CELL_FIELDS as readonly string[]).includes(field)) {
    return err(`Field AHS "${field}" tidak dapat diisi dari grid.`, {
      errorCode: "INVALID_INPUT",
      fieldErrors: { [field]: "Field tidak dikenal." },
    });
  }

  try {
    // Project tanpa AHS tetap bisa diisi dari grid: sel pertama membuat bloknya.
    const ensured = await ensureAhs(db, actor, projectId);
    if (!ensured.ok) return ensured;
    const current = toInputsView(ensured.data);
    const merged: AhsInputFormValue = {
      volume: current.volume,
      harga_jual_include: current.harga_jual_include,
      include_divisor: current.include_divisor,
      ppn_rate: current.ppn_rate,
      pbbkb_rate: current.pbbkb_rate,
      pph_inu_rate: current.pph_inu_rate,
      bph_migas_rate: current.bph_migas_rate,
      harga_keekonomian: current.harga_keekonomian,
      marketing: current.marketing,
      payment_term: current.payment_term,
      document_scheme: current.document_scheme,
      analysis_date: current.analysis_date,
      notes: current.notes,
      reason: "Sel AHS diubah dari grid spreadsheet",
    };

    if (AHS_TEXT_CELL_FIELDS.has(field)) {
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
    }

    return saveAhsInputs(db, actor, projectId, merged, { onlyFields: [field] });
  } catch (e) {
    return toActionResultError(e, "ahs");
  }
}

/** Field cost item yang bisa diubah langsung dari satu sel spreadsheet. */
export const COST_ITEM_CELL_FIELDS = [
  "category",
  "description",
  "unit",
  "rate",
  "qty",
] as const;

/**
 * SPREADSHEET CELL EDIT — ubah SATU sel cost item. Baris diambil lebih dulu
 * supaya kolom lain tidak ikut tertimpa.
 */
export async function updateCostItemCell(
  db: Database,
  actor: Actor,
  projectId: string,
  itemId: string,
  field: string,
  raw: string,
): Promise<ActionResult<CostItemView>> {
  if (!(COST_ITEM_CELL_FIELDS as readonly string[]).includes(field)) {
    return err(`Field cost item "${field}" tidak dapat diisi dari grid.`, {
      errorCode: "INVALID_INPUT",
    });
  }

  try {
    const { rows } = await db.select<AhsCostItem>("ahs_cost_items", {
      where: [eq("id", itemId)],
      limit: 1,
    });
    const before = rows[0];
    if (!before) return notFound("Cost item");

    const merged: CostItemFormValue = {
      category: before.category,
      description: before.description,
      unit: before.unit,
      rate: toNumber(before.rate),
      qty: toNumber(before.qty),
      reason: "Sel cost item diubah dari grid spreadsheet",
    };

    if (field === "category" || field === "description" || field === "unit") {
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
    }

    return updateCostItem(db, actor, projectId, itemId, merged);
  } catch (e) {
    return toActionResultError(e, "ahs_cost_items");
  }
}

/**
 * LIVE RECALCULATION (Phase 3 §14): validation -> engine -> result, with NO
 * database write. The UI calls this while the user types; nothing is persisted
 * until a scenario is committed.
 */
export async function previewAhsCalculation(
  db: Database,
  actor: Actor,
  projectId: string,
  overrides: Partial<AhsInput> = {},
): Promise<ActionResult<{ result: AhsResult; formulas_used: Record<string, string> }>> {
  try {
    const bundle = await getAhsBundle(db, actor, projectId);
    if (!bundle.ok) return bundle;
    if (!bundle.data.inputs) {
      return err("AHS belum dibuat untuk project ini.", { errorCode: "NOT_FOUND" });
    }
    if (bundle.data.costItems.length === 0) {
      return err("Belum ada cost item — tambahkan minimal 1 baris sebelum menghitung.", {
        errorCode: "MISSING_COST_LINES",
        fieldErrors: { cost_lines: "Belum ada cost item." },
      });
    }

    const input = buildAhsInput({
      inputs: bundle.data.inputs,
      costItems: bundle.data.costItems,
      templateId: bundle.data.ahs?.template_id ?? DEFAULT_TEMPLATE_ID,
      overrides,
    });
    const result = runEngine(input);
    if (!result.ok) return result;
    return ok({ result: result.data, formulas_used: result.data.formulas_used });
  } catch (e) {
    return toActionResultError(e, "ahs");
  }
}

// ---------------------------------------------------------------- cost items

export interface CostItemFormValue {
  id?: string;
  line_no?: number | null;
  category?: string | null;
  description: string;
  unit?: string | null;
  rate: number | null;
  qty: number | null;
  reason?: string | null;
}

export function validateCostItemForm(input: CostItemFormValue): Record<string, string> {
  const failure = validateCostLine(
    {
      category: input.category ?? "",
      description: input.description,
      rate: input.rate,
      qty: input.qty,
    },
    0,
  );
  if (!failure) return {};
  const key = failure.field?.replace(/^cost_lines\[0\]\.?/, "") || "description";
  return { [key]: failure.message };
}

export async function addCostItem(
  db: Database,
  actor: Actor,
  projectId: string,
  input: CostItemFormValue,
): Promise<ActionResult<CostItemView>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("menambah cost item (akses read-only)");

  const fieldErrors = validateCostItemForm(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali cost item.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  try {
    const ensured = await ensureAhs(db, actor, projectId);
    if (!ensured.ok) return ensured;
    const ahs = ensured.data;

    const existing = await loadCostItems(db, ahs.id, null);
    const lineNo =
      input.line_no && input.line_no > 0
        ? input.line_no
        : existing.reduce((max, item) => Math.max(max, item.line_no), 0) + 1;

    const total = computeCostLineTotal(input.rate, input.qty);

    const created = await db.insert<AhsCostItem>("ahs_cost_items", {
      ahs_id: ahs.id,
      scenario_id: null,
      line_no: lineNo,
      category: input.category ?? null,
      description: input.description,
      unit: input.unit ?? null,
      rate: input.rate,
      qty: input.qty,
      total,
      formula_id: "F007",
      is_summed_in_total: true,
    });

    const view = toCostItemView(created);
    const warnings: string[] = [];
    const audited = await recordHistory(db, {
      projectId,
      entity: "ahs_cost_items",
      entityId: created.id,
      action: "INSERT",
      field: "description",
      oldValue: null,
      newValue: created.description,
      reason: input.reason ?? "Cost item ditambahkan",
      changedBy: actor.id,
    });
    if (!audited) warnings.push("History tidak dapat ditulis.");

    return ok(view, warnings);
  } catch (e) {
    return toActionResultError(e, "ahs_cost_items");
  }
}

/** F007 — rate x qty, evaluated through the registry (never hardcoded here). */
export function computeCostLineTotal(rate: number | null, qty: number | null): number {
  return evaluateExpression("rate * qty", { rate: rate ?? 0, qty: qty ?? 0 });
}

export async function updateCostItem(
  db: Database,
  actor: Actor,
  projectId: string,
  itemId: string,
  input: CostItemFormValue,
): Promise<ActionResult<CostItemView>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("mengubah cost item (akses read-only)");

  const fieldErrors = validateCostItemForm(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Periksa kembali cost item.", { fieldErrors, errorCode: "INVALID_INPUT" });
  }

  try {
    const { rows } = await db.select<AhsCostItem>("ahs_cost_items", {
      where: [eq("id", itemId)],
      limit: 1,
    });
    const before = rows[0];
    if (!before) return notFound("Cost item");
    if (before.scenario_id !== null) {
      return err(
        "Cost item ini milik scenario yang sudah difinalkan (read-only). Buat scenario baru untuk perubahan.",
        { errorCode: "FORBIDDEN" },
      );
    }

    const updated = await db.update<AhsCostItem>("ahs_cost_items", itemId, {
      category: input.category ?? null,
      description: input.description,
      unit: input.unit ?? null,
      rate: input.rate,
      qty: input.qty,
      total: computeCostLineTotal(input.rate, input.qty),
    });

    const warnings: string[] = [];
    const changes: Array<[string, unknown]> = [
      ["rate", toNumber(before.rate)],
      ["qty", toNumber(before.qty)],
      ["description", before.description],
    ];
    for (const [field, previousValue] of changes) {
      const nextValue =
        field === "rate" ? input.rate : field === "qty" ? input.qty : input.description;
      if (String(previousValue ?? "") === String(nextValue ?? "")) continue;
      const audited = await recordHistory(db, {
        projectId,
        entity: "ahs_cost_items",
        entityId: itemId,
        action: "UPDATE",
        field,
        oldValue: previousValue === null || previousValue === undefined ? null : String(previousValue),
        newValue: nextValue === null || nextValue === undefined ? null : String(nextValue),
        reason: input.reason ?? "Cost item diubah",
        changedBy: actor.id,
      });
      if (!audited) {
        warnings.push("Sebagian history tidak dapat ditulis.");
        break;
      }
    }

    return ok(toCostItemView(updated), warnings);
  } catch (e) {
    return toActionResultError(e, "ahs_cost_items");
  }
}

export async function removeCostItem(
  db: Database,
  actor: Actor,
  projectId: string,
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("menghapus cost item (akses read-only)");

  try {
    const { rows } = await db.select<AhsCostItem>("ahs_cost_items", {
      where: [eq("id", itemId)],
      limit: 1,
    });
    const before = rows[0];
    if (!before) return notFound("Cost item");
    if (before.scenario_id !== null) {
      return err("Cost item milik scenario yang sudah difinalkan (read-only).", {
        errorCode: "FORBIDDEN",
      });
    }

    const otherItems = await loadCostItems(db, before.ahs_id, null);
    if (otherItems.length <= 1) {
      return err(
        "Cost item terakhir tidak boleh dihapus: Total Cost membutuhkan minimal 1 baris (engine menolak cost_lines kosong).",
        { errorCode: "INVALID_INPUT" },
      );
    }

    await db.remove("ahs_cost_items", itemId);

    const warnings: string[] = [];
    const audited = await recordHistory(db, {
      projectId,
      entity: "ahs_cost_items",
      entityId: itemId,
      action: "DELETE",
      field: "description",
      oldValue: before.description,
      newValue: null,
      reason: "Cost item dihapus",
      changedBy: actor.id,
    });
    if (!audited) warnings.push("History tidak dapat ditulis.");

    return ok({ id: itemId }, warnings);
  } catch (e) {
    return toActionResultError(e, "ahs_cost_items");
  }
}

/** Cost breakdown grouped by category for the AHS screen (engine totals). */
export interface CostBreakdownGroup {
  category: string;
  items: CostLineResult[];
  total: number;
  rate_total: number;
}

export function groupCostBreakdown(result: AhsResult): CostBreakdownGroup[] {
  const groups = new Map<string, CostLineResult[]>();
  for (const item of result.cost_lines) {
    const key = item.category && item.category.trim() !== "" ? item.category : "(tanpa kategori)";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([category, items]) => ({
    category,
    items,
    total: items.reduce((sum, i) => sum + i.total, 0),
    rate_total: items.reduce((sum, i) => sum + i.rate_for_sum, 0),
  }));
}

export function buildAhsImpact(result: AhsResult | null): Record<string, number | null> {
  return {
    revenue: result?.revenue ?? null,
    total_cost: result?.total_cost ?? null,
    gross_profit: result?.gross_profit ?? null,
    ppn_difference: result?.ppn_difference ?? null,
    net_profit: result?.net_profit ?? null,
    net_profit_per_liter: result?.net_profit_per_liter ?? null,
    profit_percentage: result?.profit_percentage ?? null,
  };
}

export { buildImpact };

export function canEditAhs(access: string, role: Actor["role"]): boolean {
  if (role === "ADMIN" || role === "PROCUREMENT") return true;
  return access === "EDIT";
}

export function canDeleteAhs(role: Actor["role"]): boolean {
  return can("delete_project", role);
}
