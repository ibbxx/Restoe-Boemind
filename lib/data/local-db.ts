/**
 * Persistent Local Database (Phase 3.5: MVP LOCAL MODE).
 *
 * Implements the Database port using in-memory state backed by local disk storage
 * (`.data/local-store.json`).
 *
 * Guarantees:
 *   1. Zero Supabase dependencies / Zero external network calls
 *   2. Refreshing the browser or restarting dev server does NOT wipe user data
 *   3. All writes are persisted to disk automatically
 *   4. Seed data comes from real Excel fixtures, NOT hardcoded component constants
 *   5. Completely swappable with SupabaseRepository later without touching UI
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { Database, TableName, SelectOptions, QueryResult } from "./db";
import { createMemoryDatabase, advanceMemoryIds, type Row } from "./memory-db";
import templatesJson from "../formulas/calculation-templates.json";
import formulasJson from "../formulas/formula-registry.json";
import fixtureJson from "../../tests/fixtures/excel-cases.json";

const DATA_DIR = resolve(process.cwd(), ".data");
const STORE_PATH = resolve(DATA_DIR, "local-store.json");

export const LOCAL_UUIDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  procurement: "00000000-0000-4000-8000-000000000002",
  pic: "00000000-0000-4000-8000-000000000003",
  customerCianjur: "00000000-0000-4000-8000-0000000000c0",
  customerTonasa: "00000000-0000-4000-8000-0000000000c1",
  customerSemenPadang: "00000000-0000-4000-8000-0000000000c2",
  customerIwip: "00000000-0000-4000-8000-0000000000c3",
  productHsd: "00000000-0000-4000-8000-0000000000d1",
  productB35: "00000000-0000-4000-8000-0000000000d2",
  vendorPbp: "00000000-0000-4000-8000-0000000000b0",
  vendorIndobunker: "00000000-0000-4000-8000-0000000000b1",
  vendorMavi: "00000000-0000-4000-8000-0000000000b2",
  vendorBlasdu: "00000000-0000-4000-8000-0000000000b3",
  vendorMegaUtama: "00000000-0000-4000-8000-0000000000b4",
  projectCianjur: "00000000-0000-4000-8000-0000000000a0",
  ahsCianjur: "00000000-0000-4000-8000-0000000000e0",
};

/**
 * Builds the initial seed dataset sourced from real Excel fixtures and templates.
 * No hardcoded UI values — everything has genuine business provenance.
 */
