/**
 * Cost engine — Formula Registry F007 (line total), F015A/F015B (total cost),
 * F016 (cost per liter).
 *
 * Excel source of truth: docs/EXCEL_MAPPING.md §C.1.4
 *
 * IMPORTANT (mapping §G5): qty is NOT always volume. The engine never assumes it.
 * IMPORTANT (mapping §G8): a null rate means NOT APPLICABLE, not 0.
 */

import { resolveFormula } from "./registry";
import type { CostLineInput, CostLineResult } from "./types";

/**
 * F007 — Total of one cost line = rate x qty.
 * Excel: JATENG!L15 =J15*K15
 */
export function calculateCostLineTotal(
  rate: number | null,
  qty: number | null,
): number {
  // null rate/qty => not applicable => contributes 0, but stays flagged in the
  // result so downstream reports can distinguish "0" from "not applicable".
  return resolveFormula("F007", { rate: rate ?? 0, qty: qty ?? 0 });
}

export function calculateCostLines(lines: CostLineInput[]): CostLineResult[] {
  return lines.map((line, i) => {
    const applied = line.rate !== null && line.rate !== undefined;
    return {
      ...line,
      line_no: line.line_no ?? i + 1,
      total: calculateCostLineTotal(line.rate, line.qty),
      rate_for_sum: line.rate ?? 0,
      applied,
    };
  });
}

/**
 * F015A — Total Biaya = sum of all cost line totals.
 * Excel: JATENG!M13 =sum(L15:L32)
 */
export function calculateTotalCost(results: CostLineResult[]): number {
  return resolveFormula("F015A", {
    cost_totals: results.map((r) => r.total),
  });
}

/**
 * F015B — Total Biaya = sum of SELECTED cost rows only.
 * Excel: IWIP!L14 =K16+K17+K18+K21+K30+K33
 * `selected` refers to CostLineResult.line_no; when omitted, all lines are used.
 */
export function calculateTotalCostSelected(
  results: CostLineResult[],
  selected: number[],
): number {
  const picked = results.filter(
    (r) => r.line_no !== undefined && selected.includes(r.line_no),
  );
  return resolveFormula("F015B", {
    hpp: pick(results, selected, 0),
    oat: pick(results, selected, 1),
    pbbkb: pick(results, selected, 2),
    ppn_input: pick(results, selected, 3),
    biaya_proyek: pick(results, selected, 4),
    biaya_keagenan: pick(results, selected, 5),
    cost_totals: picked.map((r) => r.total),
  });
}

function pick(
  results: CostLineResult[],
  selected: number[],
  index: number,
): number {
  const picked = results.filter(
    (r) => r.line_no !== undefined && selected.includes(r.line_no),
  );
  return picked[index]?.total ?? 0;
}

/**
 * F016 — Biaya per Liter = sum of all cost line rates.
 * Excel: JATENG!M14 =sum(J15:J32)
 */
export function calculateCostPerLiter(results: CostLineResult[]): number {
  return resolveFormula("F016", {
    cost_rates: results.map((r) => r.rate_for_sum),
  });
}

/** Helper: find a cost line by its Excel sub-label (e.g. "PPN 11%"). */
export function findCostLine(
  results: CostLineResult[],
  description: string,
  category?: string,
): CostLineResult | undefined {
  const want = description.trim().toUpperCase();
  return results.find(
    (r) =>
      r.description.trim().toUpperCase() === want &&
      (category === undefined ||
        r.category.trim().toUpperCase() === category.trim().toUpperCase()),
  );
}

/** Helper: rate of a cost line (0 when absent). Used to feed tax formulas. */
export function rateOf(
  results: CostLineResult[],
  description: string,
): number {
  return findCostLine(results, description)?.rate_for_sum ?? 0;
}
