/**
 * Commercial analysis view (PRD §42, Phase 3 §13).
 *
 * Reads the STORED calculation result of a scenario and attaches the formula
 * provenance from the Formula Registry, so the screen can show where each
 * number comes from (Excel sheet + cell + original formula). Nothing is
 * recalculated here.
 */

import { getFormula } from "../calculations/registry";
import type { Actor } from "../auth/session";
import { eq, type Database } from "../data/db";
import { toNumber } from "../format";
import type { CalculationResult, PriceScenario, ScenarioInput } from "../types/domain";
import { isActionErr, loadProjectContext } from "./access";
import { loadCostItems } from "./ahs";
import { ok, toActionResultError, type ActionResult } from "./result";

/** Every figure is an engine output; null means "not available" (rendered "—"). */
export interface CommercialMetrics {
  harga_jual_dpp: number | null;
  harga_jual_setelah_pajak: number | null;
  revenue: number | null;
  total_cost: number | null;
  cost_per_liter: number | null;
  ppn_output: number | null;
  ppn_input: number | null;
  ppn_difference: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  net_profit_per_liter: number | null;
  profit_percentage: number | null;
}

export interface FormulaSource {
  label: string;
  formula_id: string;
  formula_name: string;
  expression: string;
  excel_formula: string;
  source: string;
}

export interface CommercialInputs {
  vendor_price: number | null;
  customer_price: number | null;
  volume: number | null;
  include_divisor: number | null;
  cost_item_count: number;
  vendor_name: string | null;
}

export interface CommercialView {
  scenario: PriceScenario | null;
  scenarios: Array<{ id: string; name: string; is_locked: boolean; created_at: string }>;
  result: CalculationResult | null;
  metrics: CommercialMetrics;
  inputs: CommercialInputs;
  formula_sources: FormulaSource[];
  cost_lines: Array<{
    line_no: number;
    category: string | null;
    description: string;
    rate: number | null;
    qty: number | null;
    total: number | null;
    applied: boolean;
  }>;
}

function source(label: string, formulaId: string, fallback?: string): FormulaSource {
  try {
    const f = getFormula(formulaId);
    return {
      label,
      formula_id: f.formula_id,
      formula_name: f.formula_name,
      expression: f.expression,
      excel_formula: f.excel_formula,
      source: `${f.source_sheet}!${f.source_cell} (${f.source_block})`,
    };
  } catch {
    return {
      label,
      formula_id: formulaId,
      formula_name: fallback ?? formulaId,
      expression: fallback ?? "",
      excel_formula: "",
      source: "",
    };
  }
}

export function buildFormulaSources(variants: {
  sale_dpp?: string | null;
  ppn_input?: string | null;
  total_cost?: string | null;
  net_profit?: string | null;
  ppn_output?: string | null;
}): FormulaSource[] {
  return [
    source("Harga Jual DPP", variants.sale_dpp ?? "F005"),
    source("Revenue", "F006"),
    source("Cost Line Total", "F007"),
    source("PPN Masukan", variants.ppn_input ?? "F008B"),
    source("Total Biaya", variants.total_cost ?? "F015A"),
    source("Biaya per Liter", "F016"),
    source("Laba Kotor", "F017"),
    source("PPN Keluaran", variants.ppn_output ?? "F001"),
    source("Selisih PPN", "F018"),
    source("Laba Bersih", variants.net_profit ?? "F019A"),
    source("Laba Bersih per Liter", "F020"),
    source("Persentase", "F021A"),
  ];
}

export function metricsFromResult(result: CalculationResult | null): CommercialMetrics {
  return {
    harga_jual_dpp: toNumber(result?.harga_jual_dpp),
    harga_jual_setelah_pajak: toNumber(result?.harga_jual_setelah_pajak),
    revenue: toNumber(result?.revenue),
    total_cost: toNumber(result?.total_cost),
    cost_per_liter: toNumber(result?.cost_per_liter),
    ppn_output: toNumber(result?.ppn_output),
    ppn_input: toNumber(result?.ppn_input),
    ppn_difference: toNumber(result?.ppn_difference),
    gross_profit: toNumber(result?.gross_profit),
    net_profit: toNumber(result?.net_profit),
    net_profit_per_liter: toNumber(result?.net_profit_per_liter),
    profit_percentage: toNumber(result?.profit_percentage),
  };
}

