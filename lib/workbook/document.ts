import type {
  ProjectSheetsDoc,
  WorkbookAxisDef,
  WorkbookGridDoc,
  WorkbookGridRange,
} from "../types/sheets";

export const DEFAULT_WORKBOOK_COLUMN_WIDTH = 96;
export const DEFAULT_WORKBOOK_ROW_HEIGHT = 24;
export const MIN_WORKBOOK_COLUMN_WIDTH = 48;
export const MAX_WORKBOOK_COLUMN_WIDTH = 520;
export const MIN_WORKBOOK_ROW_HEIGHT = 20;
export const MAX_WORKBOOK_ROW_HEIGHT = 320;

const axis = (kind: "row" | "column", count: number): WorkbookAxisDef[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${index + 1}`,
    size: kind === "column" ? DEFAULT_WORKBOOK_COLUMN_WIDTH : DEFAULT_WORKBOOK_ROW_HEIGHT,
  }));

export function defaultWorkbookGrid(columnCount = 12, rowCount = 64): WorkbookGridDoc {
  return {
    rows: axis("row", rowCount),
    columns: axis("column", columnCount),
    placements: {},
    cells: {},
    merges: [],
    styles: {},
    sections: [],
  };
}

function validAxes(value: unknown, fallback: WorkbookAxisDef[]): WorkbookAxisDef[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const ids = new Set<string>();
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Partial<WorkbookAxisDef>;
    if (typeof item.id !== "string" || item.id === "" || ids.has(item.id)) return [];
    if (typeof item.size !== "number" || !Number.isFinite(item.size)) return [];
    ids.add(item.id);
    return [{ id: item.id, size: item.size, ...(item.manual ? { manual: true } : {}) }];
  });
}

/** Pure, non-mutating v1-v3 -> v4 migration. */
export function migrateWorkbookGrid(doc: Partial<ProjectSheetsDoc>): WorkbookGridDoc {
  const fallback = defaultWorkbookGrid();
  const source = doc.workbook;
  if (!source || typeof source !== "object") return fallback;
  return {
    rows: validAxes(source.rows, fallback.rows),
    columns: validAxes(source.columns, fallback.columns),
    placements: source.placements && typeof source.placements === "object" ? structuredClone(source.placements) : {},
    cells: source.cells && typeof source.cells === "object" ? structuredClone(source.cells) : {},
    merges: Array.isArray(source.merges) ? structuredClone(source.merges) : [],
    styles: source.styles && typeof source.styles === "object" ? structuredClone(source.styles) : {},
    sections: Array.isArray(source.sections) ? structuredClone(source.sections) : [],
  };
}

export function ensureWorkbookAxes(grid: WorkbookGridDoc, columnCount: number, rowCount: number): WorkbookGridDoc {
  const next = structuredClone(grid);
  while (next.columns.length < columnCount) {
    next.columns.push({ id: `column-${crypto.randomUUID()}`, size: DEFAULT_WORKBOOK_COLUMN_WIDTH });
  }
  while (next.rows.length < rowCount) {
    next.rows.push({ id: `row-${crypto.randomUUID()}`, size: DEFAULT_WORKBOOK_ROW_HEIGHT });
  }
  return next;
}

export function workbookStyleKey(rowId: string, columnId: string): string {
  return `${rowId}::${columnId}`;
}

export function workbookRangeBounds(grid: WorkbookGridDoc, range: WorkbookGridRange) {
  const a = grid.rows.findIndex((item) => item.id === range.startRowId);
  const b = grid.rows.findIndex((item) => item.id === range.endRowId);
  const c = grid.columns.findIndex((item) => item.id === range.startColumnId);
  const d = grid.columns.findIndex((item) => item.id === range.endColumnId);
  if ([a, b, c, d].some((value) => value < 0)) throw new Error("Range workbook tidak valid.");
  return { top: Math.min(a, b), bottom: Math.max(a, b), left: Math.min(c, d), right: Math.max(c, d) };
}

export function rangesIntersect(
  first: ReturnType<typeof workbookRangeBounds>,
  second: ReturnType<typeof workbookRangeBounds>,
): boolean {
  return first.left <= second.right && first.right >= second.left && first.top <= second.bottom && first.bottom >= second.top;
}
