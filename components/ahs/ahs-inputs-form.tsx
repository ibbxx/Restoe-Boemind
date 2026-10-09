"use client";

import { useActionState, useState, useTransition } from "react";

import { previewAhsAction, saveAhsInputsAction, type AhsFormState } from "@/lib/actions/ahs";
import type { AhsResult } from "@/lib/calculations/types";
import { formatRp, parseNumericInput } from "@/lib/format";
import type { ActionErr } from "@/lib/services/result";
import type { AhsInputsView } from "@/lib/services/ahs";
import { FormAlerts, SubmitButton } from "@/components/shared/forms";
import { Field, ReadOnlyValue } from "@/components/shared/primitives";
import { CalculationErrorState } from "@/components/shared/states";

/**
 * AHS input form.
 *
 * "Hitung ulang (preview)" sends the CURRENT form values to a server action
 * which runs them through the calculation engine and returns the result. No
 * formula executes in the browser (Phase 3 §14) and nothing is persisted until
 * "Simpan input" is pressed.
 */
export function AhsInputsForm({
  projectId,
  inputs,
  canWrite,
}: {
  projectId: string;
  inputs: AhsInputsView | null;
  canWrite: boolean;
}) {
  const [state, formAction] = useActionState<AhsFormState | null, FormData>(saveAhsInputsAction, null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<AhsResult | null>(null);
  const [previewError, setPreviewError] = useState<ActionErr | null>(null);
  const [form, setForm] = useState({
    volume: inputs?.volume ?? null,
    harga_jual_include: inputs?.harga_jual_include ?? null,
    include_divisor: inputs?.include_divisor ?? 1.11,
    ppn_rate: inputs?.ppn_rate ?? 0.11,
    pbbkb_rate: inputs?.pbbkb_rate ?? 0,
    harga_keekonomian: inputs?.harga_keekonomian ?? null,
  });

  const err = (field: string) => state?.fieldErrors?.[field];

  const runPreview = () => {
    setPreviewError(null);
    startTransition(async () => {
      const result = await previewAhsAction(projectId, {
        volume: form.volume,
        harga_jual_include: form.harga_jual_include,
        include_divisor: form.include_divisor,
        ppn_rate: form.ppn_rate,
        pbbkb_rate: form.pbbkb_rate,
        harga_keekonomian: form.harga_keekonomian,
      });
      if (result.ok) setPreview(result.data.result);
      else {
        setPreview(null);
        setPreviewError(result);
      }
    });
  };

  const onNumericChange =
    (key: keyof typeof form, isRate = false) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseNumericInput(event.target.value);
      setForm((prev) => ({
        ...prev,
        [key]: parsed === null ? null : isRate && Math.abs(parsed) > 1 ? parsed / 100 : parsed,
      }));
    };

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3 p-4">
        <input type="hidden" name="project_id" value={projectId} />
        <FormAlerts state={state} successMessage="AHS inputs saved." />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Volume (liter)" required error={err("volume")}>
            <input
              className="input"
              name="volume"
              type="number"
              step="0.0001"
              defaultValue={inputs?.volume ?? ""}
              onChange={onNumericChange("volume")}
              readOnly={!canWrite}
              required
            />
          </Field>

          <Field
            label="Customer Selling Price (include)"
            required
            error={err("harga_jual_include")}
            hint="Harga customer. Bukan harga vendor dan tidak ikut berubah saat harga vendor berubah."
          >
            <input
              className="input"
              name="harga_jual_include"
              type="number"
              step="0.0001"
              defaultValue={inputs?.harga_jual_include ?? ""}
              onChange={onNumericChange("harga_jual_include")}
              readOnly={!canWrite}
              required
            />
          </Field>

          <Field label="Include divisor" error={err("include_divisor")} hint="1.11 / 1.16 / 1.185 sesuai blok Excel.">
            <input
              className="input"
              name="include_divisor"
              type="number"
              step="0.000001"
              defaultValue={inputs?.include_divisor ?? 1.11}
              onChange={onNumericChange("include_divisor")}
              readOnly={!canWrite}
            />
          </Field>

          <Field label="PPN rate" error={err("ppn_rate")} hint="0.11 = 11%. Blok Non-PPN memakai 0.">
            <input
              className="input"
              name="ppn_rate"
              type="number"
              step="0.0001"
              defaultValue={inputs?.ppn_rate ?? 0.11}
              onChange={onNumericChange("ppn_rate", true)}
              readOnly={!canWrite}
            />
          </Field>

          <Field label="PBBKB rate" error={err("pbbkb_rate")}>
            <input
              className="input"
              name="pbbkb_rate"
              type="number"
              step="0.0001"
              defaultValue={inputs?.pbbkb_rate ?? ""}
              onChange={onNumericChange("pbbkb_rate", true)}
              readOnly={!canWrite}
            />
          </Field>

          <Field label="PPH INU rate" error={err("pph_inu_rate")}>
            <input
              className="input"
              name="pph_inu_rate"
              type="number"
              step="0.0001"
              defaultValue={inputs?.pph_inu_rate ?? ""}
              readOnly={!canWrite}
            />
          </Field>

          <Field label="BPH Migas rate" error={err("bph_migas_rate")}>
            <input
              className="input"
              name="bph_migas_rate"
              type="number"
              step="0.0001"
              defaultValue={inputs?.bph_migas_rate ?? ""}
              readOnly={!canWrite}
            />
          </Field>

          <Field label="Harga keekonomian" error={err("harga_keekonomian")} hint="Untuk F004 (diskon).">
            <input
              className="input"
              name="harga_keekonomian"
              type="number"
              step="0.0001"
              defaultValue={inputs?.harga_keekonomian ?? ""}
              onChange={onNumericChange("harga_keekonomian")}
              readOnly={!canWrite}
            />
          </Field>

          <Field label="Marketing">
            <input className="input" name="marketing" defaultValue={inputs?.marketing ?? ""} readOnly={!canWrite} />
          </Field>
          <Field label="Payment term">
            <input
              className="input"
              name="payment_term"
              defaultValue={inputs?.payment_term ?? ""}
              readOnly={!canWrite}
            />
          </Field>
          <Field label="Document scheme">
            <input
              className="input"
              name="document_scheme"
              defaultValue={inputs?.document_scheme ?? ""}
              readOnly={!canWrite}
            />
          </Field>
          <Field label="Analysis date">
            <input
              className="input"
              name="analysis_date"
              type="date"
              defaultValue={inputs?.analysis_date ?? ""}
              readOnly={!canWrite}
            />
          </Field>

          <div className="md:col-span-2 xl:col-span-4">
            <Field label="Notes">
              <textarea className="input" name="notes" rows={2} defaultValue={inputs?.notes ?? ""} readOnly={!canWrite} />
            </Field>
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <Field label="Reason (audit)">
              <input className="input" name="reason" placeholder="mis. update harga customer periode ini" />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 pt-3">
          {canWrite ? <SubmitButton label="Save inputs" pendingLabel="Saving…" /> : null}
          <button type="button" className="btn-secondary" onClick={runPreview} disabled={pending}>
            {pending ? "Calculating…" : "Hitung ulang (preview)"}
          </button>
          <span className="text-2xs text-ink-500">
            Preview dihitung di server oleh calculation engine — tidak ada formula di browser dan tidak ada
            yang tersimpan sampai Anda menekan Simpan.
          </span>
        </div>
      </form>

      {previewError ? (
        <div className="px-4 pb-4">
          <CalculationErrorState
            message={previewError.error}
            code={previewError.errorCode}
            field={Object.keys(previewError.fieldErrors ?? {})[0]}
          />
        </div>
      ) : null}

      {preview ? (
        <div className="border-t border-ink-200 bg-ink-50 px-4 py-3">
          <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-500">
            Preview (unsaved)
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <ReadOnlyValue label="Revenue" value={formatRp(preview.revenue)} />
            <ReadOnlyValue label="Total Cost" value={formatRp(preview.total_cost)} />
            <ReadOnlyValue label="Gross Profit" value={formatRp(preview.gross_profit)} />
            <ReadOnlyValue label="PPN Difference" value={formatRp(preview.ppn_difference)} />
            <ReadOnlyValue
              label="Net Profit"
              value={formatRp(preview.net_profit)}
              tone={preview.net_profit < 0 ? "negative" : "positive"}
              emphasis
            />
            <ReadOnlyValue label="Net Profit/Liter" value={formatRp(preview.net_profit_per_liter)} emphasis />
            <ReadOnlyValue
              label="Profit %"
              value={`${(preview.profit_percentage * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`}
              emphasis
            />
            <ReadOnlyValue label="Cost per Liter" value={formatRp(preview.cost_per_liter)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
