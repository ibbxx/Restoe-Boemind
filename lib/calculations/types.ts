/** Domain types for the calculation engine. */

export type TemplateId =
  | "T_A_AHS_STANDARD"
  | "T_B_VENDOR_EVAL_PROFAMIR"
  | "T_C_PROYEKSI_LABA_RUGI"
  | "T_D_MARKET_CASH"
  | "T_E_AHS_PROFIT_SHARE";

/** Sale-side DPP variants found in the workbook (Phase 2.5 §7). */
export type SaleDppVariant = "F005" | "F005B" | "F005C";

/** Net-profit variants: F019A (2 terms) / F019B (3 terms, minus PBBKB diff). */
export type NetProfitVariant = "F019A" | "F019B";

export type Resolution = "RESOLVED" | "UNRESOLVED";

export interface FormulaDef {
  formula_id: string;
  formula_name: string;
  expression: string;
  excel_formula: string;
  source_sheet: string;
  source_cell: string;
  source_block: string;
  version: number;
  description: string;
  resolution: Resolution;
  active: boolean;
}

export interface TemplateInputDef {
  key: string;
  label: string;
  data_type: "number" | "array" | "string";
  required: boolean;
  default?: number;
}

export interface CalculationTemplate {
  template_id: TemplateId | string;
  template_name: string;
  source_sheet: string;
  source_block: string;
  version: number;
  active: boolean;
  coverage_note?: string;
  input_definition: TemplateInputDef[];
  formula_definition: Record<string, string>;
  dependency_definition: Record<string, string[]>;
  output_definition: string[];
}

/** A single cost line. `rate`/`qty` may be null = NOT APPLICABLE (never coerced to 0). */
export interface CostLineInput {
  line_no?: number;
  category: string;
  description: string;
  unit?: string;
  rate: number | null;
  qty: number | null;
}

export interface CostLineResult extends CostLineInput {
  total: number;
  rate_for_sum: number;
  applied: boolean;
}

export interface VendorInput {
  vendor_name?: string;
  base_price: number;
  ppn_rate?: number;
  pbbkb_rate?: number;
  pph_rate?: number;
  oat_rate?: number;
  ppn_oat_rate?: number;
  bph_rate?: number;
  all_in_variant?: "F002A" | "F002B";
}

export interface VendorResult {
  base_price: number;
  ppn: number;
  pbbkb: number;
  pph: number;
  oat: number;
  ppn_oat: number;
  bph: number;
  all_in: number;
  all_in_formula_id: string;
}

export interface AhsInput {
  template_id: string;
  volume: number | null;
  harga_jual_include: number | null | undefined;
  /**
   * F005B / F005C — the sale-side DPP as a DIRECT value.
   * Excel sometimes types the Harga Dasar number instead of `=include/divisor`
   * (F005B) or points it at a price derived in another block (F005C). When this
   * is present it wins over `harga_jual_include ÷ include_divisor`; nothing is
   * guessed and no divisor is invented to make the numbers fit.
   */
  harga_jual_dpp_input?: number | null;
  /** Which sale DPP variant this block uses (provenance, not arithmetic). */
  sale_dpp_variant?: SaleDppVariant;
  /** F019A (gross - ppn diff) or F019B (gross - ppn diff - PBBKB diff). */
  net_profit_formula_id?: NetProfitVariant;
  include_divisor?: number;
  harga_keekonomian?: number | null;
  /** F027B — HARGA JUAL SETELAH PAJAK typed directly in Excel instead of summed. */
  harga_jual_setelah_pajak_input?: number | null;
  /** Sale-side PPN rate. Excel has genuine 0% ('Non-PPN') blocks. */
  sale_ppn_rate?: number;
  /** Cost-side PPN masukan rate, read from the block's own formula. */
  ppn_input_rate?: number;
  ppn_rate?: number;
  pbbkb_rate?: number;
  /** F019B: whether the SELISIH PBBKB term is computed (false = Excel cell empty = 0). */
  pbbkb_difference_applicable?: boolean;
  pph_inu_rate?: number;
  bph_migas_rate?: number;
  base_price?: number | null;
  ppn_input_formula_id?: "F008A" | "F008B" | "F008C";
  cost_lines: CostLineInput[];
  /** C3 cost selection for F015B (row numbers flagged into total). */
  total_cost_included_lines?: number[];
}

export interface AhsResult {
  template_id: string;
  sale_dpp_variant: SaleDppVariant;
  harga_jual_dpp: number;
  /** F004 — diskon vs harga keekonomian as a ratio; null when the cell is empty. */
  diskon: number | null;
  harga_jual_setelah_pajak: number;
  /** Sale-side PBBKB (total Rp) and cost-side PBBKB (total Rp). */
  pbbkb_output: number;
  pbbkb_input: number;
  pbbkb_difference: number;
  revenue: number;
  cost_lines: CostLineResult[];
  total_cost: number;
  cost_per_liter: number;
  ppn_output: number;
  ppn_input: number;
  ppn_difference: number;
  gross_profit: number;
  net_profit: number;
  net_profit_per_liter: number;
  profit_percentage: number;
  formulas_used: Record<string, string>;
}

