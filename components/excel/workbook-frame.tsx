"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteWorkbookAxisAction, insertWorkbookAxisAction, mergeWorkbookCellsAction, resetWorkbookAxisSizeAction, resizeWorkbookAxisAction, setWorkbookRangePresentationAction, unmergeWorkbookCellsAction } from "@/lib/actions/sheets";
import { setWorkbookCellAction, setWorkbookGridValueAction } from "@/lib/actions/workbook";
import type { WorkbookGridDoc, WorkbookGridRange } from "@/lib/types/sheets";
import type { WorkbookLayout } from "@/lib/types/workbook";
import { workbookColumnLetter } from "@/lib/workbook/layout";
import { DEFAULT_WORKBOOK_COLUMN_WIDTH, DEFAULT_WORKBOOK_ROW_HEIGHT, MAX_WORKBOOK_COLUMN_WIDTH, MAX_WORKBOOK_ROW_HEIGHT, MIN_WORKBOOK_COLUMN_WIDTH, MIN_WORKBOOK_ROW_HEIGHT } from "@/lib/workbook/document";

interface WorkbookCoordinateContextValue { activeAddress: string | null; setActiveAddress: (address: string) => void }
const WorkbookCoordinateContext = createContext<WorkbookCoordinateContextValue | null>(null);
export function useWorkbookCoordinates() { return useContext(WorkbookCoordinateContext); }

function addressIndex(address: string | null) {
  const match = address ? /^([A-Z]+)(\d+)$/.exec(address) : null;
  if (!match) return null;
  let column = 0;
  for (const char of match[1]!) column = column * 26 + char.charCodeAt(0) - 64;
  return { column: column - 1, row: Number(match[2]!) - 1 };
}

function rangeFor(doc: WorkbookGridDoc, first: string, second: string): WorkbookGridRange | null {
  const a = addressIndex(first); const b = addressIndex(second);
  if (!a || !b || !doc.rows[a.row] || !doc.rows[b.row] || !doc.columns[a.column] || !doc.columns[b.column]) return null;
  return { startRowId: doc.rows[a.row]!.id, endRowId: doc.rows[b.row]!.id, startColumnId: doc.columns[a.column]!.id, endColumnId: doc.columns[b.column]!.id };
}

