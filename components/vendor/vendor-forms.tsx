"use client";

import { useActionState, useState, useTransition } from "react";

import {
  addVendorColumnAction,
  removeVendorFromProjectAction,
  saveVendorPriceAction,
  setSelectedVendorAction,
  type VendorFormState,
} from "@/lib/actions/vendors";
import { formatCurrency } from "@/lib/format";
import type { ProjectVendorView, VendorPriceRowView } from "@/lib/services/vendors";
import { AsyncActionButton, FormAlerts, SubmitButton } from "@/components/shared/forms";
import { Field } from "@/components/shared/primitives";

/**
 * TAMBAH KOLOM VENDOR DI WORKSPACE.
 *
 * Cukup ketik nama vendor — tidak ada master data/halaman vendor terpisah.
 * Kolom baru langsung siap diisi harga seperti di Excel.
 */
export function AddVendorForm({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) {
    return <p className="px-4 py-3 text-xs text-ink-500">Read-only access.</p>;
  }

  const submit = () => {
    const value = name.trim();
    if (value === "") {
      setError("Vendor name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addVendorColumnAction(projectId, value);
      if (!result.ok) setError(result.error);
      else setName("");
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-2 p-3">
      <div>
        <label className="field-label" htmlFor="vendor-name">
          Vendor baru
        </label>
        <input
          id="vendor-name"
          className="input h-8 w-52 text-sm"
          placeholder="mis. PT Rivina"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <button type="button" className="btn-primary" disabled={pending} onClick={submit}>
        {pending ? "Adding…" : "Add vendor"}
      </button>
      {error ? <span className="text-2xs text-negative-700">{error}</span> : null}
    </div>
  );
}

export function VendorPriceForm({
  projectId,
  entry,
  canWrite,
}: {
  projectId: string;
  entry: ProjectVendorView;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<VendorFormState | null, FormData>(
    saveVendorPriceAction,
    null,
  );

  const price: VendorPriceRowView | null = entry.price;
  // A vendor price is DATA plus engine output: show the engine's ALL IN.
  const preview = previewAllIn(price);

  if (!canWrite) {
    return (
      <div className="px-3 py-2 text-xs text-ink-500">
        Read-only access.
      </div>
    );
  }

  return (
    <div className="border-t border-ink-100">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-accent-700 hover:bg-ink-50"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{price ? "Edit vendor price" : "Add vendor price"}</span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <form action={formAction} className="space-y-3 bg-ink-50 px-3 py-3">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="vendor_id" value={entry.vendor.id} />

          <FormAlerts state={state} successMessage="Vendor price saved." />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Field
              label="Base price"
              required
              error={state?.fieldErrors?.base_price}
              hint="Wajib diisi. Kosong berarti belum ada harga (bukan 0)."
            >
              <input
                className="input"
                name="base_price"
                type="number"
                step="0.0001"
                defaultValue={price?.base_price ?? ""}
                required
              />
            </Field>

            <Field label="PPN (%)" hint="Isi 11 untuk PPN, 0 jika tanpa PPN.">
              <input
                className="input"
                name="ppn_rate"
                type="number"
                step="0.01"
                defaultValue={price?.ppn_rate === null || price?.ppn_rate === undefined ? 11 : price.ppn_rate * 100}
              />
            </Field>

            <Field
              label="PPN input"
              hint="Otomatis mengikuti tarif di atas, atau ketik manual sesuai dokumen vendor."
            >
              <label className="flex items-center gap-2 py-1.5 text-xs text-ink-700">
                <input
                  type="checkbox"
                  name="ppn_is_formula"
                  defaultChecked={price?.ppn_is_formula ?? true}
                />
                Calculate from base price
              </label>
            </Field>

            <Field label="Nilai PPN manual">
              <input
                className="input"
                name="ppn_amount"
                type="number"
                step="0.0001"
                defaultValue={price?.ppn_is_formula === false ? price.ppn_amount ?? "" : ""}
              />
            </Field>

            <Field label="PBBKB">
              <input
                className="input"
                name="pbbkb_amount"
                type="number"
                step="0.0001"
                defaultValue={price?.pbbkb_amount ?? ""}
              />
            </Field>
            <Field label="PPH">
              <input className="input" name="pph_amount" type="number" step="0.0001" defaultValue={price?.pph_amount ?? ""} />
            </Field>
            <Field label="OAT">
              <input className="input" name="oat_amount" type="number" step="0.0001" defaultValue={price?.oat_amount ?? ""} />
            </Field>
            <Field label="PPN OAT">
              <input
                className="input"
                name="ppn_oat_amount"
                type="number"
                step="0.0001"
                defaultValue={price?.ppn_oat_amount ?? ""}
              />
            </Field>
            <Field label="BPH / SIB / PMKU" hint="Nama komponen bisa berbeda antar dokumen.">
              <input className="input" name="bph_amount" type="number" step="0.0001" defaultValue={price?.bph_amount ?? ""} />
            </Field>
            <Field label="Label komponen ke-7">
              <input className="input" name="extra_component_label" defaultValue={price?.extra_component_label ?? ""} />
            </Field>
            <Field label="Perhitungan ALL IN" hint="Pilih apakah komponen BPH ikut dijumlahkan.">
              <select className="input" name="all_in_variant" defaultValue={price?.all_in_formula_id ?? "F002B"}>
                <option value="F002B">Semua komponen (termasuk BPH)</option>
                <option value="F002A">Tanpa BPH</option>
              </select>
            </Field>
            <Field label="Note">
              <input className="input" name="note" defaultValue={price?.note ?? ""} />
            </Field>
            <div className="md:col-span-3 xl:col-span-4">
              <Field label="Alasan perubahan">
                <input className="input" name="reason" placeholder="mis. revisi harga vendor setelah negosiasi" />
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-3">
            <div className="text-2xs text-ink-500">
              ALL IN saat ini:{" "}
              <span className="font-mono font-medium text-ink-800">{formatEngineValue(preview)}</span>
            </div>
            <div className="flex items-center gap-2">
            <SubmitButton label="Save price" pendingLabel="Calculating…" />
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Tutup
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function formatEngineValue(value: number | null): string {
  return value === null ? "—" : formatCurrency(value);
}

function previewAllIn(price: VendorPriceRowView | null): number | null {
  return price?.all_in_amount ?? null;
}

/** Excel "Sumber (vendor)": marks which vendor column feeds the AHS header. */
export function SelectVendorButton({
  projectId,
  linkId,
  isSelected,
  canWrite,
}: {
  projectId: string;
  linkId: string;
  isSelected: boolean;
  canWrite: boolean;
}) {
  if (!canWrite) {
    return isSelected ? (
      <span className="badge bg-positive-100 text-positive-700">sumber AHS</span>
    ) : null;
  }
  return (
    <AsyncActionButton
      variant={isSelected ? "secondary" : "ghost"}
      label={isSelected ? "Batalkan sumber" : "Jadikan sumber"}
      pendingLabel="Menyimpan…"
      action={() => setSelectedVendorAction(linkId, projectId, !isSelected)}
    />
  );
}

export function RemoveVendorButton({
  projectId,
  linkId,
  vendorName,
  canWrite,
}: {
  projectId: string;
  linkId: string;
  vendorName: string;
  canWrite: boolean;
}) {
  if (!canWrite) return null;
  return (
    <AsyncActionButton
      variant="danger"
      label="Delete"
      pendingLabel="Deleting…"
      confirmTitle={`Delete ${vendorName}?`}
      confirmMessage="The vendor column will be removed from this project. Saved prices remain in history."
      action={() => removeVendorFromProjectAction(linkId, projectId)}
    />
  );
}
