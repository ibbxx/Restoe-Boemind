/**
 * AHS SERVICE TESTS (Phase 3 §12 / §14 / §26).
 *
 * The important invariant: the application stores INPUTS on `ahs` and RESULTS in
 * `calculation_results`. It never writes a calculated column, because the
 * database refuses those writes outside the calculation-engine session.
 */

import { describe, expect, it } from "vitest";

import {
  addCostItem,
  computeCostLineTotal,
  getAhsBundle,
  previewAhsCalculation,
  removeCostItem,
  saveAhsInputs,
  updateCostItem,
  validateAhsInputs,
  validateCostItemForm,
} from "../lib/services/ahs";
import { calculateAhs } from "../lib/calculations/ahs";
import { actor, makeDb, seedAhs, seedBase, UUIDS } from "./helpers/db";
import type { Ahs, AhsCostItem } from "../lib/types/domain";

const PROC = actor("PROCUREMENT", UUIDS.procurement);

describe("AHS bundle", () => {
  it("reports 'project without AHS' as a valid empty state, not an error", async () => {
    const db = makeDb(seedBase());
    const bundle = await getAhsBundle(db, PROC, UUIDS.projectA);
    expect(bundle.ok).toBe(true);
    if (bundle.ok) {
      expect(bundle.data.ahs).toBeNull();
      expect(bundle.data.costItems).toEqual([]);
      expect(bundle.data.preview).toBeNull();
      expect(bundle.data.previewError).toBeNull();
    }
  });

  it("previews the engine result for the AHS working set", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);

    const bundle = await getAhsBundle(db, PROC, UUIDS.projectA);
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;

    const view = bundle.data;
    expect(view.costItems).toHaveLength(5);
    expect(view.preview).not.toBeNull();

    // The preview must be EXACTLY what the engine returns for the same input.
    const direct = calculateAhs({
      template_id: "T_A_AHS_STANDARD",
      volume: view.inputs!.volume,
      harga_jual_include: view.inputs!.harga_jual_include,
      include_divisor: view.inputs!.include_divisor ?? 1.11,
      ppn_rate: view.inputs!.ppn_rate ?? 0.11,
      sale_ppn_rate: view.inputs!.ppn_rate ?? 0.11,
      ppn_input_rate: view.inputs!.ppn_rate ?? 0.11,
      pbbkb_rate: view.inputs!.pbbkb_rate ?? 0,
      pph_inu_rate: view.inputs!.pph_inu_rate ?? 0,
      bph_migas_rate: view.inputs!.bph_migas_rate ?? 0,
      harga_keekonomian: view.inputs!.harga_keekonomian,
      cost_lines: view.costItems.map((c) => ({
        line_no: c.line_no,
        category: c.category ?? "",
        description: c.description,
        rate: c.rate,
        qty: c.qty,
      })),
    });
    expect(direct.success).toBe(true);
    if (direct.success) {
      expect(view.preview?.revenue).toBeCloseTo(direct.revenue, 8);
      expect(view.preview?.total_cost).toBeCloseTo(direct.total_cost, 8);
      expect(view.preview?.net_profit).toBeCloseTo(direct.net_profit, 8);
      expect(view.preview?.formulas_used).toEqual(direct.formulas_used);
    }
  });

  it("keeps a cost line with a null rate as NOT APPLICABLE", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);
    const bundle = await getAhsBundle(db, PROC, UUIDS.projectA);
    if (bundle.ok) {
      const line = bundle.data.preview?.cost_lines.find((l) => l.description === "Biaya Proyek");
      expect(line?.rate).toBeNull();
      expect(line?.applied).toBe(false);
      expect(line?.total).toBe(0);
    }
  });
});

