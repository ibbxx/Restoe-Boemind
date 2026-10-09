/**
 * Scenario engine (Phase 2 §13–§14).
 *
 * Rules:
 *  - A new scenario NEVER overwrites an older one (V1 -> V2 -> V3).
 *  - Old scenarios are immutable/read-only.
 *  - Every scenario snapshots its input AND its calculated result.
 */

import { calculateAhs } from "./ahs";
import { fail, type CalcFailure, type Result } from "./errors";
import type {
  AhsInput,
  AhsResult,
  CompareMetric,
  ScenarioComparisonRow,
  ScenarioSnapshot,
} from "./types";

export interface ScenarioStore {
  insert(s: ScenarioSnapshot): void;
  get(id: string): ScenarioSnapshot | undefined;
  listByProject(projectId: string): ScenarioSnapshot[];
  update(id: string, patch: Partial<ScenarioSnapshot>): void;
}

export class InMemoryScenarioStore implements ScenarioStore {
  private readonly rows = new Map<string, ScenarioSnapshot>();

  insert(s: ScenarioSnapshot): void {
    if (this.rows.has(s.scenario_id)) {
      throw new Error(`Scenario ${s.scenario_id} sudah ada.`);
    }
    this.rows.set(s.scenario_id, Object.freeze({ ...s }));
  }

  get(id: string): ScenarioSnapshot | undefined {
    return this.rows.get(id);
  }

  listByProject(projectId: string): ScenarioSnapshot[] {
    return [...this.rows.values()]
      .filter((s) => s.project_id === projectId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  update(id: string, patch: Partial<ScenarioSnapshot>): void {
    const current = this.rows.get(id);
    if (!current) throw new Error(`Scenario ${id} tidak ditemukan.`);
    if (current.result) {
      throw new Error(
        `Scenario ${id} sudah final dan bersifat read-only (immutable).`,
      );
    }
    this.rows.set(id, Object.freeze({ ...current, ...patch }));
  }
}

let seq = 0;
function nextScenarioId(projectId: string): string {
  seq += 1;
  return `${projectId}-V${seq}`;
}

export interface CreateScenarioArgs {
  project_id: string;
  name: string;
  template_id: string;
  input: Omit<AhsInput, "template_id">;
  created_by: string;
  reason: string;
  parent_scenario_id?: string | null;
  now?: string;
}

/** createScenario — computes and stores a NEW immutable scenario. */
export function createScenario(
  store: ScenarioStore,
  args: CreateScenarioArgs,
): Result<{ scenario: ScenarioSnapshot }> {
  const calc = calculateAhs({ ...args.input, template_id: args.template_id });
  if (!calc.success) {
    return calc as unknown as CalcFailure as Result<{ scenario: ScenarioSnapshot }>;
  }
  const result = calc as unknown as AhsResult;

  const scenario: ScenarioSnapshot = {
    scenario_id: nextScenarioId(args.project_id),
    project_id: args.project_id,
    parent_scenario_id: args.parent_scenario_id ?? null,
    name: args.name,
    template_id: args.template_id,
    input: { ...args.input, template_id: args.template_id },
    result,
    created_by: args.created_by,
    created_at: args.now ?? new Date().toISOString(),
    reason: args.reason,
  };
  store.insert(scenario);
  return { success: true, scenario };
}

/** cloneScenario — derives V(n+1) from V(n) WITHOUT touching V(n). */
export function cloneScenario(
  store: ScenarioStore,
  sourceId: string,
  overrides: {
    name: string;
    reason: string;
    created_by: string;
    patch?: Partial<Omit<AhsInput, "template_id">>;
    now?: string;
  },
): Result<{ scenario: ScenarioSnapshot }> {
  const source = store.get(sourceId);
  if (!source) {
    return fail("INVALID_SCENARIO", `Scenario sumber ${sourceId} tidak ditemukan.`, "scenario_id");
  }
  const mergedInput: Omit<AhsInput, "template_id"> = {
    ...source.input,
    ...overrides.patch,
    cost_lines: overrides.patch?.cost_lines ?? source.input.cost_lines,
  };
  return createScenario(store, {
    project_id: source.project_id,
    name: overrides.name,
    template_id: source.template_id,
    input: mergedInput,
    created_by: overrides.created_by,
    reason: overrides.reason,
    parent_scenario_id: source.scenario_id,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
}

/** calculateScenario — pure recalculation of a stored snapshot (determinism check). */
export function calculateScenario(
  store: ScenarioStore,
  scenarioId: string,
): Result<{ result: AhsResult }> {
  const s = store.get(scenarioId);
  if (!s) return fail("INVALID_SCENARIO", `Scenario ${scenarioId} tidak ditemukan.`, "scenario_id");
  const calc = calculateAhs(s.input);
  if (!calc.success) return calc as unknown as Result<{ result: AhsResult }>;
  return { success: true, result: calc as unknown as AhsResult };
}

const METRICS: Array<{ metric: CompareMetric; label: string }> = [
  { metric: "vendor_price", label: "Vendor Price" },
  { metric: "customer_price", label: "Customer Price" },
  { metric: "volume", label: "Volume" },
  { metric: "revenue", label: "Revenue" },
  { metric: "total_cost", label: "Total Cost" },
  { metric: "gross_profit", label: "Gross Profit" },
  { metric: "ppn_difference", label: "PPN Difference" },
  { metric: "net_profit", label: "Net Profit" },
  { metric: "net_profit_per_liter", label: "Profit/Liter" },
  { metric: "profit_percentage", label: "Profit %" },
];

export function metricValue(s: ScenarioSnapshot, metric: CompareMetric): number | null {
  const r = s.result;
  const input = s.input;
  switch (metric) {
    case "vendor_price":
      return input.base_price ?? null;
    case "customer_price":
      return input.harga_jual_include ?? null;
    case "volume":
      return input.volume ?? null;
    case "revenue":
      return r?.revenue ?? null;
    case "total_cost":
      return r?.total_cost ?? null;
    case "gross_profit":
      return r?.gross_profit ?? null;
    case "ppn_difference":
      return r?.ppn_difference ?? null;
    case "net_profit":
      return r?.net_profit ?? null;
    case "net_profit_per_liter":
      return r?.net_profit_per_liter ?? null;
    case "profit_percentage":
      return r?.profit_percentage ?? null;
    default:
      return null;
  }
}

/** compareScenario — systematic V1 vs V2 comparison. */
export function compareScenario(
  v1: ScenarioSnapshot,
  v2: ScenarioSnapshot,
): ScenarioComparisonRow[] {
  return METRICS.map(({ metric, label }) => {
    const a = metricValue(v1, metric);
    const b = metricValue(v2, metric);
    const difference = a !== null && b !== null ? b - a : null;
    const difference_pct =
      a !== null && b !== null && a !== 0 ? (b - a) / a : null;
    return { metric, label, v1: a, v2: b, difference, difference_pct };
  });
}
