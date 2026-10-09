import Link from "next/link";

import { MISSING, formatSignedCurrency, formatText } from "@/lib/format";

export type Tone = "neutral" | "positive" | "negative" | "caution" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  positive: "bg-positive-100 text-positive-700",
  negative: "bg-negative-100 text-negative-700",
  caution: "bg-caution-100 text-caution-700",
  accent: "bg-blue-100 text-rbi-navy",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`badge ${TONE_CLASS[tone]}`}>{children}</span>;
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  actions,
  showDescription = false,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  showDescription?: boolean;
}) {
  return (
    <header className="card-hd">
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {showDescription && description ? <p className="mt-0.5 text-xs text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  showDescription = false,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  showDescription?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 text-2xs text-ink-500">{breadcrumb}</div> : null}
        <h1 className="truncate border-l-4 border-rbi-red pl-3 text-lg font-semibold tracking-tight text-rbi-navy">{title}</h1>
        {showDescription && description ? <div className="mt-1 text-xs text-ink-500">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <div className="card border-t-2 border-t-rbi-red px-4 py-3 transition hover:border-rbi-red">
      <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-semibold ${
          tone === "positive"
            ? "text-positive-700"
            : tone === "negative"
              ? "text-negative-700"
              : tone === "caution"
                ? "text-caution-700"
                : "text-ink-900"
        }`}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-2xs text-ink-500">{hint}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Field({
  label,
  children,
  hint,
  error,
  required,
  showHint = false,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  showHint?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">
        {label}
        {required ? <span className="ml-1 text-negative-700">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-2xs font-medium text-negative-700" role="alert">
          {error}
        </span>
      ) : showHint && hint ? (
        <span className="mt-1 block text-2xs text-ink-500">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * A calculated value. Always rendered in a read-only shell so the UI itself
 * communicates "not editable" (PRD §39, Phase 3 §9).
 */
export function ReadOnlyValue({
  label,
  value,
  hint,
  tone,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <output
        className={`flex items-center justify-between rounded-md border border-dashed px-2.5 py-1.5 font-mono ${
          emphasis ? "text-base font-semibold" : "text-sm"
        } ${
          tone === "positive"
            ? "border-positive-100 bg-positive-50 text-positive-700"
            : tone === "negative"
              ? "border-negative-100 bg-negative-50 text-negative-700"
              : "border-ink-200 bg-ink-100 text-ink-700"
        }`}
        aria-readonly="true"
      >
        <span>{value}</span>
        <span className="ml-2 shrink-0 text-2xs tracking-wide opacity-60">auto</span>
      </output>
      {hint ? <div className="mt-1 text-2xs text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function ValuePair({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-1.5 last:border-0">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={`text-sm text-ink-900 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export function Missing({ value, suffix }: { value: string | null | undefined; suffix?: string }) {
  const text = formatText(value);
  if (text === MISSING) return <span className="text-ink-400">{MISSING}</span>;
  return (
    <span>
      {text}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

export function DeltaValue({ value, decimals = 0 }: { value: number | null; decimals?: number }) {
  if (value === null) return <span className="text-ink-400">{MISSING}</span>;
  if (value === 0) return <span className="text-ink-500">{formatSignedCurrency(0, decimals)}</span>;
  return (
    <span className={value > 0 ? "text-positive-700" : "text-negative-700"}>
      {formatSignedCurrency(value, decimals)}
    </span>
  );
}
