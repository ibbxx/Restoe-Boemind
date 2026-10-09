import type { AhsResult } from "../calculations/types";
import type { AhsInputsView, CostItemView } from "../services/ahs";
import type { ProjectVendorView } from "../services/vendors";
import type { ComputedSheet } from "../types/sheets";
import type { WorkbookCellKind, WorkbookCellMeta, WorkbookLayout } from "../types/workbook";

export function workbookColumnLetter(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    label = String.fromCharCode(65 + rest) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function workbookAlias(value: string): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const safe = base || "cell";
  return /^[0-9]/.test(safe) ? `x_${safe}` : safe;
}

interface LayoutInput {
  vendors: ProjectVendorView[];
  inputs: AhsInputsView | null;
  result: AhsResult | null;
  costItems: CostItemView[];
  sheets: ComputedSheet[];
}

const VENDOR_ROWS = [
  "base_price", "ppn_amount", "pbbkb_amount", "pph_amount", "oat_amount",
  "ppn_oat_amount", "bph_amount", "all_in_amount",
] as const;

const AHS_INPUTS: Array<keyof AhsInputsView> = [
  "analysis_date", "marketing", "payment_term", "harga_keekonomian", "document_scheme",
  "harga_jual_include", "volume", "include_divisor", "ppn_rate", "pbbkb_rate",
  "pph_inu_rate", "bph_migas_rate", "notes",
];

const AHS_RESULTS: Array<keyof AhsResult> = [
  "diskon", "revenue", "harga_jual_setelah_pajak", "harga_jual_dpp", "total_cost",
  "cost_per_liter", "gross_profit", "ppn_difference", "pbbkb_difference", "net_profit",
  "net_profit_per_liter", "profit_percentage", "ppn_output", "ppn_input", "pbbkb_output", "pbbkb_input",
];
/**
 * Logical desktop canvas. Coordinates are independent of responsive stacking,
 * therefore A1 references do not change on mobile.
 */
export function buildWorkbookLayout(input: LayoutInput): WorkbookLayout {
  const cells: WorkbookCellMeta[] = [];
  const vendorColumnCount = Math.max(2, input.vendors.length + 1);
  const ahsStartColumn = vendorColumnCount + 1; // one visual spacer
  const ahsColumns = 6;
  const add = (meta: Omit<WorkbookCellMeta, "address"> & { column: number; row: number }) => {
    const { column, row, ...rest } = meta;
    cells.push({ ...rest, address: `${workbookColumnLetter(column)}${row}` });
  };

  input.vendors.forEach((entry, vendorIndex) => {
    const vendorSlug = workbookAlias(entry.vendor.name);
    VENDOR_ROWS.forEach((field, fieldIndex) => {
      const engine = field === "all_in_amount" || (field === "ppn_amount" && entry.price?.ppn_is_formula !== false);
      add({
        key: `vendor:${entry.vendor.id}:${field}`,
        alias: `vendor_${workbookAlias(entry.vendor.id)}_${field}`,
        displayAlias: `vendor_${vendorSlug}_${field}`,
        label: `${entry.vendor.name} - ${field.replaceAll("_", " ")}`,
        kind: engine ? "engine" : "vendor",
        editable: !engine,
        value: entry.price?.[field] ?? null,
        vendorId: entry.vendor.id,
        field,
        column: vendorIndex + 1,
        row: 7 + fieldIndex,
      });
    });
  });

  const inputPositions: Record<string, { column: number; row: number }> = {
    analysis_date: { column: 1, row: 2 }, marketing: { column: 1, row: 3 }, payment_term: { column: 1, row: 4 },
    harga_keekonomian: { column: 1, row: 5 }, document_scheme: { column: 5, row: 4 },
    harga_jual_include: { column: 1, row: 6 }, volume: { column: 3, row: 6 }, include_divisor: { column: 5, row: 6 },
    ppn_rate: { column: 1, row: 9 }, pbbkb_rate: { column: 3, row: 9 }, pph_inu_rate: { column: 1, row: 10 },
    bph_migas_rate: { column: 3, row: 10 }, notes: { column: 1, row: 32 },
  };
  for (const field of AHS_INPUTS) {
    const position = inputPositions[field] ?? { column: 1, row: 11 };
    const value = input.inputs?.[field];
    add({ key: `ahs:input:${field}`, alias: `proyeksi_${field}`, label: `Proyeksi - ${field.replaceAll("_", " ")}`,
      kind: "ahs", editable: true, value: typeof value === "number" ? value : null,
      text: typeof value === "string" ? value : null,
      field, column: ahsStartColumn + position.column, row: position.row });
  }

  const resultRows: Record<string, number> = {
    revenue: 7, harga_jual_setelah_pajak: 8, harga_jual_dpp: 9, total_cost: 20, cost_per_liter: 21,
    gross_profit: 25, ppn_difference: 26, pbbkb_difference: 27, net_profit: 28,
    net_profit_per_liter: 29, profit_percentage: 30, diskon: 5, ppn_output: 18, ppn_input: 19,
    pbbkb_output: 16, pbbkb_input: 17,
  };
  for (const field of AHS_RESULTS) {
    add({ key: `ahs:result:${field}`, alias: `proyeksi_${field}`, label: `Hasil - ${field.replaceAll("_", " ")}`,
      kind: "engine", editable: false, value: typeof input.result?.[field] === "number" ? input.result[field] as number : null,
      field, column: ahsStartColumn + 5, row: resultRows[field] ?? 24 });
  }

  const costStart = 12;
  input.costItems.forEach((item, index) => {
    (["rate", "qty", "total"] as const).forEach((field, fieldIndex) => add({
      key: `cost:${item.id}:${field}`,
      alias: `biaya_${workbookAlias(item.id)}_${field}`,
      label: `${item.description} - ${field}`,
      kind: field === "total" ? "engine" : "cost",
      editable: field !== "total",
      value: item[field], itemId: item.id, field,
      column: ahsStartColumn + 3 + fieldIndex,
      row: costStart + index,
    }));
  });

  const dynamicStarts: WorkbookLayout["dynamicStarts"] = {};
  let dynamicRow = Math.max(34, costStart + input.costItems.length + 2);
  for (const sheet of input.sheets) {
    dynamicStarts[sheet.key] = { column: ahsStartColumn + 1, row: dynamicRow };
    sheet.rows.forEach((row, rowIndex) => row.cells.forEach((cell, columnIndex) => add({
      key: `sheet:${sheet.key}:${row.id}:${cell.key}`,
      alias: `sheet_${workbookAlias(sheet.key)}_${workbookAlias(row.id)}_${workbookAlias(cell.key)}`,
      displayAlias: `sheet_${workbookAlias(sheet.key)}_${workbookAlias(row.ref)}_${workbookAlias(cell.key)}`,
      label: `${sheet.title} - ${row.label} - ${cell.key}`,
      kind: "dynamic", editable: true, value: cell.value, field: cell.key,
      column: ahsStartColumn + 1 + columnIndex, row: dynamicRow + rowIndex,
    })));
    dynamicRow += sheet.rows.length + 2;
  }

  const byKey = Object.fromEntries(cells.map((cell) => [cell.key, cell]));
  const byAddress = Object.fromEntries(cells.map((cell) => [cell.address.toUpperCase(), cell]));
  const byAlias = Object.fromEntries(cells.flatMap((cell) => [
    [cell.alias, cell] as const,
    ...(cell.displayAlias ? [[cell.displayAlias, cell] as const] : []),
  ]));
  return {
    columnCount: vendorColumnCount + 1 + ahsColumns,
    rowCount: Math.max(32, dynamicRow - 1, costStart + input.costItems.length),
    cells, byKey, byAddress, byAlias, vendorColumnCount, ahsStartColumn, dynamicStarts,
  };
}

