import Link from "next/link";

import { formatCurrency, formatDateTime, formatNumber, formatPercentFromRatio, formatRp } from "@/lib/format";
import { statusTone } from "@/lib/services/projects";
import type { DashboardView } from "@/lib/services/dashboard";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge, Card, CardHeader, ValuePair } from "@/components/shared/primitives";
import { EmptyState } from "@/components/shared/states";

function tone(t: ReturnType<typeof statusTone>) {
  return t;
}

const PROJECT_COLUMNS: Array<Column<DashboardView["recent_projects"][number]>> = [
  {
    key: "project",
    header: "Project",
    cell: (row) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink-900">{row.name}</div>
        <div className="font-mono text-2xs text-ink-500">{row.code}</div>
      </div>
    ),
  },
  { key: "customer", header: "Customer", cell: (row) => row.customer_name ?? "—" },
  { key: "volume", header: "Volume", numeric: true, cell: (row) => `${formatNumber(row.volume)} L` },
  {
    key: "profit",
    header: "Net Profit",
    numeric: true,
    cell: (row) =>
      row.net_profit === null ? (
        <span className="text-ink-400">—</span>
      ) : (
        <span className={row.net_profit < 0 ? "text-negative-700" : "text-positive-700"}>
          {formatCurrency(row.net_profit)}
        </span>
      ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <Badge tone={tone(statusTone(row.status))}>{row.status}</Badge>,
  },
  { key: "updated", header: "Updated", cell: (row) => formatDateTime(row.updated_at) },
];

export function RecentProjects({ view }: { view: DashboardView }) {
  return (
    <Card>
      <CardHeader
        title="Recent projects"
        actions={
          <Link href="/projects" className="btn-secondary text-xs">
            View all
          </Link>
        }
      />
      <DataTable
        columns={PROJECT_COLUMNS}
        rows={view.recent_projects}
        rowKey={(row) => row.id}
        rowHref={(row) => `/projects/${row.id}`}
        emptyMessage="No projects"
      />
    </Card>
  );
}

export function StatusBreakdown({ view }: { view: DashboardView }) {
  return (
    <Card>
      <CardHeader title="Project status" />
      <div className="px-4 py-2">
        {view.status_breakdown.length === 0 ? (
          <p className="py-3 text-xs text-ink-500">No projects</p>
        ) : (
          view.status_breakdown.map((entry) => (
            <ValuePair
              key={entry.status}
              label={entry.status}
              value={
                <Link href={`/projects?status=${entry.status}`} className="hover:underline">
                  {formatNumber(entry.count)}
                </Link>
              }
            />
          ))
        )}
      </div>
    </Card>
  );
}

export function LatestScenarioPanel({ view }: { view: DashboardView }) {
  const scenario = view.latest_scenario;
  return (
    <Card>
      <CardHeader title="Latest scenario" />
      <div className="px-4 py-3">
        {scenario ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/projects/${scenario.project_id}/scenarios`}
                className="text-sm font-medium text-accent-700 hover:underline"
              >
                {scenario.project_name}
              </Link>
              <Badge tone="accent">{scenario.scenario_name}</Badge>
            </div>
            <ValuePair label="Created" value={formatDateTime(scenario.created_at)} mono={false} />
            <ValuePair label="By" value={scenario.created_by_name ?? "—"} mono={false} />
            <ValuePair label="Net Profit" value={formatRp(scenario.net_profit)} />
          </div>
        ) : (
          <p className="py-3 text-xs text-ink-500">No scenarios</p>
        )}
      </div>
    </Card>
  );
}

export function LatestResultPanel({ view }: { view: DashboardView }) {
  const result = view.latest_result;
  return (
    <Card>
      <CardHeader title="Latest result" />
      <div className="px-4 py-3">
        {result ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/projects/${result.project_id}/commercial`}
                className="text-sm font-medium text-accent-700 hover:underline"
              >
                {result.project_name}
              </Link>
              <span className="text-2xs text-ink-500">{formatDateTime(result.computed_at)}</span>
            </div>
            <ValuePair label="Revenue" value={formatRp(result.revenue)} />
            <ValuePair label="Total Cost" value={formatRp(result.total_cost)} />
            <ValuePair label="Gross Profit" value={formatRp(result.gross_profit)} />
            <ValuePair label="PPN Difference" value={formatRp(result.ppn_difference)} />
            <ValuePair
              label="Net Profit"
              value={
                <span className={result.net_profit !== null && result.net_profit < 0 ? "text-negative-700" : ""}>
                  {formatRp(result.net_profit)}
                </span>
              }
            />
            <ValuePair label="Net Profit/Liter" value={formatRp(result.net_profit_per_liter)} />
            <ValuePair label="Profit %" value={formatPercentFromRatio(result.profit_percentage)} />
          </div>
        ) : (
          <p className="py-3 text-xs text-ink-500">No results</p>
        )}
      </div>
    </Card>
  );
}

export function DashboardEmptyState() {
  return (
    <EmptyState
      title="No projects yet"
      action={
        <Link href="/projects/new" className="btn-primary">
          Create project
        </Link>
      }
    />
  );
}
