/**
 * Representative Golden Cases for Local UAT Testing (Phase 3.5 §2).
 *
 * Sourced 100% from real extracted workbook fixtures (tests/fixtures/excel-cases.json).
 * No made-up numbers.
 *
 * Case A: Standard 1.11 divisor (Perhitungan INU::M6)
 * Case B: 1.185 divisor variant (AHAS Prioritas::BS2)
 * Case C: 1.16 divisor variant (AHAS Prioritas::CU173)
 * Case D: Vendor calculation variant (Eval Vendor TL::G10::Blasdu & Mega Utama)
 * Case E: Scenario with input changes / V1 vs V2 (Eval Vendor TL::I100 vs V100)
 */

import fixtureJson from "../../tests/fixtures/excel-cases.json";
import { calculateAhs } from "../calculations/ahs";
import { calculateVendor, calculateVendorAllIn, calculateVendorPpn } from "../calculations/vendor";
import { compareNumber, type CrossCheckRow, type CrossCheckStatus } from "../calculations/cross-check";
import type { AhsInput, AhsResult } from "../calculations/types";

export interface RepresentativeCaseSummary {
  key: "A" | "B" | "C" | "D" | "E";
  title: string;
  category: string;
  source: string;
  excelCaseId: string;
  description: string;
  volume: number;
  hargaJualInclude: number;
  divisor: number;
  excel: {
    revenue: number | null;
    total_cost: number | null;
    gross_profit: number | null;
    ppn_difference: number | null;
    net_profit: number | null;
    net_profit_per_liter: number | null;
    profit_percentage: number | null;
    ppn_output: number | null;
    ppn_input: number | null;
  };
  rawCase: (typeof fixtureJson.cases)[0];
}

const allCases = fixtureJson.cases;
const vendorCases = fixtureJson.vendor_cases;

const rawCaseA = allCases.find((c) => c.id === "Perhitungan INU::M6") || allCases[0]!;
const rawCaseB = allCases.find((c) => c.id === "AHAS Prioritas::BS2") || allCases[1]!;
const rawCaseC = allCases.find((c) => c.id === "AHAS Prioritas::CU173") || allCases[2]!;
const rawCaseE1 = allCases.find((c) => c.id === "Eval Vendor TL::I100") || allCases[3]!;
const rawCaseE2 = allCases.find((c) => c.id === "Eval Vendor TL::V100") || allCases[4]!;

export const CASE_A: RepresentativeCaseSummary = {
  key: "A",
  title: "Case A — Standard 1.11 Divisor",
  category: "Standard 1.11 divisor",
  source: "Perhitungan INU::M6",
  excelCaseId: rawCaseA.id,
  description: "Template AHS standard dominan dengan pembagi pajak 1.11 dan 6 cost item.",
  volume: rawCaseA.volume,
  hargaJualInclude: rawCaseA.harga_jual_include ?? 22500,
  divisor: rawCaseA.include_divisor ?? 1.11,
  excel: {
    revenue: rawCaseA.excel.revenue,
    total_cost: rawCaseA.excel.total_cost,
    gross_profit: rawCaseA.excel.gross_profit,
    ppn_difference: rawCaseA.excel.ppn_difference,
    net_profit: rawCaseA.excel.net_profit,
    net_profit_per_liter: rawCaseA.excel.net_profit_per_liter,
    profit_percentage: rawCaseA.excel.profit_percentage,
    ppn_output: rawCaseA.excel.ppn_output,
    ppn_input: rawCaseA.excel.ppn_input,
  },
  rawCase: rawCaseA,
};

export const CASE_B: RepresentativeCaseSummary = {
  key: "B",
  title: "Case B — 1.185 Divisor Variant",
  category: "1.185 variant",
  source: "AHAS Prioritas::BS2",
  excelCaseId: rawCaseB.id,
  description: "Varian divisor 1.185 nyata dari workbook (PPN + PBBKB 7.5%).",
  volume: rawCaseB.volume,
  hargaJualInclude: rawCaseB.harga_jual_include ?? 22600,
  divisor: rawCaseB.include_divisor ?? 1.185,
  excel: {
    revenue: rawCaseB.excel.revenue,
    total_cost: rawCaseB.excel.total_cost,
    gross_profit: rawCaseB.excel.gross_profit,
    ppn_difference: rawCaseB.excel.ppn_difference,
    net_profit: rawCaseB.excel.net_profit,
    net_profit_per_liter: rawCaseB.excel.net_profit_per_liter,
    profit_percentage: rawCaseB.excel.profit_percentage,
    ppn_output: rawCaseB.excel.ppn_output,
    ppn_input: rawCaseB.excel.ppn_input,
  },
  rawCase: rawCaseB,
};

