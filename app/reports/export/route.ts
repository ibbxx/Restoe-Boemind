import { NextResponse } from "next/server";

import { requestContext, isContextError } from "@/lib/data/context";
import {
  buildCommercialReport,
  buildScenarioComparisonReport,
  buildVendorComparisonReport,
  commercialReportToCsv,
  scenarioComparisonToCsv,
  vendorComparisonToCsv,
} from "@/lib/services/reports";

export const dynamic = "force-dynamic";

/**
 * CSV export (Phase 3 §18).
 *
 * Exports the SAME numbers the UI shows (raw, unformatted) and never triggers a
 * recalculation. The session and RLS still apply: an unauthorised export returns
 * an empty/forbidden response instead of leaking data.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "commercial";
  const projectId = url.searchParams.get("project");

  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.errorCode === "FORBIDDEN" ? 401 : 500 });
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (type === "commercial") {
    const report = await buildCommercialReport(ctx.db, ctx.actor, {
      search: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "",
      only_with_result: url.searchParams.get("only") === "1",
    });
    if (!report.ok) {
      return NextResponse.json({ error: report.error }, { status: 500 });
    }
    return csvResponse(commercialReportToCsv(report.data), `commercial-report-${stamp}.csv`);
  }

  if (!projectId) {
    return NextResponse.json({ error: "Parameter project wajib untuk export ini." }, { status: 400 });
  }

  if (type === "vendor") {
    const report = await buildVendorComparisonReport(ctx.db, ctx.actor, projectId);
    if (!report.ok) return NextResponse.json({ error: report.error }, { status: report.errorCode === "FORBIDDEN" ? 403 : 500 });
    return csvResponse(
      vendorComparisonToCsv(report.data.project_name, report.data.comparison),
      `vendor-comparison-${stamp}.csv`,
    );
  }

  if (type === "scenario") {
    const report = await buildScenarioComparisonReport(ctx.db, ctx.actor, projectId);
    if (!report.ok) return NextResponse.json({ error: report.error }, { status: report.errorCode === "FORBIDDEN" ? 403 : 500 });
    return csvResponse(scenarioComparisonToCsv(report.data), `scenario-comparison-${stamp}.csv`);
  }

  return NextResponse.json({ error: `Tipe report "${type}" tidak dikenal.` }, { status: 400 });
}

function csvResponse(body: string, filename: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
