/**
 * Presentation formatting. NOTHING here calculates business values: these
 * helpers only render numbers that the calculation engine produced.
 *
 * Missing values are rendered as "-" (never as 0) — PRD §11 / Phase 3 §10.
 */

export const MISSING = "—";

const idr = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const idr2 = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function isMissing(value: number | null | undefined): boolean {
  return value === null || value === undefined || !Number.isFinite(value);
}

/** Rp 16.396 — null/undefined/NaN render as "—". */
export function formatCurrency(
  value: number | null | undefined,
  opts: { decimals?: number; withSymbol?: boolean } = {},
): string {
  if (isMissing(value)) return MISSING;
  const n = value as number;
  const body = opts.decimals ? idr2.format(n) : idr.format(n);
  return opts.withSymbol === false ? body : `Rp ${body}`;
}

/** Alias with an explicit "Rp" that is always shown. */
export function formatRp(value: number | null | undefined, decimals = 0): string {
  return formatCurrency(value, { decimals });
}
export const formatRupiah = formatRp;

export function formatNumber(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (isMissing(value)) return MISSING;
  const n = value as number;
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/** Engine profit_percentage is a RATIO (F021A = net_profit / total_cost). */
export function formatPercentFromRatio(value: number | null | undefined, decimals = 2): string {
  if (isMissing(value)) return MISSING;
  return `${formatNumber((value as number) * 100, decimals)}%`;
}

/** For values already expressed in percent units. */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (isMissing(value)) return MISSING;
  return `${formatNumber(value as number, decimals)}%`;
}

export function formatSignedCurrency(value: number | null | undefined, decimals = 0): string {
  if (isMissing(value)) return MISSING;
  const n = value as number;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${formatCurrency(Math.abs(n), { decimals })}`;
}

export function formatSignedNumber(value: number | null | undefined, decimals = 0): string {
  if (isMissing(value)) return MISSING;
  const n = value as number;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(n), decimals)}`;
}

/** Normalises DB `numeric` columns, which arrive as strings over PostgREST. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parses a numeric form field. Empty string => null (NOT 0 — PRD §11). */
export function parseNumericInput(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = raw.trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return MISSING;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return MISSING;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return MISSING;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return MISSING;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatText(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") return MISSING;
  return value;
}

export function formatVolume(value: number | null | undefined): string {
  if (isMissing(value)) return MISSING;
  return `${formatNumber(value, 0)} L`;
}
