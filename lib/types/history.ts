import type { HistoryAction } from "./domain";

/** Values that can appear in `project_history.entity`. */
export const HISTORY_ENTITIES = [
  "projects",
  "vendor_prices",
  "project_vendors",
  "ahs",
  "ahs_cost_items",
  "price_scenarios",
  "scenario_inputs",
  "calculation_results",
] as const;

export const HISTORY_ACTIONS: HistoryAction[] = ["INSERT", "UPDATE", "DELETE", "CLONE", "CALCULATE"];
