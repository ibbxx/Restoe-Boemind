"use server";

import { zfd } from "zod-form-data";
import { zfdNumberNullable, zfdRate, zfdStringNullable } from "./validations";
import { actionContext, isContextError } from "./context";
import {
  addCostItem,
  previewAhsCalculation,
  removeCostItem,
  saveAhsInputs,
  updateAhsInputCell,
  updateCostItem,
  updateCostItemCell,
  type AhsInputFormValue,
  type CostItemView,
} from "../services/ahs";
import type { AhsResult } from "../calculations/types";
import type { ActionResult } from "../services/result";
import { revalidateProject } from "../revalidation";
import { fieldErrorsFromZod } from "./errors";

export interface AhsFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  warnings?: string[];
  /** Engine result after a successful save, so the screen can update instantly. */
  result?: AhsResult | null;
}

const AhsInputSchema = zfd.formData({
  project_id: zfd.text(),
  volume: zfdNumberNullable(),
  harga_jual_include: zfdNumberNullable(),
  include_divisor: zfdNumberNullable().transform(v => v ?? 1.11),
  ppn_rate: zfdRate(0.11),
  pbbkb_rate: zfdRate(0),
  pph_inu_rate: zfdRate(0),
  bph_migas_rate: zfdRate(0),
  harga_keekonomian: zfdNumberNullable(),
  marketing: zfdStringNullable(),
  payment_term: zfdStringNullable(),
  document_scheme: zfdStringNullable(),
  analysis_date: zfdStringNullable(),
  notes: zfdStringNullable(),
  reason: zfdStringNullable(),
});

export async function saveAhsInputsAction(
  _prev: AhsFormState | null,
  formData: FormData,
): Promise<AhsFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const parsed = AhsInputSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: "Data form tidak valid", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const data = parsed.data;

  const result = await saveAhsInputs(ctx.db, ctx.actor, data.project_id, {
    volume: data.volume,
    harga_jual_include: data.harga_jual_include,
    include_divisor: data.include_divisor,
    ppn_rate: data.ppn_rate,
    pbbkb_rate: data.pbbkb_rate,
    pph_inu_rate: data.pph_inu_rate,
    bph_migas_rate: data.bph_migas_rate,
    harga_keekonomian: data.harga_keekonomian,
    marketing: data.marketing,
    payment_term: data.payment_term,
    document_scheme: data.document_scheme,
    analysis_date: data.analysis_date,
    notes: data.notes,
    reason: data.reason,
  });
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }

  revalidateProject(data.project_id, { ahs: true, reports: true, commercial: true, history: true });
  return {
    ok: true,
    result: result.data.preview,
    ...(result.warnings ? { warnings: result.warnings } : {}),
  };
}

/**
 * LIVE RECALCULATION (Phase 3 §14).
 * Called while the user types: validation -> server action -> calculation
 * engine -> result. Nothing is written here, so no formula is recalculated in
 * the browser and no premature version is stored.
 */
export async function previewAhsAction(
  projectId: string,
  overrides: {
    volume?: number | null;
    harga_jual_include?: number | null;
    include_divisor?: number | null;
    ppn_rate?: number | null;
    pbbkb_rate?: number | null;
    /** F004 — so the preview also shows Diskon while typing. */
    harga_keekonomian?: number | null;
  },
): Promise<ActionResult<{ result: AhsResult; formulas_used: Record<string, string> }>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;

  return previewAhsCalculation(ctx.db, ctx.actor, projectId, {
    volume: overrides.volume ?? null,
    harga_jual_include: overrides.harga_jual_include ?? null,
    include_divisor: overrides.include_divisor ?? undefined,
    ppn_rate: overrides.ppn_rate ?? undefined,
    pbbkb_rate: overrides.pbbkb_rate ?? undefined,
    harga_keekonomian: overrides.harga_keekonomian ?? null,
  });
}

const CostItemSchema = zfd.formData({
  project_id: zfd.text(),
  line_no: zfdNumberNullable().transform(v => v ?? 0),
  category: zfdStringNullable(),
  description: zfd.text(),
  unit: zfdStringNullable(),
  rate: zfdNumberNullable().transform(v => v ?? 0),
  qty: zfdNumberNullable().transform(v => v ?? 0),
  reason: zfdStringNullable(),
});

export async function addCostItemAction(
  _prev: AhsFormState | null,
  formData: FormData,
): Promise<AhsFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const parsed = CostItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: "Data cost item tidak valid", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const data = parsed.data;

  const result = await addCostItem(ctx.db, ctx.actor, data.project_id, {
    line_no: data.line_no,
    category: data.category,
    description: data.description,
    unit: data.unit,
    rate: data.rate,
    qty: data.qty,
    reason: data.reason,
  });
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  revalidateProject(data.project_id, { ahs: true, reports: true, commercial: true, history: true });
  return { ok: true, ...(result.warnings ? { warnings: result.warnings } : {}) };
}

const UpdateCostItemSchema = zfd.formData({
  project_id: zfd.text(),
  item_id: zfd.text(),
  line_no: zfdNumberNullable().transform(v => v ?? 0),
  category: zfdStringNullable(),
  description: zfd.text(),
  unit: zfdStringNullable(),
  rate: zfdNumberNullable().transform(v => v ?? 0),
  qty: zfdNumberNullable().transform(v => v ?? 0),
  reason: zfdStringNullable(),
});

export async function updateCostItemAction(
  _prev: AhsFormState | null,
  formData: FormData,
): Promise<AhsFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const parsed = UpdateCostItemSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: "Data cost item tidak valid", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const data = parsed.data;

  const result = await updateCostItem(ctx.db, ctx.actor, data.project_id, data.item_id, {
    category: data.category,
    description: data.description,
    unit: data.unit,
    rate: data.rate,
    qty: data.qty,
    reason: data.reason,
  });
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  revalidateProject(data.project_id, { ahs: true, reports: true, commercial: true, history: true });
  return { ok: true, ...(result.warnings ? { warnings: result.warnings } : {}) };
}

/**
 * SPREADSHEET CELL EDIT (grid workspace): ubah satu sel input AHS.
 * `raw` kosong = null (bukan 0); nilai lain di-merge di server.
 */
export async function updateAhsInputCellAction(
  projectId: string,
  field: string,
  raw: string,
): Promise<ActionResult<{ id: string; preview: AhsResult | null }>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await updateAhsInputCell(ctx.db, ctx.actor, projectId, field, raw);
  if (result.ok) {
    revalidateProject(projectId, { ahs: true, reports: true, commercial: true, history: true });
  }
  return result;
}

/** SPREADSHEET CELL EDIT (grid workspace): ubah satu sel cost item. */
export async function updateCostItemCellAction(
  projectId: string,
  itemId: string,
  field: string,
  raw: string,
): Promise<ActionResult<CostItemView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await updateCostItemCell(ctx.db, ctx.actor, projectId, itemId, field, raw);
  if (result.ok) {
    revalidateProject(projectId, { ahs: true, reports: true, commercial: true, history: true });
  }
  return result;
}

export async function removeCostItemAction(
  projectId: string,
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await removeCostItem(ctx.db, ctx.actor, projectId, itemId);
  if (result.ok) {
    revalidateProject(projectId, { ahs: true, reports: true, commercial: true, history: true });
  }
  return result;
}
