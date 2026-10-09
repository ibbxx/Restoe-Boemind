import type { SheetRange } from "./types/sheets";

export interface GridPoint { row: number; col: number }
export interface GridBounds { top: number; bottom: number; left: number; right: number }
interface GridShape {
  rows: Array<{ id: string }>;
  columns: Array<{ key: string }>;
}

export function rangeBounds(sheet: GridShape, range: SheetRange): GridBounds {
  const rows = [range.startRowId, range.endRowId].map(id => sheet.rows.findIndex(row => row.id === id));
  const cols = [range.startColumnKey, range.endColumnKey].map(key => sheet.columns.findIndex(col => col.key === key));
  if ([...rows, ...cols].some(index => index < 0)) throw new Error("Range merujuk baris atau kolom yang tidak tersedia.");
  return { top: Math.min(...rows), bottom: Math.max(...rows), left: Math.min(...cols), right: Math.max(...cols) };
}

export function boundsRange(sheet: GridShape, bounds: GridBounds): SheetRange {
  return {
    startRowId: sheet.rows[bounds.top]!.id, endRowId: sheet.rows[bounds.bottom]!.id,
    startColumnKey: sheet.columns[bounds.left]!.key, endColumnKey: sheet.columns[bounds.right]!.key,
  };
}

export function intersects(a: GridBounds, b: GridBounds): boolean {
  return a.top <= b.bottom && b.top <= a.bottom && a.left <= b.right && b.left <= a.right;
}

export function contains(bounds: GridBounds, point: GridPoint): boolean {
  return point.row >= bounds.top && point.row <= bounds.bottom && point.col >= bounds.left && point.col <= bounds.right;
}