export function normalizeWorkbookFormula(raw: string): string {
  return raw.replace(/\b([A-Za-z]{1,3}):(\d{1,6})\b/g, "$1$2");
}

export function translateWorkbookFormula(raw: string, layout: WorkbookLayout): { expression: string; dependencies: string[] } {
  const parse = (address: string) => {
    const match = /^([A-Za-z]{1,3})(\d{1,6})$/.exec(address);
    if (!match) return null;
    let column = 0;
    for (const char of match[1]!.toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64;
    return { column: column - 1, row: Number(match[2]) };
  };
  let normalized = normalizeWorkbookFormula(raw.trim().replace(/^=/, ""));
  const dependencies = new Set<string>();
  normalized = normalized.replace(/\b([A-Za-z]{1,3}\d{1,6})\s*:\s*([A-Za-z]{1,3}\d{1,6})\b/g, (_range, from, to) => {
    const start = parse(from); const end = parse(to);
    if (!start || !end) throw new Error(`Range ${from}:${to} tidak valid.`);
    const aliases: string[] = [];
    for (let column = Math.min(start.column, end.column); column <= Math.max(start.column, end.column); column += 1) {
      for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
        const cell = layout.byAddress[`${workbookColumnLetter(column)}${row}`];
        if (!cell) continue;
        dependencies.add(cell.alias); aliases.push(cell.alias);
      }
    }
    if (aliases.length === 0) throw new Error(`Range ${from}:${to} tidak memiliki cell numerik.`);
    return aliases.join(", ");
  });
  const expression = normalized
    .replace(/\b(SUM|MIN|MAX|ABS|ROUND)\b/gi, (fn) => fn.toLowerCase())
    .replace(/\b([A-Za-z]{1,3}\d{1,6})\b/g, (address) => {
    const cell = layout.byAddress[address.toUpperCase()];
    if (!cell) throw new Error(`Alamat ${address.toUpperCase()} tidak memiliki nilai numerik di workbook.`);
    dependencies.add(cell.alias);
    return cell.alias;
  });
  for (const token of expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    if (layout.byAlias[token]) dependencies.add(token);
  }
  return { expression, dependencies: [...dependencies] };
}
