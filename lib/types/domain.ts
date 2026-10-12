/**
 * Domain row types — a 1:1 mirror of supabase/migrations/0001_schema.sql.
 * No invented columns: every field here exists in the database.
 */

export type UserRole = "ADMIN" | "PROCUREMENT" | "PIC" | "VIEWER";

export type ProjectStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif", COMPLETED: "Selesai", ON_HOLD: "Ditunda", CANCELLED: "Dibatalkan",
};

export type AccessLevel = "EDIT" | "VIEW";


export const PROJECT_STATUSES: ProjectStatus[] = [
  "ACTIVE",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
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
  volume: number | null;
  active_ahs_id?: string | null;
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
