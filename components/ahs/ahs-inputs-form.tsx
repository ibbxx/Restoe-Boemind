"use client";

import { useActionState, useState, useTransition } from "react";

import { saveAhsInputsAction, previewAhsAction, type AhsFormState } from "@/lib/actions/ahs";
import type { AhsResult } from "@/lib/calculations/types";
import { formatPercent, formatRupiah } from "@/lib/format";
import type { AhsInputsView } from "@/lib/services/ahs";
import { FormAlerts, SubmitButton } from "@/components/shared/forms";
import { Card, CardHeader, Field, StatCard } from "@/components/shared/primitives";
import { ErrorState } from "@/components/shared/states";

export interface AhsInputsFormProps {
  projectId: string;
  inputs: AhsInputsView | null;
  canWrite?: boolean;
}

export function AhsInputsForm({ projectId, inputs, canWrite = true }: AhsInputsFormProps) {
  const [state, formAction] = useActionState<AhsFormState | null, FormData>(
    saveAhsInputsAction,
    null,
  );

  const [volume, setVolume] = useState<string>(inputs?.volume !== null && inputs?.volume !== undefined ? String(inputs.volume) : "");
  const [hargaJualInclude, setHargaJualInclude] = useState<string>(
    inputs?.harga_jual_include !== null && inputs?.harga_jual_include !== undefined ? String(inputs.harga_jual_include) : "",
  );
  const [includeDivisor, setIncludeDivisor] = useState<string>(
    inputs?.include_divisor !== null && inputs?.include_divisor !== undefined ? String(inputs.include_divisor) : "1.11",
  );
  const [ppnRate, setPpnRate] = useState<string>(
    inputs?.ppn_rate !== null && inputs?.ppn_rate !== undefined ? String(inputs.ppn_rate * 100) : "11",
  );
  const [pbbkbRate, setPbbkbRate] = useState<string>(
    inputs?.pbbkb_rate !== null && inputs?.pbbkb_rate !== undefined ? String(inputs.pbbkb_rate * 100) : "0",
  );
  const [hargaKeekonomian, setHargaKeekonomian] = useState<string>(
    inputs?.harga_keekonomian !== null && inputs?.harga_keekonomian !== undefined ? String(inputs.harga_keekonomian) : "",
  );

  const [preview, setPreview] = useState<AhsResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRecalc = () => {
    startTransition(async () => {
      const vol = volume ? Number(volume) : null;
      const hrg = hargaJualInclude ? Number(hargaJualInclude) : null;
      const div = includeDivisor ? Number(includeDivisor) : null;
      const ppn = ppnRate ? Number(ppnRate) / 100 : null;
      const pbbkb = pbbkbRate ? Number(pbbkbRate) / 100 : null;
      const keeko = hargaKeekonomian ? Number(hargaKeekonomian) : null;

      const res = await previewAhsAction(projectId, {
        volume: vol,
        harga_jual_include: hrg,
        include_divisor: div,
        ppn_rate: ppn,
        pbbkb_rate: pbbkb,
        harga_keekonomian: keeko,
      });

      if (res.ok) {
        setPreview(res.data.result);
        setPreviewError(null);
      } else {
        setPreviewError(res.error);
      }
    });
  };

  const err = (field: string) => state?.fieldErrors?.[field];

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="project_id" value={projectId} />

        <FormAlerts
          state={state}
          successMessage="Input parameter AHS berhasil disimpan."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Volume (Liter)" error={err("volume")}>
            <input
              type="number"
              name="volume"
              className="input-field"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder="contoh: 10000"
              disabled={!canWrite}
            />
          </Field>

          <Field label="Harga Jual Include (Rp)" error={err("harga_jual_include")}>
            <input
              type="number"
              name="harga_jual_include"
              className="input-field"
              value={hargaJualInclude}
              onChange={(e) => setHargaJualInclude(e.target.value)}
              placeholder="contoh: 12500"
              disabled={!canWrite}
            />
          </Field>

          <Field label="Include Divisor" error={err("include_divisor")}>
            <input
              type="number"
              step="any"
              name="include_divisor"
              className="input-field"
              value={includeDivisor}
              onChange={(e) => setIncludeDivisor(e.target.value)}
              placeholder="1.11"
              disabled={!canWrite}
            />
          </Field>

          <Field label="PPN Rate (%)" error={err("ppn_rate")}>
            <input
              type="number"
              step="any"
              name="ppn_rate"
              className="input-field"
              value={ppnRate}
              onChange={(e) => setPpnRate(e.target.value)}
              placeholder="11"
              disabled={!canWrite}
            />
          </Field>

          <Field label="PBBKB Rate (%)" error={err("pbbkb_rate")}>
            <input
              type="number"
              step="any"
              name="pbbkb_rate"
              className="input-field"
              value={pbbkbRate}
              onChange={(e) => setPbbkbRate(e.target.value)}
              placeholder="0"
              disabled={!canWrite}
            />
          </Field>

          <Field label="Harga Keekonomian (Rp)" error={err("harga_keekonomian")}>
            <input
              type="number"
              name="harga_keekonomian"
              className="input-field"
              value={hargaKeekonomian}
              onChange={(e) => setHargaKeekonomian(e.target.value)}
              placeholder="Opsional"
              disabled={!canWrite}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {canWrite && <SubmitButton label="Simpan Parameter AHS" pendingLabel="Menyimpan…" />}
          <button
            type="button"
            onClick={handleRecalc}
            disabled={isPending}
            className="btn-secondary"
          >
            {isPending ? "Menghitung…" : "Hitung Preview Live"}
          </button>
        </div>
      </form>

      {previewError && (
        <ErrorState
          title="Kalkulasi Gagal"
          message={previewError}
        />
      )}

      {preview && (
        <Card>
          <CardHeader
            title="Hasil Live Recalculation AHS"
            description="Nilai kalkulasi langsung dari engine tanpa mengubah data tersimpan."
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Harga Jual DPP" value={formatRupiah(preview.harga_jual_dpp)} />
            <StatCard label="Revenue" value={formatRupiah(preview.revenue)} />
            <StatCard label="Total Cost" value={formatRupiah(preview.total_cost)} />
            <StatCard label="Cost / Liter" value={formatRupiah(preview.cost_per_liter)} />
            <StatCard label="Gross Profit" value={formatRupiah(preview.gross_profit)} />
            <StatCard label="Net Profit" value={formatRupiah(preview.net_profit)} />
            <StatCard label="Net Profit / Liter" value={formatRupiah(preview.net_profit_per_liter)} />
            <StatCard label="Profit %" value={formatPercent(preview.profit_percentage)} />
          </div>
        </Card>
      )}
    </div>
  );
}
