/**
 * The three states every screen must handle (Phase 3 §20 / §23):
 * loading, empty, error. They are explicit components so no screen can quietly
 * render a blank area — or a NaN.
 */

export function EmptyState({
  title,
  description,
  action,
  compact = false,
  showDescription = false,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  showDescription?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md border border-dashed border-ink-300 bg-white text-center ${
        compact ? "px-4 py-5" : "px-5 py-8"
      }`}
      data-testid="empty-state"
    >
      <div className="text-sm font-medium text-ink-700">{title}</div>
      {showDescription && description ? (
        <p className="mt-1 max-w-xl text-xs text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Terjadi kesalahan",
  message,
  code: errorCode,
  action,
}: {
  title?: string;
  message: string;
  code?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border border-negative-100 bg-negative-50 px-3 py-2.5"
      role="alert"
      data-testid="error-state"
      data-error-code={errorCode}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-negative-700">{title}</span>
      </div>
      <p className="mt-1 text-xs text-negative-700">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Warning banner for non-fatal problems (e.g. an audit row that failed). */
export function WarningState({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <div className="rounded-lg border border-caution-100 bg-caution-50 px-4 py-2" role="status">
      <div className="text-2xs font-semibold tracking-wide text-caution-700">Perhatian</div>
      <ul className="mt-1 list-disc pl-4 text-xs text-caution-700">
        {messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

/** "Calculating..." / "Loading..." / "Saving..." come from these. */
export function InlineSpinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-500" role="status" aria-live="polite">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-300 border-t-accent-600" />
      {label}
    </span>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white" aria-busy="true">
      <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-100 px-3 py-2">
        <InlineSpinner label="Memuat…" />
      </div>
      <div className="divide-y divide-ink-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 px-3 py-2.5">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <div
                key={columnIndex}
                className="h-3 flex-1 animate-pulse rounded bg-ink-100"
                style={{ animationDelay: `${(rowIndex + columnIndex) * 40}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Calculation error state. The engine refuses to return NaN, so when a
 * calculation cannot run the UI shows the engine's own structured message and
 * error code instead of a number (Phase 3 §20).
 */
export function CalculationErrorState({
  message,
  code: errorCode,
  field: errorField,
}: {
  message: string;
  code?: string;
  field?: string;
}) {
  return (
    <div className="rounded-lg border border-caution-100 bg-caution-50 px-4 py-3" role="alert" data-error-code={errorCode} data-error-field={errorField}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-caution-700">Hasil belum tersedia</span>
      </div>
      <p className="mt-1 text-xs text-caution-700">{message}</p>
    </div>
  );
}
