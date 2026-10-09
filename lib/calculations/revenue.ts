/**
 * Revenue & customer price — Formula Registry F006, F005, F004.
 * Excel source of truth: docs/EXCEL_MAPPING.md §C.1.3
 */

import { CalculationError, toResult, type Result } from "./errors";
import { resolveFormula } from "./registry";
import { validateNumeric } from "./validation";

/**
 * F006 — Revenue = harga jual setelah pajak x volume.
 * Excel: Mamuju!L7 =L8*J9  /  Eval Vendor TL!Q10 =Q11*O12 (PRD §17)
 */
export function calculateRevenue(
  hargaJualSetelahPajak: number,
  volume: number,
): number {
  return resolveFormula("F006", {
    harga_jual_setelah_pajak: hargaJualSetelahPajak,
    volume,
  });
}

/**
 * F005 — Harga jual DPP from a tax-inclusive selling price.
 * Excel: JATENG!J10 =13800/1.11
 * NOTE: the divisor is NOT a constant (1.11 / 1.185 / 1.213 observed). §G3
 */
export function calculateHargaJualDpp(
  hargaJualInclude: number,
  includeDivisor = 1.11,
): number {
  return resolveFormula("F005", {
    harga_jual_include: hargaJualInclude,
    include_divisor: includeDivisor,
  });
}

/**
 * F004 — Diskon terhadap harga keekonomian.
 * Excel: JATENG!L6 =(I6-J10)/I6
 */
export function calculateDiskon(
  hargaKeekonomian: number,
  hargaJualDpp: number,
): number {
  return resolveFormula("F004", {
    harga_keekonomian: hargaKeekonomian,
    harga_jual_dpp: hargaJualDpp,
  });
}

/**
 * Harga jual setelah pajak = DPP + PBBKB(penjualan) + PPN keluaran per liter.
 * Excel: JATENG!M9 =SUM(J10:J12)
 */
export function calculateHargaJualSetelahPajak(
  hargaJualDpp: number,
  pbbkbPenjualan: number,
  ppnOutputPerLiter: number,
): number {
  return hargaJualDpp + pbbkbPenjualan + ppnOutputPerLiter;
}

export function calculateCustomerPriceBlock(input: {
  harga_jual_include: number | null;
  volume: number | null;
  include_divisor?: number;
  harga_keekonomian?: number | null;
}): Result<{
  harga_jual_dpp: number;
  harga_jual_setelah_pajak: number;
  revenue: number;
  diskon: number | null;
}> {
  return toResult(() => {
    const vErr = validateNumeric("volume", input.volume, {
      required: true,
      allowZero: false,
      allowNegative: false,
    });
    if (vErr) throw new CalculationError("ZERO_VOLUME", vErr.message, vErr.field);
    const pErr = validateNumeric("harga_jual_include", input.harga_jual_include, {
      required: true,
      allowZero: false,
      allowNegative: false,
    });
    if (pErr)
      throw new CalculationError("MISSING_INPUT", pErr.message, pErr.field);

    const divisor = input.include_divisor ?? 1.11;
    const hargaJualDpp = calculateHargaJualDpp(input.harga_jual_include!, divisor);
    const revenue = calculateRevenue(input.harga_jual_include!, input.volume!);
    const diskon =
      input.harga_keekonomian !== undefined &&
      input.harga_keekonomian !== null &&
      input.harga_keekonomian !== 0
        ? calculateDiskon(input.harga_keekonomian, hargaJualDpp)
        : null;

    return {
      harga_jual_dpp: hargaJualDpp,
      harga_jual_setelah_pajak: input.harga_jual_include!,
      revenue,
      diskon,
    };
  }, "harga_jual_include");
}
