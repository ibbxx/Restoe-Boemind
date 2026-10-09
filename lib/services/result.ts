/**
 * Structured result model for the application layer.
 *
 * Every mutation returns an ActionResult: no thrown exceptions reach the UI, so
 * a failed request can always be rendered as an explicit error state
 * (Phase 3 §20 / §23). Calculation failures keep their engine error code so the
 * UI can show the engine's own message instead of "NaN".
 */

import type { CalcFailure, ErrorCode } from "../calculations/errors";

export interface ActionOk<T> {
  ok: true;
  data: T;
  /** Non-fatal notes, e.g. an audit entry that could not be written. */
  warnings?: string[];
}

export interface ActionErr {
  ok: false;
  /** Human-readable message, safe to display. */
  error: string;
  /** Field -> message, for inline validation display. */
  fieldErrors?: Record<string, string>;
  /** Engine error code when the failure came from the calculation engine. */
  errorCode?: ErrorCode | "FORBIDDEN" | "NOT_FOUND" | "DATABASE_ERROR" | "INVALID_INPUT";
  /** Non-fatal notes, e.g. an audit entry that could not be written. */
  warnings?: string[];
}

export type ActionResult<T> = ActionOk<T> | ActionErr;

export function ok<T>(data: T, warnings?: string[]): ActionOk<T> {
  return { ok: true, data, ...(warnings && warnings.length > 0 ? { warnings } : {}) };
}

export function err(
  error: string,
  options: { fieldErrors?: Record<string, string>; errorCode?: ActionErr["errorCode"]; warnings?: string[] } = {},
): ActionErr {
  return {
    ok: false,
    error,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.errorCode ? { errorCode: options.errorCode } : {}),
    ...(options.warnings && options.warnings.length > 0 ? { warnings: options.warnings } : {}),
  };
}

/** Convert a calculation-engine failure straight into an ActionErr. */
export function fromCalcFailure(failure: CalcFailure): ActionErr {
  return {
    ok: false,
    error: failure.message,
    errorCode: failure.errorCode,
    ...(failure.field ? { fieldErrors: { [failure.field]: failure.message } } : {}),
  };
}

export function forbidden(what: string): ActionErr {
  return err(
    `Role Anda tidak memiliki izin untuk ${what}. Database menolak operasi ini (RLS).`,
    { errorCode: "FORBIDDEN" },
  );
}

export function notFound(what: string): ActionErr {
  return err(`${what} tidak ditemukan, atau Anda tidak memiliki akses ke sana.`, {
    errorCode: "NOT_FOUND",
  });
}

export function databaseError(table: string, detail: string): ActionErr {
  return err(`Permintaan database gagal pada "${table}": ${detail}`, {
    errorCode: "DATABASE_ERROR",
  });
}

export function toActionResultError(e: unknown, table: string): ActionErr {
  console.error(`[action-error] ${table}`, e);
  if (e instanceof Error && e.name === "DatabaseError") {
    return databaseError(table, "Operasi tidak dapat diselesaikan. Coba lagi atau hubungi administrator.");
  }
  if (e instanceof Error) {
    return err(`Operasi gagal pada "${table}". Coba lagi atau hubungi administrator.`, { errorCode: "DATABASE_ERROR" });
  }
  return err(`Operasi gagal pada "${table}". Coba lagi atau hubungi administrator.`, { errorCode: "DATABASE_ERROR" });
}
