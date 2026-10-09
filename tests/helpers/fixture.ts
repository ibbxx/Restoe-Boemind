import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { AhsInput, CostLineInput } from "../../lib/calculations/types";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "..", "fixtures", "excel-cases.json");

export interface ExcelCostLine {
  row: number;
  category: string;
  description: string;
  rate: number | null;
  qty: number | null;
  total_excel: number | null;
  rate_formula: string;
}

export interface ExcelCase {
  id: string;
  sheet: string;
  template: string;
  title_cell: string;
  title: string;
  label_col: number;
  out_col: number;
  /** F005 = include/divisor, F005B = literal DPP, F005C = DPP from another block. */
  sale_variant: "F005" | "F005B" | "F005C";
  harga_jual_include: number | null;
  include_divisor: number | null;
  harga_jual_dpp_input: number | null;
  sale_formula: string;
  sale_pbbkb_rate: number;
  sale_ppn_rate: number;
  /** F027A = sum of the sale rows, F027B = value typed directly in Excel. */
  hjsp_variant: "F027A" | "F027B";
  harga_jual_setelah_pajak_input: number | null;
  ppn_input_rate: number | null;
  ppn_input_basis_source: "FORMULA" | "DERIVED_FROM_VALUE" | "UNRESOLVED";
  pbbkb_difference_applicable: boolean;
  net_profit_third_operand: string | null;
  volume: number;
  base_price: number | null;
  ppn_input_formula_id: "F008A" | "F008B" | "F008C";
  /** F019A = gross - ppn diff, F019B = gross - ppn diff - PBBKB diff. */
  net_profit_formula_id: "F019A" | "F019B";
  /** F015A = SUM range, F015B = selected rows, F015C = literal. */
  total_cost_variant: "F015A" | "F015B" | "F015C";
  total_cost_override: number | null;
  /** false => this layout has profit-share rows instead of PERSENTASE. */
  has_profit_percentage: boolean;
  total_cost_formula: string;
  cost_lines: ExcelCostLine[];
  excel: {
    revenue: number;
    harga_jual_setelah_pajak: number;
    total_cost: number;
    cost_per_liter: number | null;
    gross_profit: number;
    ppn_difference: number | null;
    net_profit: number;
    net_profit_per_liter: number | null;
    profit_percentage: number | null;
    ppn_output: number | null;
    ppn_input: number | null;
  };
}

export interface ExcelVendorComponents {
  base_price: number | null;
  ppn: number | null;
  pbbkb: number | null;
  pph: number | null;
  oat: number | null;
  ppn_oat: number | null;
  bph: number | null;
}

export interface ExcelVendorCase {
  id: string;
  sheet: string;
  uraian_cell: string;
  vendor: string;
  base_price: number | null;
  ppn_rate_effective: number;
  /** false => the Excel PPN cell is a typed literal (data), not a formula. */
  ppn_is_formula: boolean;
  components: ExcelVendorComponents;
  /** Positional values of the 7 component rows (r+1..r+7). Excel names the 7th
   *  row 'BPH', 'SIB', 'PMKU', 'Izin bunker' or 'PPH Migas' depending on the
   *  block, but the arithmetic is identical — only the naming varies. */
  component_values: Array<number | null>;
  component_labels: string[];
  excel: { ppn: number | null; all_in: number | null };
  all_in_formula: string | null;
  all_in_component_rows: number | null;
  all_in_from_row: number | null;
  all_in_to_row: number | null;
  /** Value of the SUM range evaluated from the workbook cells. */
  all_in_formula_value: number | null;
  uraian_row: number;
  includes_bph: boolean | null;
  ppn_formula: string;
  base_formula: string;
}

export interface CensusEntry {
  id: string;
  sheet: string;
  title_cell: string;
  title: string;
  classification:
    | "TESTED"
    | "INCOMPLETE"
    | "INCOMPLETE_COST_ROWS"
    | "INCOMPLETE_VALUES"
    | "NO_LABEL_COL"
    | "ANNOTATION_TITLE"
    | "SALE_FORMULA_VARIANT"
    | "SALE_ROW_NOT_FOUND"
    | "TOTAL_COST_VARIANT"
    | "PPN_INPUT_VARIANT"
    | "CUSTOM_FORMULA_BLOCK";
  detail?: string | null;
  total_cost_variant?: string | null;
  has_profit_percentage?: boolean;
  sale_variant?: string;
}

export interface RefError {
  sheet: string;
  cell: string;
  formula: string;
}

export interface Fixture {
  source: string;
  case_count: number;
  cases: ExcelCase[];
  vendor_case_count: number;
  vendor_cases: ExcelVendorCase[];
  census_count: number;
  census: CensusEntry[];
  census_summary: Record<string, number>;
  divisor_census: Array<{ divisor: number; count: number; examples: string[] }>;
  vendor_base_divisors: Array<{ divisor: number; count: number; examples: string[] }>;
  total_cost_shapes: Record<string, number>;
  sale_shapes: Array<{ pattern: string; count: number; examples: string[] }>;
  ppn_input_shapes: Record<string, number>;
  net_profit_shapes: Record<string, number>;
  percentage_shapes: Record<string, number>;
  ref_errors: RefError[];
  ref_error_dependents: Array<{ sheet: string; cell: string; formula: string; references: string }>;
  unresolved_cells: Record<string, string[]>;
  workbook_unresolved_cells: Record<string, string[]>;
}

let cached: Fixture | null = null;

export function loadFixture(): Fixture {
  if (!cached) {
    cached = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
  }
  return cached;
}

export function toCostLines(c: ExcelCase): CostLineInput[] {
  return c.cost_lines.map((cl) => ({
    category: cl.category,
    description: cl.description,
    rate: cl.rate,
    qty: cl.qty,
  }));
}

const TEMPLATE_BY_LETTER: Record<string, string> = {
  A: "T_A_AHS_STANDARD",
  B: "T_B_VENDOR_EVAL_PROFAMIR",
  C: "T_C_PROYEKSI_LABA_RUGI",
  D: "T_D_MARKET_CASH",
  E: "T_E_AHS_PROFIT_SHARE",
};

/** Build the engine input for a real Excel case (all values from the workbook). */
export function toAhsInput(c: ExcelCase): AhsInput {
  return {
    template_id: TEMPLATE_BY_LETTER[c.template] ?? "T_A_AHS_STANDARD",
    volume: c.volume,
    harga_jual_include: c.harga_jual_include,
    include_divisor: c.include_divisor ?? undefined,
    harga_jual_dpp_input: c.harga_jual_dpp_input,
    sale_dpp_variant: c.sale_variant,
      net_profit_formula_id: c.net_profit_formula_id,
    pbbkb_rate: c.sale_pbbkb_rate,
    sale_ppn_rate: c.sale_ppn_rate,
    harga_jual_setelah_pajak_input: c.harga_jual_setelah_pajak_input,
    ppn_input_rate: c.ppn_input_rate ?? undefined,
    pbbkb_difference_applicable: c.pbbkb_difference_applicable,
    ppn_rate: 0.11,
    ppn_input_formula_id: c.ppn_input_formula_id,
    base_price: c.base_price,
    cost_lines: toCostLines(c),
  };
}
