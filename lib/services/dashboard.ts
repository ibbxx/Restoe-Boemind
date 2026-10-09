/**
 * Dashboard service (PRD §8, Phase 3 §5).
 *
 * Every number is read from the database. There is no mock project, no
 * hardcoded KPI and no frontend calculation: the KPIs are AGGREGATES of the
 * calculation engine's own outputs (`calculation_results`), and the profit
 * figures are read, never re-derived.
 *
 * AGGREGATION RULE (explicit, so it cannot be mistaken for a formula change):
 *   - only the LATEST scenario of each project contributes, so a project is
 *     never counted twice across versions V1/V2/V3;
 *   - a project without a scenario contributes to the project counts but not to
 *     the money KPIs (it has no calculation result yet);
 *   - "Average Profit/Liter" = SUM(net_profit) / SUM(volume), i.e. a
 *     volume-weighted average, and it is NULL when the total volume is 0.
 */

import type { Actor } from "../auth/session";
import { eq, type Database } from "../data/db";
import { toNumber } from "../format";
import type {
  CalculationResult,
  PriceScenario,
  Project,
  ScenarioInput,
} from "../types/domain";
import { toActionResultError, ok, type ActionResult } from "./result";

export interface DashboardKpis {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  total_volume: number | null;
  total_revenue: number | null;
  total_cost: number | null;
  total_profit: number | null;
  average_profit_per_liter: number | null;
  /** How many projects have at least one calculation result. */
  projects_with_result: number;
  /** How many projects have no scenario yet (drives the empty state). */
  projects_without_result: number;
}

export interface DashboardRecentProject {
  id: string;
  code: string;
  name: string;
  status: string;
  customer_name: string | null;
  volume: number | null;
  net_profit: number | null;
  updated_at: string;
}

export interface DashboardStatusCount {
  status: string;
  count: number;
}

export interface DashboardLatestScenario {
  scenario_id: string;
  scenario_name: string;
  project_id: string;
  project_name: string;
  created_at: string;
  net_profit: number | null;
  created_by_name: string | null;
}

export interface DashboardLatestResult {
  project_id: string;
  project_name: string;
  scenario_name: string;
  revenue: number | null;
  total_cost: number | null;
  gross_profit: number | null;
  ppn_difference: number | null;
  net_profit: number | null;
  net_profit_per_liter: number | null;
  profit_percentage: number | null;
  computed_at: string;
}

export interface DashboardView {
  kpis: DashboardKpis;
  recent_projects: DashboardRecentProject[];
  status_breakdown: DashboardStatusCount[];
  latest_scenario: DashboardLatestScenario | null;
  latest_result: DashboardLatestResult | null;
  /** True when the database has no project at all (correct empty state). */
  is_empty: boolean;
}

