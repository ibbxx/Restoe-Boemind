/**
 * Engine behaviour: validation, structured errors, determinism, registry
 * integrity and the scenario engine (create / clone / calculate / compare).
 *
 * Scenario tests are built from REAL extracted blocks - no fabricated numbers.
 */

import { describe, expect, it } from "vitest";

import { calculateAhs } from "../lib/calculations/ahs";
import { evaluateExpression } from "../lib/calculations/expression";
import {
  CALCULATION_TEMPLATES,
  FORMULA_REGISTRY,
  getFormula,
  listUnresolved,
  resolveFormula,
} from "../lib/calculations/registry";
import {
  InMemoryScenarioStore,
  calculateScenario,
  cloneScenario,
  compareScenario,
  createScenario,
  metricValue,
} from "../lib/calculations/scenario";
import { validateAhsInput, validateNumeric, validateVendorPrice } from "../lib/calculations/validation";
import { loadFixture, toAhsInput, type ExcelCase } from "./helpers/fixture";

const fixture = loadFixture();
const CASES = fixture.cases;
const V1 = CASES[0]!;

function inputOf(c: ExcelCase, patch: Record<string, unknown> = {}) {
  return { ...toAhsInput(c), ...patch } as ReturnType<typeof toAhsInput>;
}

describe("Expression evaluator (formula provenance)", () => {
  it("evaluates arithmetic with Excel-style percent literals", () => {
    expect(evaluateExpression("base_price * 11%", { base_price: 14500 })).toBeCloseTo(1595, 10);
    expect(evaluateExpression("(a + b) * 0.11", { a: 100, b: 200 })).toBeCloseTo(33, 10);
  });

  it("expands arrays for sum()", () => {
    expect(evaluateExpression("sum(xs)", { xs: [1, 2, 3, 4] })).toBe(10);
    expect(evaluateExpression("sum(a, b)", { a: 1, b: 2 })).toBe(3);
  });

  it("refuses unknown variables instead of treating them as 0", () => {
    expect(() => evaluateExpression("base_price * 11%", {})).toThrowError(/tidak tersedia/);
  });

  it("refuses division by zero instead of returning Infinity", () => {
    expect(() => evaluateExpression("a / b", { a: 1, b: 0 })).toThrowError(/Pembagian dengan nol/);
  });
});

