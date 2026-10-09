"use client";

import { useState, useTransition } from "react";
import { resetWorkbookGridCellOverrideAction } from "@/lib/actions/sheets";
import { setWorkbookCellAction, setWorkbookGridValueAction } from "@/lib/actions/workbook";
import { formatNumber } from "@/lib/format";
import type { WorkbookGridCellRole, WorkbookGridDoc } from "@/lib/types/sheets";
import type { WorkbookCellMeta, WorkbookLayout } from "@/lib/types/workbook";
import { workbookColumnLetter } from "@/lib/workbook/layout";
import { workbookRangeBounds, workbookStyleKey } from "@/lib/workbook/document";

function shown(cell: WorkbookCellMeta): string {
  if (cell.formula) return cell.value === null ? cell.formula : formatNumber(cell.value, 2);
  if (cell.text !== undefined && cell.text !== null) return cell.text;
  return cell.value === null ? "" : formatNumber(cell.value, 2);
}

function raw(cell: WorkbookCellMeta): string {
  if (cell.formula) return cell.formula;
  if (cell.text !== undefined && cell.text !== null) return cell.text;
  return cell.value === null ? "" : String(cell.value);
}

function roleFor(cell: WorkbookCellMeta): WorkbookGridCellRole {
  if (cell.kind === "engine") return "engine-output";
  if (cell.kind === "label") return "label";
  if (cell.kind === "free") return "free";
  return "business-input";
}

export function GlobalWorkbookGrid({ projectId, layout, document, canWrite }: {
  projectId: string; layout: WorkbookLayout; document: WorkbookGridDoc; canWrite: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mergeBounds = document.merges.map((merge) => ({ merge, bounds: workbookRangeBounds(document, merge) }));
  const rowTemplate = document.rows.map((row) => `${row.size}px`).join(" ");

  const commit = (cell: WorkbookCellMeta, rowId: string, columnId: string) => {
    const next = drafts[cell.key] ?? raw(cell);
    if (next === raw(cell)) return;
    setError(null);
    startTransition(async () => {
      const role = roleFor(cell);
      const result = role === "business-input"
        ? await setWorkbookCellAction(projectId, cell.key, next)
        : await setWorkbookGridValueAction(projectId, { cellKey: cell.key, rowId, columnId, role, raw: next });
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="global-workbook-grid-shell">
      {error ? <p role="alert" className="workbook-toolbar-error">{error}</p> : null}
      <div
        className="global-workbook-grid"
        data-testid="workbook-physical-grid"
        style={{ gridTemplateColumns: "var(--workbook-column-template)", gridTemplateRows: rowTemplate }}
      >
        {document.rows.flatMap((row, rowIndex) => document.columns.flatMap((column, columnIndex) => {
          const containing = mergeBounds.find(({ bounds }) => rowIndex >= bounds.top && rowIndex <= bounds.bottom && columnIndex >= bounds.left && columnIndex <= bounds.right);
          if (containing && (rowIndex !== containing.bounds.top || columnIndex !== containing.bounds.left)) return [];
          const address = `${workbookColumnLetter(columnIndex)}${rowIndex + 1}`;
          const cell = layout.byAddress[address];
          if (!cell) return [];
          const coordinateKey = workbookStyleKey(row.id, column.id);
          const style = document.styles[coordinateKey];
          const span = containing ? {
            columns: containing.bounds.right - containing.bounds.left + 1,
            rows: containing.bounds.bottom - containing.bounds.top + 1,
          } : { columns: 1, rows: 1 };
          const value = drafts[cell.key] ?? shown(cell);
          return [
            <div key={coordinateKey} className={`global-workbook-cell sheet-fill-${style?.fill ?? "none"} ${style?.wrap ? "is-wrapped" : ""} ${cell.overridden ? "is-overridden" : ""}`}
              style={{ gridColumn: `${columnIndex + 1} / span ${span.columns}`, gridRow: `${rowIndex + 1} / span ${span.rows}` }}
              data-workbook-address={address} data-workbook-key={cell.key} data-workbook-raw={raw(cell)} title={`${address} · ${cell.label}`}>
              <input aria-label={`Cell ${address}`} value={value} readOnly={!canWrite} disabled={pending}
                onFocus={() => setDrafts((current) => ({ ...current, [cell.key]: raw(cell) }))}
                onChange={(event) => setDrafts((current) => ({ ...current, [cell.key]: event.target.value }))}
                onBlur={() => commit(cell, row.id, column.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                  if (event.key === "Escape") { setDrafts((current) => ({ ...current, [cell.key]: shown(cell) })); event.currentTarget.blur(); }
                }} />
              {cell.overridden && canWrite ? <button type="button" className="cell-reset-override" title="Reset ke hasil Calculation Engine"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => startTransition(async () => { const result = await resetWorkbookGridCellOverrideAction(projectId, { rowId: row.id, columnId: column.id }) as { ok: boolean; error?: string }; if (!result.ok) setError(result.error ?? "Override tidak dapat di-reset."); })}>↺</button> : null}
            </div>,
          ];
        }))}
      </div>
    </div>
  );
}