export async function loadCommercialView(
  db: Database,
  actor: Actor,
  projectId: string,
  scenarioId?: string,
): Promise<ActionResult<CommercialView>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;

    const { rows: scenarios } = await db.select<PriceScenario>("price_scenarios", {
      where: [eq("project_id", projectId)],
      order: [{ column: "created_at", ascending: true }],
    });

    const selected =
      (scenarioId ? scenarios.find((s) => s.id === scenarioId) : undefined) ??
      scenarios[scenarios.length - 1] ??
      null;

    const emptyInputs: CommercialInputs = {
      vendor_price: null,
      customer_price: null,
      volume: null,
      include_divisor: null,
      cost_item_count: 0,
      vendor_name: null,
    };

    if (!selected) {
      const { rows: ahsRows } = await db.select<{ id: string }>("ahs", {
        where: [eq("project_id", projectId)],
        limit: 1,
      });
      const costLines = ahsRows[0] ? await loadCostItems(db, ahsRows[0].id, null) : [];
      return ok({
        scenario: null,
        scenarios: [],
        result: null,
        metrics: metricsFromResult(null),
        inputs: { ...emptyInputs, cost_item_count: costLines.length },
        formula_sources: buildFormulaSources({}),
        cost_lines: costLines.map((line) => ({
          line_no: line.line_no,
          category: line.category,
          description: line.description,
          rate: line.rate,
          qty: line.qty,
          total: line.total,
          applied: line.rate !== null,
        })),
      });
    }

    const [results, inputs, ahsRows] = await Promise.all([
      db.select<CalculationResult>("calculation_results", {
        where: [eq("scenario_id", selected.id)],
        limit: 1,
      }),
      db.select<ScenarioInput>("scenario_inputs", { where: [eq("scenario_id", selected.id)] }),
      db.select<{ id: string }>("ahs", { where: [eq("project_id", projectId)], limit: 1 }),
    ]);

    const result = results.rows[0] ?? null;
    const num = (key: string) => toNumber(inputs.rows.find((i) => i.field_key === key)?.value_num);

    const costLines = ahsRows.rows[0] ? await loadCostItems(db, ahsRows.rows[0]!.id, selected.id) : [];

    const vendorNameRow = inputs.rows.find((i) => i.field_key === "vendor_name");
    const formulasUsed = (result?.formulas_used ?? {}) as Record<string, string>;

    return ok({
      scenario: selected,
      scenarios: scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        is_locked: s.is_locked,
        created_at: s.created_at,
      })),
      result,
      metrics: metricsFromResult(result),
      inputs: {
        vendor_price: num("vendor_price") ?? num("base_price"),
        customer_price: num("customer_price") ?? num("harga_jual_include"),
        volume: num("volume"),
        include_divisor: num("include_divisor"),
        cost_item_count: costLines.length,
        vendor_name: vendorNameRow?.value_text ?? null,
      },
      formula_sources: buildFormulaSources({
        sale_dpp: num("harga_jual_dpp_input") !== null ? "F005B" : "F005",
        ppn_input: formulasUsed.ppn_input ?? "F008B",
        total_cost: formulasUsed.total_cost ?? "F015A",
        net_profit: formulasUsed.net_profit ?? "F019A",
        ppn_output: formulasUsed.ppn_output ?? "F001",
      }),
      cost_lines: costLines.map((line) => ({
        line_no: line.line_no,
        category: line.category,
        description: line.description,
        rate: line.rate,
        qty: line.qty,
        total: line.total,
        applied: line.rate !== null,
      })),
    });
  } catch (e) {
    return toActionResultError(e, "calculation_results");
  }
}
