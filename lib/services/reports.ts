/**
 * Reports (PRD §42, Phase 3 §18).
 *
 * The reports READ the stored calculation results — they never recompute a
 * business value, so a report can never disagree with the engine. Export is CSV
 * and carries the RAW numeric values (not formatted "Rp 16.396" strings) so the
 * file stays usable for further analysis.
 */

import type { Actor } from "../auth/session";
import { eq, searchAcross, type Database } from "../data/db";
import { toNumber } from "../format";
import type {
  CalculationResult,
  PriceScenario,
  Project,
  ScenarioInput,
} from "../types/domain";
import { isActionErr, loadProjectContext } from "./access";
import { toActionResultError, notFound, ok, type ActionResult } from "./result";
import { buildVendorComparison, type VendorComparisonView } from "./vendors";
import { compareScenarios, type ScenarioComparisonTableView } from "./scenarios";

export interface CommercialReportRow {
  project_id: string;
  project_code: string;
  project_name: string;
  customer_name: string | null;
  location: string | null;
  status: string;
  scenario_name: string | null;
  vendor_price: number | null;
  customer_price: number | null;
  volume: number | null;
  revenue: number | null;
  total_cost: number | null;
  gross_profit: number | null;
  ppn_difference: number | null;
  net_profit: number | null;
  net_profit_per_liter: number | null;
  profit_percentage: number | null;
  /** True when the project has no calculation result yet (rendered as "-"). */
  without_result: boolean;
}

export interface CommercialReportFilters {
  search?: string;
  status?: string;
  only_with_result?: boolean;
}

export interface CommercialReport {
  rows: CommercialReportRow[];
  generated_at: string;
  filters: CommercialReportFilters;
}

export async function buildCommercialReport(
  db: Database,
  _actor: Actor,
  filters: CommercialReportFilters = {},
): Promise<ActionResult<CommercialReport>> {
  try {
    const where = [];
    if (filters.status) where.push(eq("status", filters.status));
    const or = searchAcross(["code", "name"], filters.search ?? "");

    const { rows: projects } = await db.select<Project>("projects", {
      where,
      ...(or ? { or } : {}),
      order: [{ column: "name", ascending: true }],
    });

    if (projects.length === 0) {
      return ok({ rows: [], generated_at: new Date().toISOString(), filters });
    }

    const projectIds = projects.map((p) => p.id);
    const [scenarios, customers] = await Promise.all([
      db.select<PriceScenario>("price_scenarios", {
        where: [{ column: "project_id", op: "in", value: projectIds }],
        order: [{ column: "created_at", ascending: false }],
      }),
      db.select<{ id: string; name: string }>("customers", {
        where: [
          {
            column: "id",
            op: "in",
            value: projects.map((p) => p.customer_id).filter((v): v is string => Boolean(v)),
          },
        ],
      }),
    ]);

    const latestByProject = new Map<string, PriceScenario>();
    for (const scenario of scenarios.rows) {
      if (!latestByProject.has(scenario.project_id)) latestByProject.set(scenario.project_id, scenario);
    }
    const scenarioIds = [...latestByProject.values()].map((s) => s.id);

    const [results, inputs] = await Promise.all([
      scenarioIds.length
        ? db.select<CalculationResult>("calculation_results", {
            where: [{ column: "scenario_id", op: "in", value: scenarioIds }],
          })
        : Promise.resolve({ rows: [], count: 0 }),
      scenarioIds.length
        ? db.select<ScenarioInput>("scenario_inputs", {
            where: [{ column: "scenario_id", op: "in", value: scenarioIds }],
          })
        : Promise.resolve({ rows: [], count: 0 }),
    ]);

    const resultByScenario = new Map(results.rows.map((r) => [r.scenario_id, r]));
    const customerById = new Map(customers.rows.map((c) => [c.id, c.name]));

    const rows: CommercialReportRow[] = projects.map((project) => {
      const scenario = latestByProject.get(project.id) ?? null;
      const result = scenario ? resultByScenario.get(scenario.id) ?? null : null;
      const scenarioInputs = scenario ? inputs.rows.filter((i) => i.scenario_id === scenario.id) : [];
      const num = (key: string) => toNumber(scenarioInputs.find((i) => i.field_key === key)?.value_num);

      return {
        project_id: project.id,
        project_code: project.code,
        project_name: project.name,
        customer_name: project.customer_id ? customerById.get(project.customer_id) ?? null : null,
        location: project.location,
        status: project.status,
        scenario_name: scenario?.name ?? null,
        vendor_price: num("vendor_price") ?? num("base_price"),
        customer_price: num("customer_price") ?? num("harga_jual_include"),
        volume: num("volume"),
        revenue: toNumber(result?.revenue),
        total_cost: toNumber(result?.total_cost),
        gross_profit: toNumber(result?.gross_profit),
        ppn_difference: toNumber(result?.ppn_difference),
        net_profit: toNumber(result?.net_profit),
        net_profit_per_liter: toNumber(result?.net_profit_per_liter),
        profit_percentage: toNumber(result?.profit_percentage),
        without_result: result === null,
      };
    });

    const filtered = filters.only_with_result ? rows.filter((r) => !r.without_result) : rows;
    return ok({ rows: filtered, generated_at: new Date().toISOString(), filters });
  } catch (e) {
    return toActionResultError(e, "projects");
  }
}

