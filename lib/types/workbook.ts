export type WorkbookCellKind = "vendor" | "ahs" | "cost" | "engine" | "dynamic" | "free" | "label";

export interface WorkbookCellMeta {
  key: string;
  alias: string;
  displayAlias?: string;
  address: string;
  label: string;
  kind: WorkbookCellKind;
  editable: boolean;
  value: number | null;
  text?: string | null;
  engineValue?: number | null;
  overridden?: boolean;
  formula?: string | null;
  formulaExpression?: string | null;
  formulaDependencies?: string[];
  error?: string | null;
  vendorId?: string;
  itemId?: string;
  field?: string;
}

export interface WorkbookLayout {
  columnCount: number;
  rowCount: number;
  cells: WorkbookCellMeta[];
  byKey: Record<string, WorkbookCellMeta>;
  byAddress: Record<string, WorkbookCellMeta>;
  byAlias: Record<string, WorkbookCellMeta>;
  vendorColumnCount: number;
  ahsStartColumn: number;
  dynamicStarts: Record<string, { column: number; row: number }>;
}
