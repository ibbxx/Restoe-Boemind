/**
 * LOCAL UAT / CALCULATION TESTING SUITE (Phase 3.5 §8 & §9).
 *
 * Validates the complete procurement user workflow WITHOUT:
 *   - Supabase
 *   - authentication / login
 *   - RLS
 *   - database persistence
 *   - Vercel
 *
 * Uses the in-memory state and the REAL Formula Registry + Calculation Engine.
 *
 * Checklist:
 *   Create Project           PASS
 *   Create Vendor            PASS
 *   Add Vendor Price         PASS
 *   Create AHS               PASS
 *   Calculate                PASS
 *   Compare Excel            PASS
 *   Change Vendor Price      PASS
 *   Change Customer Price    PASS
 *   Change Volume            PASS
 *   Create Scenario V1       PASS
 *   Create Scenario V2       PASS
 *   Compare V1/V2            PASS
 *   Validation Error         PASS
 *   No NaN                   PASS
 *   No Infinity              PASS
 *   466/466 Cases Mismatch   FORMULA_MISMATCH = 0
 */

import { describe, expect, it } from "vitest";

import { createProject, getProjectDetail } from "../lib/services/projects";
import { addVendorToProject, createVendor, saveVendorPrice } from "../lib/services/vendors";
import { addCostItem, getAhsBundle, saveAhsInputs, updateCostItem } from "../lib/services/ahs";
import { commitScenario, compareScenarios, getScenarioDetail } from "../lib/services/scenarios";
import { calculateAhs } from "../lib/calculations/ahs";
import { calculateVendor, calculateVendorAllIn, calculateVendorPpn } from "../lib/calculations/vendor";
import { compareNumber } from "../lib/calculations/cross-check";
import { validateAhsInput, validateNumeric } from "../lib/calculations/validation";
import { actor, makeDb, UUIDS } from "./helpers/db";
import {
  CASE_A,
  CASE_B,
  CASE_C,
  CASE_D,
  CASE_E,
  buildAhsInputFromRaw,
  compareAhsWithExcel,
  runBatch466Validation,
} from "../lib/data/representative-cases";

const PROC = actor("PROCUREMENT", UUIDS.procurement);