describe("AHS inputs", () => {
  it("validates volume and customer price before writing", () => {
    const errors = validateAhsInputs({
      volume: 0,
      harga_jual_include: null,
      include_divisor: 1.11,
      ppn_rate: 0.11,
      pbbkb_rate: 0,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
      harga_keekonomian: null,
    });
    expect(errors.volume).toBeTruthy();
    expect(errors.harga_jual_include).toBeTruthy();
  });

  it("persists INPUT columns only — calculated columns stay untouched", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);

    const result = await saveAhsInputs(db, PROC, UUIDS.projectA, {
      volume: 20000,
      harga_jual_include: 23500,
      include_divisor: 1.11,
      ppn_rate: 0.11,
      pbbkb_rate: 0,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
      harga_keekonomian: null,
      reason: "update volume",
    });
    expect(result.ok).toBe(true);

    const { rows } = await db.select<Ahs>("ahs", {
      where: [{ column: "project_id", op: "eq", value: UUIDS.projectA }],
    });
    const ahs = rows[0]!;
    expect(Number(ahs.volume)).toBe(20000);
    expect(Number(ahs.harga_jual_include)).toBe(23500);

    // Calculated columns are engine-owned: the app must leave them null.
    expect(ahs.revenue ?? null).toBeNull();
    expect(ahs.total_cost ?? null).toBeNull();
    expect(ahs.gross_profit ?? null).toBeNull();
    expect(ahs.net_profit ?? null).toBeNull();
    expect(ahs.profit_percentage ?? null).toBeNull();

    // The engine result is returned to the UI instead (live recalculation).
    // Revenue (F006) = harga_jual_setelah_pajak x volume, so it must reflect 20.000 L.
    if (result.ok) expect(result.data.preview?.revenue).toBeCloseTo(23500 * 20000, 4);
  });

  it("refuses invalid AHS input and writes nothing", async () => {
    const db = makeDb(seedBase());
    const result = await saveAhsInputs(db, PROC, UUIDS.projectA, {
      volume: null,
      harga_jual_include: 20000,
      include_divisor: 1.11,
      ppn_rate: 0.11,
      pbbkb_rate: 0,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
      harga_keekonomian: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.volume).toBeTruthy();
    expect((await db.select<Ahs>("ahs", { count: true })).count).toBe(0);
  });

  it("refuses AHS writes for a read-only role", async () => {
    const db = makeDb(seedBase());
    const result = await saveAhsInputs(db, actor("VIEWER", UUIDS.viewer), UUIDS.projectA, {
      volume: 100,
      harga_jual_include: 20000,
      include_divisor: 1.11,
      ppn_rate: 0.11,
      pbbkb_rate: 0,
      pph_inu_rate: 0,
      bph_migas_rate: 0,
      harga_keekonomian: null,
    });
    expect(result.ok).toBe(false);
  });
});

describe("Live recalculation (preview)", () => {
  it("recalculates on the server without persisting anything", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA, { volume: 10000, hargaJualInclude: 20000 });

    const preview = await previewAhsCalculation(db, PROC, UUIDS.projectA, { volume: 20000 });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    // Revenue = harga_jual_setelah_pajak x volume (F006) — doubling volume doubles revenue.
    const bundle = await getAhsBundle(db, PROC, UUIDS.projectA);
    if (bundle.ok && bundle.data.preview) {
      expect(preview.data.result.revenue / bundle.data.preview.revenue).toBeCloseTo(2, 8);
    }

    // Nothing was written: the stored AHS volume is still the original.
    const { rows } = await db.select<Ahs>("ahs", { where: [{ column: "project_id", op: "eq", value: UUIDS.projectA }] });
    expect(Number(rows[0]?.volume)).toBe(10000);
    expect(rows[0]?.revenue ?? null).toBeNull();
  });

  it("returns the engine's own error when cost lines are missing", async () => {
    const db = makeDb(seedBase());
    await db.insert("ahs", {
      project_id: UUIDS.projectA,
      template_id: "T_A_AHS_STANDARD",
      volume: 1000,
      harga_jual_include: 20000,
      include_divisor: 1.11,
      ppn_rate: 0.11,
    });

    const preview = await previewAhsCalculation(db, PROC, UUIDS.projectA, {});
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.errorCode).toBe("MISSING_COST_LINES");
  });

  it("returns structured validation errors instead of NaN", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);
    const preview = await previewAhsCalculation(db, PROC, UUIDS.projectA, { volume: 0 });
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.errorCode).toBe("ZERO_VOLUME");
  });
});