export async function loadDashboard(
  db: Database,
  _actor: Actor,
): Promise<ActionResult<DashboardView>> {
  try {
    const { rows: projects, count: projectCount } = await db.select<Project>("projects", {
      order: [{ column: "updated_at", ascending: false }],
      count: true,
    });

    const emptyKpis: DashboardKpis = {
      total_projects: 0,
      active_projects: 0,
      completed_projects: 0,
      total_volume: null,
      total_revenue: null,
      total_cost: null,
      total_profit: null,
      average_profit_per_liter: null,
      projects_with_result: 0,
      projects_without_result: 0,
    };

    if (projects.length === 0) {
      return ok({
        kpis: emptyKpis,
        recent_projects: [],
        status_breakdown: [],
        latest_scenario: null,
        latest_result: null,
        is_empty: true,
      });
    }

    const statusCounts = new Map<string, number>();
    for (const project of projects) {
      statusCounts.set(project.status, (statusCounts.get(project.status) ?? 0) + 1);
    }

    const scenarios = await db.select<PriceScenario>("price_scenarios", {
      where: [{ column: "project_id", op: "in", value: projects.map((p) => p.id) }],
      order: [{ column: "created_at", ascending: false }],
    });

    // Latest scenario per project (rows are already newest-first).
    const latestByProject = new Map<string, PriceScenario>();
    for (const scenario of scenarios.rows) {
      if (!latestByProject.has(scenario.project_id)) latestByProject.set(scenario.project_id, scenario);
    }
    const latestScenarios = [...latestByProject.values()];
    const latestScenarioIds = latestScenarios.map((s) => s.id);

    const [results, volumes, customers, profiles] = await Promise.all([
      latestScenarioIds.length
        ? db.select<CalculationResult>("calculation_results", {
            where: [{ column: "scenario_id", op: "in", value: latestScenarioIds }],
          })
        : Promise.resolve({ rows: [], count: 0 }),
      latestScenarioIds.length
        ? db.select<ScenarioInput>("scenario_inputs", {
            where: [
              { column: "scenario_id", op: "in", value: latestScenarioIds },
              eq("field_key", "volume"),
            ],
          })
        : Promise.resolve({ rows: [], count: 0 }),
      db.select<{ id: string; name: string }>("customers", {
        where: [
          {
            column: "id",
            op: "in",
            value: projects.map((p) => p.customer_id).filter((v): v is string => Boolean(v)),
          },
        ],
      }),
      db.select<{ id: string; full_name: string | null; email: string }>("profiles", {
        where: [
          {
            column: "id",
            op: "in",
            value: latestScenarios.map((s) => s.created_by).filter((v): v is string => Boolean(v)),
          },
        ],
      }),
    ]);

    const resultByScenario = new Map(results.rows.map((r) => [r.scenario_id, r]));
    const volumeByScenario = new Map(
      volumes.rows.map((v) => [v.scenario_id, toNumber(v.value_num)]),
    );
    const customerById = new Map(customers.rows.map((c) => [c.id, c.name]));
    const profileById = new Map(
      profiles.rows.map((p) => [p.id, p.full_name ?? p.email]),
    );

    let totalVolume = 0;
    let totalVolumeSeen = false;
    let totalRevenue = 0;
    let totalRevenueSeen = false;
    let totalCost = 0;
    let totalCostSeen = false;
    let totalProfit = 0;
    let totalProfitSeen = false;
    let projectsWithResult = 0;

    for (const scenario of latestScenarios) {
      const result = resultByScenario.get(scenario.id);
      if (!result) continue;
      projectsWithResult += 1;

      const volume = volumeByScenario.get(scenario.id) ?? null;
      if (volume !== null) {
        totalVolume += volume;
        totalVolumeSeen = true;
      }
      const revenue = toNumber(result.revenue);
      if (revenue !== null) {
        totalRevenue += revenue;
        totalRevenueSeen = true;
      }
      const cost = toNumber(result.total_cost);
      if (cost !== null) {
        totalCost += cost;
        totalCostSeen = true;
      }
      const profit = toNumber(result.net_profit);
      if (profit !== null) {
        totalProfit += profit;
        totalProfitSeen = true;
      }
    }

    const kpis: DashboardKpis = {
      total_projects: projectCount || projects.length,
      active_projects: statusCounts.get("ACTIVE") ?? 0,
      completed_projects: statusCounts.get("COMPLETED") ?? 0,
      total_volume: totalVolumeSeen ? totalVolume : null,
      total_revenue: totalRevenueSeen ? totalRevenue : null,
      total_cost: totalCostSeen ? totalCost : null,
      total_profit: totalProfitSeen ? totalProfit : null,
      average_profit_per_liter:
        totalVolumeSeen && totalVolume > 0 && totalProfitSeen ? totalProfit / totalVolume : null,
      projects_with_result: projectsWithResult,
      projects_without_result: projects.length - projectsWithResult,
    };

    const recentProjects: DashboardRecentProject[] = projects.slice(0, 5).map((project) => {
      const scenario = latestByProject.get(project.id);
      const result = scenario ? resultByScenario.get(scenario.id) : undefined;
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        customer_name: project.customer_id ? customerById.get(project.customer_id) ?? null : null,
        volume: scenario ? volumeByScenario.get(scenario.id) ?? null : null,
        net_profit: toNumber(result?.net_profit),
        updated_at: project.updated_at,
      };
    });

    const newestScenario = scenarios.rows[0] ?? null;
    const projectById = new Map(projects.map((p) => [p.id, p]));

    const latestScenario: DashboardLatestScenario | null = newestScenario
      ? {
          scenario_id: newestScenario.id,
          scenario_name: newestScenario.name,
          project_id: newestScenario.project_id,
          project_name: projectById.get(newestScenario.project_id)?.name ?? "(project)",
          created_at: newestScenario.created_at,
          net_profit: toNumber(resultByScenario.get(newestScenario.id)?.net_profit),
          created_by_name: newestScenario.created_by
            ? profileById.get(newestScenario.created_by) ?? null
            : null,
        }
      : null;

    const resultsSorted = results.rows
      .slice()
      .sort((a, b) => b.computed_at.localeCompare(a.computed_at));
    const newestResult = resultsSorted[0] ?? null;
    const newestResultScenario = newestResult
      ? latestScenarios.find((s) => s.id === newestResult.scenario_id) ?? null
      : null;

    const latestResult: DashboardLatestResult | null =
      newestResult && newestResultScenario
        ? {
            project_id: newestResultScenario.project_id,
            project_name: projectById.get(newestResultScenario.project_id)?.name ?? "(project)",
            scenario_name: newestResultScenario.name,
            revenue: toNumber(newestResult.revenue),
            total_cost: toNumber(newestResult.total_cost),
            gross_profit: toNumber(newestResult.gross_profit),
            ppn_difference: toNumber(newestResult.ppn_difference),
            net_profit: toNumber(newestResult.net_profit),
            net_profit_per_liter: toNumber(newestResult.net_profit_per_liter),
            profit_percentage: toNumber(newestResult.profit_percentage),
            computed_at: newestResult.computed_at,
          }
        : null;

    return ok({
      kpis,
      recent_projects: recentProjects,
      status_breakdown: [...statusCounts.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      latest_scenario: latestScenario,
      latest_result: latestResult,
      is_empty: false,
    });
  } catch (e) {
    return toActionResultError(e, "projects");
  }
}
