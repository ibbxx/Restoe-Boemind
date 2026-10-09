/**
 * Excel cross-check (Phase 2 §16, extended in Phase 2.5 §8/§10).
 *
 * Compares the engine result against the value cached in the real workbook.
 *
 * Phase 2.5 separates THREE different things that were previously collapsed
 * into one tolerance:
 *
 *   1. Excel FORMULA   (the semantics we reproduce — `lib/calculations/*`)
 *   2. Excel CACHED VALUE (what Excel last wrote — the comparison target)
 *   3. System CALCULATED VALUE
 *
 * Diagnosis is now explicit:
 *
 *   VALID             identical within arithmetic-level rounding (<= 1 sen or
 *                     <= 1e-12 relative, i.e. IEEE-754 noise)
 *   PRECISION_VARIANCE  the numbers differ, but by a relative amount far too
 *                     small to be a different formula (<= 1e-4). Reported, not
 *                     hidden, and never silently promoted to "correct".
 *   FORMULA_MISMATCH  a real semantic difference (> 1e-4). The engine does NOT
 *                     match Excel — this is a defect, not noise.
 *   UNRESOLVED        one side has no value
 *   SKIPPED           the comparison was not attempted (block variant without
 *                     that metric, typed-literal cell, #REF!, unknown operand)
 *
 * Tolerance is deliberately tight: it only absorbs rounding, it is never used
 * to make a mismatch disappear.
 */

export type CrossCheckStatus =
  | "VALID"
  | "PRECISION_VARIANCE"
  | "FORMULA_MISMATCH"
  | "UNRESOLVED"
  | "SKIPPED";

export interface CrossCheckRow {
  formula: string;
  source: string;
  label: string;
  excel: number | null;
  system: number | null;
  difference: number | null;
  relative_difference: number | null;
  status: CrossCheckStatus;
  /** Why the row is SKIPPED / UNRESOLVED, or what the deviation means. */
  note?: string;
  /** Textbook value from the workbook FORMULA (not the cached result), when known. */
  excel_formula_value?: number | null;
  cached_value?: number | null;
}

/** 1 sen — below this, Excel's cached result carries no information. */
export const ABS_TOLERANCE = 0.01;
/** IEEE-754 arithmetic noise floor. Measured worst honest case is far smaller. */
export const FLOAT_NOISE_RELATIVE = 1e-12;
/**
 * Anything above float noise but below this window is diagnosed as
 * PRECISION_VARIANCE (Excel's cached value was written with limited precision
 * or rounded inside the workbook). ANYTHING ABOVE IT IS A FORMULA MISMATCH.
 */
export const PRECISION_WINDOW_RELATIVE = 1e-4;

export interface CompareOptions {
  /**
   * Absolute floor for this metric, in the metric's own unit.
   * Defaults to 1 sen, which is right for RUPIAH metrics but far too coarse for
   * a RATIO (0.01 on a 0.05 profit % would hide an entire formula change), so
   * ratio metrics pass a tiny value explicitly.
   */
  absTolerance?: number;
}

export function compareNumber(
  excel: number | null,
  system: number | null,
  opts: CompareOptions = {},
): {
  difference: number | null;
  relative: number | null;
  status: CrossCheckStatus;
  note?: string;
} {
  if (excel === null || excel === undefined || system === null || system === undefined) {
    return { difference: null, relative: null, status: "UNRESOLVED" };
  }
  const absTol = opts.absTolerance ?? ABS_TOLERANCE;
  const difference = system - excel;
  const scale = Math.max(Math.abs(excel), Math.abs(system), 1e-12);
  const relative = Math.abs(difference) / scale;

  if (Math.abs(difference) <= absTol) {
    return { difference, relative, status: "VALID" };
  }
  if (relative <= FLOAT_NOISE_RELATIVE) {
    return { difference, relative, status: "VALID" };
  }
  if (relative <= PRECISION_WINDOW_RELATIVE) {
    return {
      difference,
      relative,
      status: "PRECISION_VARIANCE",
      note:
        `Deviasi ${relative.toExponential(2)} — di atas noise float tetapi jauh di bawah ` +
        `ambang formula berbeda (${PRECISION_WINDOW_RELATIVE}). Excel menyimpan nilai cache ` +
        `dengan presisi terbatas; bukan indikasi formula berbeda.`,
    };
  }
  return {
    difference,
    relative,
    status: "FORMULA_MISMATCH",
    note:
      `Deviasi ${relative.toExponential(2)} > ${PRECISION_WINDOW_RELATIVE}: ` +
      `ini perbedaan FORMULA, bukan noise presisi.`,
  };
}

/** Comparator preset for ratio metrics (profit %, percentages). */
export const RATIO_COMPARE: CompareOptions = { absTolerance: 1e-12 };

export function buildRow(
  formula: string,
  source: string,
  label: string,
  excel: number | null,
  system: number | null,
): CrossCheckRow {
  const { difference, relative, status, note } = compareNumber(excel, system);
  return {
    formula,
    source,
    label,
    excel,
    system,
    difference,
    relative_difference: relative,
    status,
    ...(note ? { note } : {}),
  };
}

/** A row that was NOT compared, with an explicit reason (never a silent drop). */
export function skipRow(
  formula: string,
  source: string,
  label: string,
  reason: string,
  extra: Partial<CrossCheckRow> = {},
): CrossCheckRow {
  return {
    formula,
    source,
    label,
    excel: extra.excel ?? null,
    system: extra.system ?? null,
    difference: null,
    relative_difference: null,
    status: "SKIPPED",
    note: reason,
    ...extra,
  };
}

export interface CrossCheckSummary {
  rows: CrossCheckRow[];
  valid: number;
  precision_variance: number;
  formula_mismatch: number;
  unresolved: number;
  skipped: number;
  total: number;
  compared: number;
  max_relative_difference: number | null;
}

export function summarise(rows: CrossCheckRow[]): CrossCheckSummary {
  const rels = rows
    .map((r) => r.relative_difference)
    .filter((r): r is number => r !== null);
  return {
    rows,
    valid: rows.filter((r) => r.status === "VALID").length,
    precision_variance: rows.filter((r) => r.status === "PRECISION_VARIANCE").length,
    formula_mismatch: rows.filter((r) => r.status === "FORMULA_MISMATCH").length,
    unresolved: rows.filter((r) => r.status === "UNRESOLVED").length,
    skipped: rows.filter((r) => r.status === "SKIPPED").length,
    total: rows.length,
    compared: rows.filter((r) => r.status !== "SKIPPED").length,
    max_relative_difference: rels.length ? Math.max(...rels) : null,
  };
}
