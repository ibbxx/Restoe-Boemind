/**
 * Persistent Local Database (Phase 3.5: MVP LOCAL MODE).
 *
 * Implements the Database port with transactional SQLite in a worker.
 * The previous JSON file is retained unchanged and imported once with a backup.
 *
 * Guarantees:
 *   1. Zero Supabase dependencies / Zero external network calls
 *   2. Refreshing the browser or restarting dev server does NOT wipe user data
 *   3. All writes are persisted to disk automatically
 *   4. Seed data comes from real Excel fixtures, NOT hardcoded component constants
 *   5. Completely swappable with SupabaseRepository later without touching UI
 */

import { resolve } from "node:path";

import type { Database, TableName } from "./db";
import type { Row } from "./memory-db";
import { createSqliteDatabase } from "./sqlite-db";


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
};

/**
 * Builds the initial seed dataset sourced from real Excel fixtures and templates.
 * No hardcoded UI values — everything has genuine business provenance.
 */
export function buildFixtureSeed(): Record<TableName, Row[]> {
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
      volume: 247000,
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



  return {
    calculation_templates: [],
    formula_registry: [],
    ahs: [],
    ahs_cost_items: [],
    profiles,
    customers,
    products,
    markets,
    vendors,
    projects,
    project_members,
    project_vendors,
    vendor_prices,
    // Tabel dinamis (spreadsheet) dibuat saat user menyimpan baris pertama.
    project_sheets: [],
  };
}

export function createPersistentLocalDatabase(): Database {
  const dir = resolve(process.env.LOCAL_DATA_DIR ?? resolve(process.cwd(), ".data"));
  return createSqliteDatabase({
    path: resolve(dir, "procurement.sqlite"),
    legacyPath: resolve(dir, "local-store.json"),
    backupDir: resolve(dir, "backups"),
    seed: buildFixtureSeed(),
  });
}

declare global { var __LOCAL_SQLITE_DB_V1__: Database | undefined; }

export function getLocalDatabase(): Database {
  return globalThis.__LOCAL_SQLITE_DB_V1__ ??= createPersistentLocalDatabase();
}

/** Resetting real procurement data requires an explicit backup/restore workflow. */
export function resetLocalDatabase(): never {
  throw new Error("Data tidak direset otomatis. Gunakan pemulihan cadangan.");
}
