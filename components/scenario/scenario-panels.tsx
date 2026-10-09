import Link from "next/link";

import { formatDateTime, formatNumber, formatPercentFromRatio, formatRp, formatSignedCurrency, formatSignedNumber } from "@/lib/format";
import type { ScenarioComparisonTableView } from "@/lib/services/scenarios";
import type { ScenarioView } from "@/lib/services/scenarios";
import { Badge } from "@/components/shared/primitives";
import { DataTable, type Column } from "@/components/shared/data-table";

export function ScenarioTable({
  projectId,
  scenarios,
}: {
  projectId: string;
  scenarios: ScenarioView[];
}) {
  const columns: Array<Column<ScenarioView>> = [
    {
      key: "name",
      header: "Scenario",
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink-900">{row.scenario.name}</span>
            {row.scenario.is_locked ? <Badge tone="neutral">read-only</Badge> : <Badge tone="positive">editable</Badge>}
          </div>
          <div className="text-2xs text-ink-500">
            {row.parent_name ? `dari ${row.parent_name}` : "initial"} · {formatDateTime(row.scenario.created_at)}
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", cell: (row) => <span className="text-xs">{row.scenario.scenario_type}</span> },
    {
      key: "vendor",
      header: "Vendor Price",
      numeric: true,
      cell: (row) => (row.vendor_price === null ? <span className="text-ink-400">—</span> : formatRp(row.vendor_price)),
    },
    {
      key: "customer",
      header: "Customer Price",
      numeric: true,
      cell: (row) =>
        row.customer_price === null ? <span className="text-ink-400">—</span> : formatRp(row.customer_price),
    },
    {
      key: "volume",
      header: "Volume",
      numeric: true,
      cell: (row) => (row.volume === null ? <span className="text-ink-400">—</span> : `${formatNumber(row.volume)} L`),
    },
    {
      key: "netprofit",
      header: "Net Profit",
      numeric: true,
      cell: (row) =>
        row.net_profit === null ? (
          <span className="text-ink-400">—</span>
        ) : (
          <span className={row.net_profit < 0 ? "text-negative-700" : "text-positive-700"}>
            {formatRp(row.net_profit)}
          </span>
        ),
    },
    {
      key: "perliter",
      header: "Profit/Liter",
      numeric: true,
      cell: (row) => (row.net_profit_per_liter === null ? <span className="text-ink-400">—</span> : formatRp(row.net_profit_per_liter)),
    },
    {
      key: "pct",
      header: "Profit %",
      numeric: true,
      cell: (row) => formatPercentFromRatio(row.profit_percentage),
    },
    { key: "reason", header: "Reason", cell: (row) => <span className="text-xs text-ink-600">{row.scenario.reason ?? "—"}</span> },
    {
      key: "open",
      header: "",
      cell: (row) => (
        <Link href={`/projects/${projectId}/commercial?scenario=${row.scenario.id}`} className="text-xs text-accent-700 hover:underline">
          Buka
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={scenarios}
      rowKey={(row) => row.scenario.id}
      emptyMessage="No scenario created yet."
    />
  );
}

/** Visual indicator for improvement / decline / no change (Phase 3 §16). */
export function IndicatorChip({ indicator }: { indicator: ScenarioComparisonTableView["rows"][number]["indicator"] }) {
  switch (indicator) {
    case "IMPROVEMENT":
      return <Badge tone="positive">▲ Improvement</Badge>;
    case "DECLINE":
      return <Badge tone="negative">▼ Decline</Badge>;
    case "NO_CHANGE":
      return <Badge tone="neutral">= No change</Badge>;
    default:
      return <Badge tone="caution">— tidak diinterpretasi</Badge>;
  }
}

export function ScenarioComparisonTable({ view }: { view: ScenarioComparisonTableView }) {
  if (view.columns.length === 0) {
    return <p className="px-4 py-3 text-xs text-ink-500">Belum ada scenario untuk dibandingkan.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {view.columns.map((column) => (
                <th key={column.scenario_id} scope="col" className="text-right">
                  {column.name}
                  {column.is_locked ? <span className="ml-1 text-ink-400">🔒</span> : null}
                </th>
              ))}
              <th scope="col" className="text-right">Δ (terakhir vs pertama)</th>
              <th scope="col">Indikasi</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.metric}>
                <th scope="row" className="text-left text-xs font-medium text-ink-600">
                  {row.label}
                </th>
                <td className="num">{row.v1 === null ? <span className="text-ink-400">—</span> : formatCheckValue(row.metric, row.v1)}</td>
                {view.columns.length > 2 ? (
                  <td className="num text-ink-400">—</td>
                ) : null}
                <td className="num">{row.v2 === null ? <span className="text-ink-400">—</span> : formatCheckValue(row.metric, row.v2)}</td>
                <td className="num">
                  {row.difference === null ? (
                    <span className="text-ink-400">—</span>
                  ) : row.metric === "profit_percentage" ? (
                    formatSignedNumber(row.difference * 100, 2)
                  ) : (
                    formatSignedCurrency(row.difference)
                  )}
                </td>
                <td>
                  <IndicatorChip indicator={row.overall_indicator} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-2xs text-ink-500">
        “Improvement/Decline” mengikuti arah aritmetika formula engine (mis. F019A mengurangkan Selisih PPN,
        F017 mengurangkan Total Cost). Volume tidak memiliki arah yang tersirat di formula mana pun sehingga
        ditandai “tidak diinterpretasi”.
      </p>
    </div>
  );
}

function formatCheckValue(metric: string, value: number): string {
  if (metric === "volume") return `${formatNumber(value)} L`;
  if (metric === "profit_percentage") return formatPercentFromRatio(value);
  return formatRp(value);
}

