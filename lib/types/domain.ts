/**
 * Domain row types — a 1:1 mirror of supabase/migrations/0001_schema.sql.
 * No invented columns: every field here exists in the database.
 */

export type UserRole = "ADMIN" | "PROCUREMENT" | "PIC" | "VIEWER";

export type ProjectStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";

export type AccessLevel = "EDIT" | "VIEW";

export type ScenarioType =
  | "STANDARD"
  | "CASH"
  | "TEMPO"
  | "INTERNAL_FIX"
  | "KROS_CEK"
  | "REAL_COST"
  | "KOMBINASI"
  | "BAGI_HASIL"
  | "OPSI_VOLUME";

export type HistoryAction = "INSERT" | "UPDATE" | "DELETE" | "CLONE" | "CALCULATE";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "ACTIVE",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
];

export const SCENARIO_TYPES: ScenarioType[] = [
  "STANDARD",
  "CASH",
  "TEMPO",
  "INTERNAL_FIX",
  "KROS_CEK",
  "REAL_COST",
  "KOMBINASI",
  "BAGI_HASIL",
  "OPSI_VOLUME",
];

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface Market {
  id: string;
  name: string;
  province: string | null;
  location: string | null;
  priority_class: string | null;
  notes: string | null;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface Customer {
  id: string;
  name: string;
  customer_type: string | null;
  default_term: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  contact: string | null;
  armada: string | null;
  stock: string | null;
  permit: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  customer_id: string | null;
  product_id: string | null;
  market_id: string | null;
  location: string | null;
  period_label: string | null;
  pic_id: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectVendor {
  id: string;
  project_id: string;
  vendor_id: string;
  is_selected: boolean;
  evaluation_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorPrice {
  id: string;
  project_id: string;
  vendor_id: string;
  scenario_id: string | null;
  base_price: number | null;
  ppn_rate: number | null;
  ppn_amount: number | null;
  pbbkb_rate: number | null;
  pbbkb_amount: number | null;
  pph_amount: number | null;
  oat_amount: number | null;
  ppn_oat_amount: number | null;
  bph_amount: number | null;
  extra_component_label: string | null;
  all_in_amount: number | null;
  all_in_formula_id: string | null;
  raw_include_price: number | null;
  divisor: number | null;
  ppn_is_formula: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ahs {
  id: string;
  project_id: string;
  template_id: string;
  code: string | null;
  title: string | null;
  product_id: string | null;
  volume: number | null;
  harga_jual_include: number | null;
  include_divisor: number | null;
  ppn_rate: number | null;
  pbbkb_rate: number | null;
  pph_inu_rate: number | null;
  bph_migas_rate: number | null;
  harga_keekonomian: number | null;
  marketing: string | null;
  payment_term: string | null;
  document_scheme: string | null;
  analysis_date: string | null;
  notes: string | null;
  revenue: number | null;
  total_cost: number | null;
  cost_per_liter: number | null;
  ppn_output: number | null;
  ppn_input: number | null;
  ppn_difference: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  net_profit_per_liter: number | null;
  profit_percentage: number | null;
  calculated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AhsCostItem {
  id: string;
  ahs_id: string;
  scenario_id: string | null;
  line_no: number;
  category: string | null;
  description: string;
  unit: string | null;
  rate: number | null;
  qty: number | null;
  total: number | null;
  formula_id: string | null;
  is_summed_in_total: boolean;
  created_at: string;
}

export interface PriceScenario {
  id: string;
  project_id: string;
  parent_scenario_id: string | null;
  name: string;
  scenario_type: ScenarioType;
  template_id: string;
  reason: string | null;
  is_locked: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioInput {
  id: string;
  scenario_id: string;
  field_key: string;
  value_num: number | null;
  value_text: string | null;
  value_date: string | null;
  created_at: string;
}

export interface CalculationResult {
  id: string;
  scenario_id: string;
  template_id: string;
  harga_jual_dpp: number | null;
  harga_jual_setelah_pajak: number | null;
  revenue: number | null;
  total_cost: number | null;
  cost_per_liter: number | null;
  ppn_output: number | null;
  ppn_input: number | null;
  ppn_difference: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  net_profit_per_liter: number | null;
  profit_percentage: number | null;
  formulas_used: Record<string, string> | null;
  engine_version: string | null;
  computed_at: string;
  is_valid: boolean;
}

export interface ProjectHistoryRow {
  id: string;
  project_id: string;
  scenario_id: string | null;
  entity: string;
  entity_id: string | null;
  action: HistoryAction;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  impact_json: Record<string, { before: number | null; after: number | null; delta: number | null }> | null;
  changed_by: string | null;
  changed_at: string;
}

export interface CalculationTemplateRow {
  template_id: string;
  template_name: string;
  source_sheet: string;
  source_block: string;
  input_definition: Array<{
    key: string;
    label: string;
    data_type: string;
    required: boolean;
    default?: number;
  }>;
  formula_definition: Record<string, string>;
  dependency_definition: Record<string, string[]>;
  output_definition: string[];
  coverage_note: string | null;
  version: number;
  active: boolean;
}

export interface FormulaRegistryRow {
  formula_id: string;
  formula_name: string;
  expression: string;
  excel_formula: string;
  source_sheet: string;
  source_cell: string;
  source_block: string;
  version: number;
  description: string | null;
  resolution: "RESOLVED" | "UNRESOLVED";
  active: boolean;
}
