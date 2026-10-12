/**
 * DYNAMIC SHEETS — spreadsheet tables that procurement defines itself.
 *
 * WHAT THIS IS
 *   A per-project document (`project_sheets.doc`) holding sheets whose COLUMNS,
 *   ROWS and FORMULAS are user data, not code. Every cell is either a literal
 *   typed by the user or an expression such as
 *       `harga_dasar_harga_inu * ppn_rate`
 *       `sum(fee_jne_harga_inu, cost_jne_harga_inu)`
 *       `selisih_ppn_harga_inu + bph_migas_harga_inu`
 *
 * WHAT THIS IS NOT
 *   It is NOT a second calculation engine and it does NOT touch the existing
 *   one. `lib/calculations/**` is unchanged; the calculated numbers of the AHS
 *   block still come from `calculateAhs()`. This module only evaluates the
 *   cells the USER wrote, through the same safe evaluator the engine uses
 *   (`lib/calculations/expression.ts` — no eval, no property access), and it
 *   exposes the engine's own output as read-only variables.
 *
 * FORMULA SCOPE (server side only)
 *   - engine + input variables: volume, harga_jual_include, ppn_rate,
 *     harga_jual_dpp, revenue, total_cost, net_profit, ... (see variables list)
 *   - cost lines from the AHS engine: cost_<item>_rate / cost_<item>_total,
 *     cat_<category>_total
 *   - the selected vendor price: vendor_harga_dasar, vendor_ppn, vendor_all_in, ...
 *   - other cells of the SAME sheet: `<row_ref>_<column_key>` (forward
 *     references are resolved in later passes; cycles are reported, never
 *     silently zeroed).
 */

import { canWriteProject, type ProjectAccess } from "../auth/permissions";
import type { Actor } from "../auth/session";
import { evaluateExpression, type Scope } from "../calculations/expression";
import { atomic, eq, type Database } from "../data/db";
import { initializeBindings, bindings, writeBoundValue } from "../workbook/bindings";
import { calculateWorkbook } from "../workbook/calculation";
import { parseNumericInput } from "../format";
import { boundsRange, contains, intersects, rangeBounds } from "../sheet-ranges";
import type { SheetRange, SheetFill } from "../types/sheets";
import type {
  ComputedSheet,
  ComputedSheetCell,
  ComputedSheetRow,
  ProjectSheetRow,
  ProjectSheetsDoc,
  SheetCell,
  SheetColumn,
  SheetDef,
  SheetRowDef,
  SheetVariable,
  WorkbookFormulaEntry,
  WorkbookGridRange,
  WorkbookGridCellRecord,
} from "../types/sheets";
import {
  DEFAULT_WORKBOOK_COLUMN_WIDTH,
  DEFAULT_WORKBOOK_ROW_HEIGHT,
  MAX_WORKBOOK_COLUMN_WIDTH,
  MAX_WORKBOOK_ROW_HEIGHT,
  MIN_WORKBOOK_COLUMN_WIDTH,
  MIN_WORKBOOK_ROW_HEIGHT,
  defaultWorkbookGrid,
  migrateWorkbookGrid,
  rangesIntersect,
  workbookRangeBounds,
  workbookStyleKey,
} from "../workbook/document";
import { isActionErr, loadProjectContext } from "./access";
import blankTemplate from "../workbook/templates/project-blank.json";
import ahsTemplate from "../workbook/templates/ahs-standard-v1.json";
import { ok, err, toActionResultError, type ActionResult } from "./result";
import { listProjectVendors, type ProjectVendorView } from "./vendors";

export const SHEET_FORMULA_HELP =
  "Isi angka atau rumus pada sel yang tersedia. Hasil diperbarui setelah perubahan disimpan.";

/** Guard panjang ekspresi supaya dokumen tidak dipakai sebagai tempat sampah. */
const MAX_EXPR_LENGTH = 240;

/** Minimum visible canvas size for the editable Univer workbook. */
export const MIN_UNIVER_ROW_COUNT = 200;
export const MIN_UNIVER_COLUMN_COUNT = 50;

type UniverSnapshotSheet = {
  rowCount?: unknown;
  columnCount?: unknown;
  [key: string]: unknown;
};

/**
 * Expand persisted Univer snapshots without rewriting their content.
 * Univer keeps cellData, merges, styles and formulas sparse, so increasing
 * the axis counts does not add any data to the snapshot.
 */
export function normalizeUniverWorkbookSnapshot(raw: unknown): Record<string, unknown> {
  const snapshot = raw && typeof raw === "object" && !Array.isArray(raw)
    ? structuredClone(raw as Record<string, unknown>)
    : structuredClone(blankTemplate) as unknown as Record<string, unknown>;
  const sheets = snapshot.sheets;
  if (!sheets || typeof sheets !== "object" || Array.isArray(sheets)) return snapshot;

  for (const sheet of Object.values(sheets as Record<string, unknown>)) {
    if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) continue;
    const target = sheet as UniverSnapshotSheet;
    const rowCount = typeof target.rowCount === "number" && Number.isFinite(target.rowCount)
      ? Math.floor(target.rowCount) : 0;
    const columnCount = typeof target.columnCount === "number" && Number.isFinite(target.columnCount)
      ? Math.floor(target.columnCount) : 0;
    target.rowCount = Math.max(MIN_UNIVER_ROW_COUNT, rowCount);
    target.columnCount = Math.max(MIN_UNIVER_COLUMN_COUNT, columnCount);
  }
  return snapshot;
}

// ------------------------------------------------------------- identifiers

/** `PPN 11%` -> `ppn_11`; dipakai untuk key kolom, ref baris dan nama variabel. */
export function slug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base === "") return "cell";
  return /^[0-9]/.test(base) ? `x_${base}` : base;
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = slug(base);
  let n = 2;
  while (taken.has(name)) {
    name = `${slug(base)}_${n}`;
    n += 1;
  }
  taken.add(name);
  return name;
}

