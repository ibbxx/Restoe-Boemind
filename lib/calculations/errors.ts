/**
 * Structured, explicit failure model for the calculation engine.
 *
 * The engine NEVER returns NaN / Infinity / undefined. Any condition that
 * would produce those must raise (or be returned as) a CalculationError.
 */

export type ErrorCode =
  | "MISSING_INPUT"
  | "INVALID_NUMBER"
  | "ZERO_VOLUME"
  | "NEGATIVE_VALUE"
  | "UNKNOWN_FORMULA"
  | "UNRESOLVED_FORMULA"
  | "DIVISION_BY_ZERO"
  | "EXPRESSION_ERROR"
  | "UNKNOWN_TEMPLATE"
  | "MISSING_COST_LINES"
  | "MISSING_VENDOR_PRICE";

export interface CalcFailure {
  success: false;
  errorCode: ErrorCode;
  message: string;
  field?: string;
}

export type Result<T> = ({ success: true } & T) | CalcFailure;

export class CalculationError extends Error {
  readonly errorCode: ErrorCode;
  readonly field?: string;

  constructor(errorCode: ErrorCode, message: string, field?: string) {
    super(message);
    this.name = "CalculationError";
    this.errorCode = errorCode;
    this.field = field;
  }

  toFailure(): CalcFailure {
    return {
      success: false,
      errorCode: this.errorCode,
      message: this.message,
      ...(this.field ? { field: this.field } : {}),
    };
  }
}

export function fail(
  errorCode: ErrorCode,
  message: string,
  field?: string,
): CalcFailure {
  return {
    success: false,
    errorCode,
    message,
    ...(field ? { field } : {}),
  };
}

/** Wrap a calculation so it always returns a structured Result, never a throw. */
export function toResult<T>(fn: () => T, field?: string): Result<T> {
  try {
    return { success: true, ...(fn() as object) } as Result<T>;
  } catch (e) {
    if (e instanceof CalculationError) return e.toFailure();
    return fail(
      "EXPRESSION_ERROR",
      e instanceof Error ? e.message : String(e),
      field,
    );
  }
}
