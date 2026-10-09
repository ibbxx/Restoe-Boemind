"use client";

/**
 * SEL GRID PROJECT (server action wiring).
 *
 * Satu tempat yang menghubungkan komponen sel spreadsheet dengan server action
 * yang menyimpan nilainya. Tidak ada perhitungan di sini: nilai baris/kolom
 * dihitung server, dan `AhsResult` tetap output engine yang dipakai UI.
 */

import { updateAhsInputCellAction, updateCostItemCellAction } from "@/lib/actions/ahs";
import { renameVendorColumnAction, updateVendorPriceCellAction } from "@/lib/actions/vendors";
import { setWorkbookCellAction } from "@/lib/actions/workbook";
import type { WorkbookCellMeta } from "@/lib/types/workbook";
import { SheetCellInput } from "./sheet-cell-input";

interface CellProps {
  raw: string;
  display: string;
  align?: "left" | "right";
  mono?: boolean;
  title?: string;
  invalid?: boolean;
  readOnly?: boolean;
  workbookCell?: WorkbookCellMeta;
  address?: string;
  alias?: string;
}

async function commitWorkbookCell(projectId: string, cell: WorkbookCellMeta, raw: string) {
  const result = await setWorkbookCellAction(projectId, cell.key, raw);
  return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) };
}

/** Sel input AHS (volume, harga jual, rate pajak, marketing, notes, …). */
export function AhsInputCell({
  projectId,
  field,
  ...props
}: CellProps & { projectId: string; field: string }) {
  const workbookCell = props.workbookCell;
  return (
    <SheetCellInput
      {...props}
      raw={workbookCell?.formula ?? props.raw}
      address={workbookCell?.address ?? props.address}
      alias={workbookCell?.displayAlias ?? workbookCell?.alias ?? props.alias}
      onCommit={async (raw) => {
        if (workbookCell) return commitWorkbookCell(projectId, workbookCell, raw);
        const result = await updateAhsInputCellAction(projectId, field, raw);
        return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) };
      }}
    />
  );
}

/** Sel cost item (kategori, deskripsi, unit, rate, qty) — total tetap engine. */
export function CostItemCell({
  projectId,
  itemId,
  field,
  ...props
}: CellProps & { projectId: string; itemId: string; field: string }) {
  const workbookCell = props.workbookCell;
  return (
    <SheetCellInput
      {...props}
      raw={workbookCell?.formula ?? props.raw}
      address={workbookCell?.address ?? props.address}
      alias={workbookCell?.displayAlias ?? workbookCell?.alias ?? props.alias}
      onCommit={async (raw) => {
        if (workbookCell) return commitWorkbookCell(projectId, workbookCell, raw);
        const result = await updateCostItemCellAction(projectId, itemId, field, raw);
        return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) };
      }}
    />
  );
}

/** Nama kolom vendor (header) — bisa langsung diganti dari workspace. */
export function VendorNameCell({
  projectId,
  vendorId,
  ...props
}: CellProps & { projectId: string; vendorId: string }) {
  return (
    <SheetCellInput
      {...props}
      onCommit={async (raw) => {
        const result = await renameVendorColumnAction(projectId, vendorId, raw);
        return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) };
      }}
    />
  );
}

/** Sel harga vendor (harga dasar, komponen, note) di grid evaluasi vendor. */
export function VendorPriceCell({
  projectId,
  vendorId,
  field,
  ...props
}: CellProps & { projectId: string; vendorId: string; field: string }) {
  const workbookCell = props.workbookCell;
  return (
    <SheetCellInput
      {...props}
      raw={workbookCell?.formula ?? props.raw}
      address={workbookCell?.address ?? props.address}
      alias={workbookCell?.displayAlias ?? workbookCell?.alias ?? props.alias}
      onCommit={async (raw) => {
        if (workbookCell) return commitWorkbookCell(projectId, workbookCell, raw);
        const result = await updateVendorPriceCellAction(projectId, vendorId, field, raw);
        return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) };
      }}
    />
  );
}
