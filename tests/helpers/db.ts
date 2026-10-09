/**
 * Test harness for the service layer.
 *
 * The services are exercised through the REAL Database port implemented by
 * lib/data/memory-db.ts, so every test runs the production code path (filters,
 * pagination, joins, engine wiring, history) without a hosted Supabase.
 *
 * The memory adapter runs AFTER the RLS gate. Permission tests therefore assert
 * the application-level guards that mirror RLS (lib/auth/permissions.ts), and
 * the database-level guarantees stay covered by `npm run validate:supabase`.
 */

import type { Actor } from "../../lib/auth/session";
import { createMemoryDatabase, resetMemoryIds, type Row } from "../../lib/data/memory-db";
import type { Database, TableName } from "../../lib/data/db";

export interface SeededDb {
  db: Database;
  actor: Actor;
}

export function actor(role: Actor["role"], id = `user-${role.toLowerCase()}`): Actor {
  return {
    id,
    email: `${role.toLowerCase()}@test.local`,
    full_name: `${role} Tester`,
    role,
    profileMissing: false,
    isActive: true,
  };
}

export function makeDb(seed: Partial<Record<TableName, Row[]>> = {}): Database {
  resetMemoryIds();
  return createMemoryDatabase({ seed });
}

export const UUIDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  procurement: "00000000-0000-4000-8000-000000000002",
  pic: "00000000-0000-4000-8000-000000000003",
  viewer: "00000000-0000-4000-8000-000000000004",
  projectA: "00000000-0000-4000-8000-0000000000a1",
  projectB: "00000000-0000-4000-8000-0000000000a2",
  vendor1: "00000000-0000-4000-8000-0000000000b1",
  vendor2: "00000000-0000-4000-8000-0000000000b2",
  customer: "00000000-0000-4000-8000-0000000000c1",
  product: "00000000-0000-4000-8000-0000000000d1",
};

/** A realistic starting point: two projects, one membership, two vendors. */
export function seedBase(): Partial<Record<TableName, Row[]>> {
  return {
    projects: [
      {
        id: UUIDS.projectA,
        code: "TONASA",
        name: "Tonasa — P2 Sep 2026",
        customer_id: UUIDS.customer,
        product_id: UUIDS.product,
        market_id: null,
        location: "Medan",
        period_label: "P2 SEP-26",
        pic_id: UUIDS.pic,
        status: "ACTIVE",
        notes: null,
        created_by: UUIDS.procurement,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-10T00:00:00.000Z",
      },
      {
        id: UUIDS.projectB,
        code: "IGIP",
        name: "IGIP — Q4 2026",
        customer_id: null,
        product_id: null,
        market_id: null,
        location: "Jakarta",
        period_label: "Q4-26",
        pic_id: null,
        status: "ON_HOLD",
        notes: null,
        created_by: UUIDS.admin,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      },
    ],
    project_members: [
      { id: "pm-1", project_id: UUIDS.projectA, profile_id: UUIDS.pic, access_level: "EDIT" },
    ],
    vendors: [
      {
        id: UUIDS.vendor1,
        name: "BLASDU",
        contact: "Budi",
        armada: "12 unit",
        stock: "1.500 KL",
        permit: "lengkap",
        address: null,
        notes: null,
        status: "ACTIVE",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: UUIDS.vendor2,
        name: "MEGA UTAMA",
        contact: null,
        armada: null,
        stock: "2.000 KL",
        permit: null,
        address: null,
        notes: null,
        status: "ACTIVE",
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    customers: [{ id: UUIDS.customer, name: "PT Tonasa", customer_type: "BUMN", default_term: "30 Hari" }],
    products: [{ id: UUIDS.product, code: "HSD", name: "High Speed Diesel", unit: "liter" }],
    markets: [],
    profiles: [
      {
        id: UUIDS.procurement,
        email: "proc@test.local",
        full_name: "Procurement Tester",
        role: "PROCUREMENT",
        is_active: true,
      },
      { id: UUIDS.pic, email: "pic@test.local", full_name: "PIC Tester", role: "PIC", is_active: true },
      { id: UUIDS.admin, email: "admin@test.local", full_name: "Admin Tester", role: "ADMIN", is_active: true },
    ],
    calculation_templates: [
      {
        template_id: "T_A_AHS_STANDARD",
        template_name: "AHS Standard (Template A)",
        source_sheet: "JATENG",
        source_block: "C8:M37",
        input_definition: [],
        formula_definition: {
          harga_jual_dpp: "F005",
          revenue: "F006",
          cost_line_total: "F007",
          ppn_input: "F008B",
          total_cost: "F015A",
          cost_per_liter: "F016",
          gross_profit: "F017",
          ppn_difference: "F018",
          net_profit: "F019A",
          net_profit_per_liter: "F020",
          profit_percentage: "F021A",
        },
        dependency_definition: {},
        output_definition: [],
        coverage_note: null,
        version: 1,
        active: true,
      },
    ],
  };
}

/** Seed the AHS working set of a project with real, engine-ready cost lines. */
export function seedAhs(
  db: Database,
  projectId: string,
  options: {
    volume?: number;
    hargaJualInclude?: number;
    ahsId?: string;
    costLines?: Array<{ category: string; description: string; rate: number | null; qty: number | null }>;
  } = {},
): Promise<unknown> {
  const ahsId = options.ahsId ?? "00000000-0000-4000-8000-0000000000e1";
  const volume = options.volume ?? 15000;
  const hargaJualInclude = options.hargaJualInclude ?? 22626;
  const costLines =
    options.costLines ??
    [
      { category: "HPP", description: "Harga Dasar", rate: 16396.39, qty: volume },
      { category: "PAJAK", description: "PPN 11%", rate: 1803.6, qty: volume },
      { category: "COST OF FUND", description: "Bunga Bank", rate: 120, qty: volume },
      { category: "OPERATIONAL", description: "Biaya Operasional", rate: 250, qty: volume },
      { category: "RELATION", description: "Biaya Proyek", rate: null, qty: volume },
    ];

  return (async () => {
    await db.insert("ahs", {
      id: ahsId,
      project_id: projectId,
      template_id: "T_A_AHS_STANDARD",
      code: null,
      title: "ANALISIS HARGA SATUAN (AHS)",
      product_id: null,
      volume,
      harga_jual_include: hargaJualInclude,
      include_divisor: 1.11,
      ppn_rate: 0.11,
      pbbkb_rate: 0,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
      harga_keekonomian: null,
      marketing: null,
      payment_term: null,
      document_scheme: null,
      analysis_date: null,
      notes: null,
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
    });

    for (const [index, line] of costLines.entries()) {
      await db.insert("ahs_cost_items", {
        ahs_id: ahsId,
        scenario_id: null,
        line_no: index + 1,
        category: line.category,
        description: line.description,
        unit: null,
        rate: line.rate,
        qty: line.qty,
        total: line.rate === null ? 0 : line.rate * (line.qty ?? 0),
        formula_id: "F007",
        is_summed_in_total: true,
      });
    }
    return { ahsId, volume };
  })();
}
