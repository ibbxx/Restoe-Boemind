/**
 * Profit engine — Formula Registry F017, F019A/F019B, F020, F021A/F021B,
 * F022, F023, F024, F025.
 * Excel source of truth: docs/EXCEL_MAPPING.md §C.1.5
 */

import { resolveFormula } from "./registry";

/**
 * F017 — Laba Kotor = Revenue - Total Cost.
 * Excel: Eval Vendor TL!Q35 =Q10-Q15  /  JATENG!M33 =M8-M13 (PRD §22)
 */
export function calculateGrossProfit(
  revenue: number,
  totalCost: number,
): number {
  return resolveFormula("F017", { revenue, total_cost: totalCost });
}

/**
 * F019A — Laba Bersih = Laba Kotor - Selisih PPN.
 * Excel: Eval Vendor TL!Q37 =Q35-Q36 (PRD §24)
 */
export function calculateNetProfit(
  grossProfit: number,
  ppnDifference: number,
): number {
  return resolveFormula("F019A", {
    gross_profit: grossProfit,
    ppn_difference: ppnDifference,
  });
}

/**
 * F019B — Laba Bersih = Laba Kotor - Selisih PPN - Selisih PBBKB.
 * Excel: AHAS Prioritas!FQ35 =FQ32-FQ33-FQ34
 *
 * RESOLVED in Phase 2.5. The third term is SELISIH PBBKB: `FQ34 = FP10-FP16`
 * sits on a row whose label is 'SELISIH PBBKB' (column FL labels:
 * LABA KOTOR / SELISIH PPN / SELISIH PBBKB / LABA BERSIH). 68 cells.
 */
export function calculateNetProfitWithPbbkb(
  grossProfit: number,
  ppnDifference: number,
  pbbkbDifference: number,
): number {
  return resolveFormula("F019B", {
    gross_profit: grossProfit,
    ppn_difference: ppnDifference,
    pbbkb_difference: pbbkbDifference,
  });
}

/**
 * F021B — Return on Investor Capital.
 * Excel: AHAS Prioritas!DL79 =DK79/DK82*100%  (DK82 = Modal Investor)
 * NOTE: this is NOT a presentation variant of F021A — the denominator is the
 * investor capital, not the total cost. Registered as its own metric.
 */
export function calculateReturnOnCapital(
  shareAmount: number,
  capitalAmount: number,
): number {
  return resolveFormula("F021B", {
    share_amount: shareAmount,
    capital_amount: capitalAmount,
  });
}

/**
 * F021C — Persentase terhadap Harga Include.
 * Excel: WIKA!BZ115 =BZ114/BY104*100%  (BY104 = Harga Include)
 */
export function calculatePercentageOfInclude(
  amount: number,
  hargaInclude: number,
): number {
  return resolveFormula("F021C", { amount, harga_include: hargaInclude });
}

/**
 * F020 — Laba Bersih per Liter = Laba Bersih / Volume.
 * Excel: Eval Vendor TL!Q38 =Q37/O12 (PRD §25)
 */
export function calculateNetProfitPerLiter(
  netProfit: number,
  volume: number,
): number {
  return resolveFormula("F020", {
    net_profit: netProfit,
    volume,
  });
}

/**
 * F021A — PERSENTASE = Laba Bersih / TOTAL BIAYA  (Excel baseline, PRD §26).
 * DO NOT replace with net_profit / revenue.
 * Excel: Eval Vendor TL!Q39 =Q37/Q15  /  JATENG!M37 =M35/M13
 */
export function calculateProfitPercentage(
  netProfit: number,
  totalCost: number,
): number {
  return resolveFormula("F021A", {
    net_profit: netProfit,
    total_cost: totalCost,
  });
}

/** F022 — Gross Profit versi MUE. Excel: Perhitungan INU!B8 =F8-D8-D10-D11-D12 */
export function calculateGrossProfitMue(parts: {
  harga_jual: number;
  harga_beli: number;
  total_biaya: number;
}): number {
  return resolveFormula("F022", parts);
}

/** F023 — Net Margin versi MUE. Excel: Perhitungan INU!B14 =B8-sum(B9:B13) */
export function calculateNetMarginMue(
  grossProfit: number,
  fees: number[],
): number {
  return resolveFormula("F023", {
    gross_profit: grossProfit,
    total_fee: fees.reduce((s, f) => s + f, 0),
  });
}

/** F024 — Est PPh Badan 22%. Excel: Perhitungan INU!B17 =B16*22% */
export function calculateEstPphBadan(
  netMargin: number,
  rate = 0.22,
): number {
  return resolveFormula("F024", {
    net_margin: netMargin,
    pph_badan_rate: rate,
  });
}

/**
 * F025 — Profit Bagi Hasil per Liter.
 * Excel: Eval Vendor TL!N179 =N178*30%
 * NOTE (§G6): Excel's own share percentages are inconsistent between the
 * label and the formula, so `sharePercent` MUST be an input, never inferred.
 */
export function calculateProfitSharePerLiter(
  netProfitPerLiter: number,
  sharePercent: number,
): number {
  return resolveFormula("F025", {
    net_profit_per_liter: netProfitPerLiter,
    share_percent: sharePercent,
  });
}
