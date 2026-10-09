/**
 * Local In-Memory Demo Database (Phase 3.5: LOCAL DEMO MODE / UAT).
 *
 * Separated cleanly from the Supabase production data layer.
 * Provides in-memory storage for:
 *   - projects
 *   - project_members
 *   - vendors
 *   - vendor_prices
 *   - ahs
 *   - ahs_cost_items
 *   - price_scenarios
 *   - scenario_inputs
 *   - calculation_results
 *   - project_history
 *   - products, customers, markets, profiles
 *   - calculation_templates & formula_registry
 *
 * Persisted in `globalThis.__LOCAL_DEMO_DB__` across requests in the Node server
 * process so that server actions and page renders share the state.
 */

import { createMemoryDatabase, type Row } from "./memory-db";
import type { Database, TableName } from "./db";
import templatesJson from "../formulas/calculation-templates.json";
import formulasJson from "../formulas/formula-registry.json";

export const DEMO_UUIDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  procurement: "00000000-0000-4000-8000-000000000002",
  pic: "00000000-0000-4000-8000-000000000003",
  customerTonasa: "00000000-0000-4000-8000-0000000000c1",
  customerSemenPadang: "00000000-0000-4000-8000-0000000000c2",
  customerIwip: "00000000-0000-4000-8000-0000000000c3",
  productHsd: "00000000-0000-4000-8000-0000000000d1",
  productB35: "00000000-0000-4000-8000-0000000000d2",
  marketIndustri: "00000000-0000-4000-8000-0000000000m1",
  marketTambang: "00000000-0000-4000-8000-0000000000m2",
  vendorBlasdu: "00000000-0000-4000-8000-0000000000b1",
  vendorMegaUtama: "00000000-0000-4000-8000-0000000000b2",
  vendorBeb: "00000000-0000-4000-8000-0000000000b3",
  vendorMamuju: "00000000-0000-4000-8000-0000000000b4",
  projectCaseA: "00000000-0000-4000-8000-0000000000a1",
  projectCaseB: "00000000-0000-4000-8000-0000000000a2",
  projectCaseC: "00000000-0000-4000-8000-0000000000a3",
  projectCaseE: "00000000-0000-4000-8000-0000000000a4",
  ahsCaseA: "00000000-0000-4000-8000-0000000000e1",
  ahsCaseE: "00000000-0000-4000-8000-0000000000e4",
};