describe("Dynamic cost items", () => {
  it("computes the line total through the registry expression (F007)", () => {
    expect(computeCostLineTotal(1000, 15)).toBe(15000);
    expect(computeCostLineTotal(null, 15)).toBe(0);
    expect(computeCostLineTotal(1000, null)).toBe(0);
  });

  it("rejects a cost item without description/category", () => {
    expect(validateCostItemForm({ description: "", category: "", rate: 1, qty: 1 }).description).toBeTruthy();
  });

  it("rejects a negative qty", () => {
    expect(validateCostItemForm({ description: "HPP", rate: 1, qty: -5 }).qty).toBeTruthy();
  });

  it("adds, updates and removes cost items with an audit trail", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);

    const added = await addCostItem(db, PROC, UUIDS.projectA, {
      category: "OTHER",
      description: "Biaya Keagenan",
      rate: 75,
      qty: 15000,
      reason: "biaya tambahan",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.data.line_no).toBe(6);
    expect(added.data.total).toBe(75 * 15000);

    const updated = await updateCostItem(db, PROC, UUIDS.projectA, added.data.id, {
      category: "OTHER",
      description: "Biaya Keagenan",
      rate: 100,
      qty: 15000,
      reason: "rate naik",
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.total).toBe(100 * 15000);

    const removed = await removeCostItem(db, PROC, UUIDS.projectA, added.data.id);
    expect(removed.ok).toBe(true);
    const remaining = await db.select<AhsCostItem>("ahs_cost_items", {
      where: [{ column: "ahs_id", op: "eq", value: "00000000-0000-4000-8000-0000000000e1" }],
    });
    expect(remaining.rows).toHaveLength(5);
  });

  it("refuses to delete the last cost item (engine requires >= 1 line)", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA, {
      costLines: [{ category: "HPP", description: "Harga Dasar", rate: 16000, qty: 1000 }],
    });
    const items = await db.select<AhsCostItem>("ahs_cost_items", {});
    const only = items.rows[0]!;
    const removed = await removeCostItem(db, PROC, UUIDS.projectA, only.id);
    expect(removed.ok).toBe(false);
    if (!removed.ok) expect(removed.errorCode).toBe("INVALID_INPUT");
  });

  it("refuses to mutate a cost item owned by a finalised scenario", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);
    const scenarioItem = await db.insert<AhsCostItem>("ahs_cost_items", {
      ahs_id: "00000000-0000-4000-8000-0000000000e1",
      scenario_id: "00000000-0000-4000-8000-0000000000f1",
      line_no: 99,
      category: "HPP",
      description: "Snapshot scenario",
      unit: null,
      rate: 16000,
      qty: 1000,
      total: 16000000,
    });

    const updated = await updateCostItem(db, PROC, UUIDS.projectA, scenarioItem.id, {
      description: "Snapshot scenario",
      rate: 1,
      qty: 1,
    });
    expect(updated.ok).toBe(false);
    if (!updated.ok) expect(updated.errorCode).toBe("FORBIDDEN");
  });

  it("refuses cost item writes for a read-only role", async () => {
    const db = makeDb(seedBase());
    await seedAhs(db, UUIDS.projectA);
    const added = await addCostItem(db, actor("VIEWER", UUIDS.viewer), UUIDS.projectA, {
      description: "Tidak boleh",
      rate: 1,
      qty: 1,
    });
    expect(added.ok).toBe(false);
  });
});