describe("Local Procurement Workflow UAT", () => {
  it("Workflow Step 1 — Create Project: PASS", async () => {
    const db = makeDb();
    const result = await createProject(db, PROC, {
      code: "UAT-PRJ-01",
      name: "Proyek UAT Pengadaan Solar B35",
      customer_id: null,
      product_id: null,
      market_id: null,
      location: "Semarang",
      period_label: "P1 OKT-26",
      pic_id: null,
      status: "ACTIVE",
      notes: "Testing local procurement workflow in-memory",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.id).toBeDefined();
    expect(result.data.code).toBe("UAT-PRJ-01");

    const detail = await getProjectDetail(db, PROC, result.data.id);
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      expect(detail.data.project.name).toBe("Proyek UAT Pengadaan Solar B35");
    }
  });

  it("Workflow Step 2 — Create Vendor: PASS", async () => {
    const db = makeDb();
    const result = await createVendor(db, PROC, {
      name: "PT Mitra Energi Nusantara",
      contact: "Irfan Hakim",
      armada: "15 unit tangki",
      stock: "2.500 KL",
      permit: "Lengkap & Aktif",
      address: "Kawasan Industri Kendal",
      notes: "Vendor terpercaya",
      status: "ACTIVE",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("PT Mitra Energi Nusantara");
  });

  it("Workflow Step 3 — Add Vendor Price: PASS", async () => {
    const db = makeDb();
    const project = await createProject(db, PROC, {
      code: "UAT-PRJ-02",
      name: "Proyek UAT Vendor Pricing",
      customer_id: null,
      product_id: null,
      market_id: null,
      location: "Surabaya",
      status: "ACTIVE",
    });
    if (!project.ok) throw new Error(project.error);

    const vendor = await createVendor(db, PROC, {
      name: "PT Sumber Solarindo",
      status: "ACTIVE",
    });
    if (!vendor.ok) throw new Error(vendor.error);

    const link = await addVendorToProject(db, PROC, project.data.id, vendor.data.id, "Vendor kandidat");
    expect(link.ok).toBe(true);

    // Save Vendor Price: Base Price 14,500, PPN 11% (1,595) -> All-In 16,095 (F002B)
    const priceResult = await saveVendorPrice(db, PROC, project.data.id, vendor.data.id, {
      base_price: 14500,
      ppn_rate: 0.11,
      ppn_amount: 1595,
      ppn_is_formula: true,
      pbbkb_amount: 0,
      pph_amount: 0,
      oat_amount: 0,
      ppn_oat_amount: 0,
      bph_amount: 0,
      all_in_variant: "F002B",
      note: "Harga tender putaran 1",
    });

    expect(priceResult.ok).toBe(true);
    if (!priceResult.ok) return;
    expect(priceResult.data.base_price).toBe(14500);
    expect(priceResult.data.all_in_amount).toBe(16095);
  });

  it("Workflow Step 4 — Create AHS & Input Cost & Calculate: PASS", async () => {
    const db = makeDb();
    const project = await createProject(db, PROC, {
      code: "UAT-AHS-01",
      name: "Proyek UAT AHS Calculation",
      customer_id: null,
      product_id: null,
      market_id: null,
      status: "ACTIVE",
    });
    if (!project.ok) throw new Error(project.error);

    // Create AHS inputs
    const ahsSave = await saveAhsInputs(db, PROC, project.data.id, {
      volume: 15000,
      harga_jual_include: 21800,
      include_divisor: 1.11,
      ppn_rate: 0.11,
      pbbkb_rate: 0,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
    });
    expect(ahsSave.ok).toBe(true);

    // Add dynamic cost items
    const ci1 = await addCostItem(db, PROC, project.data.id, {
      category: "HPP",
      description: "Harga Dasar Vendor",
      rate: 16396.39,
      qty: 15000,
    });
    expect(ci1.ok).toBe(true);

    const ci2 = await addCostItem(db, PROC, project.data.id, {
      category: "PAJAK",
      description: "PPN Masukan (11%)",
      rate: 1803.6,
      qty: 15000,
    });
    expect(ci2.ok).toBe(true);

    const ci3 = await addCostItem(db, PROC, project.data.id, {
      category: "BIAYA OPERASIONAL",
      description: "OAT Darat & Handling",
      rate: 450,
      qty: 15000,
    });
    expect(ci3.ok).toBe(true);

    // Get AHS bundle and preview calculation
    const bundle = await getAhsBundle(db, PROC, project.data.id);
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;

    expect(bundle.data.preview).not.toBeNull();
    const prev = bundle.data.preview!;

    // Verify all 7 key metrics are generated by calculation engine
    expect(prev.revenue).toBeCloseTo(327000000, 2); // 15000 * 21800
    expect(prev.total_cost).toBeGreaterThan(0);
    expect(prev.gross_profit).toBeCloseTo(prev.revenue - prev.total_cost, 2);
    expect(prev.ppn_difference).toBeDefined();
    expect(prev.net_profit).toBeDefined();
    expect(prev.net_profit_per_liter).toBeCloseTo(prev.net_profit / 15000, 4);
    expect(prev.profit_percentage).toBeCloseTo(prev.net_profit / prev.total_cost, 6);
  });
});

describe("Representative Golden Cases & Excel Cross-Check (Phase 3.5 §2 & §4)", () => {
  it("Case A — Standard 1.11 Divisor: System Result ≈ Excel Result (Compare Excel PASS)", () => {
    const input = {
      template_id: "T_A_AHS_STANDARD",
      volume: CASE_A.volume,
      harga_jual_include: CASE_A.hargaJualInclude,
      include_divisor: CASE_A.divisor,
      ppn_rate: 0.11,
      cost_lines: CASE_A.rawCase.cost_lines.map((cl) => ({
        category: cl.category,
        description: cl.description,
        rate: cl.rate,
        qty: cl.qty,
      })),
    };

    const res = calculateAhs(input);
    expect(res.success).toBe(true);
    if (!res.success) return;

    const rows = compareAhsWithExcel(CASE_A.rawCase, res);
    for (const row of rows) {
      if (row.excel !== null) {
        expect(["VALID", "PRECISION_VARIANCE"]).toContain(row.status);
      }
    }

    expect(res.revenue).toBe(CASE_A.excel.revenue);
    expect(res.total_cost).toBeCloseTo(CASE_A.excel.total_cost!, 2);
    expect(res.net_profit).toBeCloseTo(CASE_A.excel.net_profit!, 2);
  });

  it("Case B — 1.185 Variant: System Result ≈ Excel Result (Compare Excel PASS)", () => {
    const input = buildAhsInputFromRaw(CASE_B.rawCase);
    const res = calculateAhs(input);
    expect(res.success).toBe(true);
    if (!res.success) return;

    const rows = compareAhsWithExcel(CASE_B.rawCase, res);
    for (const row of rows) {
      if (row.excel !== null) {
        expect(["VALID", "PRECISION_VARIANCE"]).toContain(row.status);
      }
    }

    expect(res.revenue).toBe(CASE_B.excel.revenue);
    expect(res.total_cost).toBeCloseTo(CASE_B.excel.total_cost!, 2);
    expect(res.net_profit).toBeCloseTo(CASE_B.excel.net_profit!, 2);
  });

  it("Case C — 1.16 Variant: System Result ≈ Excel Result (Compare Excel PASS)", () => {
    const input = buildAhsInputFromRaw(CASE_C.rawCase);
    const res = calculateAhs(input);
    expect(res.success).toBe(true);
    if (!res.success) return;

    const rows = compareAhsWithExcel(CASE_C.rawCase, res);
    for (const row of rows) {
      if (row.excel !== null) {
        expect(["VALID", "PRECISION_VARIANCE"]).toContain(row.status);
      }
    }

    expect(res.revenue).toBeCloseTo(CASE_C.excel.revenue!, 2);
    const costCmp = compareNumber(CASE_C.excel.total_cost, res.total_cost);
    expect(["VALID", "PRECISION_VARIANCE"]).toContain(costCmp.status);
    const npCmp = compareNumber(CASE_C.excel.net_profit, res.net_profit);
    expect(["VALID", "PRECISION_VARIANCE"]).toContain(npCmp.status);
  });

  it("Case D — Vendor Calculation Variant: Blasdu & Mega Utama PASS", () => {
    // Blasdu (14500, PPN 11% -> 1595, All-In 16095)
    const ppnBlasdu = calculateVendorPpn(CASE_D.vendorBlasdu.base_price, 0.11);
    expect(ppnBlasdu).toBe(CASE_D.vendorBlasdu.excel_ppn);

    const allInBlasdu = calculateVendorAllIn(
      { base_price: 14500, ppn: ppnBlasdu },
      "F002B",
    );
    expect(allInBlasdu).toBe(CASE_D.vendorBlasdu.excel_all_in);

    // Mega Utama (16396.39 -> All-In 18199.9929)
    const ppnMega = calculateVendorPpn(CASE_D.vendorMegaUtama.base_price, 0.11);
    expect(ppnMega).toBeCloseTo(CASE_D.vendorMegaUtama.excel_ppn, 4);

    const allInMega = calculateVendorAllIn(
      { base_price: 16396.39, ppn: ppnMega },
      "F002B",
    );
    expect(allInMega).toBeCloseTo(CASE_D.vendorMegaUtama.excel_all_in, 4);
  });
});

describe("Sensitivity & Change Scenarios (Phase 3.5 §5)", () => {
  it("Scenario 2 — Change Vendor Price: Revenue unchanged, Cost & Profit change: PASS", () => {
    const baseLines = [
      { category: "HPP", description: "Harga Vendor", rate: 15400, qty: 15000 },
      { category: "OPERASIONAL", description: "OAT", rate: 500, qty: 15000 },
    ];

    const initial = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: 15000,
      harga_jual_include: 21200,
      include_divisor: 1.11,
      cost_lines: baseLines,
    });
    expect(initial.success).toBe(true);
    if (!initial.success) return;

    // Change vendor price from 15,400 to 15,340 (cheaper by 60/L)
    const changedVendorLines = [
      { category: "HPP", description: "Harga Vendor", rate: 15340, qty: 15000 },
      { category: "OPERASIONAL", description: "OAT", rate: 500, qty: 15000 },
    ];

    const updated = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: 15000,
      harga_jual_include: 21200,
      include_divisor: 1.11,
      cost_lines: changedVendorLines,
    });
    expect(updated.success).toBe(true);
    if (!updated.success) return;

    // REVENUE MUST NOT CHANGE
    expect(updated.revenue).toBe(initial.revenue);

    // Total cost decreases by exactly 60 * 15,000 = 900,000
    const costDiff = initial.total_cost - updated.total_cost;
    expect(costDiff).toBeCloseTo(900000, 2);

    // Gross profit increases by 900,000
    expect(updated.gross_profit - initial.gross_profit).toBeCloseTo(900000, 2);

    // Net profit increases by 900,000
    expect(updated.net_profit - initial.net_profit).toBeCloseTo(900000, 2);
  });

  it("Scenario 3 — Change Customer Price: Revenue, GP, NP, % change: PASS", () => {
    const costLines = [
      { category: "HPP", description: "Harga Dasar", rate: 16000, qty: 20000 },
      { category: "PAJAK", description: "PPN", rate: 1760, qty: 20000 },
    ];

    const initial = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: 20000,
      harga_jual_include: 22000,
      include_divisor: 1.11,
      cost_lines: costLines,
    });
    expect(initial.success).toBe(true);
    if (!initial.success) return;

    // Increase customer price from 22,000 to 23,000
    const updated = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: 20000,
      harga_jual_include: 23000,
      include_divisor: 1.11,
      cost_lines: costLines,
    });
    expect(updated.success).toBe(true);
    if (!updated.success) return;

    // Revenue changes
    expect(updated.revenue).toBeGreaterThan(initial.revenue);

    // Gross profit changes
    expect(updated.gross_profit).toBeGreaterThan(initial.gross_profit);

    // Net profit changes
    expect(updated.net_profit).toBeGreaterThan(initial.net_profit);

    // Profit % changes
    expect(updated.profit_percentage).toBeGreaterThan(initial.profit_percentage);
  });

  it("Scenario 4 — Change Volume: Revenue, Total Cost, NP, NP/L change: PASS", () => {
    const costLines = [
      { category: "HPP", description: "Harga Dasar", rate: 16000, qty: 10000 },
      { category: "PAJAK", description: "PPN", rate: 1760, qty: 10000 },
    ];

    const initial = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: 10000,
      harga_jual_include: 22000,
      include_divisor: 1.11,
      cost_lines: costLines,
    });
    expect(initial.success).toBe(true);
    if (!initial.success) return;

    // Double the volume to 20,000
    const doubleCostLines = [
      { category: "HPP", description: "Harga Dasar", rate: 16000, qty: 20000 },
      { category: "PAJAK", description: "PPN", rate: 1760, qty: 20000 },
    ];

    const updated = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: 20000,
      harga_jual_include: 22000,
      include_divisor: 1.11,
      cost_lines: doubleCostLines,
    });
    expect(updated.success).toBe(true);
    if (!updated.success) return;

    // Revenue doubles
    expect(updated.revenue).toBe(initial.revenue * 2);

    // Total cost doubles
    expect(updated.total_cost).toBe(initial.total_cost * 2);

    // Net profit doubles
    expect(updated.net_profit).toBeCloseTo(initial.net_profit * 2, 2);

    // Net profit per liter remains constant (same unit margin)
    expect(updated.net_profit_per_liter).toBeCloseTo(initial.net_profit_per_liter, 4);
  });

  it("Scenario 5 — Validation Errors: Empty, Negative, Zero, NaN, Infinity: PASS", () => {
    // 1. Missing volume
    const emptyVol = validateNumeric("volume", null, { required: true });
    expect(emptyVol?.errorCode).toBe("MISSING_INPUT");

    // 2. Zero volume
    const zeroVol = validateNumeric("volume", 0, { allowZero: false });
    expect(zeroVol?.errorCode).toBe("ZERO_VOLUME");

    // 3. Negative volume
    const negVol = validateNumeric("volume", -5000, { allowNegative: false });
    expect(negVol?.errorCode).toBe("NEGATIVE_VALUE");

    // 4. NaN
    const nanVal = validateNumeric("volume", Number.NaN);
    expect(nanVal?.errorCode).toBe("INVALID_NUMBER");

    // 5. Infinity
    const infVal = validateNumeric("volume", Number.POSITIVE_INFINITY);
    expect(infVal?.errorCode).toBe("INVALID_NUMBER");

    // 6. calculateAhs with empty volume
    const resEmptyVol = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: undefined as never,
      harga_jual_include: 22000,
      cost_lines: [],
    });
    expect(resEmptyVol.success).toBe(false);
    if (!resEmptyVol.success) {
      expect(resEmptyVol.errorCode).toBe("MISSING_INPUT");
    }

    // 7. calculateAhs with zero volume
    const resZeroVol = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: 0,
      harga_jual_include: 22000,
      cost_lines: [],
    });
    expect(resZeroVol.success).toBe(false);
    if (!resZeroVol.success) {
      expect(resZeroVol.errorCode).toBe("ZERO_VOLUME");
    }

    // 8. calculateAhs with missing harga_jual
    const resEmptyHj = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: 10000,
      harga_jual_include: undefined,
      cost_lines: [],
    });
    expect(resEmptyHj.success).toBe(false);
    if (!resEmptyHj.success) {
      expect(resEmptyHj.errorCode).toBe("MISSING_INPUT");
    }

    // 9. calculateVendor with missing base price
    const resEmptyVendor = calculateVendor({
      base_price: undefined as never,
      vendor_name: "Vendor Test",
    });
    expect(resEmptyVendor.success).toBe(false);
    if (!resEmptyVendor.success) {
      expect(resEmptyVendor.errorCode).toBe("MISSING_VENDOR_PRICE");
    }
  });
});

