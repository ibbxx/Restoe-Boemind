import { z } from "zod";
import { zfd } from "zod-form-data";
import { parseNumericInput } from "../format";

/**
 * Zod helper for parsing numeric inputs handling Indonesian locale (e.g. 1.000,50).
 * Empty strings are parsed as null, NOT 0.
 */
export const zfdNumberNullable = () => zfd.text(
  z.string().optional().transform((val) => {
    if (!val) return null;
    return parseNumericInput(val);
  })
).pipe(z.number().nullable());

/**
 * Zod helper for parsing required numeric inputs.
 */
export const zfdNumber = () => zfd.text(
  z.string().transform((val) => {
    const parsed = parseNumericInput(val);
    if (parsed === null) throw new Error("Angka tidak valid");
    return parsed;
  })
).pipe(z.number());

/**
 * Zod helper for parsing rate/tax inputs.
 * If empty, returns the fallback value.
 * Accepts both percentage (e.g., "11") and decimal (e.g., "0.11") and normalizes to decimal.
 */
export const zfdRate = (fallback: number | null) => zfd.text(
  z.string().optional().transform((val) => {
    if (!val) return fallback;
    const parsed = parseNumericInput(val);
    if (parsed === null) return Number.NaN;
    return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
  })
).pipe(z.number().nullable());

/**
 * Helper to ensure an empty string becomes null instead of throwing error.
 */
export const zfdStringNullable = () => zfd.text(z.string().optional().transform(v => v || null));
