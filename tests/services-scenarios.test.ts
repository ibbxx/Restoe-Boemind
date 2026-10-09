/**
 * SCENARIO SERVICE TESTS (Phase 3 §26: "V1 untouched / V2 created /
 * V1 vs V2 comparable").
 *
 * The lock itself is a DATABASE trigger (trg_lock_parent_scenario), validated by
 * `npm run validate:supabase`. Here we assert the application's half of the
 * contract: it never overwrites an existing scenario, it always writes a new
 * version, and it refuses to edit a scenario the database has locked.
 */

import { describe, expect, it } from "vitest";

import {
  buildScenarioInput,
  commitScenario,
  compareScenarios,
  getScenarioDetail,
  indicatorFor,
  listScenarios,
  nextScenarioName,
  renameScenario,
} from "../lib/services/scenarios";
import { calculateAhs } from "../lib/calculations/ahs";
import { actor, makeDb, seedAhs, seedBase, UUIDS } from "./helpers/db";
import type { CalculationResult, PriceScenario, ScenarioInput } from "../lib/types/domain";

const PROC = actor("PROCUREMENT", UUIDS.procurement);

async function seedProjectWithAhs() {
  const db = makeDb(seedBase());
  await seedAhs(db, UUIDS.projectA, {
    volume: 15000,
    hargaJualInclude: 22626,
    costLines: [
      { category: "HPP", description: "Harga Dasar", rate: 16396.39, qty: 15000 },
      { category: "PAJAK", description: "PPN 11%", rate: 1803.6029, qty: 15000 },
      { category: "OPERATIONAL", description: "Biaya Operasional", rate: 250, qty: 15000 },
    ],
  });
  return db;
}

async function createV1(db: Awaited<ReturnType<typeof seedProjectWithAhs>>) {
  const result = await commitScenario(db, PROC, UUIDS.projectA, {
    name: "V1 — Initial",
    scenario_type: "STANDARD",
    reason: "Initial analysis",
    input: {},
  });
  if (!result.ok) throw new Error(`V1 failed: ${result.error}`);
  return result.data;
}

