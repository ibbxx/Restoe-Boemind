import { formatCurrency, formatNumber, formatRp } from "@/lib/format";
import type { DashboardKpis } from "@/lib/services/dashboard";
import { StatCard } from "@/components/shared/primitives";

/**
 * KPI grid. Every figure is an aggregate of stored calculation results — no
 * KPI is hardcoded and nothing is derived in the browser (Phase 3 §5/§22).
 */
export function KpiGrid({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Total Project"
        value={formatNumber(kpis.total_projects)}
        hint={`${formatNumber(kpis.projects_with_result)} with results`}
        href="/projects"
      />
      <StatCard
        label="Active"
        value={formatNumber(kpis.active_projects)}
        tone="positive"
        hint={`${formatNumber(kpis.completed_projects)} completed`}
        href="/projects?status=ACTIVE"
      />
      <StatCard
        label="Completed"
        value={formatNumber(kpis.completed_projects)}
        hint={`${formatNumber(kpis.projects_without_result)} without scenarios`}
        href="/projects?status=COMPLETED"
      />
      <StatCard
        label="Volume"
        value={`${formatNumber(kpis.total_volume)} L`}
        hint="Latest scenario per project"
      />
      <StatCard label="Revenue" value={formatCurrency(kpis.total_revenue)} />
      <StatCard label="Cost" value={formatCurrency(kpis.total_cost)} />
      <StatCard
        label="Profit"
        value={formatCurrency(kpis.total_profit)}
        tone={kpis.total_profit !== null && kpis.total_profit < 0 ? "negative" : "positive"}
      />
      <StatCard
        label="Average Profit/Liter"
        value={formatRp(kpis.average_profit_per_liter)}
        tone={
          kpis.average_profit_per_liter !== null && kpis.average_profit_per_liter < 0
            ? "negative"
            : "positive"
        }
        hint="Weighted average"
      />
    </div>
  );
}
