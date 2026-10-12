import type { Database } from "../data/db";
import { eq } from "../data/db";
import type { Actor } from "../auth/session";
import { canWriteProject, type ProjectAccess } from "../auth/permissions";
import { calculateAhs } from "../calculations/ahs";
import { getTemplate as getCalcTemplate } from "../calculations/registry";
import type {
  AhsInput,
  AhsResult,
  CalculationTemplate,
  CostLineInput,
} from "../calculations/types";
import { ok, err, fromCalcFailure, forbidden, type ActionResult } from "./result";

export const COST_CATEGORIES = [
  "HPP",
  "PBBKB",
  "PPH",
  "OPERATIONAL",
  "INVESTOR",
  "OTHER",
] as const;

export const DEFAULT_TEMPLATE_ID = "T_A_AHS_STANDARD";

export interface CostItemView {
  id: string;
  line_no: number;
  category: string;
  description: string;
  unit: string | null;
  rate: number | null;
  qty: number | null;
  total: number;
}

export interface AhsInputsView {
  id: string;
  project_id: string;
  template_id: string;
  volume: number | null;
  harga_jual_include: number | null;
  include_divisor: number;
  ppn_rate: number;
  pbbkb_rate: number;
  pph_inu_rate: number;
  bph_migas_rate: number;
  harga_keekonomian: number | null;
  marketing: string | null;
  payment_term: string | null;
  document_scheme: string | null;
  analysis_date: string | null;
  notes: string | null;
}

export interface AhsBundle {
  ahs: AhsInputsView | null;
  template: CalculationTemplate | null;
  costItems: CostItemView[];
  result: AhsResult | null;
}

export interface AhsInputFormValue {
  volume?: number | null;
  harga_jual_include?: number | null;
  include_divisor?: number | null;
  ppn_rate?: number | null;
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

export interface CostItemFormValue {
  line_no?: number | null;
  category?: string | null;
  description: string;
  unit?: string | null;
  rate?: number | null;
  qty?: number | null;
  reason?: string | null;
}

export interface CostBreakdownGroup {
  category: string;
  total: number;
  items: CostItemView[];
}

export function computeCostLineTotal(rate: number | null, qty: number | null): number {
  if (rate === null || qty === null) return 0;
  return rate * qty;
}

export function toCostItemView(row: Record<string, unknown>): CostItemView {
  const rate = typeof row.rate === "number" ? row.rate : null;
  const qty = typeof row.qty === "number" ? row.qty : null;
  return {
    id: String(row.id),
    line_no: Number(row.line_no ?? 0),
    category: String(row.category ?? "OTHER"),
    description: String(row.description ?? ""),
    unit: row.unit ? String(row.unit) : null,
    rate,
    qty,
    total: computeCostLineTotal(rate, qty),
  };
}

export function toInputsView(ahs: Record<string, unknown>): AhsInputsView {
  return {
    id: String(ahs.id),
    project_id: String(ahs.project_id),
    template_id: String(ahs.template_id ?? DEFAULT_TEMPLATE_ID),
    volume: typeof ahs.volume === "number" ? ahs.volume : null,
    harga_jual_include: typeof ahs.harga_jual_include === "number" ? ahs.harga_jual_include : null,
    include_divisor: typeof ahs.include_divisor === "number" ? ahs.include_divisor : 1.11,
    ppn_rate: typeof ahs.ppn_rate === "number" ? ahs.ppn_rate : 0.11,
    pbbkb_rate: typeof ahs.pbbkb_rate === "number" ? ahs.pbbkb_rate : 0,
    pph_inu_rate: typeof ahs.pph_inu_rate === "number" ? ahs.pph_inu_rate : 0,
    bph_migas_rate: typeof ahs.bph_migas_rate === "number" ? ahs.bph_migas_rate : 0,
    harga_keekonomian: typeof ahs.harga_keekonomian === "number" ? ahs.harga_keekonomian : null,
    marketing: ahs.marketing ? String(ahs.marketing) : null,
    payment_term: ahs.payment_term ? String(ahs.payment_term) : null,
    document_scheme: ahs.document_scheme ? String(ahs.document_scheme) : null,
    analysis_date: ahs.analysis_date ? String(ahs.analysis_date) : null,
    notes: ahs.notes ? String(ahs.notes) : null,
  };
}

export function toCostLineInputs(rows: CostItemView[]): CostLineInput[] {
  return rows.map((r) => ({
    line_no: r.line_no,
    category: r.category,
    description: r.description,
    unit: r.unit ?? undefined,
    rate: r.rate,
    qty: r.qty,
  }));
}

export function runEngine(input: AhsInput): ActionResult<AhsResult> {
  const result = calculateAhs(input);
  if (!("success" in result) || !result.success) {
    return fromCalcFailure(result as unknown as import("../calculations/errors").CalcFailure);
  }
  return ok(result as AhsResult);
}

export async function getTemplate(templateId = DEFAULT_TEMPLATE_ID): Promise<CalculationTemplate | null> {
  try {
    return getCalcTemplate(templateId);
  } catch {
    return null;
  }
}

export async function loadCostItems(db: Database, projectId: string): Promise<CostItemView[]> {
  const res = await db.select("ahs_cost_items", {
    where: [eq("project_id", projectId)],
    order: [{ column: "line_no", ascending: true }],
  });
  return res.rows.map(toCostItemView);
}

export async function getAhsBundle(
  db: Database,
  _actor: Actor,
  projectId: string,
): Promise<ActionResult<AhsBundle>> {
  const [ahsRes, costItems] = await Promise.all([
    db.select("ahs", { where: [eq("project_id", projectId)] }),
    loadCostItems(db, projectId),
  ]);

  const ahsRaw = ahsRes.rows[0];
  if (!ahsRaw) {
    return ok({
      ahs: null,
      template: null,
      costItems: [],
      result: null,
    });
  }

  const ahs = toInputsView(ahsRaw);
  const template = await getTemplate(ahs.template_id);
  const engineInput: AhsInput = {
    template_id: ahs.template_id,
    volume: ahs.volume,
    harga_jual_include: ahs.harga_jual_include,
    include_divisor: ahs.include_divisor,
    ppn_rate: ahs.ppn_rate,
    pbbkb_rate: ahs.pbbkb_rate,
    pph_inu_rate: ahs.pph_inu_rate,
    bph_migas_rate: ahs.bph_migas_rate,
    harga_keekonomian: ahs.harga_keekonomian,
    cost_lines: toCostLineInputs(costItems),
  };

  const calcRes = runEngine(engineInput);
  return ok({
    ahs,
    template,
    costItems,
    result: calcRes.ok ? calcRes.data : null,
  });
}

export function validateAhsInputs(input: AhsInputFormValue): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.volume !== undefined && input.volume !== null && input.volume <= 0) {
    errors.volume = "Volume harus berupa angka positif";
  }
  if (input.harga_jual_include !== undefined && input.harga_jual_include !== null && input.harga_jual_include < 0) {
    errors.harga_jual_include = "Harga jual include tidak boleh negatif";
  }
  return errors;
}