function newId(prefix: string): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return `${prefix}-${c.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ------------------------------------------------------------ default rows

/** Baris awal (semua bisa diubah/dihapus procurement). */
function resultPointsSheet(): SheetDef {
  return { key: "poin_perhitungan", title: "POIN PERHITUNGAN TAMBAHAN",
    columns: [{ key: "nilai", label: "Nilai / hasil" }], rows: [], merges: [], styles: {} };
}

const STANDARD_WORKBOOK_LABELS: Array<[number, number, string]> = [
  [0, 0, "EVALUASI HARGA PEMASOK"], [0, 4, "PROYEKSI LABA RUGI"],
  [1, 0, "Pekerjaan / Material"], [2, 0, "Pelanggan"], [3, 0, "Lokasi"], [4, 0, "Periode"],
  [5, 0, "Uraian"], [6, 0, "Harga Dasar"], [7, 0, "PPN"], [8, 0, "PBBKB"],
  [9, 0, "PPH"], [10, 0, "OAT"], [11, 0, "PPN OAT"], [12, 0, "BPH"], [13, 0, "TOTAL"],
  [1, 4, "Tanggal analisis"], [2, 4, "Marketing"], [3, 4, "Pembayaran"],
  [4, 4, "Harga Keekonomian"], [5, 4, "HARGA INCLUDE"], [5, 6, "VOLUME"], [5, 8, "DIVISOR"],
  [6, 4, "TOTAL PENDAPATAN"], [7, 4, "HARGA JUAL SETELAH PAJAK"],
  [10, 4, "HARGA JUAL"], [19, 4, "TOTAL BIAYA"], [20, 4, "BIAYA PER LITER"],
  [24, 4, "LABA KOTOR"], [25, 4, "SELISIH PPN"], [26, 4, "SELISIH PBBKB"],
  [27, 4, "LABA BERSIH"], [28, 4, "LABA BERSIH PER LITER"], [29, 4, "PERSENTASE"],
  [31, 4, "Keterangan"], [63, 0, "POIN PERHITUNGAN TAMBAHAN"],
];

function seedStandardWorkbookLabels(workbook: ReturnType<typeof defaultWorkbookGrid>) {
  for (const [row, column, raw] of STANDARD_WORKBOOK_LABELS) {
    const rowId = workbook.rows[row]?.id; const columnId = workbook.columns[column]?.id;
    if (!rowId || !columnId) continue;
    const key = workbookStyleKey(rowId, columnId);
    if (!workbook.cells[key]) workbook.cells[key] = { role: "label", raw };
  }
  return workbook;
}

export function defaultSheetsDoc(): ProjectSheetsDoc {
  const univerWorkbook = normalizeUniverWorkbookSnapshot(ahsTemplate);
  initializeBindings(univerWorkbook);
  return { version: 5, sheets: [
    { key: "lembar_kerja", title: "Lembar kerja", columns: [{ key: "nilai", label: "Nilai" }], rows: [], merges: [], styles: {} },
  ], workbookFormulas: {}, workbook: defaultWorkbookGrid(), univerWorkbook };
}

export function createProjectSheetsTemplate(input: {
  code: string; name: string; location?: string | null; periodLabel?: string | null; volume?: number | null;
}): ProjectSheetsDoc {
  const doc = defaultSheetsDoc();
  const snapshot = doc.univerWorkbook!;
  snapshot.id = `project-${input.code}`;
  snapshot.name = input.name || input.code;
  writeBoundValue(snapshot, "project.name", input.name || input.code);
  writeBoundValue(snapshot, "project.location", input.location ?? null);
  writeBoundValue(snapshot, "project.period_label", input.periodLabel ?? null);
  writeBoundValue(snapshot, "project.volume", input.volume ?? null);

  // Auto-fill AHS header from project data
  writeBoundValue(snapshot, "ahs.pekerjaan", input.name || input.code);
  writeBoundValue(snapshot, "ahs.lokasi", input.location ?? null);
  writeBoundValue(snapshot, "ahs.lokasi_ahs", input.location ?? null);
  writeBoundValue(snapshot, "ahs.volume", input.volume ?? null);
  const now = new Date();
  const formattedDate = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  writeBoundValue(snapshot, "ahs.tgl_analisis", formattedDate);
  writeBoundValue(snapshot, "ahs.analysis_date", formattedDate);
  return doc;
}

// ------------------------------------------------------------------ parsing

/** Dokumen dari DB bisa datang sebagai object (local) atau string (jsonb text). */
export function parseSheetsDoc(raw: unknown): ProjectSheetsDoc {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Lembar kerja tidak dapat dibaca. Gunakan cadangan untuk memulihkan data.");
    }
  }
  if (!value || typeof value !== "object") throw new Error("Lembar kerja tidak dapat dibaca.");
  const doc = value as Partial<ProjectSheetsDoc>;
  if (!Array.isArray(doc.sheets) || doc.sheets.length === 0) throw new Error("Lembar kerja tidak lengkap.");
  if (doc.univerWorkbook != null) {
    const workbook = doc.univerWorkbook as Record<string, unknown>;
    if (typeof workbook !== "object" || Array.isArray(workbook) || !workbook.sheets || typeof workbook.sheets !== "object" || Array.isArray(workbook.sheets) || !Object.keys(workbook.sheets).length) {
      throw new Error("Lembar kerja tidak dapat dibaca. Gunakan cadangan untuk memulihkan data.");
    }
  }
  const sheets = structuredClone(doc.sheets as SheetDef[]);
  if (!sheets.some(sheet => sheet.key === "poin_perhitungan")) sheets.push(resultPointsSheet());
  return { version: 5, sheets: sheets.map(sheet => ({
    ...sheet, merges: sheet.merges ?? [], styles: sheet.styles ?? {},
  })), workbookFormulas: doc.workbookFormulas ?? {}, workbook: seedStandardWorkbookLabels(migrateWorkbookGrid(doc)),
  univerWorkbook: normalizeUniverWorkbookSnapshot(doc.univerWorkbook),
  businessProjection: doc.businessProjection,
  lastMutationId: doc.lastMutationId,
  revision: doc.revision,
  };
}

/**
 * Satu sel: angka literal ATAU formula. `500` dan `=vendor_oat` adalah input
 * yang sah; teks bebas yang bukan formula akan ditolak saat evaluasi (bukan
 * diam-diam menjadi 0).
 */
export function parseCellInput(raw: string): SheetCell {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, expr: null };
  const body = trimmed.startsWith("=") ? trimmed.slice(1).trim() : trimmed;
  if (body === "") return { value: null, expr: null };

  const numericOnly = /^[\d.,\s-]+$/.test(body);
  if (numericOnly) {
    const parsed = parseNumericInput(body);
    if (parsed !== null) return { value: parsed, expr: null };
  }
  if (body.length > MAX_EXPR_LENGTH) {
    return { value: null, expr: body.slice(0, MAX_EXPR_LENGTH) };
  }
  return { value: null, expr: body };
}

// ------------------------------------------------------------------- scope

export interface SheetScopeInput {
  volume: number | null;
  vendor: ProjectVendorView | null;
  vendors?: ProjectVendorView[];
}

/** Variables exposed to server-side custom-sheet formulas. */
export function buildSheetVariables(input: SheetScopeInput): SheetVariable[] {
  const out: SheetVariable[] = [];
  const push = (name: string, label: string, group: string, value: number | null | undefined) => {
    out.push({ name, label, group, value: value === undefined ? null : value });
  };
  push("volume", "Volume (L)", "Proyek", input.volume);

  const v = input.vendor?.price ?? null;
  if (v) {
    push("vendor_harga_dasar", "pemasok harga dasar", "pemasok terpilih", v.base_price);
    push("vendor_ppn", "pemasok PPN", "pemasok terpilih", v.ppn_amount);
    push("vendor_pbbkb", "pemasok PBBKB", "pemasok terpilih", v.pbbkb_amount);
    push("vendor_pph", "pemasok PPH", "pemasok terpilih", v.pph_amount);
    push("vendor_oat", "pemasok OAT", "pemasok terpilih", v.oat_amount);
    push("vendor_ppn_oat", "pemasok PPN OAT", "pemasok terpilih", v.ppn_oat_amount);
    push("vendor_bph", "pemasok BPH", "pemasok terpilih", v.bph_amount);
    push("vendor_all_in", "pemasok all in", "pemasok terpilih", v.all_in_amount);
  }

  for (const entry of input.vendors ?? []) {
    const price = entry.price;
    if (!price) continue;
    const prefix = `vendor_${slug(entry.vendor.name)}`;
    push(`${prefix}_base_price`, `${entry.vendor.name} - harga dasar`, "Semua pemasok", price.base_price);
    push(`${prefix}_ppn_amount`, `${entry.vendor.name} - PPN`, "Semua pemasok", price.ppn_amount);
    push(`${prefix}_pbbkb_amount`, `${entry.vendor.name} - PBBKB`, "Semua pemasok", price.pbbkb_amount);
    push(`${prefix}_pph_amount`, `${entry.vendor.name} - PPH`, "Semua pemasok", price.pph_amount);
    push(`${prefix}_oat_amount`, `${entry.vendor.name} - OAT`, "Semua pemasok", price.oat_amount);
    push(`${prefix}_ppn_oat_amount`, `${entry.vendor.name} - PPN OAT`, "Semua pemasok", price.ppn_oat_amount);
    push(`${prefix}_bph_amount`, `${entry.vendor.name} - BPH`, "Semua pemasok", price.bph_amount);
    push(`${prefix}_all_in_amount`, `${entry.vendor.name} - total`, "Semua pemasok", price.all_in_amount);
  }

  return out;
}

/** Ref unik per baris: `Harga Dasar` -> `harga_dasar`, duplikat -> `harga_dasar_2`. */
function rowRefs(sheet: SheetDef): Map<string, string> {
  const taken = new Set<string>();
  const map = new Map<string, string>();
  for (const row of sheet.rows) map.set(row.id, uniqueName(row.label, taken));
  return map;
}

// ------------------------------------------------- Excel-style cell addresses

/**
 * ALAMAT SEL ALA EXCEL.
 *
 * Kolom diberi huruf (A, B, C, …), baris diberi nomor (1, 2, 3, …) sehingga
 * user bisa MENUNJUK sel seperti di Excel: `=B2*11%`, `=sum(B2:B6)`.
 * Alamat itu diterjemahkan ke nama variabel internal (`harga_dasar_rate`)
 * SEBELUM evaluasi — evaluator dan engine tidak perlu tahu soal alamat.
 * Formula lama yang memakai nama variabel tetap jalan (keduanya didukung).
 */
export interface SheetAddressMap {
  /** "B3" -> nama sel (mis. ppn_harga_inu). */
  byAddress: Map<string, string>;
  /** "rowId::columnKey" -> "B3". */
  byCell: Map<string, string>;
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    label = String.fromCharCode(65 + rest) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function parseAddress(address: string): { col: number; row: number } | null {
  const match = /^([A-Za-z]{1,3})(\d{1,6})$/.exec(address.trim());
  if (!match) return null;
  const letters = (match[1] as string).toUpperCase();
  let col = 0;
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(match[2]) - 1 };
}

export function buildAddressMap(sheet: SheetDef): SheetAddressMap {
  const refs = rowRefs(sheet);
  const byAddress = new Map<string, string>();
  const byCell = new Map<string, string>();
  sheet.rows.forEach((row, rowIndex) => {
    sheet.columns.forEach((column, columnIndex) => {
      const address = `${columnLetter(columnIndex)}${rowIndex + 1}`;
      byAddress.set(address.toUpperCase(), `${refs.get(row.id)}_${column.key}`);
      byCell.set(`${row.id}::${column.key}`, address);
    });
  });
  for (const merge of sheet.merges ?? []) {
    const b = rangeBounds(sheet, merge);
    const anchor = byAddress.get(`${columnLetter(b.left)}${b.top + 1}`)!;
    for (let r = b.top; r <= b.bottom; r++) {
      for (let c = b.left; c <= b.right; c++) byAddress.set(`${columnLetter(c)}${r + 1}`, anchor);
    }
  }
  return { byAddress, byCell };
}

const EXCEL_FUNCTIONS = new Set(["sum", "min", "max", "abs", "round"]);
const RANGE_RE = /([A-Za-z]{1,3}\d{1,6})\s*:\s*([A-Za-z]{1,3}\d{1,6})/g;

function expandRange(from: string, to: string, map: SheetAddressMap): string[] {
  const a = parseAddress(from);
  const b = parseAddress(to);
  if (!a || !b) return [];
  const names: string[] = [];
  const colFrom = Math.min(a.col, b.col);
  const colTo = Math.max(a.col, b.col);
  const rowFrom = Math.min(a.row, b.row);
  const rowTo = Math.max(a.row, b.row);
  for (let col = colFrom; col <= colTo; col += 1) {
    for (let row = rowFrom; row <= rowTo; row += 1) {
      const name = map.byAddress.get(`${columnLetter(col - 1)}${row + 1}`);
      if (name) names.push(name);
    }
  }
  return [...new Set(names)];
}

/**
 * `=sum(B2:B6)` -> `sum(ppn_harga_inu, pbbkb_harga_inu, …)`
 * `=B2*11%`     -> `ppn_harga_inu * 11%`
 * Nama variabel (`vendor_oat`, `cost_ppn_11_rate`) tidak diubah.
 */
export function translateFormula(expr: string, map: SheetAddressMap): string {
  const withRanges = expr.replace(RANGE_RE, (match, from: string, to: string) => {
    const names = expandRange(from, to, map);
    return names.length > 0 ? names.join(", ") : match;
  });

  return withRanges.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (token) => {
    const lower = token.toLowerCase();
    if (EXCEL_FUNCTIONS.has(lower)) return lower;
    const name = map.byAddress.get(token.toUpperCase());
    if (name && !token.includes("_")) return name;
    return token;
  });
}

// --------------------------------------------------------------- evaluation

function toScope(variables: SheetVariable[]): Scope {
  const scope: Scope = {};
  for (const v of variables) {
    if (v.value === null) {
      // Variabel yang TIDAK BERLAKU tetap ada di scope sebagai null:
      // `sum(...)` mengabaikannya seperti sel kosong, dan pemakaian skalar
      // menghasilkan pesan — bukan diam-diam menjadi 0.
      scope[v.name] = null;
    } else if (Number.isFinite(v.value)) {
      scope[v.name] = v.value;
    }
  }
  return scope;
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  return e instanceof Error ? e.message : String(e);
}

function errorCode(e: unknown): string | null {
  if (e && typeof e === "object" && "errorCode" in e) {
    const code = (e as { errorCode?: unknown }).errorCode;
    if (typeof code === "string") return code;
  }
  return null;
}

function errorField(e: unknown): string | null {
  if (e && typeof e === "object" && "field" in e) {
    const field = (e as { field?: unknown }).field;
    if (typeof field === "string" && field !== "") return field;
  }
  return null;
}

/**
 * "TIDAK BERLAKU" vs salah tulis.
 *
 * Excel: sel kosong yang dipakai formula menghasilkan 0 dan SUM mengabaikannya.
 * Di sini nilai kosong tetap null ("—", bukan 0), tetapi formulanya tetap bisa
 * dihitung: variabel yang ADA di scope tapi bernilai null = tidak berlaku,
 * sedangkan nama variabel yang TIDAK ADA = salah tulis dan tetap error.
 */
function isNotApplicable(e: unknown, scope: Scope): boolean {
  const code = errorCode(e);
  const field = errorField(e);
  if (code === "MISSING_INPUT" && field !== null && field in scope) return true;
  return /bukan skalar \(0 nilai\)/.test(errorMessage(e));
}

/**
 * Evaluasi satu sheet. Literal langsung dipakai; formula dicoba berulang kali
 * (forward reference) sampai semua selesai atau siklus terdeteksi. Hasilnya
 * deterministic: urutan baris tidak mengubah nilai akhir selama tidak ada siklus.
 */
export function computeSheet(sheet: SheetDef, variables: SheetVariable[]): ComputedSheet {
  const refs = rowRefs(sheet);
  const addressMap = buildAddressMap(sheet);
  const scope = toScope(variables);
  const cells = new Map<string, ComputedSheetCell>();
  const pending: Array<{ row: SheetRowDef; column: SheetColumn; cell: SheetCell }> = [];

  for (const row of sheet.rows) {
    for (const column of sheet.columns) {
      const cell = row.cells[column.key] ?? { value: null, expr: null };
      const key = `${row.id}::${column.key}`;
      if (cell.expr === null) {
        cells.set(key, { key: column.key, value: cell.value, expr: null, error: null, note: null });
        // Sel literal & sel KOSONG ikut masuk scope: literal bisa direferensikan
        // formula lain, dan sel kosong diperlakukan seperti sel kosong Excel
        // (diabaikan SUM, bukan 0).
        scope[`${refs.get(row.id)}_${column.key}`] = cell.value;
      } else {
        pending.push({ row, column, cell });
        cells.set(key, { key: column.key, value: null, expr: cell.expr, error: null, note: null });
      }
    }
  }

  const maxPasses = Math.max(2, pending.length + 1);
  let remaining = pending;
  for (let pass = 0; pass < maxPasses && remaining.length > 0; pass += 1) {
    const next: typeof remaining = [];
    for (const item of remaining) {
      const key = `${item.row.id}::${item.column.key}`;
      try {
        // Formula boleh memakai alamat sel ala Excel (B2, sum(B2:B6)) —
        // diterjemahkan ke nama variabel sebelum dievaluasi.
        const expression = translateFormula(item.cell.expr as string, addressMap);
        const value = evaluateExpression(expression, scope);
        scope[`${refs.get(item.row.id)}_${item.column.key}`] = value;
        cells.set(key, { key: item.column.key, value, expr: item.cell.expr, error: null, note: null });
      } catch (e) {
        const code = errorCode(e);
        const message = errorMessage(e);
        const ref = `${refs.get(item.row.id)}_${item.column.key}`;
        if (isNotApplicable(e, scope)) {
          // Variabelnya kosong/tidak berlaku: nilainya tetap null ("—"), dan
          // sel ini boleh dipakai SUM(...) seperti sel kosong di Excel.
          scope[ref] = null;
          cells.set(key, {
            key: item.column.key,
            value: null,
            expr: item.cell.expr,
            error: null,
            note: `Tidak berlaku — ${message}`,
          });
        } else if (code === "MISSING_INPUT") {
          // Mungkin referensi maju (baris di bawah) — coba lagi di pass berikutnya.
          next.push(item);
          cells.set(key, {
            key: item.column.key,
            value: null,
            expr: item.cell.expr,
            error: message,
            note: null,
          });
        } else {
          cells.set(key, {
            key: item.column.key,
            value: null,
            expr: item.cell.expr,
            error: message,
            note: null,
          });
        }
      }
    }
    if (next.length === remaining.length && pass > 0) {
      remaining = next;
      break;
    }
    remaining = next;
  }
  for (const item of remaining) {
    const key = `${item.row.id}::${item.column.key}`;
    const previous = cells.get(key);
    cells.set(key, {
      key: item.column.key,
      value: null,
      expr: item.cell.expr,
      error:
        previous?.error ??
        "Formula belum bisa dihitung: variabel belum tersedia atau terjadi siklus referensi.",
      note: null,
    });
  }

  const rows: ComputedSheetRow[] = sheet.rows.map((row) => ({
    id: row.id,
    ref: refs.get(row.id) as string,
    label: row.label,
    cells: sheet.columns.map(
      (column) =>
        cells.get(`${row.id}::${column.key}`) ?? {
          key: column.key,
          value: null,
          expr: null,
          error: null,
          note: null,
        },
    ),
  }));

  return { key: sheet.key, title: sheet.title, columns: sheet.columns, rows, merges: sheet.merges ?? [], styles: sheet.styles ?? {} };
}

export function computeSheets(doc: ProjectSheetsDoc, variables: SheetVariable[]): ComputedSheet[] {
  return doc.sheets.map((sheet) => computeSheet(sheet, variables));
}

export interface ProjectSheetsView {
  doc: ProjectSheetsDoc;
  sheets: ComputedSheet[];
  variables: SheetVariable[];
}

export function buildSheetsView(doc: ProjectSheetsDoc, input: SheetScopeInput): ProjectSheetsView {
  const variables = buildSheetVariables(input);
  return { doc, sheets: computeSheets(doc, variables), variables };
}

// ---------------------------------------------------------------- persistence

async function loadDocRow(db: Database, projectId: string): Promise<ProjectSheetRow | null> {
  const { rows } = await db.select<ProjectSheetRow>("project_sheets", {
    where: [eq("project_id", projectId)],
    limit: 1,
  });
  return rows[0] ?? null;
}

async function loadScope(db: Database, actor: Actor, projectId: string): Promise<SheetScopeInput> {
  const vendors = await listProjectVendors(db, actor, projectId);
  const entries = vendors.ok ? vendors.data : [];
  const project = (await db.select<{ volume: number | null }>("projects", { where: [eq("id", projectId)], limit: 1 })).rows[0];
  return { volume: project?.volume ?? null, vendor: entries.find((entry) => entry.link.is_selected) ?? null };
}

/** Dokumen + nilai terhitung untuk halaman project. Membuat baris default bila belum ada. */
export async function loadProjectSheets(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<ProjectSheetsView>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;

    const [row, scope] = await Promise.all([loadDocRow(db, projectId), loadScope(db, actor, projectId)]);
    const doc = row ? parseSheetsDoc(row.doc) : defaultSheetsDoc();
    return ok(buildSheetsView(doc, scope));
  } catch (e) {
    return toActionResultError(e, "project_sheets");
  }
}

/** Simpan dokumen (dipakai semua mutation di bawah). */
async function persistDoc(
  db: Database,
  projectId: string,
  doc: ProjectSheetsDoc,
): Promise<void> {
  const existing = await loadDocRow(db, projectId);
  if (existing) {
    await db.update<ProjectSheetRow>("project_sheets", existing.id, { doc });
    return;
  }
  await db.insert<ProjectSheetRow>("project_sheets", { project_id: projectId, doc });
}

/** Persist the complete Univer snapshot. The snapshot is the editable project instance, not the master template. */
export async function saveUniverWorkbook(
  db: Database,
  actor: Actor,
  projectId: string,
  snapshot: Record<string, unknown>,
  options: { baseRevision?: number; mutationId?: string } = {},
): Promise<ActionResult<{ revision: number; calculationErrors: string[] }>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (!canWriteProject(ctx.access as ProjectAccess)) {
    return { ok: false, error: "Anda hanya memiliki akses lihat pada proyek ini.", errorCode: "FORBIDDEN" };
  }
  try {
    if (!snapshot || typeof snapshot !== "object" || !snapshot.sheets || typeof snapshot.sheets !== "object" || Array.isArray(snapshot.sheets) || !Object.keys(snapshot.sheets).length || !Array.isArray(snapshot.sheetOrder)) {
      return { ok: false, error: "Lembar kerja tidak dapat dibaca. Coba buka kembali halaman ini.", errorCode: "INVALID_INPUT" };
    }
    const serialized = JSON.stringify(snapshot);
    const order = snapshot.sheetOrder as unknown[];
    if (new Set(order).size !== order.length || order.length !== Object.keys(snapshot.sheets).length || order.some((id) => typeof id !== "string" || !Object.hasOwn(snapshot.sheets as object, id))) return { ok: false, error: "Urutan lembar kerja tidak valid.", errorCode: "INVALID_INPUT" };
    if (Buffer.byteLength(serialized, "utf8") > 5_000_000) {
      return { ok: false, error: "Lembar kerja terlalu besar untuk disimpan (maksimal 5 MB).", errorCode: "INVALID_INPUT" };
    }
    for (const [id, value] of Object.entries(snapshot.sheets)) {
      if (!value || typeof value !== "object" || Array.isArray(value) || !(snapshot.sheetOrder as unknown[]).includes(id)) return { ok: false, error: "Lembar kerja tidak lengkap.", errorCode: "INVALID_INPUT" };
      const sheet = value as { name?: string; cellData?: unknown; rowCount?: number; columnCount?: number };
      if (!Number.isInteger(sheet.rowCount) || !Number.isInteger(sheet.columnCount) || sheet.rowCount! <= 0 || sheet.columnCount! <= 0 || sheet.rowCount! > 1_048_576 || sheet.columnCount! > 16_384) return { ok: false, error: "Ukuran lembar kerja tidak valid.", errorCode: "INVALID_INPUT" };
      if (typeof sheet.name !== "string" || !sheet.name.trim() || sheet.cellData != null && (typeof sheet.cellData !== "object" || Array.isArray(sheet.cellData))) return { ok: false, error: "Isi lembar kerja tidak valid.", errorCode: "INVALID_INPUT" };
    }
    const normalized = normalizeUniverWorkbookSnapshot(snapshot);
    const projection = await calculateWorkbook(normalized);
    return await atomic(db, async (tx) => {
      const row = await loadDocRow(tx, projectId);
      const doc = row ? parseSheetsDoc(row.doc) : defaultSheetsDoc();
      const revision = row?.revision ?? doc.revision ?? 0;
      if (options.mutationId && options.mutationId === doc.lastMutationId) return ok({ revision, calculationErrors: doc.businessProjection?.errors ?? [] });
      if (options.baseRevision !== undefined && options.baseRevision !== revision) return { ok: false, error: "Lembar kerja berubah di tab lain. Muat versi terbaru; perubahan Anda tetap ada dalam draf.", errorCode: "CONFLICT" };
      const previousKeys = new Set([
        ...Object.keys(doc.businessProjection?.values ?? {}),
        ...Object.values(bindings(doc.univerWorkbook ?? {})).map((entry) => entry.comment).filter((key): key is string => Boolean(key)),
      ].filter((key) => key.startsWith("project.") || key.startsWith("vendor.")));
      for (const key of previousKeys) {
        if (!Object.hasOwn(projection.values, key)) { projection.values[key] = null; projection.errors.push(key); }
      }
      if (!String(projection.values["project.name"] ?? "").trim()) return err("Nama proyek wajib diisi.", { fieldErrors: { name: "Nama proyek wajib diisi." }, errorCode: "INVALID_INPUT" });
      if (!["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"].includes(String(projection.values["project.status"] ?? ""))) return err("Pilih status proyek yang tersedia.", { fieldErrors: { status: "Pilih status proyek yang tersedia." }, errorCode: "INVALID_INPUT" });
      doc.univerWorkbook = normalized;
      doc.businessProjection = projection;
      doc.lastMutationId = options.mutationId;
      doc.revision = revision + 1;
      if (row) await tx.update("project_sheets", row.id, { doc, ...(tx.local ? { revision: revision + 1 } : {}) });
      else await tx.insert("project_sheets", { project_id: projectId, doc, ...(tx.local ? { revision: revision + 1 } : {}) });
      if (tx.local) {
        const { applyWorkbookProjection } = await import("./editor");
        await applyWorkbookProjection(tx, actor, projectId, projection);
      }
      return ok({ revision: revision + 1, calculationErrors: projection.errors });
    });
  } catch (error) {
    return toActionResultError(error, "project_sheets");
  }
}

/** Formula workbook bisnis memakai dokumen JSONB yang sama dengan dynamic sheet. */
export async function setWorkbookFormula(
  db: Database,
  actor: Actor,
  projectId: string,
  cellKey: string,
  entry: WorkbookFormulaEntry | null,
): Promise<ActionResult<void>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (!canWriteProject(ctx.access as ProjectAccess)) {
    return { ok: false, error: "Anda hanya memiliki akses lihat pada proyek ini.", errorCode: "FORBIDDEN" };
  }
  try {
    const row = await loadDocRow(db, projectId);
    const doc = row ? parseSheetsDoc(row.doc) : defaultSheetsDoc();
    const formulas = { ...(doc.workbookFormulas ?? {}) };
    if (entry) formulas[cellKey] = entry;
    else delete formulas[cellKey];
    doc.version = 5;
    doc.workbookFormulas = formulas;
    await persistDoc(db, projectId, doc);
    return ok(undefined);
  } catch (e) {
    return toActionResultError(e, "project_sheets");
  }
}

interface MutationContext {
  db: Database;
  actor: Actor;
  projectId: string;
  doc: ProjectSheetsDoc;
}

class SheetInputError extends Error {}

async function withDoc(
  db: Database,
  actor: Actor,
  projectId: string,
  mutate: (ctx: MutationContext) => { doc: ProjectSheetsDoc; audit: string; before: string | null; after: string | null },
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (!canWriteProject(ctx.access as ProjectAccess)) {
    return { ok: false, error: "Anda hanya memiliki akses lihat pada proyek ini.", errorCode: "FORBIDDEN" };
  }

  try {
    const row = await loadDocRow(db, projectId);
    const doc = row ? parseSheetsDoc(row.doc) : defaultSheetsDoc();
    const result = mutate({ db, actor, projectId, doc });
    await persistDoc(db, projectId, result.doc);

    const scope = await loadScope(db, actor, projectId);
    return ok(buildSheetsView(result.doc, scope));
  } catch (e) {
    if (e instanceof SheetInputError) return { ok: false, error: e.message, errorCode: "INVALID_INPUT" };
    return toActionResultError(e, "project_sheets");
  }
}

function findSheet(doc: ProjectSheetsDoc, sheetKey: string): SheetDef | null {
  return doc.sheets.find((sheet) => sheet.key === sheetKey) ?? null;
}

// ------------------------------------------------------------------ mutations

export async function mergeSheetCells(
  db: Database, actor: Actor, projectId: string,
  input: { sheet_key: string; range: SheetRange },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error("Sheet tidak ditemukan.");
    const b = rangeBounds(sheet, input.range);
    if (b.top === b.bottom && b.left === b.right) throw new SheetInputError("Pilih minimal dua cell untuk merge.");
    if ((sheet.merges ?? []).some(m => intersects(b, rangeBounds(sheet, m)))) {
      throw new SheetInputError("Range bertumpuk dengan merge yang sudah ada. Unmerge terlebih dahulu.");
    }
    for (let r = b.top; r <= b.bottom; r++) {
      for (let c = b.left; c <= b.right; c++) {
        if (r === b.top && c === b.left) continue;
        const cell = sheet.rows[r]!.cells[sheet.columns[c]!.key];
        if (cell && (cell.value !== null || cell.expr !== null)) {
          throw new SheetInputError("Merge dibatalkan: cell selain kiri-atas masih berisi nilai atau rumus.");
        }
      }
    }
    const merge = boundsRange(sheet, b);
    sheet.merges = [...(sheet.merges ?? []), merge];
    return { doc, audit: `merge:${sheet.key}`, before: null, after: JSON.stringify(merge) };
  });
}

export async function unmergeSheetCells(
  db: Database, actor: Actor, projectId: string,
  input: { sheet_key: string; range: SheetRange },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error("Sheet tidak ditemukan.");
    const b = rangeBounds(sheet, input.range);
    const removed = (sheet.merges ?? []).filter(m => intersects(b, rangeBounds(sheet, m)));
    sheet.merges = (sheet.merges ?? []).filter(m => !intersects(b, rangeBounds(sheet, m)));
    return { doc, audit: `unmerge:${sheet.key}`, before: JSON.stringify(removed), after: null };
  });
}

export async function setSheetRangeStyle(
  db: Database, actor: Actor, projectId: string,
  input: { sheet_key: string; range: SheetRange; fill: SheetFill },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error("Sheet tidak ditemukan.");
    if (!["none", "yellow", "green", "blue", "pink", "gray"].includes(input.fill)) throw new SheetInputError("Warna tidak tersedia.");
    const b = rangeBounds(sheet, input.range);
    const before = JSON.stringify(sheet.styles ?? {});
    sheet.styles ??= {};
    for (let r = b.top; r <= b.bottom; r++) {
      const id = sheet.rows[r]!.id;
      sheet.styles[id] ??= {};
      for (let c = b.left; c <= b.right; c++) {
        const key = sheet.columns[c]!.key;
        if (input.fill === "none") delete sheet.styles[id]![key];
        else sheet.styles[id]![key] = input.fill;
      }
    }
    return { doc, audit: `style:${sheet.key}`, before, after: JSON.stringify(sheet.styles) };
  });
}

export async function setSheetCell(
  db: Database,
  actor: Actor,
  projectId: string,
  input: { sheet_key: string; row_id: string; column_key: string; raw: string },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error(`Sheet "${input.sheet_key}" tidak ditemukan.`);
    const row = sheet.rows.find((r) => r.id === input.row_id);
    if (!row) throw new Error("Baris tidak ditemukan.");
    if (!sheet.columns.some((c) => c.key === input.column_key)) {
      throw new Error(`Kolom "${input.column_key}" tidak ditemukan.`);
    }
    const point = { row: sheet.rows.indexOf(row), col: sheet.columns.findIndex(c => c.key === input.column_key) };
    for (const merge of sheet.merges ?? []) {
      const b = rangeBounds(sheet, merge);
      if (contains(b, point) && (point.row !== b.top || point.col !== b.left)) {
        throw new SheetInputError("Edit nilai melalui cell kiri-atas area merge.");
      }
    }

    const before = row.cells[input.column_key] ?? { value: null, expr: null };
    const parsed = parseCellInput(input.raw);
    if (parsed.value === null && parsed.expr === null) {
      delete row.cells[input.column_key];
    } else {
      row.cells[input.column_key] = parsed;
    }

    return {
      doc,
      audit: `cell:${sheet.key}:${row.label}:${input.column_key}`,
      before: before.expr ?? (before.value === null ? null : String(before.value)),
      after: parsed.expr ?? (parsed.value === null ? null : String(parsed.value)),
    };
  });
}

export async function setSheetRowLabel(
  db: Database,
  actor: Actor,
  projectId: string,
  input: { sheet_key: string; row_id: string; label: string },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error(`Sheet "${input.sheet_key}" tidak ditemukan.`);
    const row = sheet.rows.find((r) => r.id === input.row_id);
    if (!row) throw new Error("Baris tidak ditemukan.");
    const label = input.label.trim();
    if (label === "") throw new Error("Label baris tidak boleh kosong.");
    const before = row.label;
    row.label = label;
    return { doc, audit: `row_label:${sheet.key}`, before, after: label };
  });
}

export async function addSheetRow(
  db: Database,
  actor: Actor,
  projectId: string,
  input: { sheet_key: string; label?: string | null },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error(`Sheet "${input.sheet_key}" tidak ditemukan.`);
    const label = (input.label ?? "").trim() || `Baris ${sheet.rows.length + 1}`;
    const row: SheetRowDef = { id: newId(sheet.key), label, cells: {} };
    sheet.rows.push(row);
    return { doc, audit: `add_row:${sheet.key}`, before: null, after: label };
  });
}

export async function removeSheetRow(
  db: Database,
  actor: Actor,
  projectId: string,
  input: { sheet_key: string; row_id: string },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error(`Sheet "${input.sheet_key}" tidak ditemukan.`);
    const index = sheet.rows.findIndex((r) => r.id === input.row_id);
    if (index === -1) throw new Error("Baris tidak ditemukan.");
    if ((sheet.merges ?? []).some(m => {
      const b = rangeBounds(sheet, m);
      return index >= b.top && index <= b.bottom;
    })) throw new SheetInputError("Unmerge terlebih dahulu sebelum menghapus baris ini.");
    delete sheet.styles?.[input.row_id];
    const [removed] = sheet.rows.splice(index, 1);
    return { doc, audit: `remove_row:${sheet.key}`, before: removed?.label ?? null, after: null };
  });
}

export async function addSheetColumn(
  db: Database,
  actor: Actor,
  projectId: string,
  input: { sheet_key: string; label: string },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error(`Sheet "${input.sheet_key}" tidak ditemukan.`);
    const label = input.label.trim();
    if (label === "") throw new Error("Nama kolom tidak boleh kosong.");
    const taken = new Set(sheet.columns.map((c) => c.key));
    const key = uniqueName(label, taken);
    sheet.columns.push({ key, label });
    return { doc, audit: `add_column:${sheet.key}`, before: null, after: key };
  });
}

export async function removeSheetColumn(
  db: Database,
  actor: Actor,
  projectId: string,
  input: { sheet_key: string; column_key: string },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const sheet = findSheet(doc, input.sheet_key);
    if (!sheet) throw new Error(`Sheet "${input.sheet_key}" tidak ditemukan.`);
    if (sheet.columns.length <= 1) throw new Error("Minimal satu kolom harus tersisa.");
    const index = sheet.columns.findIndex(c => c.key === input.column_key);
    if (index < 0) throw new Error("Kolom tidak ditemukan.");
    if ((sheet.merges ?? []).some(m => {
      const b = rangeBounds(sheet, m);
      return index >= b.left && index <= b.right;
    })) throw new SheetInputError("Unmerge terlebih dahulu sebelum menghapus kolom ini.");
    for (const styles of Object.values(sheet.styles ?? {})) delete styles[input.column_key];
    sheet.columns = sheet.columns.filter((c) => c.key !== input.column_key);
    for (const row of sheet.rows) delete row.cells[input.column_key];
    return { doc, audit: `remove_column:${sheet.key}`, before: input.column_key, after: null };
  });
}

export async function addSheet(
  db: Database,
  actor: Actor,
  projectId: string,
  title: string,
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const name = title.trim();
    if (name === "") throw new Error("Nama tabel tidak boleh kosong.");
    const taken = new Set(doc.sheets.map((s) => s.key));
    const sheet: SheetDef = {
      key: uniqueName(name, taken),
      title: name.toUpperCase(),
      columns: [
        { key: "uraian_1", label: "Kolom 1" },
        { key: "uraian_2", label: "Kolom 2" },
      ],
      rows: [{ id: newId("row"), label: "Baris 1", cells: {} }],
    };
    doc.sheets.push(sheet);
    return { doc, audit: "add_sheet", before: null, after: sheet.key };
  });
}

export async function removeSheet(
  db: Database,
  actor: Actor,
  projectId: string,
  sheetKey: string,
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const before = doc.sheets.find((s) => s.key === sheetKey)?.title ?? null;
    doc.sheets = doc.sheets.filter((s) => s.key !== sheetKey);
    return { doc, audit: "remove_sheet", before, after: null };
  });
}

// ------------------------------------------------------- global workbook v4

function workbookDoc(doc: ProjectSheetsDoc) {
  doc.version = 5;
  doc.workbook ??= defaultWorkbookGrid();
  return doc.workbook;
}

export async function resizeWorkbookAxis(
  db: Database, actor: Actor, projectId: string,
  input: { axis: "row" | "column"; id: string; size: number; manual?: boolean },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc);
    const axes = input.axis === "column" ? grid.columns : grid.rows;
    const target = axes.find((item) => item.id === input.id);
    if (!target) throw new SheetInputError("Koordinat workbook tidak ditemukan.");
    const minimum = input.axis === "column" ? MIN_WORKBOOK_COLUMN_WIDTH : MIN_WORKBOOK_ROW_HEIGHT;
    const maximum = input.axis === "column" ? MAX_WORKBOOK_COLUMN_WIDTH : MAX_WORKBOOK_ROW_HEIGHT;
    if (!Number.isFinite(input.size)) throw new SheetInputError("Ukuran koordinat tidak valid.");
    const before = JSON.stringify(target);
    target.size = Math.round(Math.min(maximum, Math.max(minimum, input.size)));
    if (input.axis === "row") target.manual = input.manual ?? true;
    return { doc, audit: `workbook_resize:${input.axis}:${input.id}`, before, after: JSON.stringify(target) };
  });
}

export async function resetWorkbookAxisSize(
  db: Database, actor: Actor, projectId: string,
  input: { axis: "row" | "column"; id: string; size?: number },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc);
    const target = (input.axis === "column" ? grid.columns : grid.rows).find((item) => item.id === input.id);
    if (!target) throw new SheetInputError("Koordinat workbook tidak ditemukan.");
    const before = JSON.stringify(target);
    target.size = Math.round(input.size ?? (input.axis === "column" ? DEFAULT_WORKBOOK_COLUMN_WIDTH : DEFAULT_WORKBOOK_ROW_HEIGHT));
    if (input.axis === "row") delete target.manual;
    return { doc, audit: `workbook_autofit:${input.axis}:${input.id}`, before, after: JSON.stringify(target) };
  });
}

export async function setWorkbookRangePresentation(
  db: Database, actor: Actor, projectId: string,
  input: { range: WorkbookGridRange; fill?: SheetFill; wrap?: boolean },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc);
    const bounds = workbookRangeBounds(grid, input.range);
    const before = JSON.stringify(grid.styles);
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let column = bounds.left; column <= bounds.right; column += 1) {
        const key = workbookStyleKey(grid.rows[row]!.id, grid.columns[column]!.id);
        const style = { ...(grid.styles[key] ?? {}) };
        if (input.fill !== undefined) {
          if (input.fill === "none") delete style.fill;
          else style.fill = input.fill;
        }
        if (input.wrap !== undefined) style.wrap = input.wrap;
        if (Object.keys(style).length) grid.styles[key] = style;
        else delete grid.styles[key];
      }
    }
    return { doc, audit: "workbook_style", before, after: JSON.stringify(grid.styles) };
  });
}

export async function setWorkbookGridCell(
  db: Database, actor: Actor, projectId: string,
  input: { rowId: string; columnId: string; cell: WorkbookGridCellRecord },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc);
    if (!grid.rows.some((row) => row.id === input.rowId) || !grid.columns.some((column) => column.id === input.columnId)) {
      throw new SheetInputError("Koordinat workbook tidak ditemukan.");
    }
    const key = workbookStyleKey(input.rowId, input.columnId);
    const before = grid.cells[key] ? JSON.stringify(grid.cells[key]) : null;
    if (!input.cell.raw && !input.cell.overrideRaw && input.cell.role === "free") delete grid.cells[key];
    else grid.cells[key] = structuredClone(input.cell);
    return { doc, audit: `workbook_cell:${key}`, before, after: grid.cells[key] ? JSON.stringify(grid.cells[key]) : null };
  });
}

export async function resetWorkbookGridCellOverride(
  db: Database, actor: Actor, projectId: string, input: { rowId: string; columnId: string },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc); const key = workbookStyleKey(input.rowId, input.columnId);
    const current = grid.cells[key];
    if (!current) throw new SheetInputError("Cell override tidak ditemukan.");
    const before = JSON.stringify(current);
    delete current.overrideRaw; delete current.expression; delete current.dependencies;
    return { doc, audit: `workbook_reset_override:${key}`, before, after: JSON.stringify(current) };
  });
}

export async function mergeWorkbookCells(
  db: Database, actor: Actor, projectId: string, range: WorkbookGridRange,
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc);
    const bounds = workbookRangeBounds(grid, range);
    if (bounds.top === bounds.bottom && bounds.left === bounds.right) throw new SheetInputError("Pilih minimal dua cell untuk merge.");
    if (grid.merges.some((item) => rangesIntersect(bounds, workbookRangeBounds(grid, item)))) {
      throw new SheetInputError("Range bertumpuk dengan merge yang sudah ada.");
    }
    const anchorRow = grid.rows[bounds.top]!.id;
    const anchorColumn = grid.columns[bounds.left]!.id;
    for (const [cellKey, placement] of Object.entries(grid.placements)) {
      const row = grid.rows.findIndex((item) => item.id === placement.rowId);
      const column = grid.columns.findIndex((item) => item.id === placement.columnId);
      if (row < bounds.top || row > bounds.bottom || column < bounds.left || column > bounds.right) continue;
      if (placement.rowId !== anchorRow || placement.columnId !== anchorColumn) {
        throw new SheetInputError(`Merge dibatalkan: ${cellKey} memiliki nilai, binding bisnis, atau dependency.`);
      }
    }
    grid.merges.push(range);
    return { doc, audit: "workbook_merge", before: null, after: JSON.stringify(range) };
  });
}

export async function unmergeWorkbookCells(
  db: Database, actor: Actor, projectId: string, range: WorkbookGridRange,
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc);
    const bounds = workbookRangeBounds(grid, range);
    const removed = grid.merges.filter((item) => rangesIntersect(bounds, workbookRangeBounds(grid, item)));
    grid.merges = grid.merges.filter((item) => !rangesIntersect(bounds, workbookRangeBounds(grid, item)));
    return { doc, audit: "workbook_unmerge", before: JSON.stringify(removed), after: null };
  });
}

export async function insertWorkbookAxis(
  db: Database, actor: Actor, projectId: string,
  input: { axis: "row" | "column"; afterId: string },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc);
    const axes = input.axis === "column" ? grid.columns : grid.rows;
    const index = axes.findIndex((item) => item.id === input.afterId);
    if (index < 0) throw new SheetInputError("Koordinat workbook tidak ditemukan.");
    const created = {
      id: `${input.axis}-${newId("axis")}`,
      size: input.axis === "column" ? DEFAULT_WORKBOOK_COLUMN_WIDTH : DEFAULT_WORKBOOK_ROW_HEIGHT,
    };
    axes.splice(index + 1, 0, created);
    return { doc, audit: `workbook_insert:${input.axis}`, before: input.afterId, after: created.id };
  });
}

export async function deleteWorkbookAxis(
  db: Database, actor: Actor, projectId: string,
  input: { axis: "row" | "column"; id: string },
): Promise<ActionResult<ProjectSheetsView>> {
  return withDoc(db, actor, projectId, ({ doc }) => {
    const grid = workbookDoc(doc);
    const axes = input.axis === "column" ? grid.columns : grid.rows;
    if (axes.length <= 1) throw new SheetInputError("Minimal satu koordinat harus tersisa.");
    const index = axes.findIndex((item) => item.id === input.id);
    if (index < 0) throw new SheetInputError("Koordinat workbook tidak ditemukan.");
    if (Object.values(grid.placements).some((placement) =>
      input.axis === "column" ? placement.columnId === input.id : placement.rowId === input.id)) {
      throw new SheetInputError("Koordinat berisi cell bisnis dan tidak dapat dihapus.");
    }
    if (grid.merges.some((merge) => {
      const bounds = workbookRangeBounds(grid, merge);
      return input.axis === "column"
        ? index >= bounds.left && index <= bounds.right
        : index >= bounds.top && index <= bounds.bottom;
    })) throw new SheetInputError("Delete ditolak karena memotong merge. Unmerge terlebih dahulu.");
    axes.splice(index, 1);
    for (const key of Object.keys(grid.styles)) {
      if (key.startsWith(`${input.id}::`) || key.endsWith(`::${input.id}`)) delete grid.styles[key];
    }
    return { doc, audit: `workbook_delete:${input.axis}`, before: input.id, after: null };
  });
}
