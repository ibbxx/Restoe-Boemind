/**
 * AHS orchestration — INPUT -> VALIDATION -> FORMULA RESOLUTION -> CALCULATION
 * -> RESULT (Phase 2 §6).
 *
 * The pipeline order and the formula ids come from the Calculation Template
 * (lib/formulas/calculation-templates.json), mirroring the real Excel blocks.
 * Deterministic: identical input always yields identical output.
 */

import { CalculationError, fail, type Result, type CalcFailure } from "./errors";
import { getTemplate, resolveFormula } from "./registry";
import {
  calculateCostLines,
  calculateCostPerLiter,
  calculateTotalCost,
  calculateTotalCostSelected,
} from "./cost";
import {
  calculateDiskon,
  calculateHargaJualDpp,
  calculateRevenue,
} from "./revenue";
import {
  calculatePpnOutputPerLiter,
  calculatePpnInputTotalFromCostLines,
  calculatePpnDifference,
  calculatePbbkb,
} from "./tax";
import {
  calculateGrossProfit,
  calculateNetProfit,
  calculateNetProfitWithPbbkb,
  calculateNetProfitPerLiter,
  calculateProfitPercentage,
} from "./profit";
import type { AhsInput, AhsResult, CalculationTemplate } from "./types";
import { validateAhsInput } from "./validation";

/** Resolve which optional output steps a template asks for. */
function templateWants(t: CalculationTemplate, step: string): boolean {
  return Boolean(t.formula_definition[step]);
}

/**
 * Full AHS calculation for one workbook block.
 * Returns a structured Result — never throws, never yields NaN/Infinity/undefined.
 */
