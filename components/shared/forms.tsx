"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import type { ActionResult } from "@/lib/services/result";

/** Submit button with the required "Saving…" state (Phase 3 §20). */
export function SubmitButton({
  label,
  pendingLabel = "Menyimpan…",
  variant = "primary",
  disabled,
  title,
  className = "",
}: {
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const variantClass =
    variant === "primary"
      ? "btn-primary"
      : variant === "secondary"
        ? "btn-secondary"
        : variant === "danger"
          ? "btn-danger"
          : "btn-ghost";
  return (
    <button
      type="submit"
      className={`${variantClass} ${className}`}
      disabled={pending || disabled}
      title={title}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/50 border-t-white" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** Error + warning rendering shared by every form. */
export function FormAlerts({
  state,
  successMessage,
}: {
  state: { ok?: boolean; error?: string; warnings?: string[] } | null;
  successMessage?: string;
}) {
  if (!state) return null;
  if (state.error) {
    return (
      <div className="rounded-md border border-negative-100 bg-negative-50 px-3 py-2 text-xs text-negative-700" role="alert">
        {state.error}
      </div>
    );
  }
  return (
    <>
      {state.ok && successMessage ? (
        <div className="rounded-md border border-positive-100 bg-positive-50 px-3 py-2 text-xs text-positive-700" role="status">
          {successMessage}
        </div>
      ) : null}
      {state.warnings && state.warnings.length > 0 ? (
        <ul className="list-disc rounded-md border border-caution-100 bg-caution-50 px-6 py-2 text-2xs text-caution-700">
          {state.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/**
 * Button that invokes an async server action, shows a pending state and reports
 * the structured error. Destructive operations require a confirmation step
 * (Phase 3 §19).
 */
export function AsyncActionButton({
  action,
  label,
  pendingLabel,
  confirmTitle,
  confirmMessage,
  variant = "secondary",
  disabled,
  disabledReason,
  onDone,
}: {
  action: () => Promise<ActionResult<unknown>>;
  label: string;
  pendingLabel?: string;
  confirmTitle?: string;
  confirmMessage?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  disabledReason?: string;
  onDone?: (result: ActionResult<unknown>) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const variantClass =
    variant === "primary"
      ? "btn-primary"
      : variant === "secondary"
        ? "btn-secondary"
        : variant === "danger"
          ? "btn-danger"
          : "btn-ghost";

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      onDone?.(result);
    });
  };

  return (
    <>
      <button
        type="button"
        className={`${variantClass} text-xs`}
        disabled={pending || disabled}
        title={disabled ? disabledReason : undefined}
        aria-busy={pending}
        onClick={() => {
          if (confirmTitle) setConfirming(true);
          else run();
        }}
      >
        {pending ? pendingLabel ?? "Memproses…" : label}
      </button>

      {error ? (
        <span className="text-2xs text-negative-700" role="alert">
          {error}
        </span>
      ) : null}

      {confirming ? (
          <ConfirmDialog
          title={confirmTitle ?? "Konfirmasi tindakan"}
          message={confirmMessage ?? "Tindakan ini tidak dapat dibatalkan."}
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            run();
          }}
        />
      ) : null}
    </>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Konfirmasi",
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <p className="mt-2 text-xs text-ink-600">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>
            Batal
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
