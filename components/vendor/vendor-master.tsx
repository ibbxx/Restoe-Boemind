"use client";

import { useActionState } from "react";

import { createVendorAction, updateVendorAction, type VendorFormState } from "@/lib/actions/vendors";
import type { Vendor } from "@/lib/types/domain";
import { FormAlerts, SubmitButton } from "@/components/shared/forms";
import { Field } from "@/components/shared/primitives";

export function VendorMasterForm({
  mode,
  vendor,
  canWrite,
}: {
  mode: "create" | "edit";
  vendor?: Vendor;
  canWrite: boolean;
}) {
  const action = mode === "create" ? createVendorAction : updateVendorAction;
  const [state, formAction] = useActionState<VendorFormState | null, FormData>(action, null);

  if (!canWrite) {
    return (
      <p className="px-4 py-3 text-xs text-ink-500">
        Role Anda read-only untuk master vendor — perubahan akan ditolak database (RLS: vendors_write).
      </p>
    );
  }

  const err = (field: string) => state?.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-3 p-4">
      {mode === "edit" && vendor ? <input type="hidden" name="vendor_id" value={vendor.id} /> : null}
      <FormAlerts state={state} successMessage={mode === "edit" ? "Vendor tersimpan." : "Vendor dibuat."} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Vendor Name" required error={err("name")}>
          <input className="input" name="name" defaultValue={vendor?.name ?? ""} required />
        </Field>
        <Field label="Contact">
          <input className="input" name="contact" defaultValue={vendor?.contact ?? ""} />
        </Field>
        <Field label="Armada" hint="Dipakai sebagai “Availability” pada vendor comparison.">
          <input className="input" name="armada" defaultValue={vendor?.armada ?? ""} />
        </Field>
        <Field label="Stock" hint="Dipakai sebagai “Availability” pada vendor comparison.">
          <input className="input" name="stock" defaultValue={vendor?.stock ?? ""} />
        </Field>
        <Field label="Permit">
          <input className="input" name="permit" defaultValue={vendor?.permit ?? ""} />
        </Field>
        <Field label="Status" error={err("status")}>
          <select className="input" name="status" defaultValue={vendor?.status ?? "ACTIVE"}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Address">
            <input className="input" name="address" defaultValue={vendor?.address ?? ""} />
          </Field>
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <Field label="Notes">
            <textarea className="input" name="notes" rows={2} defaultValue={vendor?.notes ?? ""} />
          </Field>
        </div>
      </div>

      <SubmitButton label={mode === "create" ? "Tambah vendor" : "Simpan vendor"} pendingLabel="Menyimpan…" />
    </form>
  );
}
