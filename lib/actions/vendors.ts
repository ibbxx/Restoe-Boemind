"use server";

import { actionContext, isContextError } from "./context";
import { formBool, formId, formNumber, formOptionalText, formRate, formText } from "./form";
import {
  addVendorColumnByName,
  addVendorToProject,
  createVendor,
  renameVendorColumn,
  removeVendorFromProject,
  saveVendorPrice,
  setSelectedVendor,
  updateVendor,
  updateVendorPriceCell,
  type VendorFormInput,
  type VendorPriceRowView,
} from "../services/vendors";
import type { ActionResult } from "../services/result";
import { revalidateCollection, revalidateProject } from "../revalidation";

export interface VendorFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  warnings?: string[];
}

function readVendorForm(formData: FormData): VendorFormInput {
  return {
    name: formText(formData, "name"),
    contact: formOptionalText(formData, "contact"),
    armada: formOptionalText(formData, "armada"),
    stock: formOptionalText(formData, "stock"),
    permit: formOptionalText(formData, "permit"),
    address: formOptionalText(formData, "address"),
    notes: formOptionalText(formData, "notes"),
    status: formText(formData, "status") || "ACTIVE",
  };
}

export async function createVendorAction(
  _prev: VendorFormState | null,
  formData: FormData,
): Promise<VendorFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const result = await createVendor(ctx.db, ctx.actor, readVendorForm(formData));
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  revalidateCollection("/projects");
  return { ok: true };
}

export async function updateVendorAction(
  _prev: VendorFormState | null,
  formData: FormData,
): Promise<VendorFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const vendorId = formText(formData, "vendor_id");
  const result = await updateVendor(ctx.db, ctx.actor, vendorId, readVendorForm(formData));
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  revalidateCollection("/projects");
  return { ok: true };
}

/**
 * SPREADSHEET CELL EDIT (grid workspace): ubah satu sel harga vendor.
 * Komponen lain di-merge di server, komponen kosong tetap null (bukan 0).
 */
export async function updateVendorPriceCellAction(
  projectId: string,
  vendorId: string,
  field: string,
  raw: string,
): Promise<ActionResult<VendorPriceRowView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await updateVendorPriceCell(ctx.db, ctx.actor, projectId, vendorId, field, raw);
  if (result.ok) {
    revalidateProject(projectId);
  }
  return result;
}

/**
 * Tambah KOLOM vendor di workspace cukup dengan mengetik namanya — tidak perlu
 * master data vendor maupun halaman terpisah.
 */
export async function addVendorColumnAction(
  projectId: string,
  name: string,
): Promise<ActionResult<unknown>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await addVendorColumnByName(ctx.db, ctx.actor, projectId, name);
  if (result.ok) revalidateProject(projectId);
  return result;
}

/** Ganti nama kolom vendor langsung dari header kolom di workspace. */
export async function renameVendorColumnAction(
  projectId: string,
  vendorId: string,
  name: string,
): Promise<ActionResult<unknown>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await renameVendorColumn(ctx.db, ctx.actor, projectId, vendorId, name);
  if (result.ok) revalidateProject(projectId);
  return result;
}

export async function addVendorToProjectAction(
  _prev: VendorFormState | null,
  formData: FormData,
): Promise<VendorFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const projectId = formText(formData, "project_id");
  const vendorId = formId(formData, "vendor_id");
  if (!vendorId) return { ok: false, error: "Pilih vendor terlebih dahulu.", fieldErrors: { vendor_id: "Pilih vendor." } };

  const result = await addVendorToProject(
    ctx.db,
    ctx.actor,
    projectId,
    vendorId,
    formOptionalText(formData, "evaluation_note"),
  );
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  revalidateProject(projectId);
  return { ok: true };
}

export async function removeVendorFromProjectAction(
  linkId: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await removeVendorFromProject(ctx.db, ctx.actor, projectId, linkId);
  if (result.ok) {
    revalidateProject(projectId);
  }
  return result;
}

export async function setSelectedVendorAction(
  linkId: string,
  projectId: string,
  isSelected: boolean,
): Promise<ActionResult<unknown>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await setSelectedVendor(ctx.db, ctx.actor, projectId, linkId, isSelected);
  if (result.ok) {
    revalidateProject(projectId);
  }
  return result;
}

export async function saveVendorPriceAction(
  _prev: VendorFormState | null,
  formData: FormData,
): Promise<VendorFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const projectId = formText(formData, "project_id");
  const vendorId = formText(formData, "vendor_id");
  const allInVariant = formText(formData, "all_in_variant");

  const result = await saveVendorPrice(ctx.db, ctx.actor, projectId, vendorId, {
    base_price: formNumber(formData, "base_price"),
    ppn_rate: formRate(formData, "ppn_rate", 0.11),
    ppn_amount: formNumber(formData, "ppn_amount"),
    ppn_is_formula: formBool(formData, "ppn_is_formula"),
    pbbkb_amount: formNumber(formData, "pbbkb_amount"),
    pph_amount: formNumber(formData, "pph_amount"),
    oat_amount: formNumber(formData, "oat_amount"),
    ppn_oat_amount: formNumber(formData, "ppn_oat_amount"),
    bph_amount: formNumber(formData, "bph_amount"),
    extra_component_label: formOptionalText(formData, "extra_component_label"),
    all_in_variant: allInVariant === "F002A" ? "F002A" : "F002B",
    note: formOptionalText(formData, "note"),
    reason: formOptionalText(formData, "reason"),
  });

  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
    revalidateProject(projectId);
  return { ok: true };
}
