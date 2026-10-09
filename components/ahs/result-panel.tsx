import { Fragment } from "react";

import type { AhsResult } from "@/lib/calculations/types";
import { groupCostBreakdown, type CostItemView } from "@/lib/services/ahs";
import { formatRp } from "@/lib/format";
import { Card, CardHeader, ReadOnlyValue } from "@/components/shared/primitives";

/**
 * Calculation result + cost breakdown. All totals are ENGINE outputs
 * (`calculateAhs`), rendered read-only. The category subtotals are simple
 * groupings of the engine's own line totals.
 */
export function AhsResultPanel({
  result,
  costItems,
  pendingReason,
}: {
  result: AhsResult | null;
  costItems: CostItemView[];
  pendingReason?: string;
}) {
  if (!result) {
    return (
      <Card>
        <CardHeader title="Calculation result" />
        <p className="px-4 py-6 text-center text-xs text-ink-500">
          {pendingReason ?? "Hasil perhitungan belum tersedia."}
        </p>
      </Card>
    );
  }

  const groups = groupCostBreakdown(result);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Calculation result"
          description=""
        />
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
          <ReadOnlyValue label="Harga Jual DPP" value={formatRp(result.harga_jual_dpp)} hint={`varian ${result.sale_dpp_variant}`} />
          <ReadOnlyValue label="Harga Jual Setelah Pajak" value={formatRp(result.harga_jual_setelah_pajak)} />
          <ReadOnlyValue label="Revenue (F006)" value={formatRp(result.revenue)} />
          <ReadOnlyValue label="Total Cost (F015A)" value={formatRp(result.total_cost)} />
          <ReadOnlyValue label="Cost per Liter (F016)" value={formatRp(result.cost_per_liter)} />
          <ReadOnlyValue label="Gross Profit (F017)" value={formatRp(result.gross_profit)} />
          <ReadOnlyValue label="PPN Difference (F018)" value={formatRp(result.ppn_difference)} />
          <ReadOnlyValue
            label="Net Profit"
            value={formatRp(result.net_profit)}
            tone={result.net_profit < 0 ? "negative" : "positive"}
            emphasis
          />
          <ReadOnlyValue
            label="Net Profit/Liter (F020)"
            value={formatRp(result.net_profit_per_liter)}
            tone={result.net_profit < 0 ? "negative" : "positive"}
            emphasis
          />
          <ReadOnlyValue
            label="Profit % (F021A)"
            value={`${(result.profit_percentage * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`}
            hint="Net Profit ÷ Total Cost"
            emphasis
          />
          <ReadOnlyValue label="PPN Keluaran" value={formatRp(result.ppn_output)} />
          <ReadOnlyValue label="PPN Masukan" value={formatRp(result.ppn_input)} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`Cost breakdown (${costItems.length} baris)`}
          description=""
        />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Description</th>
                <th scope="col" className="text-right">Rate</th>
                <th scope="col" className="text-right">Qty</th>
                <th scope="col" className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={`group-${group.category}`}>
                  <tr className="bg-ink-50">
                    <td colSpan={4} className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                      {group.category}
                    </td>
                    <td className="num font-semibold">{formatRp(group.total)}</td>
                  </tr>
                  {group.items.map((item, index) => (
                    <tr key={`${group.category}-${item.line_no ?? index}`}>
                      <td className="text-2xs text-ink-500">{item.category ?? "—"}</td>
                      <td>
                        {item.description}
                        {!item.applied ? (
                          <span className="ml-2 badge bg-caution-100 text-caution-700">tidak berlaku</span>
                        ) : null}
                      </td>
                      <td className="num">{item.rate === null ? <span className="text-ink-400">—</span> : formatRp(item.rate)}</td>
                      <td className="num">{item.qty === null ? <span className="text-ink-400">—</span> : item.qty}</td>
                      <td className="num">{formatRp(item.total)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="border-t border-ink-200 text-xs font-semibold uppercase tracking-wide text-ink-600">
                  Total Cost (F015A)
                </td>
                <td className="num border-t border-ink-200 font-semibold">{formatRp(result.total_cost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Formula registry" />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 px-4 py-3 md:grid-cols-3 xl:grid-cols-4">
          {Object.entries(result.formulas_used).map(([step, formulaId]) => (
            <div key={step} className="flex items-baseline justify-between gap-2 border-b border-ink-100 py-1">
              <dt className="text-2xs text-ink-500">{step}</dt>
              <dd className="font-mono text-2xs text-ink-800">{formulaId}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
