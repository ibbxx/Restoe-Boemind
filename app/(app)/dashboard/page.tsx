import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import { loadDashboard } from "@/lib/services/dashboard";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import {
  DashboardEmptyState,
  LatestResultPanel,
  LatestScenarioPanel,
  RecentProjects,
  StatusBreakdown,
} from "@/components/dashboard/dashboard-panels";
import { PageHeader } from "@/components/shared/primitives";
import { ErrorState } from "@/components/shared/states";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState title="Dashboard tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />
      </>
    );
  }

  const dashboard = await loadDashboard(ctx.db, ctx.actor);
  if (!dashboard.ok) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState
          title="Dashboard tidak dapat dimuat"
          message={dashboard.error}
          code={dashboard.errorCode}
        />
      </>
    );
  }

  const view = dashboard.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Seluruh angka dibaca dari calculation result yang tersimpan di database."
        actions={
          <Link href="/projects/new" className="btn-primary">
            New project
          </Link>
        }
      />

      <div className="space-y-4">
        <KpiGrid kpis={view.kpis} />

        {view.is_empty ? (
          <DashboardEmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <RecentProjects view={view} />
            </div>
            <div className="space-y-4">
              <StatusBreakdown view={view} />
              <LatestScenarioPanel view={view} />
              <LatestResultPanel view={view} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