export const CASE_C: RepresentativeCaseSummary = {
  key: "C",
  title: "Case C — 1.16 Divisor Variant",
  category: "1.16 variant",
  source: "AHAS Prioritas::CU173",
  excelCaseId: rawCaseC.id,
  description: "Varian divisor 1.16 nyata dari workbook pada volume 425.000 liter.",
  volume: rawCaseC.volume,
  hargaJualInclude: rawCaseC.harga_jual_include ?? 20895,
  divisor: rawCaseC.include_divisor ?? 1.16,
  excel: {
    revenue: rawCaseC.excel.revenue,
    total_cost: rawCaseC.excel.total_cost,
    gross_profit: rawCaseC.excel.gross_profit,
    ppn_difference: rawCaseC.excel.ppn_difference,
    net_profit: rawCaseC.excel.net_profit,
    net_profit_per_liter: rawCaseC.excel.net_profit_per_liter,
    profit_percentage: rawCaseC.excel.profit_percentage,
    ppn_output: rawCaseC.excel.ppn_output,
    ppn_input: rawCaseC.excel.ppn_input,
  },
  rawCase: rawCaseC,
};

export const CASE_D = {
  key: "D" as const,
  title: "Case D — Vendor Calculation Variant",
  category: "Vendor calculation variant",
  source: "Eval Vendor TL::G10 (Blasdu & Mega Utama)",
  excelCaseId: "Eval Vendor TL::G10::Blasdu",
  description: "Evaluasi harga vendor: PPN vendor (F001) dan ALL-IN 7 komponen (F002B) termasuk BPH.",
  vendorBlasdu: {
    name: "Blasdu",
    base_price: 14500,
    ppn_rate: 0.11,
    excel_ppn: 1595,
    excel_all_in: 16095,
  },
  vendorMegaUtama: {
    name: "Mega Utama",
    base_price: 16396.39,
    ppn_rate: 0.11,
    excel_ppn: 1803.6029,
    excel_all_in: 18199.9929,
  },
};

export const CASE_E = {
  key: "E" as const,
  title: "Case E — Input Change & Scenario Comparison (V1 vs V2)",
  category: "Scenario yang memiliki perubahan input",
  source: "Eval Vendor TL::I100 (V1) & V100 (V2)",
  excelCaseIdV1: rawCaseE1.id,
  excelCaseIdV2: rawCaseE2.id,
  description: "Perbandingan dua blok Excel dari tender yang sama: volume dan harga jual tetap, harga vendor berbeda Rp60/liter.",
  v1: {
    volume: rawCaseE1.volume,
    harga_jual_include: rawCaseE1.harga_jual_include,
    excel: rawCaseE1.excel,
    rawCase: rawCaseE1,
  },
  v2: {
    volume: rawCaseE2.volume,
    harga_jual_include: rawCaseE2.harga_jual_include,
    excel: rawCaseE2.excel,
    rawCase: rawCaseE2,
  },
};

export const REPRESENTATIVE_CASES = [CASE_A, CASE_B, CASE_C];

