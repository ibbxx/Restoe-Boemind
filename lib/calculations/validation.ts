/**
 * Validation layer (Phase 2 §8).
 *
 * KEY RULE FROM THE MAPPING:
 *   An empty Excel cell is NOT automatically zero.
 *   `null` means "tidak berlaku / tidak tersedia" (NOT APPLICABLE) and is kept
 *   as null through the pipeline. Only cells whose Excel formula demonstrably
 *   evaluates to 0 become the number 0.
 */

import { fail, type CalcFailure } from "./errors";
import type { AhsInput, CostLineInput } from "./types";

export interface NumericRule {
  required?: boolean;
  allowZero?: boolean;
  allowNegative?: boolean;
  min?: number;
  max?: number;
}

export function validateNumeric(
  field: string,
  value: unknown,
  rule: NumericRule = {},
): CalcFailure | null {
  const { required = true, allowZero = true, allowNegative = true } = rule;

  if (value === null || value === undefined) {
    if (required) {
      return fail(
        "MISSING_INPUT",
        `Field "${field}" wajib diisi (di Excel: sel kosong — bukan 0).`,
        field,
      );
    }
    return null;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fail(
      "INVALID_NUMBER",
      `Field "${field}" harus berupa angka, diterima: ${String(value)}.`,
      field,
    );
  }
  if (!Number.isFinite(value)) {
    return fail(
      "INVALID_NUMBER",
      `Field "${field}" tidak boleh Infinity/NaN.`,
      field,
    );
  }
  if (!allowZero && value === 0) {
    return fail("ZERO_VOLUME", `Field "${field}" tidak boleh 0.`, field);
  }
  if (!allowNegative && value < 0) {
    return fail(
      "NEGATIVE_VALUE",
      `Field "${field}" tidak boleh negatif (${value}).`,
      field,
    );
  }
  if (rule.min !== undefined && value < rule.min) {
    return fail(
      "INVALID_NUMBER",
      `Field "${field}" di bawah nilai minimum ${rule.min}.`,
      field,
    );
  }
  if (rule.max !== undefined && value > rule.max) {
    return fail(
      "INVALID_NUMBER",
      `Field "${field}" di atas nilai maksimum ${rule.max}.`,
      field,
    );
  }
  return null;
}

export function validateProjectId(projectId: string | null | undefined): CalcFailure | null {
  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    return fail("INVALID_SCENARIO", "Project ID tidak valid.", "project_id");
  }
  return null;
}

export function validateScenarioId(scenarioId: string | null | undefined): CalcFailure | null {
  if (!scenarioId || typeof scenarioId !== "string" || scenarioId.trim() === "") {
    return fail("INVALID_SCENARIO", "Scenario ID tidak valid.", "scenario_id");
  }
  return null;
}

/** Collect ALL validation problems (not just the first) for a good UX. */
export function validateAhsInput(input: AhsInput): CalcFailure[] {
  const errors: CalcFailure[] = [];

  const volumeErr = validateNumeric("volume", input.volume, {
    required: true,
    allowZero: false,
    allowNegative: false,
  });
  if (volumeErr) errors.push(volumeErr);

  // F005B / F005C: when the sale DPP is a direct value taken from Excel there is
  // no include price and no divisor to validate — the DPP itself is required.
  const usesDirectDpp =
    input.harga_jual_dpp_input !== undefined && input.harga_jual_dpp_input !== null;
  if (usesDirectDpp) {
    const dppErr = validateNumeric("harga_jual_dpp_input", input.harga_jual_dpp_input, {
      required: true,
      allowZero: false,
      allowNegative: false,
    });
    if (dppErr) errors.push(dppErr);
  } else {
    const priceErr = validateNumeric("harga_jual_include", input.harga_jual_include, {
      required: true,
      allowZero: false,
      allowNegative: false,
    });
    if (priceErr) errors.push(priceErr);

    const divisorErr = validateNumeric("include_divisor", input.include_divisor ?? 1.11, {
      required: true,
      allowZero: false,
      allowNegative: false,
    });
    if (divisorErr) errors.push(divisorErr);
  }

  const taxRates: Array<[string, unknown]> = [
    ["ppn_rate", input.ppn_rate ?? 0.11],
    ["pbbkb_rate", input.pbbkb_rate ?? 0],
    ["pph_inu_rate", input.pph_inu_rate ?? 0],
    ["bph_migas_rate", input.bph_migas_rate ?? 0],
  ];
  for (const [k, v] of taxRates) {
    const e = validateNumeric(k, v, { required: false, allowNegative: false });
    if (e) errors.push(e);
  }

  if (!Array.isArray(input.cost_lines) || input.cost_lines.length === 0) {
    errors.push(
      fail(
        "MISSING_COST_LINES",
        "Cost items wajib diisi (minimal 1 baris).",
        "cost_lines",
      ),
    );
  } else {
    input.cost_lines.forEach((line, i) => {
      const e = validateCostLine(line, i);
      if (e) errors.push(e);
    });
  }

  if (input.base_price !== undefined && input.base_price !== null) {
    const e = validateNumeric("base_price", input.base_price, {
      required: false,
      allowNegative: false,
    });
    if (e) errors.push(e);
  }

  return errors;
}

export function validateCostLine(
  line: CostLineInput,
  index: number,
): CalcFailure | null {
  const label = `cost_lines[${index}]`;
  if (line.rate !== null && line.rate !== undefined) {
    const e = validateNumeric(`${label}.rate`, line.rate, { required: false });
    if (e) return e;
  }
  if (line.qty !== null && line.qty !== undefined) {
    const e = validateNumeric(`${label}.qty`, line.qty, {
      required: false,
      allowNegative: false,
    });
    if (e) return e;
  }
  if (!line.description && !line.category) {
    return fail(
      "MISSING_INPUT",
      `${label}: category atau description wajib diisi.`,
      `${label}.description`,
    );
  }
  return null;
}

/** Validate a vendor price payload. Missing price must NOT become 0 (PRD §11). */
export function validateVendorPrice(
  basePrice: number | null | undefined,
  vendorName?: string,
): CalcFailure | null {
  if (basePrice === null || basePrice === undefined) {
    return fail(
      "MISSING_VENDOR_PRICE",
      `Harga vendor${vendorName ? ` "${vendorName}"` : ""} belum diisi — ` +
        `data kosong tidak dianggap Rp0.`,
      "base_price",
    );
  }
  return validateNumeric("base_price", basePrice, {
    required: true,
    allowZero: false,
    allowNegative: false,
  });
}