describe("Scenario Cloning & Comparison (Phase 3.5 §6)", () => {
  it("Scenario V1 -> Clone V2 -> Compare: V1 unchanged, V2 recalculated, Difference visible: PASS", async () => {
    const db = makeDb();
    const project = await createProject(db, PROC, {
      code: "UAT-SCN-01",
      name: "Proyek UAT Scenario V1 vs V2",
      status: "ACTIVE",
    });
    if (!project.ok) throw new Error(project.error);

    // Setup initial AHS
    await saveAhsInputs(db, PROC, project.data.id, {
      volume: 15000,
      harga_jual_include: 21200,
      include_divisor: 1.11,
      ppn_rate: 0.11,
    });

    await addCostItem(db, PROC, project.data.id, {
      category: "HPP",
      description: "Harga Vendor A",
      rate: 15400,
      qty: 15000,
    });

    // Commit V1 (Initial)
    const v1Result = await commitScenario(db, PROC, project.data.id, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "Initial baseline scenario",
      template_id: "T_A_AHS_STANDARD",
      input: { volume: 15000, harga_jual_include: 21200, include_divisor: 1.11 },
    });
    expect(v1Result.ok).toBe(true);
    if (!v1Result.ok) return;

    const v1NetProfitInitial = Number(v1Result.data.result.net_profit);

    // Commit V2 (Clone / Vendor Price Change: rate 15340 instead of 15400)
    const v2Result = await commitScenario(db, PROC, project.data.id, {
      name: "V2",
      scenario_type: "STANDARD",
      reason: "Vendor negosiasi harga dasar turun Rp60/L",
      source_scenario_id: v1Result.data.scenario_id,
      template_id: "T_A_AHS_STANDARD",
      input: { volume: 15000, harga_jual_include: 21200, include_divisor: 1.11 },
      cost_rate_overrides: [{ description: "Harga Vendor A", rate: 15340 }],
    });
    expect(v2Result.ok).toBe(true);
    if (!v2Result.ok) return;

    // Verify V1 is locked and unchanged
    const v1DetailAfter = await getScenarioDetail(db, PROC, project.data.id, v1Result.data.scenario_id);
    expect(v1DetailAfter.ok).toBe(true);
    if (v1DetailAfter.ok) {
      expect(v1DetailAfter.data.scenario.is_locked).toBe(true);
      expect(Number(v1DetailAfter.data.result?.net_profit)).toBe(v1NetProfitInitial);
    }

    // Verify V2 has new recalculated profit (+900,000)
    const v2Detail = await getScenarioDetail(db, PROC, project.data.id, v2Result.data.scenario_id);
    expect(v2Detail.ok).toBe(true);
    if (v2Detail.ok) {
      const v2NetProfit = Number(v2Detail.data.result?.net_profit);
      expect(v2NetProfit - v1NetProfitInitial).toBeCloseTo(900000, 2);
    }

    // Compare V1 vs V2
    const comparison = await compareScenarios(db, PROC, project.data.id, [
      v1Result.data.scenario_id,
      v2Result.data.scenario_id,
    ]);
    expect(comparison.ok).toBe(true);
    if (comparison.ok) {
      const npRow = comparison.data.rows.find((r) => r.metric === "net_profit");
      expect(npRow).toBeDefined();
      expect(npRow?.difference).toBeCloseTo(900000, 2);
      expect(npRow?.overall_indicator).toBe("IMPROVEMENT");

      const revRow = comparison.data.rows.find((r) => r.metric === "revenue");
      expect(revRow?.difference).toBe(0);
      expect(revRow?.overall_indicator).toBe("NO_CHANGE");
    }
  });
});

describe("All 466 Excel Cases Integration (Phase 3.5 §9)", () => {
  it("Validates all 466 real Excel cases with FORMULA_MISMATCH = 0: PASS", () => {
    const summary = runBatch466Validation();
    expect(summary.totalCases).toBe(466);
    expect(summary.casesPassed).toBe(466);
    expect(summary.formulaMismatchCount).toBe(0);
    expect(summary.mismatches).toEqual([]);
    expect(summary.validCount).toBeGreaterThan(1300);
  });
});