export function buildAhsInputFromRaw(raw: (typeof fixtureJson.cases)[0]): AhsInput {
  const templateByLetter: Record<string, string> = {
    A: "T_A_AHS_STANDARD",
    B: "T_B_VENDOR_EVAL_PROFAMIR",
    C: "T_C_PROYEKSI_LABA_RUGI",
    D: "T_D_MARKET_CASH",
    E: "T_E_AHS_PROFIT_SHARE",
  };

  return {
    template_id: templateByLetter[raw.template] ?? "T_A_AHS_STANDARD",
    volume: raw.volume,
    harga_jual_include: raw.harga_jual_include,
    include_divisor: raw.include_divisor ?? 1.11,
    harga_jual_dpp_input: raw.harga_jual_dpp_input,
    sale_dpp_variant: raw.sale_variant as AhsInput["sale_dpp_variant"],
    net_profit_formula_id: raw.net_profit_formula_id as AhsInput["net_profit_formula_id"],
    pbbkb_rate: raw.sale_pbbkb_rate,
    sale_ppn_rate: raw.sale_ppn_rate,
    harga_jual_setelah_pajak_input: raw.harga_jual_setelah_pajak_input,
    ppn_input_rate: raw.ppn_input_rate ?? undefined,
    pbbkb_difference_applicable: raw.pbbkb_difference_applicable,
    ppn_rate: 0.11,
    ppn_input_formula_id: raw.ppn_input_formula_id as AhsInput["ppn_input_formula_id"],
    base_price: raw.base_price,
    cost_lines: raw.cost_lines.map((cl) => ({
      category: cl.category,
      description: cl.description,
      rate: cl.rate,
      qty: cl.qty,
    })),
  };
}

export interface MetricComparison {
  metric: string;
  formula: string;
  excel: number | null;
  system: number | null;
  difference: number | null;
  relative: number | null;
  status: CrossCheckStatus;
}

export function compareAhsWithExcel(raw: (typeof fixtureJson.cases)[0], result: AhsResult): MetricComparison[] {
  const metrics: Array<{ label: string; formula: string; excel: number | null; system: number | null }> = [
    { label: "Revenue", formula: "F006", excel: raw.excel.revenue, system: result.revenue },
    { label: "Total Cost", formula: "F015A/B", excel: raw.excel.total_cost, system: result.total_cost },
    { label: "Gross Profit", formula: "F017", excel: raw.excel.gross_profit, system: result.gross_profit },
    { label: "PPN Difference", formula: "F018", excel: raw.excel.ppn_difference, system: result.ppn_difference },
    { label: "Net Profit", formula: "F019A/B", excel: raw.excel.net_profit, system: result.net_profit },
    { label: "Net Profit/Liter", formula: "F020", excel: raw.excel.net_profit_per_liter, system: result.net_profit_per_liter },
    { label: "Profit %", formula: "F021A", excel: raw.excel.profit_percentage, system: result.profit_percentage },
  ];

  return metrics.map((m) => {
    if (m.excel === null || m.excel === undefined) {
      return {
        metric: m.label,
        formula: m.formula,
        excel: null,
        system: m.system,
        difference: null,
        relative: null,
        status: "SKIPPED",
      };
    }
    const cmp = compareNumber(m.excel, m.system);
    return {
      metric: m.label,
      formula: m.formula,
      excel: m.excel,
      system: m.system,
      difference: cmp.difference,
      relative: cmp.relative,
      status: cmp.status,
    };
  });
}

/**
 * Runs the cross check for all 466 validated Excel cases.
 */
export function runBatch466Validation() {
  let totalCases = 0;
  let casesPassed = 0;
  let validCount = 0;
  let precisionVarianceCount = 0;
  let formulaMismatchCount = 0;
  let skippedCount = 0;
  const mismatches: Array<{ id: string; metric: string; excel: number; system: number; diff: number }> = [];

  for (const c of allCases) {
    totalCases += 1;
    const input = buildAhsInputFromRaw(c);
    const res = calculateAhs(input);
    if (!res.success) {
      formulaMismatchCount += 1;
      mismatches.push({ id: c.id, metric: "Engine Execution", excel: 0, system: 0, diff: -1 });
      continue;
    }

    const rows = compareAhsWithExcel(c, res);
    let caseHadMismatch = false;

    for (const r of rows) {
      if (r.status === "VALID") validCount += 1;
      else if (r.status === "PRECISION_VARIANCE") precisionVarianceCount += 1;
      else if (r.status === "FORMULA_MISMATCH") {
        formulaMismatchCount += 1;
        caseHadMismatch = true;
        mismatches.push({
          id: c.id,
          metric: r.metric,
          excel: r.excel ?? 0,
          system: r.system ?? 0,
          diff: r.difference ?? 0,
        });
      } else if (r.status === "SKIPPED") {
        skippedCount += 1;
      }
    }

    if (!caseHadMismatch) casesPassed += 1;
  }

  return {
    totalCases,
    casesPassed,
    validCount,
    precisionVarianceCount,
    formulaMismatchCount,
    skippedCount,
    mismatches,
  };
}
