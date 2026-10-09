import { formatCurrency, formatDateTime } from "@/lib/format";
import { formatHistoryValue, historyEntityLabel, type HistoryRowView } from "@/lib/services/history";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/shared/primitives";

const IMPACT_LABELS: Record<string, string> = {
  revenue: "Revenue",
  total_cost: "Total Cost",
  gross_profit: "Gross Profit",
  ppn_difference: "PPN Difference",
  net_profit: "Net Profit",
  net_profit_per_liter: "Profit/Liter",
  profit_percentage: "Profit %",
  all_in: "Vendor ALL IN",
};

function ImpactCell({ row }: { row: HistoryRowView }) {
  const impact = row.impact_json;
  if (!impact || Object.keys(impact).length === 0) return <span className="text-ink-400">—</span>;
  return (
    <ul className="space-y-0.5 text-2xs">
      {Object.entries(impact).map(([metric, value]) => {
        const isPct = metric === "profit_percentage";
        const format = (v: number | null) =>
          v === null ? "—" : isPct ? `${(v * 100).toFixed(2)}%` : formatCurrency(v);
        return (
          <li key={metric} className="whitespace-nowrap">
            <span className="text-ink-500">{IMPACT_LABELS[metric] ?? metric}:</span>{" "}
            <span className="font-mono">{format(value.before)}</span>
            <span className="mx-1">→</span>
            <span className="font-mono">{format(value.after)}</span>
            {value.delta !== null && value.delta !== 0 ? (
              <span className={value.delta > 0 ? "ml-1 text-positive-700" : "ml-1 text-negative-700"}>
                ({value.delta > 0 ? "▲" : "▼"} {format(Math.abs(value.delta))})
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const columns: Array<Column<HistoryRowView>> = [
  {
    key: "when",
    header: "Date",
    cell: (row) => <span className="whitespace-nowrap text-xs">{formatDateTime(row.changed_at)}</span>,
  },
  {
    key: "who",
    header: "User",
    cell: (row) => (
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-800">{row.changed_by_name}</div>
        <div className="text-2xs text-ink-500">{row.changed_by_email ?? ""}</div>
      </div>
    ),
  },
  {
    key: "action",
    header: "Action",
    cell: (row) => (
      <div className="space-y-0.5">
        <Badge tone={row.action === "DELETE" ? "negative" : row.action === "INSERT" ? "positive" : "neutral"}>
          {row.action}
        </Badge>
        <div className="text-2xs text-ink-500">
          {historyEntityLabel(row.entity)}
          {row.scenario_name ? ` · ${row.scenario_name}` : ""}
        </div>
      </div>
    ),
  },
  { key: "field", header: "Field", cell: (row) => <span className="font-mono text-2xs">{row.field ?? "—"}</span> },
  {
    key: "old",
    header: "Old Value",
    numeric: true,
    cell: (row) => <span>{formatHistoryValue(row.old_value)}</span>,
  },
  {
    key: "new",
    header: "New Value",
    numeric: true,
    cell: (row) => <span>{formatHistoryValue(row.new_value)}</span>,
  },
  { key: "reason", header: "Reason", cell: (row) => <span className="text-xs text-ink-600">{row.reason ?? "—"}</span> },
  { key: "impact", header: "Impact", cell: (row) => <ImpactCell row={row} /> },
];

/**
 * History is APPEND-ONLY: the database rejects UPDATE and DELETE for every
 * role (trg_history_append_only), so no edit/delete affordance is rendered.
 */
export function HistoryTable({ rows }: { rows: HistoryRowView[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      emptyMessage="Belum ada perubahan yang tercatat untuk project ini."
      caption="Project history"
    />
  );
}
