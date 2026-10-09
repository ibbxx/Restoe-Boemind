import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import {
  buildCommercialReport,
  buildScenarioComparisonReport,
  buildVendorComparisonReport,
} from "@/lib/services/reports";
import { listProjectVendors } from "@/lib/services/vendors";
import { SCENARIO_TYPES, PROJECT_STATUSES } from "@/lib/types/domain";
import {
  formatCurrency,
  formatNumber,
  formatPercentFromRatio,
  formatRp,
} from "@/lib/format";
import { Card, CardHeader, PageHeader, Badge } from "@/components/shared/primitives";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { VendorComparisonTable } from "@/components/vendor/vendor-tables";
import { ScenarioComparisonTable } from "@/components/scenario/scenario-panels";

export const dynamic = "force-dynamic";

/**
 * Reports (Phase 3 §18): view + filter + export.
 * Reports only READ stored results — they cannot change a business value, and
 * the CSV export carries raw numbers (not formatted strings).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; project?: string; only?: string }>;
}) {
  const sp = await searchParams;

  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return <ErrorState title="Reports tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />;
  }

  const commercial = await buildCommercialReport(ctx.db, ctx.actor, {
    search: sp.q ?? "",
    status: sp.status ?? "",
    only_with_result: sp.only === "1",
  });

  if (!commercial.ok) {
    return <ErrorState title="Reports tidak dapat dimuat" message={commercial.error} code={commercial.errorCode} />;
  }

  const report = commercial.data;
  const projectId = sp.project ?? report.rows[0]?.project_id ?? null;

  const [vendorReport, scenarioReport, projectVendors] = await Promise.all([
    projectId ? buildVendorComparisonReport(ctx.db, ctx.actor, projectId) : Promise.resolve(null),
    projectId ? buildScenarioComparisonReport(ctx.db, ctx.actor, projectId) : Promise.resolve(null),
    projectId ? listProjectVendors(ctx.db, ctx.actor, projectId) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          projectId ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/reports/export?type=commercial&project=${projectId}&q=${encodeURIComponent(sp.q ?? "")}&status=${sp.status ?? ""}`}
                className="btn-primary"
              >
                Export commercial CSV
              </Link>
              <Link href={`/reports/export?type=vendor&project=${projectId}`} className="btn-secondary">
                Export vendor CSV
              </Link>
              <Link href={`/reports/export?type=scenario&project=${projectId}`} className="btn-secondary">
                Export scenario CSV
              </Link>
            </div>
          ) : null
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={`Commercial report (${formatNumber(report.rows.length)} project)`}
            description={`Dibuat ${new Date(report.generated_at).toLocaleString("id-ID")}`}
          />
          <form className="flex flex-wrap items-end gap-2 border-b border-ink-200 px-3 py-3" method="get">
            <label className="min-w-[200px] flex-1">
              <span className="field-label">Search</span>
              <input className="input" name="q" defaultValue={sp.q ?? ""} placeholder="project code / name" />
            </label>
            <label>
              <span className="field-label">Status</span>
              <select className="input" name="status" defaultValue={sp.status ?? ""}>
                <option value="">All</option>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="pb-1.5">
              <span className="flex items-center gap-2 text-xs text-ink-700">
                <input type="checkbox" name="only" value="1" defaultChecked={sp.only === "1"} />
                With results only
              </span>
            </label>
            <button type="submit" className="btn-secondary">
              Apply
            </button>
          </form>

          {report.rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                compact
                title="No report data"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Scenario</th>
                    <th scope="col" className="text-right">Vendor Price</th>
                    <th scope="col" className="text-right">Customer Price</th>
                    <th scope="col" className="text-right">Volume</th>
                    <th scope="col" className="text-right">Revenue</th>
                    <th scope="col" className="text-right">Total Cost</th>
                    <th scope="col" className="text-right">Gross Profit</th>
                    <th scope="col" className="text-right">PPN Diff</th>
                    <th scope="col" className="text-right">Net Profit</th>
                    <th scope="col" className="text-right">Profit/Liter</th>
                    <th scope="col" className="text-right">Profit %</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.project_id}>
                      <td>
                        <Link
                          href={`/projects/${row.project_id}`}
                          className="font-medium text-accent-700 hover:underline"
                        >
                          {row.project_name}
                        </Link>
                        <div className="font-mono text-2xs text-ink-500">
                          {row.project_code} · {row.status}
                        </div>
                      </td>
                      <td className="text-xs">{row.customer_name ?? "—"}</td>
                      <td className="text-xs">
                        {row.scenario_name ?? <Badge tone="caution">None</Badge>}
                      </td>
                      <td className="num">{formatRp(row.vendor_price)}</td>
                      <td className="num">{formatRp(row.customer_price)}</td>
                      <td className="num">{formatNumber(row.volume)}</td>
                      <td className="num">{formatCurrency(row.revenue)}</td>
                      <td className="num">{formatCurrency(row.total_cost)}</td>
                      <td className="num">{formatCurrency(row.gross_profit)}</td>
                      <td className="num">{formatCurrency(row.ppn_difference)}</td>
                      <td className="num font-medium">{formatCurrency(row.net_profit)}</td>
                      <td className="num">{formatRp(row.net_profit_per_liter)}</td>
                      <td className="num">{formatPercentFromRatio(row.profit_percentage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Vendor comparison"
            description={
              projectId
                ? "Perbandingan vendor pada project yang dipilih."
                : "Pilih project pada tabel di atas untuk melihat perbandingan vendor."
            }
            actions={
              projectId && projectVendors?.ok ? (
                <span className="text-2xs text-ink-500">{projectVendors.data.length} vendor</span>
              ) : null
            }
          />
          {vendorReport && vendorReport.ok ? (
            <VendorComparisonTable view={vendorReport.data.comparison} />
          ) : vendorReport && !vendorReport.ok ? (
            <ErrorState message={vendorReport.error} code={vendorReport.errorCode} />
          ) : (
            <p className="px-4 py-3 text-xs text-ink-500">Select a project.</p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Scenario comparison"
            description="Maksimum 3 versi terakhir, dibandingkan oleh engine."
          />
          {scenarioReport && scenarioReport.ok ? (
            <ScenarioComparisonTable
              view={{ columns: scenarioReport.data.columns, rows: scenarioReport.data.rows }}
            />
          ) : scenarioReport && !scenarioReport.ok ? (
            <ErrorState message={scenarioReport.error} code={scenarioReport.errorCode} />
          ) : (
            <p className="px-4 py-3 text-xs text-ink-500">Select a project.</p>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-2xs text-ink-500">
            Scenario type yang tersedia (mengikuti label blok di workbook): {SCENARIO_TYPES.join(", ")}.
            Reports show stored engine results.
          </p>
        </Card>
      </div>
    </>
  );
}
