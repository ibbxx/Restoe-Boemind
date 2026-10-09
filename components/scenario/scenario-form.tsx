"use client";

import { useActionState, useState } from "react";

import { commitScenarioAction, renameScenarioAction, type ScenarioFormState } from "@/lib/actions/scenarios";
import { formatRp } from "@/lib/format";
import type { CostItemView } from "@/lib/services/ahs";
import { SCENARIO_TYPES, type ScenarioType } from "@/lib/types/domain";
import { FormAlerts, SubmitButton } from "@/components/shared/forms";
import { Field } from "@/components/shared/primitives";

export function ScenarioForm({
  projectId,
  nextName,
  scenarios,
  costItems,
  defaults,
}: {
  projectId: string;
  nextName: string;
  scenarios: Array<{ id: string; name: string; is_locked: boolean }>;
  costItems: CostItemView[];
  defaults: {
    volume: number | null;
    harga_jual_include: number | null;
    include_divisor: number | null;
    ppn_rate: number | null;
    pbbkb_rate: number | null;
  };
}) {
  const [state, formAction] = useActionState<ScenarioFormState | null, FormData>(commitScenarioAction, null);
  const latest = scenarios[scenarios.length - 1]?.id ?? "";
  const [source, setSource] = useState(latest);
  const [variantF019B, setVariantF019B] = useState(false);
  const [literalDpp, setLiteralDpp] = useState(false);

  return (
    <form action={formAction} className="space-y-3 p-4">
      <input type="hidden" name="project_id" value={projectId} />
      <FormAlerts state={state} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Nama scenario" required error={state?.fieldErrors?.name} hint={`Kosongkan untuk memakai ${nextName}`}>
          <input className="input" name="name" placeholder={nextName} />
        </Field>

        <Field label="Scenario type">
          <select className="input" name="scenario_type" defaultValue="STANDARD">
            {SCENARIO_TYPES.map((type: ScenarioType) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Sumber (clone dari)" hint="Nilai disalin dari versi ini, tidak menghapus versi lama.">
          <select
            className="input"
            name="source_scenario_id"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">— AHS project (data terkini) —</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_locked ? " (locked)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reason (wajib untuk audit)" required error={state?.fieldErrors?.reason}>
          <input className="input" name="reason" placeholder="mis. vendor revision 16.396 → 16.000" required />
        </Field>

        <Field label="Volume" error={state?.fieldErrors?.volume}>
          <input
            className="input"
            name="volume"
            type="number"
            step="0.0001"
            defaultValue={defaults.volume ?? ""}
          />
        </Field>

        <Field label="Customer price (include)" error={state?.fieldErrors?.harga_jual_include}>
          <input
            className="input"
            name="harga_jual_include"
            type="number"
            step="0.0001"
            defaultValue={defaults.harga_jual_include ?? ""}
          />
        </Field>

        <Field label="Include divisor" error={state?.fieldErrors?.include_divisor}>
          <input
            className="input"
            name="include_divisor"
            type="number"
            step="0.000001"
            defaultValue={defaults.include_divisor ?? 1.11}
          />
        </Field>

        <Field label="PPN rate" error={state?.fieldErrors?.ppn_rate}>
          <input className="input" name="ppn_rate" type="number" step="0.01" defaultValue={11} />
        </Field>

        <Field label="PBBKB rate" error={state?.fieldErrors?.pbbkb_rate}>
          <input className="input" name="pbbkb_rate" type="number" step="0.01" defaultValue={0} />
        </Field>

        <Field label="Varian net profit" hint="F019A (2 suku) atau F019B (3 suku, dikurangi Selisih PBBKB).">
          <label className="flex items-center gap-2 py-1.5 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={variantF019B}
              onChange={(e) => setVariantF019B(e.target.checked)}
            />
            Pakai F019B
          </label>
          <input type="hidden" name="net_profit_formula_id" value={variantF019B ? "F019B" : ""} />
        </Field>

        <Field label="Harga jual DPP" hint="Blok Excel yang mengetik DPP langsung (F005B) — bukan hasil bagi divisor.">
          <label className="flex items-center gap-2 py-1.5 text-xs text-ink-700">
            <input type="checkbox" checked={literalDpp} onChange={(e) => setLiteralDpp(e.target.checked)} />
            DPP diketik manual
          </label>
          <input type="hidden" name="sale_dpp_variant" value={literalDpp ? "F005B" : ""} />
        </Field>

        {literalDpp ? (
          <Field label="Nilai DPP (F005B)">
            <input className="input" name="harga_jual_dpp_input" type="number" step="0.0001" />
          </Field>
        ) : null}
      </div>

      {costItems.length > 0 ? (
        <div className="rounded-lg border border-ink-200">
          <div className="border-b border-ink-200 bg-ink-100 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-500">
            Cost item override (opsional) — biarkan kosong untuk memakai nilai sumber
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="text-right">Rate (sumber)</th>
                  <th scope="col" className="text-right">Rate (scenario baru)</th>
                </tr>
              </thead>
              <tbody>
                {costItems.map((item) => (
                  <tr key={item.id}>
                    <td className="text-2xs text-ink-500">{item.category ?? "—"}</td>
                    <td>
                      {item.description}
                      <input type="hidden" name={`cost_description_${item.line_no}`} value={item.description} />
                    </td>
                    <td className="num">
                      {item.rate === null ? <span className="text-ink-400">—</span> : formatRp(item.rate)}
                    </td>
                    <td>
                      <input
                        className="input text-right"
                        name={`cost_rate_${item.line_no}`}
                        type="number"
                        step="0.00000001"
                        placeholder={item.rate === null ? "tidak berlaku" : ""}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 pt-3">
        <SubmitButton label="Hitung & simpan scenario" pendingLabel="Calculating…" />
        <span className="text-2xs text-ink-500">
          Tombol ini menjalankan calculation engine di server lalu menyimpan input + hasil sebagai versi baru.
        </span>
      </div>
    </form>
  );
}

export function RenameScenarioForm({
  projectId,
  scenarioId,
  name,
  disabled,
  disabledReason,
}: {
  projectId: string;
  scenarioId: string;
  name: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState<ScenarioFormState | null, FormData>(renameScenarioAction, null);

  if (disabled) {
    return (
      <span className="text-2xs text-ink-400" title={disabledReason}>
        terkunci (read-only)
      </span>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="scenario_id" value={scenarioId} />
      <input className="input w-32 text-xs" name="name" defaultValue={name} aria-label="Nama scenario" />
      <SubmitButton label="Rename" pendingLabel="…" variant="secondary" className="text-xs" />
      {state?.error ? <span className="text-2xs text-negative-700">{state.error}</span> : null}
    </form>
  );
}