describe("Scenario creation", () => {
  it("names scenarios V1, V2, V3 from the stored count", async () => {
    const db = makeDb(seedBase());
    expect(await nextScenarioName(db, UUIDS.projectA)).toBe("V1");
    await seedAhs(db, UUIDS.projectA);
    await createV1(db);
    expect(await nextScenarioName(db, UUIDS.projectA)).toBe("V2");
  });

  it("stores input snapshot, cost snapshot and the engine result", async () => {
    const db = await seedProjectWithAhs();
    const v1 = await createV1(db);

    const detail = await getScenarioDetail(db, PROC, UUIDS.projectA, v1.scenario_id);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;

    expect(detail.data.scenario.name).toBe("V1 — Initial");
    expect(detail.data.scenario.parent_scenario_id).toBeNull();
    expect(detail.data.costItems).toHaveLength(3);
    expect(detail.data.costItems.every((c) => c.scenario_id === v1.scenario_id)).toBe(true);

    const storedInputs = await db.select<ScenarioInput>("scenario_inputs", {
      where: [{ column: "scenario_id", op: "eq", value: v1.scenario_id }],
    });
    const volume = storedInputs.rows.find((i) => i.field_key === "volume");
    expect(Number(volume?.value_num)).toBe(15000);
    expect(storedInputs.rows.find((i) => i.field_key === "customer_price")).toBeTruthy();
    expect(storedInputs.rows.find((i) => i.field_key === "template_id")?.value_text).toBe("T_A_AHS_STANDARD");

    // The stored result equals the engine result for the same snapshot.
    const recomputed = calculateAhs(detail.data.input!);
    expect(recomputed.success).toBe(true);
    if (recomputed.success) {
      expect(Number(v1.result.revenue)).toBeCloseTo(recomputed.revenue, 6);
      expect(Number(v1.result.total_cost)).toBeCloseTo(recomputed.total_cost, 6);
      expect(Number(v1.result.net_profit)).toBeCloseTo(recomputed.net_profit, 6);
      expect(Number(v1.result.profit_percentage)).toBeCloseTo(recomputed.profit_percentage, 8);
    }
    expect(detail.data.reproduced).toBe(true);
  });

  it("refuses a scenario when the project has no cost items", async () => {
    const db = makeDb(seedBase());
    await db.insert("ahs", {
      project_id: UUIDS.projectA,
      template_id: "T_A_AHS_STANDARD",
      volume: 1000,
      harga_jual_include: 20000,
      include_divisor: 1.11,
      ppn_rate: 0.11,
    });
    const result = await commitScenario(db, PROC, UUIDS.projectA, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "coba",
      input: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("MISSING_COST_LINES");
  });

  it("refuses a scenario when the project has no AHS at all", async () => {
    const db = makeDb(seedBase());
    const result = await commitScenario(db, PROC, UUIDS.projectA, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "coba",
      input: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("NOT_FOUND");
  });

  it("refuses scenario creation for a read-only viewer", async () => {
    const db = await seedProjectWithAhs();
    const result = await commitScenario(db, actor("VIEWER", UUIDS.viewer), UUIDS.projectA, {
      name: "V1",
      scenario_type: "STANDARD",
      reason: "coba",
      input: {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("V1 untouched, V2 created", () => {
  it("keeps V1 byte-identical while V2 links back to it", async () => {
    const db = await seedProjectWithAhs();
    const v1 = await createV1(db);

    const snapshotBefore = JSON.stringify(
      await db.select("scenario_inputs", { where: [{ column: "scenario_id", op: "eq", value: v1.scenario_id }] }),
    );

    const v2 = await commitScenario(db, PROC, UUIDS.projectA, {
      name: "V2 — Vendor Revision",
      scenario_type: "STANDARD",
      reason: "Vendor turun 396,39",
      input: {},
      cost_rate_overrides: [{ description: "Harga Dasar", rate: 16000 }],
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;

    expect(v2.data.parent_scenario_id).toBe(v1.scenario_id);

    const snapshotAfter = JSON.stringify(
      await db.select("scenario_inputs", { where: [{ column: "scenario_id", op: "eq", value: v1.scenario_id }] }),
    );
    expect(snapshotAfter).toBe(snapshotBefore);

    const storedV1 = await db.select<CalculationResult>("calculation_results", {
      where: [{ column: "scenario_id", op: "eq", value: v1.scenario_id }],
    });
    expect(Number(storedV1.rows[0]?.net_profit)).toBeCloseTo(Number(v1.result.net_profit), 6);

    // V2 is cheaper, so profit improves while the customer price is unchanged.
    expect(Number(v2.data.result.total_cost)).toBeLessThan(Number(v1.result.total_cost));
    expect(Number(v2.data.result.net_profit)).toBeGreaterThan(Number(v1.result.net_profit));
    expect(Number(v2.data.result.revenue)).toBeCloseTo(Number(v1.result.revenue), 6);

    const list = await listScenarios(db, PROC, UUIDS.projectA);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.data.map((s) => s.scenario.name)).toEqual(["V1 — Initial", "V2 — Vendor Revision"]);
      expect(list.data[1]?.parent_name).toBe("V1 — Initial");
      expect(list.data[1]?.vendor_price).toBe(16000);
    }
  });

  it("creates a V3 chain without touching V1 or V2", async () => {
    const db = await seedProjectWithAhs();
    const v1 = await createV1(db);
    const v2 = await commitScenario(db, PROC, UUIDS.projectA, {
      name: "V2",
      scenario_type: "STANDARD",
      reason: "vendor turun",
      input: {},
      cost_rate_overrides: [{ description: "Harga Dasar", rate: 16000 }],
    });
    if (!v2.ok) throw new Error("V2 failed");

    const v3 = await commitScenario(db, PROC, UUIDS.projectA, {
      name: "V3",
      scenario_type: "STANDARD",
      reason: "customer turun",
      source_scenario_id: v2.data.scenario_id,
      input: { harga_jual_include: 21800 },
    });
    expect(v3.ok).toBe(true);

    const v2Row = await db.select<PriceScenario>("price_scenarios", {
      where: [{ column: "id", op: "eq", value: v2.data.scenario_id }],
    });
    expect(v2Row.rows[0]?.name).toBe("V2");
    expect(Number(v1.result.revenue)).toBeGreaterThan(0);

    if (v3.ok) {
      // Customer price down => revenue down, cost unchanged.
      expect(Number(v3.data.result.revenue)).toBeLessThan(Number(v2.data.result.revenue));
      expect(Number(v3.data.result.total_cost)).toBeCloseTo(Number(v2.data.result.total_cost), 6);
      expect(v3.data.parent_scenario_id).toBe(v2.data.scenario_id);
    }
  });
});

describe("Old scenarios are read-only", () => {
  it("refuses to rename a locked scenario", async () => {
    const db = await seedProjectWithAhs();
    const v1 = await createV1(db);
    // Simulate the DB trigger that locks the parent once a child exists.
    await db.update<PriceScenario>("price_scenarios", v1.scenario_id, { is_locked: true });

    const renamed = await renameScenario(db, PROC, UUIDS.projectA, v1.scenario_id, "V1 diubah");
    expect(renamed.ok).toBe(false);
    if (!renamed.ok) expect(renamed.errorCode).toBe("FORBIDDEN");

    const row = await db.select<PriceScenario>("price_scenarios", {
      where: [{ column: "id", op: "eq", value: v1.scenario_id }],
    });
    expect(row.rows[0]?.name).toBe("V1 — Initial");
  });

  it("allows renaming an unlocked scenario and audits the change", async () => {
    const db = await seedProjectWithAhs();
    const v1 = await createV1(db);
    const renamed = await renameScenario(db, PROC, UUIDS.projectA, v1.scenario_id, "V1 — Baseline");
    expect(renamed.ok).toBe(true);

    const history = await db.select<{ field: string; old_value: string; new_value: string }>(
      "project_history",
      { where: [{ column: "entity", op: "eq", value: "price_scenarios" }] },
    );
    const nameRow = history.rows.find((h) => h.field === "name");
    expect(nameRow?.old_value).toBe("V1 — Initial");
    expect(nameRow?.new_value).toBe("V1 — Baseline");
  });

  it("refuses a duplicate scenario name in the same project", async () => {
    const db = await seedProjectWithAhs();
    await createV1(db);
    const result = await commitScenario(db, PROC, UUIDS.projectA, {
      name: "V1 — Initial",
      scenario_type: "STANDARD",
      reason: "duplikat",
      input: {},
    });
    // The database unique constraint (project_id, name) is the guard.
    expect(result.ok).toBe(false);
  });
});

describe("Scenario comparison", () => {
  it("returns the engine's metric labels with indicators", async () => {
    const db = await seedProjectWithAhs();
    const v1 = await createV1(db);
    const v2 = await commitScenario(db, PROC, UUIDS.projectA, {
      name: "V2",
      scenario_type: "STANDARD",
      reason: "vendor turun",
      input: {},
      cost_rate_overrides: [{ description: "Harga Dasar", rate: 16000 }],
    });
    if (!v2.ok) throw new Error("V2 failed");

    const comparison = await compareScenarios(db, PROC, UUIDS.projectA, [v1.scenario_id, v2.data.scenario_id]);
    expect(comparison.ok).toBe(true);
    if (!comparison.ok) return;

    expect(comparison.data.columns.map((c) => c.name)).toEqual(["V1 — Initial", "V2"]);
    expect(comparison.data.rows.map((r) => r.label)).toEqual([
      "Vendor Price",
      "Customer Price",
      "Volume",
      "Revenue",
      "Total Cost",
      "Gross Profit",
      "PPN Difference",
      "Net Profit",
      "Profit/Liter",
      "Profit %",
    ]);

    const byLabel = new Map(comparison.data.rows.map((r) => [r.label, r]));
    expect(byLabel.get("Vendor Price")?.difference).toBeLessThan(0);
    expect(byLabel.get("Vendor Price")?.indicator).toBe("IMPROVEMENT");
    expect(byLabel.get("Total Cost")?.indicator).toBe("IMPROVEMENT");
    expect(byLabel.get("Net Profit")?.indicator).toBe("IMPROVEMENT");
    expect(byLabel.get("Customer Price")?.indicator).toBe("NO_CHANGE");
    expect(byLabel.get("Revenue")?.indicator).toBe("NO_CHANGE");
    // Volume has no direction implied by any formula.
    expect(byLabel.get("Volume")?.indicator).toBe("NEUTRAL");
  });

  it("labels a higher total cost as a decline", async () => {
    const db = await seedProjectWithAhs();
    const v1 = await createV1(db);
    const v2 = await commitScenario(db, PROC, UUIDS.projectA, {
      name: "V2",
      scenario_type: "STANDARD",
      reason: "vendor naik",
      input: {},
      cost_rate_overrides: [{ description: "Harga Dasar", rate: 17500 }],
    });
    if (!v2.ok) throw new Error("V2 failed");

    const comparison = await compareScenarios(db, PROC, UUIDS.projectA, [v1.scenario_id, v2.data.scenario_id]);
    if (comparison.ok) {
      const byLabel = new Map(comparison.data.rows.map((r) => [r.label, r]));
      expect(byLabel.get("Total Cost")?.indicator).toBe("DECLINE");
      expect(byLabel.get("Net Profit")?.indicator).toBe("DECLINE");
    }
  });

  it("maps metric directions from the engine's arithmetic", () => {
    expect(indicatorFor("net_profit", 5)).toBe("IMPROVEMENT");
    expect(indicatorFor("total_cost", 5)).toBe("DECLINE");
    expect(indicatorFor("ppn_difference", 5)).toBe("DECLINE");
    expect(indicatorFor("revenue", 5)).toBe("IMPROVEMENT");
    expect(indicatorFor("net_profit", 0)).toBe("NO_CHANGE");
    // A missing value is NOT "no change".
    expect(indicatorFor("net_profit", null)).toBe("NEUTRAL");
    expect(indicatorFor("volume", 100)).toBe("NEUTRAL");
  });

  it("refuses to compare a scenario that cannot be reconstructed", async () => {
    const db = makeDb(seedBase());
    const scenario = await db.insert<PriceScenario>("price_scenarios", {
      project_id: UUIDS.projectA,
      parent_scenario_id: null,
      name: "V1",
      scenario_type: "STANDARD",
      template_id: "T_A_AHS_STANDARD",
      reason: null,
      is_locked: false,
      created_by: UUIDS.procurement,
    });
    const comparison = await compareScenarios(db, PROC, UUIDS.projectA, [scenario.id, scenario.id]);
    expect(comparison.ok).toBe(false);
    if (!comparison.ok) expect(comparison.errorCode).toBe("NOT_FOUND");
  });

  it("rebuilds the engine input from the stored snapshot", () => {
    const input = buildScenarioInput(
      { template_id: "T_A_AHS_STANDARD" },
      [
        { id: "1", scenario_id: "s", field_key: "volume", value_num: 1000, value_text: null, value_date: null, created_at: "" },
        { id: "2", scenario_id: "s", field_key: "harga_jual_include", value_num: 22200, value_text: null, value_date: null, created_at: "" },
        { id: "3", scenario_id: "s", field_key: "vendor_price", value_num: 15000, value_text: null, value_date: null, created_at: "" },
      ],
      [
        {
          id: "c1",
          ahs_id: "a",
          scenario_id: "s",
          line_no: 1,
          category: "HPP",
          description: "Harga Dasar",
          unit: null,
          rate: 15000,
          qty: 1000,
          total: 15000000,
          formula_id: "F007",
          is_summed_in_total: true,
        },
      ],
      {
        volume: null,
        harga_jual_include: null,
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
      },
    );

    expect(input.volume).toBe(1000);
    expect(input.harga_jual_include).toBe(22200);
    expect(input.base_price).toBe(15000);
    expect(input.cost_lines).toHaveLength(1);
    expect(calculateAhs(input).success).toBe(true);
  });
});
