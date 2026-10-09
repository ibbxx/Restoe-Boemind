"use client";

/**
 * SPREADSHEET GRID — cara kerja sel seperti Excel.
 *
 * Alur yang didukung:
 *   1. KLIK SEL            -> sel aktif, bisa langsung diketik (Enter simpan, Esc batal).
 *   2. RUMUS LANGSUNG     -> ketik `=B2*11%` atau `=sum(B2:B6)` di dalam sel.
 *   3. KLIK SEL LAIN saat  -> alamat sel itu (mis. `B3`) masuk ke formula yang sedang
 *      sedang mengedit        ditulis — persis “point mode” di Excel.
 *   4. RANGE               -> `=sum(B2:B6)` diterjemahkan server menjadi daftar sel.
 *
 * Komponen ini TIDAK menghitung apa pun: nilainya dihitung server
 * (`lib/services/sheets.ts`), dan `AhsResult` tetap output engine.
 */

import { useEffect, useRef, useState, useTransition } from "react";

import { formatNumber, formatRp } from "@/lib/format";
import type { ComputedSheet, ComputedSheetCell } from "@/lib/types/sheets";
import type { SheetRange, SheetFill } from "@/lib/types/sheets";
import { boundsRange, contains, intersects, rangeBounds, type GridPoint, type GridBounds } from "@/lib/sheet-ranges";
import type { CellCommitResult } from "./sheet-cell-input";
import { SheetCellInput } from "./sheet-cell-input";

