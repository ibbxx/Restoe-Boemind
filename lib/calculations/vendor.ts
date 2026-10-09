/**
 * Vendor calculations — Formula Registry F001, F002A/F002B, F003.
 * Excel source of truth: docs/EXCEL_MAPPING.md §C.1.2 / §C.2
 */

import { CalculationError, toResult, type Result } from "./errors";
import { getFormula, resolveFormula } from "./registry";
import type { VendorInput, VendorResult } from "./types";
import { validateVendorPrice } from "./validation";

/** F001 — Vendor PPN = base_price * ppn_rate. Excel: Eval Vendor TL!H12 =H11*11% */
export function calculateVendorPpn(
  basePrice: number,
  ppnRate = 0.11,
): number {
  return resolveFormula("F001", { base_price: basePrice, ppn_rate: ppnRate });
}

/**
 * F002A / F002B — Vendor ALL IN.
 * The mapping proved TWO coexisting Excel forms; the variant is a parameter,
 * never a guess. See docs/EXCEL_MAPPING.md §G1.
 */
export function calculateVendorAllIn(
  parts: {
    base_price: number;
    ppn: number;
    pbbkb?: number;
    pph?: number;
    oat?: number;
    ppn_oat?: number;
    bph?: number;
  },
  variant: "F002A" | "F002B" = "F002B",
): number {
  return resolveFormula(variant, {
    base_price: parts.base_price,
    ppn: parts.ppn,
    pbbkb: parts.pbbkb ?? 0,
    pph: parts.pph ?? 0,
    oat: parts.oat ?? 0,
    ppn_oat: parts.ppn_oat ?? 0,
    bph: parts.bph ?? 0,
  });
}

/** F003 — Vendor base price derived from a tax-inclusive price. */
export function calculateVendorBaseFromInclude(
  includePrice: number,
  divisor = 1.11,
): number {
  return resolveFormula("F003", {
    include_price: includePrice,
    include_divisor: divisor,
  });
}

/**
 * Full vendor evaluation. Missing base price is a structured error,
 * NOT a silent zero (PRD §11).
 */
export function calculateVendor(
  input: VendorInput,
): Result<{ vendor: VendorResult; formulas_used: Record<string, string> }> {
  return toResult(() => {
    const invalid = validateVendorPrice(input.base_price, input.vendor_name);
    if (invalid) throw new CalculationError(
      "MISSING_VENDOR_PRICE",
      invalid.message,
      invalid.field,
    );

    const ppnRate = input.ppn_rate ?? 0.11;
    const ppn = calculateVendorPpn(input.base_price, ppnRate);

    const componentScope = {
      base_price: input.base_price,
      ppn,
      pbbkb_rate: input.pbbkb_rate ?? 0,
      pph_rate: input.pph_rate ?? 0,
      oat_rate: input.oat_rate ?? 0,
      ppn_oat_rate: input.ppn_oat_rate ?? 0,
      bph_rate: input.bph_rate ?? 0,
    };
    const pbbkb = resolveFormula("F009", componentScope);
    const pph = resolveFormula("F012", {
      base_price: input.base_price,
      pph_bumn_rate: input.pph_rate ?? 0,
    });
    const oat = resolveFormula("F007", {
      rate: input.oat_rate ?? 0,
      qty: 1,
    });
    const ppnOat = resolveFormula("F001", {
      base_price: input.oat_rate ?? 0,
      ppn_rate: ppnRate,
    });
    const bph = resolveFormula("F011", {
      base_price: input.base_price,
      bph_migas_rate: 0,
    });

    const variant = input.all_in_variant ?? "F002B";
    const allIn = calculateVendorAllIn(
      {
        base_price: input.base_price,
        ppn,
        pbbkb,
        pph,
        oat,
        ppn_oat: ppnOat,
        bph,
      },
      variant,
    );

    const vendor: VendorResult = {
      base_price: input.base_price,
      ppn,
      pbbkb,
      pph,
      oat,
      ppn_oat: ppnOat,
      bph,
      all_in: allIn,
      all_in_formula_id: variant,
    };

    return {
      vendor,
      formulas_used: {
        ppn: "F001",
        all_in: variant,
        pbbkb: "F009",
        bph_migas: "F011",
      },
    };
  }, "base_price");
}

export function describeVendorFormulas(): Array<{ id: string; expression: string }> {
  return ["F001", "F002A", "F002B", "F003"].map((id) => {
    const f = getFormula(id);
    return { id, expression: f.expression };
  });
}