export function calculateAhs(input: AhsInput): Result<AhsResult> {
  let template: CalculationTemplate;
  try {
    template = getTemplate(input.template_id);
  } catch (e) {
    const err = e as CalculationError;
    return fail(
      "UNKNOWN_TEMPLATE",
      err.message ?? String(e),
      "template_id",
    );
  }

  // --- 1. VALIDATION -------------------------------------------------------
  const errors: CalcFailure[] = validateAhsInput(input);
  if (errors.length > 0) {
    const first = errors[0]!;
    return {
      ...first,
      message:
        errors.length === 1
          ? first.message
          : `${errors.length} validation error: ${errors
              .map((e) => `${e.field ?? "?"}: ${e.message}`)
              .join(" | ")}`,
    };
  }

  try {
    const volume = input.volume!;
    const includePrice = input.harga_jual_include;
    const divisor = input.include_divisor ?? 1.11;
    // Sale-side and cost-side PPN rates are separate INPUTS read from the
    // workbook formula. A 'Non-PPN' block really charges 0% on both sides.
    const ppnRate = input.sale_ppn_rate ?? input.ppn_rate ?? 0.11;
    const ppnInputRate = input.ppn_input_rate ?? input.ppn_rate ?? 0.11;
    const pbbkbRate = input.pbbkb_rate ?? 0;
    const formulasUsed: Record<string, string> = {};

    // --- 2. FORMULA RESOLUTION + CALCULATION -------------------------------
    // Sale-side DPP: F005 (`include / divisor`) or, when Excel types the DPP
    // directly (F005B) / points it at a price derived elsewhere (F005C), the
    // direct value. The variant is a PARAMETER, never a guess.
    const directDpp = input.harga_jual_dpp_input;
    const saleDppVariant =
      input.sale_dpp_variant ??
      (directDpp !== undefined && directDpp !== null ? "F005B" : "F005");
    const hargaJualDpp =
      directDpp !== undefined && directDpp !== null
        ? directDpp
        : calculateHargaJualDpp(includePrice!, divisor);
    formulasUsed.harga_jual_dpp = saleDppVariant;

    // F004 — Diskon terhadap harga keekonomian (Excel types this in the header).
    // Empty keekonomian cell stays null: NOT APPLICABLE, never 0.
    const hargaKeekonomian = input.harga_keekonomian ?? null;
    const diskon =
      hargaKeekonomian !== null && hargaKeekonomian !== 0
        ? calculateDiskon(hargaKeekonomian, hargaJualDpp)
        : null;
    if (diskon !== null) formulasUsed.diskon = "F004";

    // PBBKB on the selling side (Template A: =J10*7.5%*0, effectively 0)
    const pbbkbPenjualan = calculatePbbkb(hargaJualDpp, pbbkbRate);
    formulasUsed.pbbkb_penjualan = "F009";
    const pbbkbOutput = pbbkbPenjualan * volume;

    const ppnOutputPerLiter = calculatePpnOutputPerLiter(hargaJualDpp, ppnRate);
    formulasUsed.ppn_output = "F001";

    // HARGA JUAL SETELAH PAJAK = DPP + PBBKB + PPN keluaran (F027A), unless the
    // block types the value directly (F027B) — then Excel's typed value wins.
    const hjspInput = input.harga_jual_setelah_pajak_input;
    const hargaJualSetelahPajak =
      hjspInput !== undefined && hjspInput !== null
        ? hjspInput
        : hargaJualDpp + pbbkbPenjualan + ppnOutputPerLiter;
    formulasUsed.harga_jual_setelah_pajak =
      hjspInput !== undefined && hjspInput !== null ? "F027B" : "F027A";

    const revenue = calculateRevenue(hargaJualSetelahPajak, volume);
    formulasUsed.revenue = template.formula_definition["revenue"] ?? "F006";

    const costLines = calculateCostLines(input.cost_lines);
    formulasUsed.cost_line_total = "F007";

    const totalCost =
      template.formula_definition["total_cost"] === "F015B" &&
      input.total_cost_included_lines &&
      input.total_cost_included_lines.length > 0
        ? calculateTotalCostSelected(costLines, input.total_cost_included_lines)
        : calculateTotalCost(costLines);
    formulasUsed.total_cost = template.formula_definition["total_cost"] ?? "F015A";

    const costPerLiter = calculateCostPerLiter(costLines);
    formulasUsed.cost_per_liter = "F016";

    const ppnOutput = ppnOutputPerLiter * volume;

    const ppnInputVariant =
      input.ppn_input_formula_id ??
      (template.formula_definition["ppn_input"] as
        | "F008A"
        | "F008B"
        | "F008C"
        | undefined) ??
      "F008B";
    // Excel stores the TOTAL (per-liter x qty), e.g. JATENG!L20 = J20*K20
    const ppnInput = calculatePpnInputTotalFromCostLines(
      costLines,
      ppnInputRate,
      ppnInputVariant,
    );
    formulasUsed.ppn_input = ppnInputVariant;

    const ppnDifference = calculatePpnDifference(ppnOutput, ppnInput);
    formulasUsed.ppn_difference = "F018";

    const grossProfit = calculateGrossProfit(revenue, totalCost);
    formulasUsed.gross_profit = "F017";

    // F019A (2 terms) or F019B (3 terms: also minus SELISIH PBBKB).
    // SELISIH PBBKB = PBBKB penjualan (total) - PBBKB biaya (total), exactly as
    // `AHAS Prioritas!FQ34 = FP10-FP16` does.
    const pbbkbInput = costLines.reduce(
      (sum, line) =>
        line.description.trim().toUpperCase() === "PBBKB" &&
        line.category.trim().toUpperCase() !== "PAJAK"
          ? sum + (line.total ?? 0)
          : sum,
      0,
    );
    // When Excel leaves the SELISIH PBBKB cell empty, its own arithmetic
    // (`= g - p - <empty>`) contributes 0. That is a property of the BLOCK, so
    // it comes in as an input rather than being assumed either way.
    const pbbkbDifference =
      input.pbbkb_difference_applicable === false ? 0 : pbbkbOutput - pbbkbInput;
    const netProfitVariant = input.net_profit_formula_id ?? "F019A";
    const netProfit =
      netProfitVariant === "F019B"
        ? calculateNetProfitWithPbbkb(grossProfit, ppnDifference, pbbkbDifference)
        : calculateNetProfit(grossProfit, ppnDifference);
    formulasUsed.net_profit = netProfitVariant;

    const netProfitPerLiter = calculateNetProfitPerLiter(netProfit, volume);
    formulasUsed.net_profit_per_liter = "F020";

    const profitPercentage = templateWants(template, "profit_percentage")
      ? calculateProfitPercentage(netProfit, totalCost)
      : 0;
    formulasUsed.profit_percentage = "F021A";

    // --- 3. RESULT ---------------------------------------------------------
    const result: AhsResult = {
      template_id: template.template_id,
      sale_dpp_variant: saleDppVariant,
      harga_jual_dpp: hargaJualDpp,
      diskon,
      harga_jual_setelah_pajak: hargaJualSetelahPajak,
      pbbkb_output: pbbkbOutput,
      pbbkb_input: pbbkbInput,
      pbbkb_difference: pbbkbDifference,
      revenue,
      cost_lines: costLines,
      total_cost: totalCost,
      cost_per_liter: costPerLiter,
      ppn_output: ppnOutput,
      ppn_input: ppnInput,
      ppn_difference: ppnDifference,
      gross_profit: grossProfit,
      net_profit: netProfit,
      net_profit_per_liter: netProfitPerLiter,
      profit_percentage: profitPercentage,
      formulas_used: formulasUsed,
    };

    assertFinite(result);
    return { success: true, ...result };
  } catch (e) {
    if (e instanceof CalculationError) return e.toFailure();
    return fail(
      "EXPRESSION_ERROR",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** Guard: the engine must never emit NaN / Infinity. */
function assertFinite(result: AhsResult): void {
  const numericKeys: Array<keyof AhsResult> = [
    "harga_jual_dpp",
    "harga_jual_setelah_pajak",
    "pbbkb_output",
    "pbbkb_input",
    "pbbkb_difference",
    "revenue",
    "total_cost",
    "cost_per_liter",
    "ppn_output",
    "ppn_input",
    "ppn_difference",
    "gross_profit",
    "net_profit",
    "net_profit_per_liter",
    "profit_percentage",
  ];
  if (result.diskon !== null && !Number.isFinite(result.diskon)) {
    throw new CalculationError(
      "EXPRESSION_ERROR",
      `Hasil "diskon" bukan angka terhingga: ${String(result.diskon)}.`,
      "diskon",
    );
  }
  for (const k of numericKeys) {
    const v = result[k];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new CalculationError(
        "EXPRESSION_ERROR",
        `Hasil "${String(k)}" bukan angka terhingga: ${String(v)}.`,
        String(k),
      );
    }
  }
}

/** Exposed for the cross-check tooling. */
export function resolveFormulaForReport(formulaId: string, scope: Record<string, number>): number {
  return resolveFormula(formulaId, scope);
}
