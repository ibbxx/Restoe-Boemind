/**
 * FormData parsing helpers.
 *
 * KEY RULE: an empty field parses to NULL, never to 0. That is what keeps the
 * "data kosong ≠ Rp0" rule (PRD §11) true all the way from the HTML form to the
 * database.
 *
 * This module must NOT be marked "use server": it exports synchronous helpers.
 */

import { parseNumericInput } from "../format";

export function formText(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

export function formOptionalText(formData: FormData, key: string): string | null {
  const value = formText(formData, key);
  return value === "" ? null : value;
}

export function formId(formData: FormData, key: string): string | null {
  const value = formText(formData, key);
  return value === "" || value === "__none__" ? null : value;
}

/** Empty string => null (NOT APPLICABLE), invalid text => NaN marker. */
export function formNumber(formData: FormData, key: string): number | null {
  return parseNumericInput(formText(formData, key));
}

/** Rate fields where an empty box must fall back to the Excel default. */
export function formRate(formData: FormData, key: string, fallback: number | null): number | null {
  const raw = formText(formData, key);
  if (raw === "") return fallback;
  const parsed = parseNumericInput(raw);
  if (parsed === null) return Number.NaN;
  // Accept both "11" (percent) and "0.11" (ratio) for tax rates.
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

export function formBool(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  if (raw === null) return false;
  const value = String(raw).toLowerCase();
  return value === "on" || value === "true" || value === "1" || value === "yes";
}

export function formNumberList(formData: FormData, key: string): number[] {
  return formData
    .getAll(key)
    .map((value) => parseNumericInput(String(value)))
    .filter((v): v is number => v !== null);
}

/** `cost_rate_<index>` pairs posted from the scenario form. */
export function formIndexedNumbers(
  formData: FormData,
  prefix: string,
): Array<{ description: string; rate: number | null }> {
  const out: Array<{ description: string; rate: number | null }> = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith(prefix)) continue;
    const description = String(raw);
    const rate = parseNumericInput(String(formData.get(`${key}__rate`) ?? ""));
    out.push({ description, rate });
  }
  return out;
}
