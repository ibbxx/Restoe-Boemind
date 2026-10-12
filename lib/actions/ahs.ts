"use server";

import { revalidatePath } from "next/cache";

import { actionContext, isContextError } from "./context";
import { formNumber, formOptionalText, formRate, formText } from "./form";
import {
  addCostItem,
  previewAhsCalculation,
  removeCostItem,
  saveAhsInputs,
  updateCostItem,
  type AhsInputFormValue,
} from "../services/ahs";
import type { AhsResult } from "../calculations/types";
import type { ActionResult } from "../services/result";

export interface AhsFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  warnings?: string[];
  /** Engine result after a successful save, so the screen can update instantly. */
  result?: AhsResult | null;
}

function readAhsForm(formData: FormData): AhsInputFormValue {
  return {
    volume: formNumber(formData, "volume"),
    harga_jual_include: formNumber(formData, "harga_jual_include"),
    include_divisor: formNumber(formData, "include_divisor") ?? 1.11,
    ppn_rate: formRate(formData, "ppn_rate", 0.11),
    pbbkb_rate: formRate(formData, "pbbkb_rate", 0),
    pph_inu_rate: formRate(formData, "pph_inu_rate", 0),
    bph_migas_rate: formRate(formData, "bph_migas_rate", 0),
    harga_keekonomian: formNumber(formData, "harga_keekonomian"),
    marketing: formOptionalText(formData, "marketing"),
    payment_term: formOptionalText(formData, "payment_term"),
    document_scheme: formOptionalText(formData, "document_scheme"),
    analysis_date: formOptionalText(formData, "analysis_date"),
    notes: formOptionalText(formData, "notes"),
    reason: formOptionalText(formData, "reason"),
  };
}

export async function saveAhsInputsAction(
  _prev: AhsFormState | null,
  formData: FormData,
): Promise<AhsFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const projectId = formText(formData, "project_id");
  const result = await saveAhsInputs(ctx.db, ctx.actor, projectId, readAhsForm(formData));
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }

  revalidatePath(`/projects/${projectId}/ahs`);
  revalidatePath(`/projects/${projectId}`);
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

export async function addCostItemAction(
  _prev: AhsFormState | null,
  formData: FormData,
): Promise<AhsFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const projectId = formText(formData, "project_id");
  const result = await addCostItem(ctx.db, ctx.actor, projectId, {
    line_no: formNumber(formData, "line_no"),
    category: formOptionalText(formData, "category"),
    description: formText(formData, "description"),
    unit: formOptionalText(formData, "unit"),
    rate: formNumber(formData, "rate"),
    qty: formNumber(formData, "qty"),
    reason: formOptionalText(formData, "reason"),
  });
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  revalidatePath(`/projects/${projectId}/ahs`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, ...(result.warnings ? { warnings: result.warnings } : {}) };
}

export async function updateCostItemAction(
  _prev: AhsFormState | null,
  formData: FormData,
): Promise<AhsFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const projectId = formText(formData, "project_id");
  const itemId = formText(formData, "item_id");
  const result = await updateCostItem(ctx.db, ctx.actor, projectId, itemId, {
    category: formOptionalText(formData, "category"),
    description: formText(formData, "description"),
    unit: formOptionalText(formData, "unit"),
    rate: formNumber(formData, "rate"),
    qty: formNumber(formData, "qty"),
    reason: formOptionalText(formData, "reason"),
  });
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  revalidatePath(`/projects/${projectId}/ahs`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, ...(result.warnings ? { warnings: result.warnings } : {}) };
}

export async function removeCostItemAction(
  projectId: string,
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await removeCostItem(ctx.db, ctx.actor, projectId, itemId);
  if (result.ok) {
    revalidatePath(`/projects/${projectId}/ahs`);
    revalidatePath(`/projects/${projectId}`);
  }
  return result;
}