export function createInitialDemoSeed(): Partial<Record<TableName, Row[]>> {
  const templates: Row[] = (templatesJson.templates || []).map((t) => ({
    template_id: t.template_id,
    template_name: t.template_name,
    source_sheet: t.source_sheet,
    source_block: t.source_block,
    input_definition: t.input_definition,
    formula_definition: t.formula_definition,
    dependency_definition: t.dependency_definition,
    output_definition: t.output_definition,
    coverage_note: t.coverage_note ?? null,
    version: t.version ?? 1,
    active: t.active ?? true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }));

  const formulas: Row[] = (formulasJson.formulas || []).map((f) => ({
    formula_id: f.formula_id,
    formula_name: f.formula_name,
    expression: f.expression,
    excel_formula: f.excel_formula,
    source_sheet: f.source_sheet,
    source_cell: f.source_cell,
    source_block: f.source_block,
    version: f.version,
    description: f.description,
    resolution: f.resolution,
    active: f.active,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }));

  const profiles: Row[] = [
    {
      id: DEMO_UUIDS.admin,
      email: "admin@demo.local",
      full_name: "Admin Demo",
      role: "ADMIN",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.procurement,
      email: "procurement@demo.local",
      full_name: "Procurement Lead (Demo Mode)",
      role: "PROCUREMENT",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.pic,
      email: "pic@demo.local",
      full_name: "PIC Field Demo",
      role: "PIC",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  const customers: Row[] = [
    { id: DEMO_UUIDS.customerTonasa, name: "PT Tonasa", customer_type: "BUMN", default_term: "30 Hari" },
    { id: DEMO_UUIDS.customerSemenPadang, name: "PT Semen Padang", customer_type: "BUMN", default_term: "45 Hari" },
    { id: DEMO_UUIDS.customerIwip, name: "PT IWIP", customer_type: "SWASTA", default_term: "Cash in Advance" },
  ];

  const products: Row[] = [
    { id: DEMO_UUIDS.productHsd, code: "HSD", name: "High Speed Diesel (Solar)", unit: "liter" },
    { id: DEMO_UUIDS.productB35, code: "B35", name: "Biosolar B35", unit: "liter" },
  ];

  const markets: Row[] = [
    { id: DEMO_UUIDS.marketIndustri, code: "IND", name: "Industri & Manufaktur" },
    { id: DEMO_UUIDS.marketTambang, code: "TAM", name: "Pertambangan" },
  ];

  const vendors: Row[] = [
    {
      id: DEMO_UUIDS.vendorBlasdu,
      name: "BLASDU",
      contact: "Budi Santoso",
      armada: "12 unit tangki",
      stock: "1.500 KL",
      permit: "Lengkap (Migas & Bunker)",
      address: "Jl. Pelabuhan No. 12, Semarang",
      notes: "Vendor utama suplai area Jawa Tengah dan sekitarnya",
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.vendorMegaUtama,
      name: "MEGA UTAMA",
      contact: "Hendra Wijaya",
      armada: "8 unit tangki",
      stock: "2.000 KL",
      permit: "Lengkap",
      address: "Jl. Industri Raya Blok C, Surabaya",
      notes: "Suplai area Jawa Timur & Makassar",
      status: "ACTIVE",
      created_at: "2026-01-02T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.vendorBeb,
      name: "PT BEB",
      contact: "Anton Setiawan",
      armada: "5 unit",
      stock: "1.000 KL",
      permit: "Lengkap",
      address: "Jl. RE Martadinata, Tanjung Priok",
      notes: "Vendor bunker Jabodetabek",
      status: "ACTIVE",
      created_at: "2026-01-03T00:00:00.000Z",
      updated_at: "2026-01-03T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.vendorMamuju,
      name: "PBP MAMUJU",
      contact: "Syarifuddin",
      armada: "10 unit",
      stock: "1.200 KL",
      permit: "Lengkap",
      address: "Jl. Poros Mamuju - Majene",
      notes: "Suplai Sulawesi Barat",
      status: "ACTIVE",
      created_at: "2026-01-04T00:00:00.000Z",
      updated_at: "2026-01-04T00:00:00.000Z",
    },
  ];

  const projects: Row[] = [
    {
      id: DEMO_UUIDS.projectCaseA,
      code: "INU-50K",
      name: "Perhitungan INU — 50.000 Liter (Case A: 1.11 Divisor)",
      customer_id: DEMO_UUIDS.customerTonasa,
      product_id: DEMO_UUIDS.productHsd,
      market_id: DEMO_UUIDS.marketIndustri,
      location: "Medan",
      period_label: "P2 SEP-26",
      pic_id: DEMO_UUIDS.pic,
      status: "ACTIVE",
      notes: "Representative Case A: Standard 1.11 divisor dari sheet Perhitungan INU::M6",
      created_by: DEMO_UUIDS.procurement,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-10T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.projectCaseB,
      code: "PRIOR-1.185",
      name: "AHAS Prioritas — 10.000 Liter (Case B: 1.185 Divisor)",
      customer_id: DEMO_UUIDS.customerSemenPadang,
      product_id: DEMO_UUIDS.productHsd,
      market_id: DEMO_UUIDS.marketTambang,
      location: "Padang",
      period_label: "Q3-26",
      pic_id: DEMO_UUIDS.pic,
      status: "ACTIVE",
      notes: "Representative Case B: 1.185 divisor variant dari sheet AHAS Prioritas::BS2",
      created_by: DEMO_UUIDS.procurement,
      created_at: "2026-08-15T00:00:00.000Z",
      updated_at: "2026-08-20T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.projectCaseC,
      code: "PRIOR-1.16",
      name: "AHAS Prioritas — 425.000 Liter (Case C: 1.16 Divisor)",
      customer_id: DEMO_UUIDS.customerIwip,
      product_id: DEMO_UUIDS.productHsd,
      market_id: DEMO_UUIDS.marketTambang,
      location: "Morowali",
      period_label: "AUG-26",
      pic_id: DEMO_UUIDS.pic,
      status: "ACTIVE",
      notes: "Representative Case C: 1.16 divisor variant dari sheet AHAS Prioritas::CU173",
      created_by: DEMO_UUIDS.procurement,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.projectCaseE,
      code: "EVAL-TL",
      name: "Eval Vendor TL — 15.000 Liter (Case D & E: Multi-Vendor Scenario)",
      customer_id: DEMO_UUIDS.customerTonasa,
      product_id: DEMO_UUIDS.productHsd,
      market_id: DEMO_UUIDS.marketIndustri,
      location: "Kendal / Semarang",
      period_label: "P1 OKT-26",
      pic_id: DEMO_UUIDS.pic,
      status: "ACTIVE",
      notes: "Representative Case D (Vendor Blasdu/Mega Utama) & Case E (Scenario V1 Initial vs V2 Clone)",
      created_by: DEMO_UUIDS.procurement,
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-09-15T00:00:00.000Z",
    },
  ];

  const project_members: Row[] = [
    { id: "pm-1", project_id: DEMO_UUIDS.projectCaseA, profile_id: DEMO_UUIDS.pic, access_level: "EDIT" },
    { id: "pm-2", project_id: DEMO_UUIDS.projectCaseB, profile_id: DEMO_UUIDS.pic, access_level: "EDIT" },
    { id: "pm-3", project_id: DEMO_UUIDS.projectCaseC, profile_id: DEMO_UUIDS.pic, access_level: "EDIT" },
    { id: "pm-4", project_id: DEMO_UUIDS.projectCaseE, profile_id: DEMO_UUIDS.pic, access_level: "EDIT" },
  ];

  const project_vendors: Row[] = [
    {
      id: "pv-case-a-1",
      project_id: DEMO_UUIDS.projectCaseA,
      vendor_id: DEMO_UUIDS.vendorBlasdu,
      is_selected: true,
      evaluation_note: "Vendor terpilih harga dasar kompetitif",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "pv-case-e-1",
      project_id: DEMO_UUIDS.projectCaseE,
      vendor_id: DEMO_UUIDS.vendorBlasdu,
      is_selected: true,
      evaluation_note: "Vendor V1 Initial",
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-09-15T00:00:00.000Z",
    },
    {
      id: "pv-case-e-2",
      project_id: DEMO_UUIDS.projectCaseE,
      vendor_id: DEMO_UUIDS.vendorMegaUtama,
      is_selected: false,
      evaluation_note: "Vendor perbandingan V2",
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-09-15T00:00:00.000Z",
    },
  ];

  const vendor_prices: Row[] = [
    {
      id: "vp-case-a-1",
      project_id: DEMO_UUIDS.projectCaseA,
      vendor_id: DEMO_UUIDS.vendorBlasdu,
      base_price: 17737,
      ppn_rate: 0.11,
      ppn_amount: 1951.07,
      ppn_is_formula: true,
      pbbkb_amount: 0,
      pph_amount: 0,
      oat_amount: 0,
      ppn_oat_amount: 0,
      bph_amount: 0,
      extra_component_label: null,
      all_in_price: 19688.07,
      all_in_variant: "F002B",
      note: "Harga dasar dari Excel Perhitungan INU::M6",
      is_active: true,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "vp-case-e-1",
      project_id: DEMO_UUIDS.projectCaseE,
      vendor_id: DEMO_UUIDS.vendorBlasdu,
      base_price: 14500,
      ppn_rate: 0.11,
      ppn_amount: 1595,
      ppn_is_formula: true,
      pbbkb_amount: 0,
      pph_amount: 0,
      oat: 0,
      ppn_oat_amount: 0,
      bph_amount: 0,
      extra_component_label: null,
      all_in_price: 16095,
      all_in_variant: "F002B",
      note: "Case D / E (V1): Blasdu 14.500 all-in 16.095",
      is_active: true,
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-09-15T00:00:00.000Z",
    },
    {
      id: "vp-case-e-2",
      project_id: DEMO_UUIDS.projectCaseE,
      vendor_id: DEMO_UUIDS.vendorMegaUtama,
      base_price: 16396.39,
      ppn_rate: 0.11,
      ppn_amount: 1803.6029,
      ppn_is_formula: true,
      pbbkb_amount: 0,
      pph_amount: 0,
      oat: 0,
      ppn_oat_amount: 0,
      bph_amount: 0,
      extra_component_label: null,
      all_in_price: 18199.9929,
      all_in_variant: "F002B",
      note: "Case D: Mega Utama 16.396,39 all-in 18.199,99",
      is_active: true,
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-09-15T00:00:00.000Z",
    },
  ];

  // AHS for Case A (Perhitungan INU::M6)
  const ahs: Row[] = [
    {
      id: DEMO_UUIDS.ahsCaseA,
      project_id: DEMO_UUIDS.projectCaseA,
      template_id: "T_A_AHS_STANDARD",
      code: "AHS-INU-01",
      title: "ANALISIS HARGA SATUAN (AHS) — Case A",
      product_id: DEMO_UUIDS.productHsd,
      volume: 50000,
      harga_jual_include: 22500,
      include_divisor: 1.11,
      ppn_rate: 0.11,
      pbbkb_rate: 0,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
      harga_keekonomian: null,
      marketing: "Bambang",
      payment_term: "30 Hari",
      document_scheme: "Standard",
      analysis_date: "2026-09-02",
      notes: "Golden Case A: 1.11 divisor",
      revenue: null,
      total_cost: null,
      cost_per_liter: null,
      ppn_output: null,
      ppn_input: null,
      ppn_difference: null,
      gross_profit: null,
      net_profit: null,
      net_profit_per_liter: null,
      profit_percentage: null,
      calculated_at: null,
      created_at: "2026-09-02T00:00:00.000Z",
      updated_at: "2026-09-02T00:00:00.000Z",
    },
    {
      id: DEMO_UUIDS.ahsCaseE,
      project_id: DEMO_UUIDS.projectCaseE,
      template_id: "T_B_VENDOR_EVAL_PROFAMIR",
      code: "AHS-TL-01",
      title: "ANALISIS HARGA SATUAN (AHS) — Case E",
      product_id: DEMO_UUIDS.productHsd,
      volume: 15000,
      harga_jual_include: 21200,
      include_divisor: 1.11,
      ppn_rate: 0.11,
      pbbkb_rate: 0,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
      harga_keekonomian: null,
      marketing: "Rian",
      payment_term: "Tempo",
      document_scheme: "FOB",
      analysis_date: "2026-09-15",
      notes: "Golden Case E: Eval Vendor TL",
      revenue: null,
      total_cost: null,
      cost_per_liter: null,
      ppn_output: null,
      ppn_input: null,
      ppn_difference: null,
      gross_profit: null,
      net_profit: null,
      net_profit_per_liter: null,
      profit_percentage: null,
      calculated_at: null,
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-09-15T00:00:00.000Z",
    },
  ];

  // Cost items for Case A (from Perhitungan INU::M6 cost lines)
  const ahs_cost_items: Row[] = [
    {
      id: "ci-a-1",
      ahs_id: DEMO_UUIDS.ahsCaseA,
      scenario_id: null,
      line_no: 1,
      category: "HPP",
      description: "Harga Dasar (Vendor)",
      unit: "liter",
      rate: 17737,
      qty: 50000,
      total: 886850000,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-a-2",
      ahs_id: DEMO_UUIDS.ahsCaseA,
      scenario_id: null,
      line_no: 2,
      category: "PAJAK",
      description: "PPN Masukan (11%)",
      unit: "liter",
      rate: 1951.07,
      qty: 50000,
      total: 97553500,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-a-3",
      ahs_id: DEMO_UUIDS.ahsCaseA,
      scenario_id: null,
      line_no: 3,
      category: "ONGKOS ANGKUT",
      description: "Ongkos Angkut Darat (OAT)",
      unit: "liter",
      rate: 450,
      qty: 50000,
      total: 22500000,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-a-4",
      ahs_id: DEMO_UUIDS.ahsCaseA,
      scenario_id: null,
      line_no: 4,
      category: "BIAYA OPERASIONAL",
      description: "Handling & Operasional Lapangan",
      unit: "liter",
      rate: 200,
      qty: 50000,
      total: 10000000,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-a-5",
      ahs_id: DEMO_UUIDS.ahsCaseA,
      scenario_id: null,
      line_no: 5,
      category: "COST OF FUND",
      description: "Bunga Bank / Biaya Pembiayaan",
      unit: "liter",
      rate: 300,
      qty: 50000,
      total: 15000000,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-a-6",
      ahs_id: DEMO_UUIDS.ahsCaseA,
      scenario_id: null,
      line_no: 6,
      category: "BIAYA PROYEK",
      description: "Koordinasi Lapangan / Kawalan",
      unit: "liter",
      rate: 160,
      qty: 50000,
      total: 8000000,
      formula_id: "F007",
      is_summed_in_total: true,
    },
  ];

  // Real `project_history` schema (string values only — never a JSON object).
  const project_history: Row[] = [
    {
      id: "hist-1",
      project_id: DEMO_UUIDS.projectCaseA,
      scenario_id: null,
      changed_by: DEMO_UUIDS.procurement,
      entity: "projects",
      entity_id: DEMO_UUIDS.projectCaseA,
      action: "INSERT",
      field: "project",
      old_value: null,
      new_value: projects[0]?.name ?? null,
      reason: "Initial project setup in Demo Mode",
      impact_json: null,
      changed_at: "2026-09-01T00:00:00.000Z",
    },
  ];

  return {
    calculation_templates: templates,
    formula_registry: formulas,
    profiles,
    customers,
    products,
    markets,
    vendors,
    projects,
    project_members,
    project_vendors,
    vendor_prices,
    ahs,
    ahs_cost_items,
    price_scenarios: [],
    scenario_inputs: [],
    calculation_results: [],
    project_history,
    project_sheets: [],
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __LOCAL_DEMO_DB__: Database | undefined;
}

/**
 * Returns the singleton in-memory database for local demo mode.
 * Creates it with initial seed if not already instantiated.
 */
export function getLocalDemoDatabase(): Database {
  if (!globalThis.__LOCAL_DEMO_DB__) {
    globalThis.__LOCAL_DEMO_DB__ = createMemoryDatabase({
      seed: createInitialDemoSeed(),
    });
  }
  return globalThis.__LOCAL_DEMO_DB__;
}

/**
 * Resets the in-memory demo database back to fresh initial seed.
 */
export function resetLocalDemoDatabase(): Database {
  const fresh = createMemoryDatabase({
    seed: createInitialDemoSeed(),
  });
  globalThis.__LOCAL_DEMO_DB__ = fresh;
  return fresh;
}
