"use client";

/**
 * SPREADSHEET CELL — satu sel yang bisa diklik lalu diketik, seperti Excel.
 *
 * Selalu menampilkan NILAI TERHITUNG (dari server) dan, saat diklik, menampilkan
 * teks mentah yang bisa diedit (angka biasa atau formula). Penyimpanan dilakukan
 * oleh server action; komponen ini tidak pernah menghitung apa pun.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useWorkbookCoordinates } from "./workbook-frame";

export interface CellCommitResult {
  ok: boolean;
  error?: string;
}

export function SheetCellInput({
  raw,
  display,
  align = "right",
  readOnly = false,
  mono = true,
  title,
  invalid = false,
  placeholder = "—",
  onCommit,
  address,
  alias,
}: {
  /** Teks mentah yang diedit (tanpa "="), mis. "17000" atau "vendor_oat * 2". */
  raw: string;
  /** Nilai terhitung siap tampil, mis. "Rp 17.000" atau "—". */
  display: string;
  align?: "left" | "right";
  readOnly?: boolean;
  mono?: boolean;
  title?: string;
  /** Formula gagal / nilai tidak valid — ditandai merah, tidak pernah jadi 0. */
  invalid?: boolean;
  placeholder?: string;
  onCommit: (raw: string) => Promise<CellCommitResult>;
  address?: string;
  alias?: string;
}) {
  const workbook = useWorkbookCoordinates();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(raw);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraft(raw);
      setError(null);
    }
  }, [raw, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [editing]);

  if (readOnly) {
    return (
      <span
        data-workbook-address={address}
        className={`block px-1 py-0.5 ${align === "right" ? "text-right" : ""} ${
          mono ? "font-mono tabular-nums" : ""
        } ${invalid ? "text-negative-700" : ""}`}
        title={[address, alias, title ?? error].filter(Boolean).join(" · ") || undefined}
        onClick={() => address && workbook?.setActiveAddress(address)}
      >
        {display}
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(raw);
      return;
    }
    const next = draft.trim();
    if (next === raw.trim()) return;
    startTransition(async () => {
      const result = await onCommit(next);
      if (!result.ok) setError(result.error ?? "Nilai tidak tersimpan.");
    });
  };

  const flagged = Boolean(error) || invalid;

  return (
    <input
      ref={inputRef}
      aria-label={[address, title].filter(Boolean).join(" - ") || undefined}
      data-workbook-address={address}
      className={`w-full cursor-cell border-0 bg-transparent px-1 py-0.5 outline-none transition ${
        align === "right" ? "text-right" : ""
      } ${mono ? "font-mono tabular-nums" : ""} ${
        editing ? "bg-white ring-1 ring-inset ring-accent-500" : "hover:bg-accent-50"
      } ${flagged ? "text-negative-700" : ""} ${pending ? "opacity-60" : ""}`}
      value={editing ? draft : display}
      placeholder={placeholder}
      title={error ?? ([address, alias, invalid ? "Formula belum bisa dihitung" : title].filter(Boolean).join(" · ") || undefined)}
      onFocus={() => {
        if (address) workbook?.setActiveAddress(address);
        setDraft(raw);
        setEditing(true);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          cancelRef.current = true;
          event.currentTarget.blur();
        }
      }}
      disabled={pending}
    />
  );
}

/** Sel tampilan (read-only) dengan format yang sama seperti sheet. */
export function SheetCell({
  value,
  align = "right",
  mono = true,
  tone,
}: {
  value: string;
  align?: "left" | "right";
  mono?: boolean;
  tone?: string;
}) {
  return (
    <span
      className={`block px-1 py-0.5 ${align === "right" ? "text-right" : ""} ${
        mono ? "font-mono tabular-nums" : ""
      } ${tone ?? ""}`}
    >
      {value}
    </span>
  );
}