function columnLetter(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    label = String.fromCharCode(65 + rest) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function cellAddress(columnIndex: number, rowIndex: number): string {
  return `${columnLetter(columnIndex)}${rowIndex + 1}`;
}

function displayCell(cell: ComputedSheetCell): string {
  if (cell.value === null) return "—";
  return Math.abs(cell.value) >= 1000 ? formatRp(cell.value) : formatNumber(cell.value, 2);
}

export function rawCell(cell: ComputedSheetCell): string {
  if (cell.expr !== null) return `=${cell.expr}`;
  return cell.value === null ? "" : String(cell.value);
}

export interface SpreadsheetGridProps {
  sheet: ComputedSheet;
  canWrite: boolean;
  compact?: boolean;
  onCommitCell: (rowId: string, columnKey: string, raw: string) => Promise<CellCommitResult>;
  onRemoveRow?: (rowId: string) => void;
  onAddRow?: () => void;
  onRemoveColumn?: (columnKey: string) => void;
  busy?: boolean;
  onMerge?: (range: SheetRange) => Promise<CellCommitResult>;
  onUnmerge?: (range: SheetRange) => Promise<CellCommitResult>;
  onSetFill?: (range: SheetRange, fill: SheetFill) => Promise<CellCommitResult>;
  onRenameRow?: (rowId: string, label: string) => Promise<CellCommitResult>;
}

export function SpreadsheetGrid({
  sheet,
  canWrite,
  compact = false,
  onCommitCell,
  onRemoveRow,
  onAddRow,
  onRemoveColumn,
  busy = false,
  onMerge,
  onUnmerge,
  onSetFill,
  onRenameRow,
}: SpreadsheetGridProps) {
  const [active, setActive] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [selection, setSelection] = useState<{ start: GridPoint; end: GridPoint } | null>(null);
  const dragRef = useRef(false);
  const draggedRef = useRef(false);
  const locked = pending || busy;
  useEffect(() => {
    const stop = () => { dragRef.current = false; };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  // Dokumen baru dari server = nilai terhitung terbaru.
  useEffect(() => {
    setOptimistic({});
  }, [sheet]);

  useEffect(() => {
    if (active) activeInputRef.current?.focus();
  }, [editing, active]);

  const addressOf = (rowIndex: number, columnIndex: number) => cellAddress(columnIndex, rowIndex);

  const isActive = (rowId: string, columnKey: string) =>
    active !== null && active.rowId === rowId && active.columnKey === columnKey;

  /**
   * Klik sel, seperti Excel:
   *   - sel belum aktif   -> PILIH sel (isi terhitung terlihat di sel)
   *   - sel aktif di-klik -> mulai mengedit isinya
   *   - sedang mengedit  -> klik sel lain = masukkan ALAMAT sel itu ke formula
   */
  const handleCellClick = (rowId: string, columnKey: string, rowIndex: number, columnIndex: number, raw: string, shift = false) => {
    if (!canWrite || locked) return;
    if (draggedRef.current) { draggedRef.current = false; return; }
    const point = { row: rowIndex, col: columnIndex };
    if (shift && selection) { setSelection({ start: selection.start, end: point }); return; }
    if (!editing) setSelection({ start: point, end: point });
    if (isActive(rowId, columnKey)) {
      if (!editing) {
        setEditing(true);
        setDraft(raw);
      }
      return;
    }
    if (editing && draft.trim().startsWith("=")) {
      insertText(addressOf(rowIndex, columnIndex));
      return;
    }
    if (editing) commit();
    setActive({ rowId, columnKey });
    setDraft(raw);
    setEditing(false);
    setError(null);
  };

  /** Menambahkan teks ke formula; formula selalu diawali "=". */
  const insertText = (text: string) => {
    setDraft((prev) => {
      const base = prev.trim() === "" ? "=" : prev;
      const withLeading = base.startsWith("=") ? base : `=${base}`;
      return `${withLeading}${text}`;
    });
    setEditing(true);
  };

  const activeCell = (() => {
    if (!active) return null;
    const rowIndex = sheet.rows.findIndex((row) => row.id === active.rowId);
    if (rowIndex === -1) return null;
    const columnIndex = sheet.columns.findIndex((column) => column.key === active.columnKey);
    if (columnIndex === -1) return null;
    const cell = sheet.rows[rowIndex]?.cells[columnIndex];
    if (!cell) return null;
    return { rowIndex, columnIndex, cell };
  })();

  const mergeBounds = (sheet.merges ?? []).map(m => rangeBounds(sheet, m));
  let selectedBounds: GridBounds | null = selection ? {
    top: Math.min(selection.start.row, selection.end.row), bottom: Math.max(selection.start.row, selection.end.row),
    left: Math.min(selection.start.col, selection.end.col), right: Math.max(selection.start.col, selection.end.col),
  } : null;
  if (selectedBounds) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of mergeBounds) {
        const current: GridBounds = selectedBounds!;
        if (!intersects(current, b)) continue;
        const next: GridBounds = { top: Math.min(current.top, b.top), bottom: Math.max(current.bottom, b.bottom),
          left: Math.min(current.left, b.left), right: Math.max(current.right, b.right) };
        if (JSON.stringify(next) !== JSON.stringify(selectedBounds)) { selectedBounds = next; changed = true; }
      }
    }
  }
  const selectedRange = selectedBounds && sheet.rows[selectedBounds.bottom] && sheet.columns[selectedBounds.right]
    ? boundsRange(sheet, selectedBounds) : null;
  const rangeLabel = selectedBounds ? `${cellAddress(selectedBounds.left, selectedBounds.top)}:${cellAddress(selectedBounds.right, selectedBounds.bottom)}` : "—";
  const mergeSelected = selectedBounds ? mergeBounds.some(b => intersects(b, selectedBounds!)) : false;
  const canMerge = selectedBounds && !mergeSelected && (selectedBounds.top !== selectedBounds.bottom || selectedBounds.left !== selectedBounds.right);
  const mutateRange = (fn: () => Promise<CellCommitResult>) => {
    setError(null);
    startTransition(async () => {
      try { const result = await fn(); if (!result.ok) setError(result.error ?? "Perubahan tidak tersimpan."); }
      catch { setError("Perubahan tidak tersimpan. Coba lagi."); }
    });
  };

  const commit = () => {
    if (!active || !activeCell) return;
    if (!editing || locked) return;
    const raw = draft;
    const key = `${active.rowId}:${active.columnKey}`;
    setEditing(false);
    if (raw.trim() === rawCell(activeCell.cell).trim()) return;
    setOptimistic((prev) => ({ ...prev, [key]: raw.trim() === "" ? "—" : raw }));
    startTransition(async () => {
      const result = await onCommitCell(active.rowId, active.columnKey, raw);
      if (!result.ok) {
        setError(result.error ?? "Nilai tidak tersimpan.");
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    });
  };

  const cancel = () => {
    if (activeCell) setDraft(rawCell(activeCell.cell));
    setEditing(false);
    setError(null);
  };

  return (
    <div ref={containerRef} className="excel-sheet">
      <div className="overflow-x-auto">
        <table className={`sheet-table ${compact ? "" : "min-w-[420px]"}`}>
          <thead>
            <tr>
              <th scope="col" className="w-8" aria-label="Nomor baris" />
              <th scope="col" className="text-left">Uraian</th>
              {sheet.columns.map((column, columnIndex) => (
                <th key={column.key} scope="col" className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    <span className="font-mono text-2xs text-ink-400">{columnLetter(columnIndex)}</span>
                    {column.label}
                    {canWrite && onRemoveColumn && sheet.columns.length > 1 ? (
                      <button
                        type="button"
                        title={`Hapus kolom ${column.label}`}
                        className="text-2xs text-ink-400 hover:text-negative-700"
                        disabled={pending}
                        onClick={() => onRemoveColumn(column.key)}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                </th>
              ))}
              {canWrite && onRemoveRow ? <th scope="col" className="w-8" aria-label="Aksi" /> : null}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={row.id}>
                <th scope="row" className="w-8 bg-ink-50 text-center font-mono text-2xs text-ink-400">
                  {rowIndex + 1}
                </th>
                <td className="sheet-label min-w-[130px]">
                  {onRenameRow && canWrite ? (
                    <SheetCellInput raw={row.label} display={row.label} align="left" mono={false}
                      title={`Nama poin baris ${rowIndex + 1}`}
                      onCommit={label => onRenameRow(row.id, label)} />
                  ) : row.label}
                </td>
                {row.cells.map((cell, columnIndex) => {
                  const merged = mergeBounds.find(b => contains(b, { row: rowIndex, col: columnIndex }));
                  if (merged && (rowIndex !== merged.top || columnIndex !== merged.left)) return null;
                  const selected = selectedBounds && contains(selectedBounds, { row: rowIndex, col: columnIndex });
                  const fill = sheet.styles?.[row.id]?.[cell.key] ?? "none";
                  const address = addressOf(rowIndex, columnIndex);
                  const cellActive = isActive(row.id, cell.key);
                  const key = `${row.id}:${cell.key}`;
                  const shown = optimistic[key];
                  return (
                    <td
                      key={cell.key}
                      rowSpan={merged ? merged.bottom - merged.top + 1 : undefined}
                      colSpan={merged ? merged.right - merged.left + 1 : undefined}
                      className={`p-0 text-right sheet-fill-${fill} ${selected ? "sheet-selected" : ""} ${cellActive ? "ring-1 ring-inset ring-accent-500" : ""}`}
                      data-cell={address}
                      aria-selected={Boolean(selected)}
                      onPointerDown={(event) => {
                        if (!canWrite || locked || editing || event.button !== 0) return;
                        dragRef.current = true;
                        draggedRef.current = false;
                        const point = { row: rowIndex, col: columnIndex };
                        setSelection(prev => ({ start: event.shiftKey && prev ? prev.start : point, end: point }));
                      }}
                      onPointerEnter={() => {
                        if (!dragRef.current || editing) return;
                        draggedRef.current = true;
                        setSelection(prev => prev ? { ...prev, end: { row: rowIndex, col: columnIndex } } : null);
                      }}
                      onPointerUp={() => {
                        if (!draggedRef.current || !selection) return;
                        const point = selection.start;
                        const startRow = sheet.rows[point.row];
                        const startCell = startRow?.cells[point.col];
                        if (startRow && startCell) {
                          setActive({ rowId: startRow.id, columnKey: startCell.key });
                          setDraft(rawCell(startCell));
                          setEditing(false);
                        }
                      }}
                    >
                      {cellActive ? (
                        <input
                          ref={activeInputRef}
                          data-testid={`cell-input-${address}`}
                          className={`w-full border-0 bg-transparent px-1 py-0.5 text-right font-mono tabular-nums outline-none ${
                            pending ? "opacity-60" : ""
                          }`}
                          value={editing ? draft : shown ?? displayCell(cell)}
                          disabled={!canWrite || locked}
                          aria-label={`Cell ${address}`}
                          onDoubleClick={() => { setDraft(rawCell(cell)); setEditing(true); }}
                          title={cell.error ?? cell.note ?? `${row.label} · ${row.ref}_${cell.key}`}
                          onChange={(event) => { setEditing(true); setDraft(event.target.value); }}
                          onKeyDown={(event) => {
                            if (!editing && (event.key === "F2" || event.key === "Enter")) {
                              event.preventDefault();
                              setDraft(rawCell(cell));
                              setEditing(true);
                              return;
                            }
                            if (!editing && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
                              event.preventDefault();
                              setDraft(event.key);
                              setEditing(true);
                              return;
                            }
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commit();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancel();
                            }
                          }}
                          onBlur={(event) => {
                            const next = event.relatedTarget as Node | null;
                            if (next && containerRef.current?.contains(next)) return;
                            commit();
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          data-testid={`cell-${address}`}
                          className={`block w-full cursor-cell px-1 py-0.5 text-right font-mono tabular-nums hover:bg-accent-50 ${
                            cell.error !== null ? "text-negative-700" : cell.note !== null ? "text-caution-700" : ""
                          } ${canWrite ? "" : "cursor-default"}`}
                          title={
                            cell.error ?? cell.note ?? `${address} · ${row.label} (${row.ref}_${cell.key})`
                          }
                          disabled={!canWrite || locked}
                          onClick={(event) => handleCellClick(row.id, cell.key, rowIndex, columnIndex, rawCell(cell), event.shiftKey)}
                          onDoubleClick={() => {
                            setActive({ rowId: row.id, columnKey: cell.key });
                            setDraft(rawCell(cell));
                            setEditing(true);
                          }}
                          onKeyDown={(event) => {
                            if (!canWrite) return;
                            const printable = event.key.length === 1;
                            if (event.key === "Enter" || event.key === "F2") {
                              event.preventDefault();
                              setActive({ rowId: row.id, columnKey: cell.key });
                              setDraft(rawCell(cell));
                              setEditing(true);
                              return;
                            }
                            if (printable && !event.ctrlKey && !event.metaKey && !event.altKey) {
                              event.preventDefault();
                              setActive({ rowId: row.id, columnKey: cell.key });
                              setSelection({ start: { row: rowIndex, col: columnIndex }, end: { row: rowIndex, col: columnIndex } });
                              setDraft(event.key);
                              setEditing(true);
                            }
                          }}
                        >
                          {cell.error ? "#ERROR!" : shown ?? displayCell(cell)}
                        </button>
                      )}
                    </td>
                  );
                })}
                {canWrite && onRemoveRow ? (
                  <td className="text-center">
                    <button
                      type="button"
                      title={`Hapus baris ${row.label}`}
                      className="text-2xs text-ink-400 hover:text-negative-700"
                      disabled={pending}
                      onClick={() => onRemoveRow(row.id)}
                    >
                      ×
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(onMerge || onUnmerge || onSetFill) && canWrite ? (
        <details className="border-t border-ink-100 px-1 py-0.5 text-2xs text-ink-600">
          <summary className="w-fit cursor-pointer select-none hover:text-accent-700">Format sel</summary>
          <div className="flex flex-wrap items-center gap-1 py-1">
            <span className="mr-1 font-mono" data-testid="selected-range">{rangeLabel}</span>
            {onMerge ? <button type="button" className="btn-secondary text-2xs" disabled={locked || !canMerge || editing}
              onClick={() => selectedRange && mutateRange(() => onMerge(selectedRange))}>Merge cells</button> : null}
            {onUnmerge ? <button type="button" className="btn-secondary text-2xs" disabled={locked || !mergeSelected || editing}
              onClick={() => selectedRange && mutateRange(() => onUnmerge(selectedRange))}>Unmerge</button> : null}
            {onSetFill ? ([
              ["none", "Tanpa warna"], ["yellow", "Kuning"], ["green", "Hijau"], ["blue", "Biru"], ["pink", "Merah muda"], ["gray", "Abu-abu"],
            ] as Array<[SheetFill, string]>).map(([fill, label]) => (
              <button key={fill} type="button" aria-label={`Warna ${label}`} title={label}
                className={`sheet-swatch sheet-fill-${fill}`} disabled={locked || !selectedRange || editing}
                onClick={() => selectedRange && mutateRange(() => onSetFill(selectedRange, fill))} />
            )) : null}
          </div>
        </details>
      ) : null}

      {canWrite && onAddRow ? (
        <div className="px-1 py-0.5">
          <button
            type="button"
            className="text-2xs text-accent-700 hover:underline"
            disabled={pending}
            onClick={onAddRow}
          >
            + baris
          </button>
        </div>
      ) : null}

      {error || activeCell?.cell.error ? <p role="alert" className="px-1 text-2xs text-negative-700">{error ?? activeCell?.cell.error}</p> : null}
    </div>
  );
}