export function WorkbookFrame({ projectId, layout, document, canWrite, children }: {
  projectId: string; layout: WorkbookLayout; document: WorkbookGridDoc; canWrite: boolean; children: React.ReactNode;
}) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const [formula, setFormula] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [columnSizes, setColumnSizes] = useState(() => document.columns.map((item) => item.size));
  const [rowSizes, setRowSizes] = useState(() => document.rows.map((item) => item.size));
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const context = useMemo(() => ({ activeAddress, setActiveAddress }), [activeAddress]);
  const columns = document.columns.map((_, index) => workbookColumnLetter(index));
  const rows = document.rows.map((_, index) => index + 1);
  const active = activeAddress ? layout.byAddress[activeAddress] : undefined;
  const selectedRange = activeAddress && selectionStart ? rangeFor(document, selectionStart, activeAddress) : null;
  const coordinateStyle = columnSizes.reduce<Record<string, string | number>>((style, size, index) => {
    style[`--workbook-column-${index + 1}`] = `${size}px`;
    return style;
  }, {
    "--workbook-columns": columns.length,
    "--workbook-column-template": columnSizes.map((size) => `${size}px`).join(" "),
    "--workbook-width": `${columnSizes.reduce((sum, size) => sum + size, 0)}px`,
  });

  useEffect(() => {
    const fillClasses = ["sheet-fill-yellow", "sheet-fill-green", "sheet-fill-blue", "sheet-fill-pink", "sheet-fill-gray"];
    for (const [cellKey, placement] of Object.entries(document.placements)) {
      const cell = layout.byKey[cellKey];
      if (!cell) continue;
      const style = document.styles[`${placement.rowId}::${placement.columnId}`];
      for (const element of rootRef.current?.querySelectorAll<HTMLElement>(`[data-workbook-address="${cell.address}"]`) ?? []) {
        element.classList.remove(...fillClasses);
        if (style?.fill && style.fill !== "none") element.classList.add(`sheet-fill-${style.fill}`);
        element.style.whiteSpace = style?.wrap ? "normal" : "";
        element.style.overflowWrap = style?.wrap ? "anywhere" : "";
      }
    }
  }, [document.placements, document.styles, layout]);

  const run = (operation: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      const result = await operation() as { ok?: boolean; error?: string };
      if (!result?.ok) setError(result?.error ?? "Perubahan workbook tidak tersimpan.");
    });
  };
  const commitFormulaBar = () => {
    if (!active || !activeAddress) return;
    const index = addressIndex(activeAddress);
    if (!index) return;
    if (active.kind !== "engine" && active.kind !== "free" && active.kind !== "label") {
      run(() => setWorkbookCellAction(projectId, active.key, formula));
      return;
    }
    const role = active.kind === "engine" ? "engine-output" : active.kind;
    run(() => setWorkbookGridValueAction(projectId, {
      cellKey: active.key,
      rowId: document.rows[index.row]!.id,
      columnId: document.columns[index.column]!.id,
      role,
      raw: formula,
    }));
  };
  const selectAddress = (address: string, extend: boolean, raw?: string) => {
    setActiveAddress(address);
    setSelectionStart((current) => extend && current ? current : address);
    const cell = layout.byAddress[address];
    setFormula(raw ?? cell?.formula ?? (cell?.value === null || cell?.value === undefined ? "" : String(cell.value)));
  };
  const startResize = (axis: "row" | "column", index: number, event: React.PointerEvent) => {
    if (!canWrite) return;
    event.preventDefault(); event.stopPropagation();
    const origin = axis === "column" ? event.clientX : event.clientY;
    const initial = axis === "column" ? columnSizes[index]! : rowSizes[index]!;
    const minimum = axis === "column" ? MIN_WORKBOOK_COLUMN_WIDTH : MIN_WORKBOOK_ROW_HEIGHT;
    const maximum = axis === "column" ? MAX_WORKBOOK_COLUMN_WIDTH : MAX_WORKBOOK_ROW_HEIGHT;
    let finalSize = initial;
    const move = (pointer: PointerEvent) => {
      finalSize = Math.round(Math.min(maximum, Math.max(minimum, initial + (axis === "column" ? pointer.clientX : pointer.clientY) - origin)));
      if (axis === "column") setColumnSizes((sizes) => sizes.map((size, i) => i === index ? finalSize : size));
      else setRowSizes((sizes) => sizes.map((size, i) => i === index ? finalSize : size));
    };
    const end = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      const id = axis === "column" ? document.columns[index]!.id : document.rows[index]!.id;
      run(() => resizeWorkbookAxisAction(projectId, { axis, id, size: finalSize, manual: axis === "row" }));
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };
  const autoFit = (axis: "row" | "column", index: number) => {
    const selector = axis === "column" ? `[data-workbook-address^="${workbookColumnLetter(index)}"]` : `[data-workbook-address$="${index + 1}"]`;
    const nodes = [...(rootRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])];
    const measured = nodes.reduce((size, node) => Math.max(size, axis === "column" ? node.scrollWidth + 16 : node.scrollHeight + 8), 0);
    const fallback = axis === "column" ? DEFAULT_WORKBOOK_COLUMN_WIDTH : DEFAULT_WORKBOOK_ROW_HEIGHT;
    const size = Math.max(fallback, measured);
    if (axis === "column") setColumnSizes((sizes) => sizes.map((value, i) => i === index ? size : value));
    else setRowSizes((sizes) => sizes.map((value, i) => i === index ? size : value));
    const id = axis === "column" ? document.columns[index]!.id : document.rows[index]!.id;
    run(() => resetWorkbookAxisSizeAction(projectId, { axis, id, size }));
  };

  return <WorkbookCoordinateContext.Provider value={context}>
    <div ref={rootRef} className="workbook-coordinate-frame" style={coordinateStyle as React.CSSProperties}>
      <div className="workbook-global-toolbar" role="toolbar" aria-label="Toolbar workbook global">
        <output className="workbook-address-box" title="Alamat/range aktif">{selectionStart && activeAddress && selectionStart !== activeAddress ? `${selectionStart}:${activeAddress}` : activeAddress ?? "A1"}</output>
        <span aria-hidden="true" className="font-semibold">fx</span>
        <input aria-label="Formula bar" className="workbook-formula-bar" value={formula} disabled={!canWrite || !active || pending} onChange={(event) => setFormula(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && active) { event.preventDefault(); commitFormulaBar(); } }} />
        <button type="button" disabled={!canWrite || !activeAddress || pending} onClick={() => { const index = addressIndex(activeAddress); if (index) run(() => insertWorkbookAxisAction(projectId, { axis: "row", afterId: document.rows[index.row]!.id })); }}>+ Baris</button>
        <button type="button" disabled={!canWrite || !activeAddress || pending} onClick={() => { const index = addressIndex(activeAddress); if (index) run(() => insertWorkbookAxisAction(projectId, { axis: "column", afterId: document.columns[index.column]!.id })); }}>+ Kolom</button>
        <button type="button" disabled={!canWrite || !activeAddress || pending} onClick={() => { const index = addressIndex(activeAddress); if (index) run(() => deleteWorkbookAxisAction(projectId, { axis: "row", id: document.rows[index.row]!.id })); }}>Hapus baris</button>
        <button type="button" disabled={!canWrite || !activeAddress || pending} onClick={() => { const index = addressIndex(activeAddress); if (index) run(() => deleteWorkbookAxisAction(projectId, { axis: "column", id: document.columns[index.column]!.id })); }}>Hapus kolom</button>
        <button type="button" disabled={!canWrite || !selectedRange || pending} onClick={() => selectedRange && run(() => mergeWorkbookCellsAction(projectId, selectedRange))}>Merge</button>
        <button type="button" disabled={!canWrite || !selectedRange || pending} onClick={() => selectedRange && run(() => unmergeWorkbookCellsAction(projectId, selectedRange))}>Unmerge</button>
        <button type="button" disabled={!canWrite || !selectedRange || pending} onClick={() => selectedRange && run(() => setWorkbookRangePresentationAction(projectId, { range: selectedRange, wrap: true }))}>Wrap Text</button>
        <label className="workbook-color-control">Warna <select disabled={!canWrite || !selectedRange || pending} defaultValue="none" onChange={(event) => selectedRange && run(() => setWorkbookRangePresentationAction(projectId, { range: selectedRange, fill: event.target.value as "none" | "yellow" | "green" | "blue" | "pink" | "gray" }))}><option value="none">Tanpa warna</option><option value="yellow">Kuning</option><option value="green">Hijau</option><option value="blue">Biru</option><option value="pink">Merah muda</option><option value="gray">Abu-abu</option></select></label>
        <button type="button" disabled={!canWrite || !activeAddress || pending} onClick={() => { const index = addressIndex(activeAddress); if (index) autoFit("column", index.column); }}>Auto-fit kolom</button>
        <button type="button" disabled={!canWrite || !activeAddress || pending} onClick={() => { const index = addressIndex(activeAddress); if (index) autoFit("row", index.row); }}>Auto-fit baris</button>
      </div>
      {error ? <p role="alert" className="workbook-toolbar-error">{error}</p> : null}
      <div className="workbook-coordinate-corner" title="Cell aktif">{activeAddress ?? "A1"}</div>
      <div className="workbook-column-headers" aria-label="Koordinat kolom workbook">{columns.map((column, index) => <span key={document.columns[index]!.id} style={{ width: columnSizes[index] }} onClick={() => selectAddress(`${column}1`, false)}>{column}<i className="workbook-column-resizer" role="separator" aria-label={`Ubah lebar kolom ${column}`} onPointerDown={(event) => startResize("column", index, event)} onDoubleClick={() => autoFit("column", index)} /></span>)}</div>
      <div className="workbook-coordinate-body" onPointerDown={(event) => { if (!(event.target instanceof Element)) return; const cell = event.target.closest<HTMLElement>("[data-workbook-address]"); const address = cell?.dataset.workbookAddress; if (address) selectAddress(address, event.shiftKey, cell.dataset.workbookRaw); }}>
        <div className="workbook-row-headers" aria-label="Koordinat baris workbook">{rows.map((row, index) => <span key={document.rows[index]!.id} style={{ height: rowSizes[index] }} onClick={() => selectAddress(`A${row}`, false)}>{row}<i className="workbook-row-resizer" role="separator" aria-label={`Ubah tinggi baris ${row}`} onPointerDown={(event) => startResize("row", index, event)} onDoubleClick={() => autoFit("row", index)} /></span>)}</div>
        {children}
      </div>
    </div>
  </WorkbookCoordinateContext.Provider>;
}
