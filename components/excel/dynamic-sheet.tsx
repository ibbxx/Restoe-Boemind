"use client";

/**
 * DYNAMIC SHEET — tabel yang diisi user seperti spreadsheet.
 *
 * Kolom, baris dan FORMULA bukan template: procurement mengetik rumus langsung
 * di sel dan dapat mengklik sel tujuan untuk memasukkan alamatnya — seperti Excel.
 * Semua nilai dihitung di server
 * (`lib/services/sheets.ts`) memakai evaluator ekspresi yang sama dengan
 * Calculation Engine; tidak ada formula yang berjalan di browser.
 */

import { useState, useTransition } from "react";

import {
  addSheetAction,
  addSheetColumnAction,
  addSheetRowAction,
  removeSheetAction,
  removeSheetColumnAction,
  removeSheetRowAction,
  setSheetCellAction,
  setSheetRowLabelAction,
  mergeSheetCellsAction,
  unmergeSheetCellsAction,
  setSheetRangeStyleAction,
} from "@/lib/actions/sheets";
import { formatNumber } from "@/lib/format";
import type { ComputedSheet, SheetVariable } from "@/lib/types/sheets";
import type { CellCommitResult } from "./sheet-cell-input";
import { SpreadsheetGrid } from "./spreadsheet-grid";

export function DynamicSheet({
  projectId,
  sheet,
  variables,
  canWrite,
  embedded = false,
}: {
  projectId: string;
  sheet: ComputedSheet;
  variables: SheetVariable[];
  canWrite: boolean;
  /** Dipakai saat sheet ditanam di dalam sheet AHS (tanpa judul & toolbar). */
  embedded?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [newColumn, setNewColumn] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Perubahan tidak tersimpan.");
    });
  };

  const commitCell = async (rowId: string, columnKey: string, raw: string): Promise<CellCommitResult> => {
    const result = await setSheetCellAction(projectId, {
      sheet_key: sheet.key,
      row_id: rowId,
      column_key: columnKey,
      raw,
    });
    return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) };
  };

  const grid = (
    <SpreadsheetGrid
      sheet={sheet}
      canWrite={canWrite}
      compact={embedded}
      onCommitCell={commitCell}
      busy={pending}
      {...(!embedded ? {
        onRenameRow: async (rowId: string, label: string) => {
          const result = await setSheetRowLabelAction(projectId, { sheet_key: sheet.key, row_id: rowId, label });
          return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) };
        },
        onMerge: (range: import("@/lib/types/sheets").SheetRange) => mergeSheetCellsAction(projectId, { sheet_key: sheet.key, range }),
        onUnmerge: (range: import("@/lib/types/sheets").SheetRange) => unmergeSheetCellsAction(projectId, { sheet_key: sheet.key, range }),
        onSetFill: (range: import("@/lib/types/sheets").SheetRange, fill: import("@/lib/types/sheets").SheetFill) => setSheetRangeStyleAction(projectId, { sheet_key: sheet.key, range, fill }),
      } : {})}
      {...(canWrite && !embedded
        ? {
            onRemoveRow: (rowId: string) =>
              run(() => removeSheetRowAction(projectId, { sheet_key: sheet.key, row_id: rowId })),
            onAddRow: () => run(() => addSheetRowAction(projectId, { sheet_key: sheet.key })),
            onRemoveColumn: (columnKey: string) =>
              run(() => removeSheetColumnAction(projectId, { sheet_key: sheet.key, column_key: columnKey })),
          }
        : {})}
    />
  );

  if (embedded) {
    return (
      <div>
        {grid}
        {error ? <p className="px-1 text-2xs text-negative-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <section className="excel-sheet flex flex-col gap-1" aria-label={sheet.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sheet-title-alt flex-1 text-left">{sheet.title}</h2>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="btn-secondary text-2xs"
              disabled={pending}
              onClick={() => run(() => addSheetRowAction(projectId, { sheet_key: sheet.key }))}
            >
              + Baris
            </button>
            <button
              type="button"
              className="btn-secondary text-2xs"
              disabled={pending}
              onClick={() => setShowLegend((value) => !value)}
            >
              {showLegend ? "Sembunyikan variabel" : "Variabel & rumus"}
            </button>
            {sheet.key !== "poin_perhitungan" ? <button
              type="button"
              className="btn-danger text-2xs"
              disabled={pending}
              onClick={() => run(() => removeSheetAction(projectId, sheet.key))}
            >
              Hapus tabel
            </button> : null}
          </div>
        ) : null}
      </div>

      {showLegend ? <SheetLegend variables={variables} /> : null}

      <div className="overflow-x-auto">{grid}</div>

      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-2 py-1">
          <span className="text-2xs text-ink-500">Kolom baru:</span>
          <input
            className="input h-7 w-40 text-xs"
            placeholder="mis. Margin"
            value={newColumn}
            onChange={(event) => setNewColumn(event.target.value)}
          />
          <button
            type="button"
            className="btn-secondary text-2xs"
            disabled={pending || newColumn.trim() === ""}
            onClick={() => {
              const label = newColumn.trim();
              setNewColumn("");
              run(() => addSheetColumnAction(projectId, { sheet_key: sheet.key, label }));
            }}
          >
            + Kolom
          </button>
          {sheet.columns.length > 1 ? (
            <span className="text-2xs text-ink-400">
              Hapus kolom: tombol × di header. Formula boleh memakai alamat sel (B2) atau nama variabel
              (harga_dasar_harga_inu).
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="border border-negative-100 bg-negative-50 px-2 py-1 text-2xs text-negative-700">{error}</p>
      ) : null}
    </section>
  );
}

function SheetLegend({ variables }: { variables: SheetVariable[] }) {
  const groups = new Map<string, SheetVariable[]>();
  for (const variable of variables) {
    const list = groups.get(variable.group) ?? [];
    list.push(variable);
    groups.set(variable.group, list);
  }

  return (
    <div className="sheet-block p-2">
      <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-500">
        Variabel yang boleh dipakai di formula (output engine &amp; repository — read-only)
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {[...groups.entries()].map(([group, list]) => (
          <div key={group}>
            <div className="text-2xs font-semibold text-ink-600">{group}</div>
            <ul className="mt-0.5 space-y-0.5">
              {list.map((variable) => (
                <li key={variable.name} className="flex items-baseline justify-between gap-2 text-2xs">
                  <span className="font-mono text-ink-700">{variable.name}</span>
                  <span className="font-mono text-ink-500">
                    {variable.value === null ? "—" : formatNumber(variable.value, 2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tambah tabel baru (kolom & formula diisi procurement sendiri). */
export function NewSheetButton({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2 border border-dashed border-ink-300 bg-white px-2 py-1.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-500">Tabel baru</span>
      <input
        className="input h-7 w-48 text-xs"
        placeholder="mis. Konversi Satuan MUE"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button
        type="button"
        className="btn-secondary text-2xs"
        disabled={pending || title.trim() === ""}
        onClick={() => {
          const name = title.trim();
          setTitle("");
          setError(null);
          startTransition(async () => {
            const result = await addSheetAction(projectId, name);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        + Tambah tabel
      </button>
      {error ? <span className="text-2xs text-negative-700">{error}</span> : null}
    </div>
  );
}
