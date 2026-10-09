/**
 * Tax engine — Formula Registry F001, F008A/F008B, F009, F010, F011, F013, F018.
 * Excel source of truth: docs/EXCEL_MAPPING.md §C.1.3, §C.1.4
 */

import { resolveFormula } from "./registry";
import type { CostLineResult } from "./types";
import { findCostLine, rateOf } from "./cost";

/**
 * PPN Keluaran per liter = DPP jual x tarif PPN.
 * Excel: JATENG!J12 =J10*11%
 */
export function calculatePpnOutputPerLiter(
  hargaJualDpp: number,
  ppnRate = 0.11,
): number {
  return resolveFormula("F001", {
    base_price: hargaJualDpp,
    ppn_rate: ppnRate,
  });
}

/**
 * PPN Masukan — THREE registered Excel variants (mapping §G2, extended by the
 * Phase 2 cross-check which discovered F008C):
 *   F008A: base_price * ppn_rate                  (Eval Vendor TL!N22 =N17*11%)
 *   F008B: (base+oat+pbbkb+pph_inu+bph)*ppn_rate  (JATENG!J20 =SUM(J15:J19)*11%)
 *   F008C: (base+oat)*ppn_rate                    (VIRTUE!G20 =sum(G15:G16)*11%)
 */
export type PpnInputVariant = "F008A" | "F008B" | "F008C";

export function calculatePpnInput(
  parts: {
    base_price: number;
    oat?: number;
    pbbkb?: number;
    pph_inu?: number;
    bph_migas?: number;
    ppn_rate?: number;
  },
  variant: PpnInputVariant = "F008B",
): number {
  return resolveFormula(variant, {
    base_price: parts.base_price,
    oat: parts.oat ?? 0,
    pbbkb: parts.pbbkb ?? 0,
    pph_inu: parts.pph_inu ?? 0,
    bph_migas: parts.bph_migas ?? 0,
    ppn_rate: parts.ppn_rate ?? 0.11,
  });
}

/** Convenience: derive ppn_input PER LITER directly from the mapped cost lines. */
export function calculatePpnInputFromCostLines(
  lines: CostLineResult[],
  ppnRate = 0.11,
  variant: PpnInputVariant = "F008B",
): number {
  return calculatePpnInput(
    {
      // In the mapping, the HPP 'Harga Dasar' rate is the vendor base price
      // used as the PPN input base.
      base_price: rateOf(lines, "Harga Dasar") || (lines[0]?.rate_for_sum ?? 0),
      oat: rateOf(lines, "OAT"),
      pbbkb: rateOf(lines, "PBBKB"),
      pph_inu: rateOf(lines, "PPH INU 0,3%"),
      bph_migas: rateOf(lines, "BPH Migas 0,25%"),
      ppn_rate: ppnRate,
    },
    variant,
  );
}

/**
 * PPN masukan TOTAL (Rp) for the block.
 *
 * Excel does NOT store the per-liter figure as the block metric: the cost row is
 *   JATENG!L20 = J20 * K20       (per-liter x qty)
 *   Eval Vendor TL!P22 = N22 * O22
 * so the reported `ppn_input` (and therefore Selisih PPN) is the TOTAL.
 */
export function calculatePpnInputTotalFromCostLines(
  lines: CostLineResult[],
  ppnRate = 0.11,
  variant: PpnInputVariant = "F008B",
): number {
  const perLiter = calculatePpnInputFromCostLines(lines, ppnRate, variant);
  const ppnRow =
    findCostLine(lines, "PPN 11%", "PAJAK") ?? findCostLine(lines, "PPN 11%");
  const qty = ppnRow?.qty ?? 0;
  return resolveFormula("F007", { rate: perLiter, qty });
}

/** F009 — PBBKB. Excel: JATENG!J11 =J10*7.5%*0 */
export function calculatePbbkb(basePrice: number, pbbkbRate = 0): number {
  return resolveFormula("F009", {
    base_price: basePrice,
    pbbkb_rate: pbbkbRate,
  });
}

/** F010 — PPH INU 0,3%. Excel: JATENG!J18 */
export function calculatePphInu(basePrice: number, rate = 0): number {
  return resolveFormula("F010", {
    base_price: basePrice,
    pph_inu_rate: rate,
  });
}

/** F011 — BPH Migas 0,25%. Excel: Perhitungan INU!U47 =0.25%*V34 */
export function calculateBphMigas(basePrice: number, rate = 0): number {
  return resolveFormula("F011", {
    base_price: basePrice,
    bph_migas_rate: rate,
  });
}

/** F013 — Diskonto SKBDN 3,3%. Excel: JATENG!J24 */
export function calculateDiskontoSkbdn(basePrice: number, rate = 0): number {
  return resolveFormula("F013", {
    base_price: basePrice,
    diskonto_rate: rate,
  });
}

/**
 * F018 — Selisih PPN = PPN keluaran - PPN masukan.
 * Excel: Eval Vendor TL!Q36 =P14-P22 (PRD §23)
 */
export function calculatePpnDifference(
  ppnOutput: number,
  ppnInput: number,
): number {
  return resolveFormula("F018", {
    ppn_output: ppnOutput,
    ppn_input: ppnInput,
  });
}