describe("Formula Registry integrity", () => {
  it("every formula referenced by a template is registered and resolvable", () => {
    const problems: string[] = [];
    for (const t of CALCULATION_TEMPLATES) {
      for (const [step, id] of Object.entries(t.formula_definition)) {
        try {
          const f = getFormula(id);
          if (!f.active) {
            problems.push(`${t.template_id}.${step} -> ${id} is inactive`);
          }
        } catch {
          problems.push(`${t.template_id}.${step} -> ${id} MISSING`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps Excel variants as SEPARATE formulas (never merged)", () => {
    const ids = FORMULA_REGISTRY.map((f) => f.formula_id);
    for (const group of [
      ["F002A", "F002B"],
      ["F008A", "F008B", "F008C"],
      ["F015A", "F015B", "F015C"],
      ["F019A", "F019B"],
      ["F021A", "F021B", "F021C"],
      ["F005", "F005B", "F005C"],
    ]) {
      for (const id of group) expect(ids).toContain(id);
    }
  });

  it("keeps no formula UNRESOLVED without workbook evidence", () => {
    // Phase 2.5 resolved both open items with direct evidence (F019B third term
    // = SELISIH PBBKB, F021B denominator = Modal Investor / Harga Include).
    const unresolved = listUnresolved();
    expect(unresolved).toEqual([]);
    for (const f of FORMULA_REGISTRY) {
      expect(f.description, f.formula_id).toBeTruthy();
      expect(f.formula_name, f.formula_id).toBeTruthy();
    }
  });

  it("records Excel provenance (sheet + cell + original formula)", () => {
    for (const f of FORMULA_REGISTRY) {
      expect(f.source_sheet, f.formula_id).toBeTruthy();
      expect(f.source_cell, f.formula_id).toBeTruthy();
      expect(f.excel_formula, f.formula_id).toBeTruthy();
    }
  });

  it("REFUSES to evaluate an INACTIVE formula instead of guessing", () => {
    // F015C is a documented Excel variant whose value is typed directly into the
    // workbook (no computable formula), so it stays registered but inactive.
    const inactive = FORMULA_REGISTRY.filter((f) => !f.active);
    expect(inactive.length).toBeGreaterThan(0);
    for (const f of inactive) {
      expect(f.resolution, f.formula_id).toBe("RESOLVED");
      expect(() => resolveFormula(f.formula_id, {})).toThrowError(/UNRESOLVED/);
    }
  });
});

describe("Validation layer", () => {
  it("rejects zero volume with a structured error", () => {
    const r = calculateAhs(inputOf(V1, { volume: 0 }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.errorCode).toBe("ZERO_VOLUME");
      expect(r.field).toBe("volume");
      expect(r.message).toBeTruthy();
    }
  });

  it("rejects a missing customer price instead of defaulting to 0", () => {
    const r = calculateAhs(inputOf(V1, { harga_jual_include: null }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errorCode).toBe("MISSING_INPUT");
  });

  it("rejects an empty cost list", () => {
    const r = calculateAhs(inputOf(V1, { cost_lines: [] }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errorCode).toBe("MISSING_COST_LINES");
  });

  it("keeps a null cost rate as null (NOT APPLICABLE, not 0)", () => {
    const r = calculateAhs(
      inputOf(V1, {
        cost_lines: [
          { category: "HPP", description: "Harga Dasar", rate: 1000, qty: 10 },
          { category: "RELASI", description: "Biaya Proyek", rate: null, qty: 10 },
        ],
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      const line = r.cost_lines.find((l) => l.description === "Biaya Proyek")!;
      expect(line.rate).toBeNull();
      expect(line.applied).toBe(false);
      expect(line.total).toBe(0);
    }
  });

  it("reports a missing vendor price instead of Rp 0 (PRD §11)", () => {
    const f = validateVendorPrice(null, "BLASDU");
    expect(f?.errorCode).toBe("MISSING_VENDOR_PRICE");
    expect(validateVendorPrice(14500)).toBeNull();
  });

  it("rejects unknown templates explicitly", () => {
    const r = calculateAhs(inputOf(V1, { template_id: "T_TIDAK_ADA" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errorCode).toBe("UNKNOWN_TEMPLATE");
  });

  it("never returns NaN / Infinity / undefined", () => {
    const r = calculateAhs(inputOf(V1));
    expect(r.success).toBe(true);
    if (r.success) {
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "number") {
          expect(Number.isFinite(v), `${k}=${v}`).toBe(true);
          expect(v).not.toBeUndefined();
        }
      }
    }
  });

  it("validateNumeric enforces rules", () => {
    expect(validateNumeric("x", "abc")?.errorCode).toBe("INVALID_NUMBER");
    expect(validateNumeric("x", -5, { allowNegative: false })?.errorCode).toBe("NEGATIVE_VALUE");
    expect(validateNumeric("x", null)?.errorCode).toBe("MISSING_INPUT");
    expect(validateNumeric("x", null, { required: false })).toBeNull();
  });

  it("validateAhsInput collects every problem, not just the first", () => {
    const errs = validateAhsInput({
      template_id: "T_A_AHS_STANDARD",
      volume: 0,
      harga_jual_include: null,
      cost_lines: [],
    });
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Determinism", () => {
  it("identical input always yields identical output", () => {
    const a = calculateAhs(inputOf(V1));
    const b = calculateAhs(inputOf(V1));
    expect(a).toEqual(b);
  });

  it("is deterministic across every extracted block (2 runs each)", () => {
    for (const c of CASES) {
      expect(calculateAhs(inputOf(c))).toEqual(calculateAhs(inputOf(c)));
    }
  });

  it("is deterministic across 100 repeated runs", () => {
    const first = calculateAhs(inputOf(V1));
    for (let i = 0; i < 100; i += 1) {
      expect(calculateAhs(inputOf(V1))).toEqual(first);
    }
  });
});

describe("Scenario engine", () => {
  /** V1 from a real block; V2 = V1 with the vendor price (HPP rate) reduced. */
  function makeStore() {
    const store = new InMemoryScenarioStore();
    const created = createScenario(store, {
      project_id: "TONASA",
      name: "V1 Initial",
      template_id: "T_A_AHS_STANDARD",
      input: inputOf(V1),
      created_by: "user-1",
      reason: "Initial analysis dari blok Excel asli",
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error("unreachable");
    return { store, v1: created.scenario };
  }

  it("createScenario stores the input snapshot AND the calculated result", () => {
    const { v1 } = makeStore();
    expect(v1.result).not.toBeNull();
    expect(v1.result!.revenue).toBeCloseTo(V1.excel.revenue, 6);
    expect(v1.parent_scenario_id).toBeNull();
    expect(v1.reason).toBeTruthy();
    expect(v1.created_by).toBe("user-1");
  });

  it("cloneScenario creates V2 without overwriting V1", () => {
    const { store, v1 } = makeStore();
    const before = JSON.parse(JSON.stringify(store.get(v1.scenario_id)));

    const lowered = V1.cost_lines.map((cl) =>
      cl.category.toUpperCase() === "HPP"
        ? { ...cl, rate: (cl.rate ?? 0) - 500 }
        : cl,
    );
    const cloned = cloneScenario(store, v1.scenario_id, {
      name: "V2 Vendor turun 500",
      reason: "Negosiasi ulang harga vendor",
      created_by: "user-2",
      patch: { cost_lines: lowered },
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(cloned.success).toBe(true);
    if (!cloned.success) return;
    const v2 = cloned.scenario;

    // V1 is untouched
    expect(store.get(v1.scenario_id)).toEqual(before);

    // V2 links back to V1 and reflects the change
    expect(v2.parent_scenario_id).toBe(v1.scenario_id);
    expect(v2.result!.total_cost).toBeLessThan(v1.result!.total_cost);
    expect(v2.result!.net_profit).toBeGreaterThan(v1.result!.net_profit);

    // Customer price is NOT auto-changed (PRD §33)
    expect(v2.input.harga_jual_include).toBe(v1.input.harga_jual_include);
    expect(v2.result!.revenue).toBeCloseTo(v1.result!.revenue, 6);
  });

  it("stores V1 -> V2 -> V3 as an immutable chain", () => {
    const { store, v1 } = makeStore();
    const v2 = cloneScenario(store, v1.scenario_id, {
      name: "V2",
      reason: "r2",
      created_by: "u",
      patch: { volume: (V1.volume ?? 0) + 1000 },
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(v2.success).toBe(true);
    if (!v2.success) return;
    const v3 = cloneScenario(store, v2.scenario.scenario_id, {
      name: "V3",
      reason: "r3",
      created_by: "u",
      patch: { harga_jual_include: (V1.harga_jual_include ?? 0) + 500 },
      now: "2026-01-03T00:00:00.000Z",
    });
    expect(v3.success).toBe(true);
    if (!v3.success) return;

    const all = store.listByProject("TONASA");
    expect(all).toHaveLength(3);
    expect(all.map((s) => s.name)).toEqual(["V1 Initial", "V2", "V3"]);
    expect(all[2]!.parent_scenario_id).toBe(all[1]!.scenario_id);
  });

  it("rejects mutation of a finalised scenario (immutability)", () => {
    const { store, v1 } = makeStore();
    expect(() => store.update(v1.scenario_id, { name: "diubah" })).toThrowError(/read-only/);
  });

  it("recalculating a stored scenario reproduces its snapshot exactly", () => {
    const { store, v1 } = makeStore();
    const again = calculateScenario(store, v1.scenario_id);
    expect(again.success).toBe(true);
    if (again.success) expect(again.result).toEqual(v1.result);
  });

  it("compareScenario reports every required metric with systematic differences", () => {
    const { store, v1 } = makeStore();
    const cloned = cloneScenario(store, v1.scenario_id, {
      name: "V2",
      reason: "vendor -500",
      created_by: "u",
      patch: {
        cost_lines: V1.cost_lines.map((cl) =>
          cl.category.toUpperCase() === "HPP" ? { ...cl, rate: (cl.rate ?? 0) - 500 } : cl,
        ),
      },
      now: "2026-01-02T00:00:00.000Z",
    });
    if (!cloned.success) throw new Error("clone failed");

    const rows = compareScenario(v1, cloned.scenario);
    const labels = rows.map((r) => r.label);
    for (const want of [
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
    ]) {
      expect(labels).toContain(want);
    }

    const byLabel = new Map(rows.map((r) => [r.label, r]));
    // Vendor price down -> cost down
    const baseOf = (s: typeof v1) =>
      s.input.cost_lines.find((l) => l.category.toUpperCase() === "HPP")?.rate ?? null;
    expect(baseOf(v1)! - baseOf(cloned.scenario)!).toBe(500);

    const tc = byLabel.get("Total Cost")!;
    expect(tc.difference).toBeLessThan(0);
    const np = byLabel.get("Net Profit")!;
    expect(np.difference).toBeGreaterThan(0);
    // Customer price / revenue unchanged
    expect(byLabel.get("Customer Price")!.difference).toBe(0);
    expect(byLabel.get("Revenue")!.difference).toBe(0);
  });

  it("metricValue exposes vendor price from input and results from output", () => {
    const { v1 } = makeStore();
    expect(metricValue(v1, "vendor_price")).toBe(
      v1.input.cost_lines.find((l) => l.category.toUpperCase() === "HPP")?.rate ?? null,
    );
    expect(metricValue(v1, "revenue")).toBeCloseTo(v1.result!.revenue, 6);
  });
});