export async function saveAhsInputs(
  db: Database,
  actor: Actor,
  projectId: string,
  input: AhsInputFormValue,
): Promise<ActionResult<{ id: string; preview: AhsResult | null }>> {
  if (!canWriteProject("FULL" as ProjectAccess)) {
    return forbidden("Hanya anggota dengan izin tulis yang dapat mengubah AHS");
  }

  const fieldErrors = validateAhsInputs(input);
  if (Object.keys(fieldErrors).length > 0) {
    return err("Validasi input AHS gagal", { fieldErrors });
  }

  const existingRes = await db.select("ahs", { where: [eq("project_id", projectId)] });
  const payload = {
    volume: input.volume ?? null,
    harga_jual_include: input.harga_jual_include ?? null,
    include_divisor: input.include_divisor ?? 1.11,
    ppn_rate: input.ppn_rate ?? 0.11,
    pbbkb_rate: input.pbbkb_rate ?? 0,
    pph_inu_rate: input.pph_inu_rate ?? 0,
    bph_migas_rate: input.bph_migas_rate ?? 0,
    harga_keekonomian: input.harga_keekonomian ?? null,
    marketing: input.marketing ?? null,
    payment_term: input.payment_term ?? null,
    document_scheme: input.document_scheme ?? null,
    analysis_date: input.analysis_date ?? null,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  let ahsId = existingRes.rows[0]?.id as string | undefined;
  if (existingRes.rows.length > 0 && ahsId) {
    await db.update("ahs", ahsId, payload);
  } else {
    const created = await db.insert("ahs", {
      project_id: projectId,
      template_id: DEFAULT_TEMPLATE_ID,
      ...payload,
      created_by: actor.id,
    });
    ahsId = created.id as string;
  }

  const costItems = await loadCostItems(db, projectId);
  const calcRes = runEngine({
    template_id: DEFAULT_TEMPLATE_ID,
    volume: input.volume ?? null,
    harga_jual_include: input.harga_jual_include ?? null,
    include_divisor: input.include_divisor ?? 1.11,
    ppn_rate: input.ppn_rate ?? 0.11,
    pbbkb_rate: input.pbbkb_rate ?? 0,
    pph_inu_rate: input.pph_inu_rate ?? 0,
    bph_migas_rate: input.bph_migas_rate ?? 0,
    harga_keekonomian: input.harga_keekonomian ?? null,
    cost_lines: toCostLineInputs(costItems),
  });

  return ok({ id: ahsId, preview: calcRes.ok ? calcRes.data : null });
}

export async function previewAhsCalculation(
  db: Database,
  _actor: Actor,
  projectId: string,
  overrides?: Partial<AhsInputFormValue>,
): Promise<ActionResult<{ result: AhsResult; formulas_used: Record<string, string> }>> {
  const existingRows = await db.select("ahs", { where: [eq("project_id", projectId)] });
  const existing = existingRows.rows[0] ? toInputsView(existingRows.rows[0]) : null;
  const costItems = await loadCostItems(db, projectId);

  const merged = {
    template_id: existing?.template_id ?? DEFAULT_TEMPLATE_ID,
    volume: overrides?.volume !== undefined ? overrides.volume : (existing?.volume ?? null),
    harga_jual_include: overrides?.harga_jual_include !== undefined ? overrides.harga_jual_include : (existing?.harga_jual_include ?? null),
    include_divisor: overrides?.include_divisor !== undefined ? (overrides.include_divisor ?? 1.11) : (existing?.include_divisor ?? 1.11),
    ppn_rate: overrides?.ppn_rate !== undefined ? (overrides.ppn_rate ?? 0.11) : (existing?.ppn_rate ?? 0.11),
    pbbkb_rate: overrides?.pbbkb_rate !== undefined ? (overrides.pbbkb_rate ?? 0) : (existing?.pbbkb_rate ?? 0),
    pph_inu_rate: overrides?.pph_inu_rate !== undefined ? (overrides.pph_inu_rate ?? 0) : (existing?.pph_inu_rate ?? 0),
    bph_migas_rate: overrides?.bph_migas_rate !== undefined ? (overrides.bph_migas_rate ?? 0) : (existing?.bph_migas_rate ?? 0),
    harga_keekonomian: overrides?.harga_keekonomian !== undefined ? overrides.harga_keekonomian : (existing?.harga_keekonomian ?? null),
    cost_lines: toCostLineInputs(costItems),
  };

  const calcRes = runEngine(merged);
  if (!calcRes.ok) return calcRes;

  return ok({
    result: calcRes.data,
    formulas_used: calcRes.data.formulas_used,
  });
}

export async function addCostItem(
  db: Database,
  actor: Actor,
  projectId: string,
  input: CostItemFormValue,
): Promise<ActionResult<CostItemView>> {
  if (!canWriteProject("FULL" as ProjectAccess)) {
    return forbidden("Tidak memiliki izin tulis");
  }

  const created = await db.insert("ahs_cost_items", {
    project_id: projectId,
    line_no: input.line_no ?? 1,
    category: input.category ?? "OTHER",
    description: input.description,
    unit: input.unit ?? null,
    rate: input.rate ?? null,
    qty: input.qty ?? null,
    created_by: actor.id,
  });

  return ok(toCostItemView(created));
}

export async function updateCostItem(
  db: Database,
  _actor: Actor,
  _projectId: string,
  itemId: string,
  patch: CostItemFormValue,
): Promise<ActionResult<CostItemView>> {
  if (!canWriteProject("FULL" as ProjectAccess)) {
    return forbidden("Tidak memiliki izin tulis");
  }

  const updated = await db.update("ahs_cost_items", itemId, {
    category: patch.category ?? undefined,
    description: patch.description,
    unit: patch.unit ?? null,
    rate: patch.rate ?? null,
    qty: patch.qty ?? null,
    updated_at: new Date().toISOString(),
  });

  return ok(toCostItemView(updated));
}

export async function removeCostItem(
  db: Database,
  _actor: Actor,
  _projectId: string,
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!canWriteProject("FULL" as ProjectAccess)) {
    return forbidden("Tidak memiliki izin tulis");
  }

  await db.remove("ahs_cost_items", itemId);
  return ok({ id: itemId });
}

export function groupCostBreakdown(result: AhsResult): CostBreakdownGroup[] {
  const groups: Record<string, CostBreakdownGroup> = {};
  for (const cat of COST_CATEGORIES) {
    groups[cat] = { category: cat, total: 0, items: [] };
  }

  for (const line of result.cost_lines) {
    const cat = line.category || "OTHER";
    if (!groups[cat]) {
      groups[cat] = { category: cat, total: 0, items: [] };
    }
    const itemTotal = line.total || 0;
    groups[cat]!.total += itemTotal;
    groups[cat]!.items.push({
      id: String(line.line_no ?? 0),
      line_no: line.line_no ?? 0,
      category: cat,
      description: line.description,
      unit: line.unit ?? null,
      rate: line.rate,
      qty: line.qty,
      total: itemTotal,
    });
  }

  return Object.values(groups);
}

export function buildAhsImpact(result: AhsResult | null): Record<string, number | null> {
  if (!result) return {};
  return {
    revenue: result.revenue,
    total_cost: result.total_cost,
    gross_profit: result.gross_profit,
    net_profit: result.net_profit,
  };
}