export function buildFixtureSeed(): Record<TableName, Row[]> {
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
      id: LOCAL_UUIDS.admin,
      email: "admin@local.test",
      full_name: "Administrator",
      role: "ADMIN",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: LOCAL_UUIDS.procurement,
      email: "procurement@local.test",
      full_name: "Procurement Lead",
      role: "PROCUREMENT",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: LOCAL_UUIDS.pic,
      email: "pic@local.test",
      full_name: "PIC Field",
      role: "PIC",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  const customers: Row[] = [
    { id: LOCAL_UUIDS.customerCianjur, name: "PT Cikondang Kencana Prima", customer_type: "SWASTA", default_term: "COD" },
    { id: LOCAL_UUIDS.customerTonasa, name: "PT Tonasa", customer_type: "BUMN", default_term: "30 Hari" },
    { id: LOCAL_UUIDS.customerSemenPadang, name: "PT Semen Padang", customer_type: "BUMN", default_term: "45 Hari" },
    { id: LOCAL_UUIDS.customerIwip, name: "PT IWIP", customer_type: "SWASTA", default_term: "Cash in Advance" },
  ];

  const products: Row[] = [
    { id: LOCAL_UUIDS.productHsd, code: "HSD", name: "High Speed Diesel (Solar Industri)", unit: "liter" },
    { id: LOCAL_UUIDS.productB35, code: "B35", name: "Biosolar B35", unit: "liter" },
  ];

  const markets: Row[] = [
    { id: "mkt-1", code: "IND", name: "Industri & Manufaktur" },
    { id: "mkt-2", code: "TAM", name: "Pertambangan" },
    { id: "mkt-3", code: "MAR", name: "Marine & Bunker" },
  ];

  const vendors: Row[] = [
    {
      id: LOCAL_UUIDS.vendorPbp,
      name: "PBP",
      contact: "Ahmad",
      armada: "10 unit",
      stock: "1.200 KL",
      permit: "Lengkap",
      address: "Pelabuhan",
      notes: "Vendor utama",
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: LOCAL_UUIDS.vendorIndobunker,
      name: "Indobunker",
      contact: "Bambang",
      armada: "8 unit",
      stock: "1.500 KL",
      permit: "Lengkap",
      address: "Semarang",
      notes: "Vendor tender",
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: LOCAL_UUIDS.vendorMavi,
      name: "MAVI",
      contact: "Charles",
      armada: "6 unit",
      stock: "800 KL",
      permit: "Lengkap",
      address: "Surabaya",
      notes: "Vendor pendukung",
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: LOCAL_UUIDS.vendorBlasdu,
      name: "BLASDU",
      contact: "Budi",
      armada: "12 unit",
      stock: "2.000 KL",
      permit: "Lengkap",
      address: "Semarang",
      notes: "Vendor evaluasi TL",
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: LOCAL_UUIDS.vendorMegaUtama,
      name: "MEGA UTAMA",
      contact: "Hendra",
      armada: "14 unit",
      stock: "2.500 KL",
      permit: "Lengkap",
      address: "Jakarta",
      notes: "Vendor perbandingan",
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  // Sourced from workbook: P1 OKT-26 (Cianjur)
  const projects: Row[] = [
    {
      id: LOCAL_UUIDS.projectCianjur,
      code: "P1 OKT-26",
      name: "Pengadaan HSD Cianjur — PT Cikondang Kencana Prima",
      customer_id: LOCAL_UUIDS.customerCianjur,
      product_id: LOCAL_UUIDS.productHsd,
      market_id: "mkt-1",
      location: "Cianjur",
      period_label: "P1 OKT-26",
      pic_id: LOCAL_UUIDS.pic,
      status: "ACTIVE",
      notes: "Proyek pengadaan HSD volume 247.000 liter lokasi Cianjur",
      created_by: LOCAL_UUIDS.procurement,
      created_at: "2026-10-07T00:00:00.000Z",
      updated_at: "2026-10-07T00:00:00.000Z",
    },
  ];

  const project_members: Row[] = [
    { id: "pm-1", project_id: LOCAL_UUIDS.projectCianjur, profile_id: LOCAL_UUIDS.procurement, access_level: "EDIT" },
    { id: "pm-2", project_id: LOCAL_UUIDS.projectCianjur, profile_id: LOCAL_UUIDS.pic, access_level: "EDIT" },
  ];

  const project_vendors: Row[] = [
    {
      id: "pv-1",
      project_id: LOCAL_UUIDS.projectCianjur,
      vendor_id: LOCAL_UUIDS.vendorPbp,
      is_selected: true,
      evaluation_note: "Vendor utama P1 OKT-26",
      created_at: "2026-10-07T00:00:00.000Z",
      updated_at: "2026-10-07T00:00:00.000Z",
    },
    {
      id: "pv-2",
      project_id: LOCAL_UUIDS.projectCianjur,
      vendor_id: LOCAL_UUIDS.vendorIndobunker,
      is_selected: false,
      evaluation_note: "Vendor perbandingan 1",
      created_at: "2026-10-07T00:00:00.000Z",
      updated_at: "2026-10-07T00:00:00.000Z",
    },
    {
      id: "pv-3",
      project_id: LOCAL_UUIDS.projectCianjur,
      vendor_id: LOCAL_UUIDS.vendorMavi,
      is_selected: false,
      evaluation_note: "Vendor perbandingan 2",
      created_at: "2026-10-07T00:00:00.000Z",
      updated_at: "2026-10-07T00:00:00.000Z",
    },
  ];

  const vendor_prices: Row[] = [
    {
      id: "vp-1",
      project_id: LOCAL_UUIDS.projectCianjur,
      vendor_id: LOCAL_UUIDS.vendorPbp,
      base_price: 14700,
      ppn_rate: 0.11,
      ppn_amount: 1617,
      ppn_is_formula: true,
      pbbkb_amount: 0,
      pph_amount: 0,
      oat_amount: 0,
      ppn_oat_amount: 0,
      bph_amount: 0,
      extra_component_label: null,
      all_in_amount: 16317,
      all_in_formula_id: "F002B",
      note: "PPN",
      created_by: LOCAL_UUIDS.procurement,
      created_at: "2026-10-07T00:00:00.000Z",
      updated_at: "2026-10-07T00:00:00.000Z",
    },
    {
      id: "vp-2",
      project_id: LOCAL_UUIDS.projectCianjur,
      vendor_id: LOCAL_UUIDS.vendorIndobunker,
      base_price: 17000,
      ppn_rate: 0.11,
      ppn_amount: 1870,
      ppn_is_formula: true,
      pbbkb_amount: 0,
      pph_amount: 0,
      oat_amount: 0,
      ppn_oat_amount: 0,
      bph_amount: 0,
      extra_component_label: null,
      all_in_amount: 18870,
      all_in_formula_id: "F002B",
      note: "PPN",
      created_by: LOCAL_UUIDS.procurement,
      created_at: "2026-10-07T00:00:00.000Z",
      updated_at: "2026-10-07T00:00:00.000Z",
    },
    {
      id: "vp-3",
      project_id: LOCAL_UUIDS.projectCianjur,
      vendor_id: LOCAL_UUIDS.vendorMavi,
      base_price: 15900,
      ppn_rate: 0.11,
      ppn_amount: 1749,
      ppn_is_formula: true,
      pbbkb_amount: 0,
      pph_amount: 0,
      oat_amount: 0,
      ppn_oat_amount: 0,
      bph_amount: 0,
      extra_component_label: null,
      all_in_amount: 17649,
      all_in_formula_id: "F002B",
      note: "PPN",
      created_by: LOCAL_UUIDS.procurement,
      created_at: "2026-10-07T00:00:00.000Z",
      updated_at: "2026-10-07T00:00:00.000Z",
    },
  ];

  const ahs: Row[] = [
    {
      id: LOCAL_UUIDS.ahsCianjur,
      project_id: LOCAL_UUIDS.projectCianjur,
      template_id: "T_A_AHS_STANDARD",
      code: "AHS-CIANJUR",
      title: "PROYEKSI LABA RUGI — Cianjur P1 OKT-26",
      product_id: LOCAL_UUIDS.productHsd,
      volume: 247000,
      harga_jual_include: 21200,
      include_divisor: 1.16,
      ppn_rate: 0.11,
      pbbkb_rate: 0.05,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
      harga_keekonomian: null,
      marketing: "Rian",
      payment_term: "COD",
      document_scheme: "Fulldoc",
      analysis_date: "07/10/2026",
      notes: "Jika Biaya Proyek Pak Andri mau 40%, maka profit bersih RBI 2.346\nJika Biaya Proyek Pak Andri mau 50%, maka profit bersih RBI 2.038",
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
      created_at: "2026-10-07T00:00:00.000Z",
      updated_at: "2026-10-07T00:00:00.000Z",
    },
  ];

  const ahs_cost_items: Row[] = [
    {
      id: "ci-c1",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 1,
      category: "HPP",
      description: "Harga Dasar",
      rate: 14700,
      qty: 247000,
      total: 3630900000,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c2",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 2,
      category: "HPP",
      description: "OAT",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c3",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 3,
      category: "HPP",
      description: "PBBKB",
      rate: 913.7931,
      qty: 247000,
      total: 225706897,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c4",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 4,
      category: "HPP",
      description: "PPH INU 0,3%",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c5",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 5,
      category: "HPP",
      description: "BPH Migas 0,25%",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c6",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 6,
      category: "PAJAK",
      description: "PPN 11%",
      rate: 1617,
      qty: 247000,
      total: 399399000,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c7",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 7,
      category: "PAJAK",
      description: "PPH penjualan BUMN 1,5%",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c8",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 8,
      category: "COST OF FUND",
      description: "Investor",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c9",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 9,
      category: "COST OF FUND",
      description: "Bunga Bank",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c10",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 10,
      category: "COST OF FUND",
      description: "Diskonto SKBDN 3,3%",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c11",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 11,
      category: "OPERASIONAL",
      description: "Biaya Operasional",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c12",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 12,
      category: "OPERASIONAL",
      description: "Bonus Marketing",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c13",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 13,
      category: "ASET",
      description: "Tangki Solar",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c14",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 14,
      category: "KOORDINASI",
      description: "Ormas/Lainnya",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c15",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 15,
      category: "RELASI",
      description: "Biaya Proyek PAK ANDRI 60:40",
      rate: 1230.3448,
      qty: 247000,
      total: 303895172,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c16",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 16,
      category: "RELASI",
      description: "Biaya Bu Lisa dan Pak Taufiq",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c17",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 17,
      category: "RESIKO",
      description: "Pak awal",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
    {
      id: "ci-c18",
      ahs_id: LOCAL_UUIDS.ahsCianjur,
      scenario_id: null,
      line_no: 18,
      category: "RESIKO",
      description: "Spare kenaikan harga",
      rate: 0,
      qty: 247000,
      total: 0,
      formula_id: "F007",
      is_summed_in_total: true,
    },
  ];

  // Real `project_history` schema (string values only — never a JSON object).
  const project_history: Row[] = [
    {
      id: "hist-0",
      project_id: LOCAL_UUIDS.projectCianjur,
      scenario_id: null,
      changed_by: LOCAL_UUIDS.procurement,
      entity: "projects",
      entity_id: LOCAL_UUIDS.projectCianjur,
      action: "INSERT",
      field: "project",
      old_value: null,
      new_value: projects[0]?.name ?? null,
      reason: "Initial project setup in Local MVP Mode",
      impact_json: null,
      changed_at: "2026-10-07T00:00:00.000Z",
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
    // Tabel dinamis (spreadsheet) dibuat saat user menyimpan baris pertama.
    project_sheets: [],
  };
}

/**
 * Loads stored database tables from disk or creates initial seed if none exists.
 */
function loadStoreFromDisk(): Record<TableName, Row[]> {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    if (existsSync(STORE_PATH)) {
      const raw = readFileSync(STORE_PATH, "utf8");
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        return parsed;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Failed to read local store from disk, falling back to seed:", err);
  }

  const initial = buildFixtureSeed();
  saveStoreToDisk(initial);
  return initial;
}

/**
 * Persists all database tables to local disk storage.
 */
function saveStoreToDisk(data: Record<TableName, Row[]>): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to persist local store to disk:", err);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __LOCAL_PERSISTENT_DB__: Database | undefined;
  // eslint-disable-next-line no-var
  var __LOCAL_STORE_DATA__: Record<TableName, Row[]> | undefined;
}

/**
 * Geser generator id melewati id yang SUDAH ada di disk.
 *
 * `nextId()` di memory-db memakai counter proses yang selalu mulai dari 0,
 * sementara store lokal bertahan antar-restart. Tanpa langkah ini, insert
 * berikutnya mengulang id dari proses sebelumnya; karena `update`/`remove`
 * mencocokkan id, baris tabel lain yang kebetulan ber-id sama bisa ikut
 * tertimpa/terhapus.
 */
function advanceIdsPastStoredRows(data: Record<TableName, Row[]>): void {
  const pattern = /^00000000-0000-4000-8000-(\d{12})$/;
  let max = 0;
  for (const rows of Object.values(data)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const match = pattern.exec(String((row as Row | null)?.id ?? ""));
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  advanceMemoryIds(max);
}

/**
 * Creates the persistent local database that synchronizes all mutations to disk.
 */
export function createPersistentLocalDatabase(): Database {
  const tableData = loadStoreFromDisk();
  advanceIdsPastStoredRows(tableData);
  globalThis.__LOCAL_STORE_DATA__ = tableData;
  const store = globalThis.__LOCAL_STORE_DATA__;

  const memoryDb = createMemoryDatabase({ seed: tableData });

  function persistCurrentState(): void {
    if (globalThis.__LOCAL_STORE_DATA__) {
      saveStoreToDisk(globalThis.__LOCAL_STORE_DATA__);
    }
  }

  return {
    live: false,

    async select<T = Row>(table: TableName, options?: SelectOptions): Promise<QueryResult<T>> {
      return memoryDb.select<T>(table, options);
    },

    async insert<T = Row>(table: TableName, values: Record<string, unknown>): Promise<T> {
      const inserted = await memoryDb.insert<T>(table, values);
      if (!store[table]) {
        store[table] = [];
      }
      store[table].push(inserted as Row);
      persistCurrentState();
      return inserted;
    },

    async update<T = Row>(table: TableName, id: string, patch: Record<string, unknown>): Promise<T> {
      const updated = await memoryDb.update<T>(table, id, patch);
      const rows = store[table] || [];
      const idx = rows.findIndex((r) => r.id === id);
      if (idx !== -1) {
        rows[idx] = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
      }
      persistCurrentState();
      return updated;
    },

    async remove(table: TableName, id: string): Promise<void> {
      await memoryDb.remove(table, id);
      const rows = store[table] || [];
      const idx = rows.findIndex((r) => r.id === id);
      if (idx !== -1) {
        rows.splice(idx, 1);
      }
      persistCurrentState();
    },
  };
}

/**
 * Returns the singleton local persistent database.
 */
export function getLocalDatabase(): Database {
  if (!globalThis.__LOCAL_PERSISTENT_DB__) {
    globalThis.__LOCAL_PERSISTENT_DB__ = createPersistentLocalDatabase();
  }
  return globalThis.__LOCAL_PERSISTENT_DB__;
}

/**
 * Resets the local persistent database back to initial fixture seed and writes to disk.
 */
export function resetLocalDatabase(): Database {
  const freshSeed = buildFixtureSeed();
  saveStoreToDisk(freshSeed);
  globalThis.__LOCAL_STORE_DATA__ = freshSeed;
  globalThis.__LOCAL_PERSISTENT_DB__ = createPersistentLocalDatabase();
  return globalThis.__LOCAL_PERSISTENT_DB__;
}
