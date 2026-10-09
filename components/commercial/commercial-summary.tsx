import {
  formatCurrency,
  formatPercentFromRatio,
  formatRp,
} from "@/lib/format";
import type { CommercialMetrics } from "@/lib/services/commercial";
import { ReadOnlyValue, ValuePair } from "@/components/shared/primitives";

export const EMPTY_METRICS: CommercialMetrics = {
  harga_jual_dpp: null,
  harga_jual_setelah_pajak: null,
  revenue: null,
  total_cost: null,
  cost_per_liter: null,
  ppn_output: null,
  ppn_input: null,
  ppn_difference: null,
  gross_profit: null,
  net_profit: null,
  net_profit_per_liter: null,
  profit_percentage: null,
};

/**
 * Commercial result block. Every figure is an ENGINE output rendered read-only:
 * the UI never recomputes Revenue, Cost, Gross Profit, PPN difference or Net
 * Profit (PRD §39, Phase 3 §13).
 */
export function CommercialResultBlock({
  metrics,
  highlight = true,
}: {
  metrics: CommercialMetrics;
  highlight?: boolean;
}) {
  const profitTone =
    metrics.net_profit === null ? undefined : metrics.net_profit < 0 ? "negative" : "positive";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ReadOnlyValue label="Revenue" value={formatCurrency(metrics.revenue)} />
        <ReadOnlyValue label="Total Cost" value={formatCurrency(metrics.total_cost)} />
        <ReadOnlyValue label="Gross Profit" value={formatCurrency(metrics.gross_profit)} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <ReadOnlyValue label="PPN Difference" value={formatCurrency(metrics.ppn_difference)} />
        <ReadOnlyValue label="Net Profit" value={formatCurrency(metrics.net_profit)} tone={profitTone} />
        <ReadOnlyValue
          label="Net Profit/Liter"
          value={formatRp(metrics.net_profit_per_liter)}
          tone={profitTone}
        />
        <ReadOnlyValue
          label="Profit %"
          value={formatPercentFromRatio(metrics.profit_percentage)}
          hint="F021A = Net Profit ÷ Total Cost"
        />
      </div>

      {highlight ? (
        <div
          className={`rounded-lg border px-4 py-3 ${
            profitTone === "negative"
              ? "border-negative-100 bg-negative-50"
              : "border-positive-100 bg-positive-50"
          }`}
        >
          <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">
            Dengan harga/vendor ini project menghasilkan
          </div>
          <div
            className={`font-mono text-2xl font-semibold ${
              profitTone === "negative" ? "text-negative-700" : "text-positive-700"
            }`}
          >
            {formatCurrency(metrics.net_profit)}
          </div>
          <div className="mt-0.5 text-2xs text-ink-600">
            Net Profit — {formatPercentFromRatio(metrics.profit_percentage)} dari total biaya,{" "}
            {formatRp(metrics.net_profit_per_liter)}/liter
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Input → Calculation → Result hierarchy (Phase 3 §13). */
export function CommercialBreakdown({ metrics }: { metrics: CommercialMetrics }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="rounded-lg border border-ink-200 bg-white px-3 py-2">
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-500">1 · Harga</div>
        <ValuePair label="Harga Jual DPP" value={formatRp(metrics.harga_jual_dpp)} />
        <ValuePair label="Harga Jual Setelah Pajak" value={formatRp(metrics.harga_jual_setelah_pajak)} />
        <ValuePair label="Cost per Liter (F016)" value={formatRp(metrics.cost_per_liter)} />
      </div>
      <div className="rounded-lg border border-ink-200 bg-white px-3 py-2">
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-500">2 · Pajak</div>
        <ValuePair label="PPN Keluaran (F001)" value={formatRp(metrics.ppn_output)} />
        <ValuePair label="PPN Masukan (F008A/B/C)" value={formatRp(metrics.ppn_input)} />
        <ValuePair label="Selisih PPN (F018)" value={formatRp(metrics.ppn_difference)} />
      </div>
      <div className="rounded-lg border border-ink-200 bg-white px-3 py-2">
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-500">3 · Hasil</div>
        <ValuePair label="Revenue (F006)" value={formatRp(metrics.revenue)} />
        <ValuePair label="Total Cost (F015A/B)" value={formatRp(metrics.total_cost)} />
        <ValuePair label="Laba Kotor (F017)" value={formatRp(metrics.gross_profit)} />
        <ValuePair label="Laba Bersih (F019A/B)" value={formatRp(metrics.net_profit)} />
        <ValuePair label="Laba Bersih/Liter (F020)" value={formatRp(metrics.net_profit_per_liter)} />
        <ValuePair label="Persentase (F021A)" value={formatPercentFromRatio(metrics.profit_percentage)} />
      </div>
    </div>
  );
}