export interface VendorComparisonReport {
  project_id: string;
  project_name: string;
  comparison: VendorComparisonView;
}

export async function buildVendorComparisonReport(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<VendorComparisonReport>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;
    const comparison = await buildVendorComparison(db, actor, projectId);
    if (!comparison.ok) return comparison;
    return ok({
      project_id: projectId,
      project_name: ctx.project.name,
      comparison: comparison.data,
    });
  } catch (e) {
    return toActionResultError(e, "project_vendors");
  }
}

export interface ScenarioComparisonReport {
  project_id: string;
  project_name: string;
  columns: ScenarioComparisonTableView["columns"];
  rows: ScenarioComparisonTableView["rows"];
}

export async function buildScenarioComparisonReport(
  db: Database,
  actor: Actor,
  projectId: string,
  scenarioIds?: string[],
): Promise<ActionResult<ScenarioComparisonReport>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;

    let ids = scenarioIds ?? [];
    if (ids.length < 2) {
      const { rows } = await db.select<PriceScenario>("price_scenarios", {
        where: [eq("project_id", projectId)],
        order: [{ column: "created_at", ascending: true }],
      });
      ids = rows.map((r) => r.id).slice(0, 3);
    }
    if (ids.length === 0) return notFound("Scenario");

    const compared = await compareScenarios(db, actor, projectId, ids);
    if (!compared.ok) return compared;

    return ok({
      project_id: projectId,
      project_name: ctx.project.name,
      columns: compared.data.columns,
      rows: compared.data.rows,
    });
  } catch (e) {
    return toActionResultError(e, "price_scenarios");
  }
}

// ---------------------------------------------------------------- CSV export

/** RFC4180-safe CSV cell. Raw values are exported, never formatted strings. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(header: string[], rows: Array<Array<unknown>>, delimiter = ","): string {
  const lines = [header.map(csvCell).join(delimiter)];
  for (const row of rows) lines.push(row.map(csvCell).join(delimiter));
  return `${lines.join("\r\n")}\r\n`;
}

export const COMMERCIAL_REPORT_HEADER = [
  "Project Code",
  "Project Name",
  "Customer",
  "Location",
  "Status",
  "Scenario",
  "Vendor Price",
  "Customer Price",
  "Volume",
  "Revenue",
  "Total Cost",
  "Gross Profit",
  "PPN Difference",
  "Net Profit",
  "Net Profit/Liter",
  "Profit %",
] as const;

export function commercialReportToCsv(report: CommercialReport): string {
  const rows = report.rows.map((r) => [
    r.project_code,
    r.project_name,
    r.customer_name,
    r.location,
    r.status,
    r.scenario_name,
    r.vendor_price,
    r.customer_price,
    r.volume,
    r.revenue,
    r.total_cost,
    r.gross_profit,
    r.ppn_difference,
    r.net_profit,
    r.net_profit_per_liter,
    r.profit_percentage,
  ]);
  return toCsv([...COMMERCIAL_REPORT_HEADER], rows);
}

export function vendorComparisonToCsv(projectName: string, view: VendorComparisonView): string {
  const header = ["Project", "Metric", ...view.vendors.map((v) => v.name)];
  const rows: Array<Array<unknown>> = view.rows.map((row) => [
    projectName,
    row.label,
    ...row.cells.map((cell) => cell.value),
  ]);
  rows.push([projectName, "Availability", ...view.vendors.map((v) => v.availability)]);
  rows.push([projectName, "Notes", ...view.vendors.map((v) => v.note)]);
  return toCsv(header, rows);
}

export function scenarioComparisonToCsv(report: ScenarioComparisonReport): string {
  const header = ["Metric", ...report.columns.map((c) => c.name), "Δ (last vs first)", "Indicator"];
  const rows: Array<Array<unknown>> = report.rows.map((row) => [
    row.label,
    ...report.columns.map((column) => {
      if (column.scenario_id === report.columns[0]?.scenario_id) return row.v1;
      if (column.scenario_id === report.columns[report.columns.length - 1]?.scenario_id) return row.v2;
      return null;
    }),
    row.difference,
    row.overall_indicator,
  ]);
  return toCsv(header, rows);
}
