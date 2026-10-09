/**
 * DYNAMIC SHEET TYPES — spreadsheet tables whose columns, rows and formulas are
 * defined by procurement, not by a template.
 *
 * A sheet is a small document stored per project (`project_sheets.doc`):
 *   sheets[] -> columns[] -> rows[] -> cells{ columnKey: { value | expr } }
 *
 * A cell holds EITHER a literal value (typed by the user) OR an expression
 * (a formula such as `harga_dasar_harga_inu * ppn_rate`). Expressions are
 * evaluated server-side by `lib/services/sheets.ts` through the same safe
 * evaluator the Calculation Engine uses — the engine itself is untouched and
 * `AhsResult` stays the source of truth for the commercial numbers.
 */

export interface SheetColumn {
  /** Stable key, used inside formulas (`<row>_<column>`). */
  key: string;
  label: string;
  /** Presentation only — numbers are stored as numbers in both cases. */
  kind?: "number" | "percent";
}

export interface SheetCell {
  /** Literal number typed by the user; null when the cell is a formula/empty. */
  value: number | null;
  /** Formula (no leading "="): e.g. `harga_dasar_harga_inu * ppn_rate`. */
  expr: string | null;
}

export interface SheetRowDef {
  id: string;
  label: string;
  /** Cells keyed by column key. A missing key means "empty". */
  cells: Record<string, SheetCell>;
}

export interface SheetDef {
  key: string;
  title: string;
  columns: SheetColumn[];
  rows: SheetRowDef[];
  merges?: SheetRange[];
  styles?: Record<string, Record<string, SheetFill>>;
}

/** Stable identities keep formatting attached when rows/columns are appended. */
export interface SheetRange {
  startRowId: string;
  endRowId: string;
  startColumnKey: string;
  endColumnKey: string;
}

export type SheetFill = "none" | "yellow" | "green" | "blue" | "pink" | "gray";

/** Stable physical axes for the one project-wide workbook canvas. */
export interface WorkbookAxisDef {
  id: string;
  /** Width for columns and height for rows, in CSS pixels. */
  size: number;
  /** A manually resized row no longer follows wrap-driven auto height. */
  manual?: boolean;
}

export interface WorkbookGridRange {
  startRowId: string;
  endRowId: string;
  startColumnId: string;
  endColumnId: string;
}

export interface WorkbookGridStyle {
  fill?: SheetFill;
  wrap?: boolean;
}

export type WorkbookGridCellRole = "free" | "label" | "business-input" | "engine-output";

export interface WorkbookGridCellRecord {
  role: WorkbookGridCellRole;
  raw: string | null;
  /** Stable business key when this coordinate mirrors repository/engine data. */
  bindingKey?: string;
  /** User-entered replacement for an engine output. */
  overrideRaw?: string | null;
  expression?: string | null;
  dependencies?: string[];
  computedValue?: number | null;
}

export interface WorkbookSectionAnchor {
  key: string;
  rowId: string;
  columnId: string;
}

/**
 * Physical canvas metadata. Business values stay in their repositories; this
 * document only owns stable placement and presentation state.
 */
export interface WorkbookGridDoc {
  rows: WorkbookAxisDef[];
  columns: WorkbookAxisDef[];
  /** Business/dynamic cell key -> stable physical coordinate. */
  placements: Record<string, { rowId: string; columnId: string }>;
  /** Coordinate key (`rowId::columnId`) -> editable cell content/binding. */
  cells: Record<string, WorkbookGridCellRecord>;
  merges: WorkbookGridRange[];
  styles: Record<string, WorkbookGridStyle>;
  sections: WorkbookSectionAnchor[];
}

export interface ProjectSheetsDoc {
  version: 1 | 2 | 3 | 4 | 5;
  sheets: SheetDef[];
  /** Formula untuk sel bisnis di ProjectWorkspace, keyed by stable cell id. */
  workbookFormulas?: Record<string, WorkbookFormulaEntry>;
  /** Introduced in v4: one persisted coordinate system for the whole project. */
  workbook?: WorkbookGridDoc;
}

export interface WorkbookFormulaEntry {
  /** Rumus yang diketik user, selalu memakai awalan `=`. */
  raw: string;
  /** Rumus aman dengan alamat A1 yang sudah diterjemahkan menjadi alias stabil. */
  expression: string;
  /** Alias stabil yang direferensikan; dipakai untuk validasi cycle. */
  dependencies: string[];
}

/** Row of the `project_sheets` table (one document per project). */
export interface ProjectSheetRow {
  id: string;
  project_id: string;
  doc: ProjectSheetsDoc;
  created_at: string;
  updated_at: string;
}

/** Computed cell sent to the UI: the value is ALWAYS computed on the server. */
export interface ComputedSheetCell {
  key: string;
  value: number | null;
  expr: string | null;
  /** Message when the formula could not be evaluated (never a silent 0). */
  error: string | null;
  /**
   * Catatan lunak: sel "tidak berlaku" karena variabelnya kosong (mis. komponen
   * vendor yang belum diisi). Nilainya tetap null ("—"), bukan 0.
   */
  note: string | null;
}

export interface ComputedSheetRow {
  id: string;
  /** Reference key used by formulas (`harga_dasar` -> `harga_dasar_harga_inu`). */
  ref: string;
  label: string;
  cells: ComputedSheetCell[];
}

export interface ComputedSheet {
  key: string;
  title: string;
  columns: SheetColumn[];
  rows: ComputedSheetRow[];
  merges?: SheetRange[];
  styles?: Record<string, Record<string, SheetFill>>;
}

/** Variable available inside a formula, shown to the user as a legend. */
export interface SheetVariable {
  name: string;
  label: string;
  group: string;
  value: number | null;
}
