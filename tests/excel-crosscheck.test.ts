/**
 * EXCEL CROSS-CHECK (Phase 2 §16–§17, extended Phase 2.5 §8/§10).
 *
 * Every expectation below is a value cached in the REAL workbook
 * `ANALISIS HARGA SATUAN (2026).xlsx`, extracted by
 * scripts/extract_excel_cases.py. There are NO mock results.
 *
 * Phase 2.5 diagnosis (never collapsed into one tolerance):
 *   VALID              identical within arithmetic rounding
 *   PRECISION_VARIANCE deviation above float noise, below 1e-4 (reported, not hidden)
 *   FORMULA_MISMATCH   real semantic difference (> 1e-4) — must be ZERO
 *   UNRESOLVED         one side has no value
 *   SKIPPED            comparison not attempted (variant without that metric, etc.)
 */

import { describe, expect, it } from "vitest";

import {
  compareNumber,
  skipRow,
  summarise,
  RATIO_COMPARE,
  type CompareOptions,
  type CrossCheckRow,
} from "../lib/calculations/cross-check";
import { calculateAhs } from "../lib/calculations/ahs";
import {
  calculateVendorAllIn,
  calculateVendorPpn,
  calculateVendorBaseFromInclude,
} from "../lib/calculations/vendor";
import { calculateCostLines } from "../lib/calculations/cost";
import { calculateNetProfitWithPbbkb } from "../lib/calculations/profit";
import { loadFixture, toAhsInput, type ExcelCase } from "./helpers/fixture";

const fixture = loadFixture();
const CASES = fixture.cases;
const VENDOR_CASES = fixture.vendor_cases;

const cache = new Map<string, ReturnType<typeof calculateAhs>>();
function runEngine(c: ExcelCase) {
  let r = cache.get(c.id);
  if (!r) {
    r = calculateAhs(toAhsInput(c));
    cache.set(c.id, r);
  }
  if (!r.success) {
    throw new Error(`engine failed for ${c.id}: ${r.errorCode} — ${r.message}`);
  }
  return r;
}

/** Assert a whole metric column against Excel and return the summary rows. */
function crossCheckMetric(
  label: string,
  excelOf: (c: ExcelCase) => number | null,
  systemOf: (c: ExcelCase) => number | null,
  opts: CompareOptions = {},
): { rows: CrossCheckRow[]; checked: number; skipped: number; failures: CrossCheckRow[] } {
  const rows: CrossCheckRow[] = [];
  let skipped = 0;
  for (const c of CASES) {
    const excel = excelOf(c);
    if (excel === null || excel === undefined) {
      skipped += 1;
      rows.push(
        skipRow(label, `${c.sheet}!${c.title_cell}`, c.id,
          "Excel tidak menyediakan metrik ini pada varian blok tersebut."),
      );
      continue;
    }
    const system = systemOf(c);
    const { difference, relative, status, note } = compareNumber(excel, system, opts);
    rows.push({
      formula: label,
      source: `${c.sheet}!${c.title_cell}`,
      label: c.id,
      excel,
      system,
      difference,
      relative_difference: relative,
      status,
      ...(note ? { note } : {}),
    });
  }
  return {
    rows,
    checked: rows.length - skipped,
    skipped,
    failures: rows.filter(
      (r) => r.status === "FORMULA_MISMATCH" || r.status === "UNRESOLVED",
    ),
  };
}

describe("preconditions", () => {
  it("fixture contains real extracted cases", () => {
    expect(fixture.source).toContain("ANALISIS HARGA SATUAN");
    expect(CASES.length).toBeGreaterThan(460);
    expect(VENDOR_CASES.length).toBeGreaterThan(500);
  });

  it("engine never returns NaN/Infinity on any real case", () => {
    for (const c of CASES) {
      const r = runEngine(c);
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "number") {
          expect(Number.isFinite(v), `${c.id}.${k} not finite (${v})`).toBe(true);
        }
      }
    }
  });
});

// ------------------------------------------------- 0. BLOCK CENSUS (Phase 2.5 §9)
describe("Block census — every block is classified, nothing silently dropped", () => {
  it("accounts for ALL title cells in the workbook", () => {
    expect(fixture.census_count).toBe(485);
    const sum = Object.values(fixture.census_summary).reduce((a, b) => a + b, 0);
    expect(sum).toBe(485);
  });

  it("every TESTED census entry has an extracted case", () => {
    const ids = new Set(CASES.map((c) => c.id));
    const tested = fixture.census.filter((c) => c.classification === "TESTED");
    expect(tested.length).toBe(CASES.length);
    for (const t of tested) expect(ids.has(t.id)).toBe(true);
  });

  it("every non-TESTED block carries an explicit classification", () => {
    const nonTested = fixture.census.filter((c) => c.classification !== "TESTED");
    expect(nonTested.length).toBeGreaterThan(0);
    for (const n of nonTested) {
      expect(n.classification, n.id).toBeTruthy();
    }
    expect(nonTested.length).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------- 1. VENDOR PPN
describe("Test 1 — Vendor PPN (F001)", () => {
  const usable = VENDOR_CASES.filter(
    (v) =>
      v.ppn_is_formula &&
      typeof v.base_price === "number" &&
      v.base_price !== 0 &&
      v.excel.ppn !== null,
  );

  it("matches Excel on every vendor block with a base price", () => {
    const failures: string[] = [];
    for (const v of usable) {
      const system = calculateVendorPpn(v.base_price!, v.ppn_rate_effective);
      const { status } = compareNumber(v.excel.ppn, system);
      if (status === "FORMULA_MISMATCH" || status === "UNRESOLVED") {
        failures.push(`${v.id} excel=${v.excel.ppn} system=${system}`);
      }
    }
    expect(usable.length).toBeGreaterThan(300);
    expect(failures).toEqual([]);
  });

  it("covers both PPN rate regimes found in the workbook", () => {
    const withTax = VENDOR_CASES.filter((v) => v.ppn_rate_effective === 0.11);
    const withoutTax = VENDOR_CASES.filter(
      (v) => v.ppn_is_formula && v.ppn_rate_effective === 0,
    );
    expect(withTax.length).toBeGreaterThan(1000);
    expect(withoutTax.length).toBeGreaterThan(0);
    for (const v of withoutTax) expect(v.excel.ppn).toBe(0);
  });

  it("reports blocks whose PPN is a typed literal rather than a formula", () => {
    const literals = VENDOR_CASES.filter(
      (v) => !v.ppn_is_formula && v.excel.ppn !== null,
    );
    expect(literals.length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------- 2. VENDOR ALL IN
describe("Test 2 — Vendor ALL IN (F002A / F002B)", () => {
  const sumCases = VENDOR_CASES.filter(
    (v) =>
      v.all_in_formula !== null &&
      /sum/i.test(v.all_in_formula) &&
      v.excel.all_in !== null &&
      v.all_in_component_rows !== null &&
      v.all_in_from_row !== null,
  );

  function formulaRangeSum(v: (typeof VENDOR_CASES)[number]): number {
    const vars = v.component_values;
    let total = 0;
    for (let i = 0; i < vars.length; i += 1) {
      const row = v.uraian_row + 1 + i;
      if (row >= v.all_in_from_row! && row <= v.all_in_to_row!) {
        total += vars[i] ?? 0;
      }
    }
    return total;
  }

  it("the registry expression reproduces each block's own SUM range", () => {
    const byVariant = { F002A: 0, F002B: 0 };
    const failures: string[] = [];
    for (const v of sumCases) {
      const variant: "F002A" | "F002B" =
        v.all_in_component_rows! >= 7 ? "F002B" : "F002A";
      byVariant[variant] += 1;
      const cv = v.component_values;
      const allIn = calculateVendorAllIn(
        {
          base_price: cv[0] ?? 0, ppn: cv[1] ?? 0, pbbkb: cv[2] ?? 0, pph: cv[3] ?? 0,
          oat: cv[4] ?? 0, ppn_oat: cv[5] ?? 0, bph: cv[6] ?? 0,
        },
        variant,
      );
      const { status } = compareNumber(formulaRangeSum(v), allIn);
      if (status === "FORMULA_MISMATCH" || status === "UNRESOLVED") {
        failures.push(`${v.id} (${variant})`);
      }
    }
    expect(sumCases.length).toBeGreaterThan(500);
    expect(byVariant.F002A).toBeGreaterThan(50);
    expect(byVariant.F002B).toBeGreaterThan(300);
    expect(failures).toEqual([]);
  });

  it("documents the blocks whose CACHED ALL IN contradicts their own formula", () => {
    const stale = sumCases.filter(
      (v) => compareNumber(v.excel.all_in, formulaRangeSum(v)).status === "FORMULA_MISMATCH",
    );
    // eslint-disable-next-line no-console
    console.log(`\nSTALE CACHED ALL-IN BLOCKS: ${stale.length}/${sumCases.length}`);
    expect(stale.length).toBeLessThan(sumCases.length * 0.03);
  });

  it("covers the BPH-row naming variants found in the workbook", () => {
    const seventh = new Set(
      VENDOR_CASES.map((v) => v.component_labels[6] ?? "").filter(Boolean),
    );
    expect(seventh.size).toBeGreaterThanOrEqual(3);
    expect([...seventh].some((l) => /BPH/i.test(l))).toBe(true);
  });

  it("registers the two variants as separate formulas (not merged)", () => {
    expect(calculateVendorAllIn({ base_price: 1000, ppn: 110, bph: 50 }, "F002A")).toBe(1110);
    expect(calculateVendorAllIn({ base_price: 1000, ppn: 110, bph: 50 }, "F002B")).toBe(1160);
  });
});

// ----------------------------------------------------------- 3. VENDOR BASE F003
describe("Test 3 — Vendor base dari harga include (F003)", () => {
  it("matches Excel for blocks whose base formula is '=X/divisor'", () => {
    const usable = VENDOR_CASES.filter((v) => {
      const m = /^=\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(
        (v.base_formula ?? "").replace(/\s/g, ""),
      );
      return Boolean(m) && typeof v.base_price === "number";
    });
    expect(usable.length).toBeGreaterThan(20);
    const failures: string[] = [];
    for (const v of usable) {
      const m = /^=\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(
        (v.base_formula ?? "").replace(/\s/g, ""),
      )!;
      const system = calculateVendorBaseFromInclude(Number(m[1]), Number(m[2]));
      const { status } = compareNumber(v.base_price, system);
      if (status === "FORMULA_MISMATCH" || status === "UNRESOLVED") failures.push(v.id);
    }
    expect(failures).toEqual([]);
  });
});

// ----------------------------------------------------------------- 4. REVENUE
describe("Test 4 — Revenue (F006)", () => {
  it("revenue = harga_jual_setelah_pajak x volume matches Excel", () => {
    const { checked, failures } = crossCheckMetric(
      "F006", (c) => c.excel.revenue, (c) => runEngine(c).revenue,
    );
    expect(checked).toBeGreaterThan(460);
    expect(failures).toEqual([]);
  });
});

// ------------------------------------------------------------- 5. COST LINE TOT
describe("Test 5 — Cost line total (F007)", () => {
  it("every extracted cost line reproduces Excel rate x qty", () => {
    let checked = 0;
    const failures: string[] = [];
    for (const c of CASES) {
      for (const cl of c.cost_lines) {
        if (cl.total_excel === null) continue;
        const system = calculateCostLines([
          { category: cl.category, description: cl.description, rate: cl.rate, qty: cl.qty },
        ])[0]!.total;
        checked += 1;
        const { status } = compareNumber(cl.total_excel, system);
        if (status === "FORMULA_MISMATCH" || status === "UNRESOLVED") {
          failures.push(`${c.id} r${cl.row}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(8000);
    expect(failures).toEqual([]);
  });
});

// ------------------------------------------------------------- 6. TOTAL COST
describe("Test 6 — Total Cost (F015A) & Biaya per Liter (F016)", () => {
  it("total cost = sum of the real cost rows", () => {
    const { checked, failures } = crossCheckMetric(
      "F015A", (c) => c.excel.total_cost, (c) => runEngine(c).total_cost,
    );
    expect(checked).toBeGreaterThan(460);
    expect(failures).toEqual([]);
  });

  it("cost per liter = sum of real cost rates", () => {
    const { checked, failures } = crossCheckMetric(
      "F016", (c) => c.excel.cost_per_liter, (c) => runEngine(c).cost_per_liter,
    );
    expect(checked).toBeGreaterThan(460);
    expect(failures).toEqual([]);
  });
});

// ------------------------------------------------------------ 7. GROSS PROFIT
describe("Test 7 — Laba Kotor / Gross Profit (F017)", () => {
  it("gross profit = revenue - total cost matches Excel", () => {
    const { checked, failures } = crossCheckMetric(
      "F017", (c) => c.excel.gross_profit, (c) => runEngine(c).gross_profit,
    );
    expect(checked).toBeGreaterThan(460);
    expect(failures).toEqual([]);
  });
});

// ----------------------------------------------------------- 8. PPN DIFFERENCE
describe("Test 8 — Selisih PPN (F018) with all three PPN-input variants", () => {
  it("ppn input reproduces Excel for F008A, F008B and F008C", () => {
    const byVariant: Record<string, number> = {};
    const failures: string[] = [];
    for (const c of CASES) {
      const r = runEngine(c);
      byVariant[c.ppn_input_formula_id] = (byVariant[c.ppn_input_formula_id] ?? 0) + 1;
      const { status } = compareNumber(c.excel.ppn_input, r.ppn_input);
      if (status === "FORMULA_MISMATCH" || status === "UNRESOLVED") {
        failures.push(`${c.id} (${c.ppn_input_formula_id})`);
      }
    }
    expect(byVariant["F008A"]).toBeGreaterThan(100);
    expect(byVariant["F008B"]).toBeGreaterThan(10);
    expect(byVariant["F008C"]).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });

  it("ppn difference = ppn keluaran - ppn masukan matches Excel", () => {
    const { checked, failures } = crossCheckMetric(
      "F018", (c) => c.excel.ppn_difference, (c) => runEngine(c).ppn_difference,
    );
    expect(checked).toBeGreaterThan(460);
    expect(failures).toEqual([]);
  });

  it("ppn keluaran (F001 sale side) matches Excel", () => {
    const { checked, failures } = crossCheckMetric(
      "F001/out", (c) => c.excel.ppn_output, (c) => runEngine(c).ppn_output,
    );
    expect(checked).toBeGreaterThan(460);
    expect(failures).toEqual([]);
  });
});

// ------------------------------------------------------------- 9. NET PROFIT
describe("Test 9 — Laba Bersih (F019A) and F019B (3 suku)", () => {
  it("net profit matches Excel for both variants", () => {
    const { checked, failures } = crossCheckMetric(
      "F019A/B", (c) => c.excel.net_profit, (c) => runEngine(c).net_profit,
    );
    expect(checked).toBeGreaterThan(460);
    expect(failures).toEqual([]);
  });

  it("covers the F019B (3-term) blocks with PBBKB difference", () => {
    const three = CASES.filter((c) => c.net_profit_formula_id === "F019B");
    expect(three.length).toBeGreaterThan(0);
    for (const c of three) {
      const r = runEngine(c);
      expect(r.formulas_used.net_profit).toBe("F019B");
      const { status } = compareNumber(c.excel.net_profit, r.net_profit);
      // VALID, or PRECISION_VARIANCE when Excel's cached difference of two ~1e9
      // magnitudes was written with limited precision. Never a mismatch.
      expect(["VALID", "PRECISION_VARIANCE"], c.id).toContain(status);
    }
  });

  it("F019B expression is gross - ppn diff - PBBKB diff", () => {
    // Direct registry check of the resolved semantics.
    expect(calculateNetProfitWithPbbkb(1000, 100, 50)).toBe(850);
  });
});

// --------------------------------------------------- 10. NET PROFIT PER LITER
describe("Test 10 — Laba Bersih per Liter (F020)", () => {
  it("net profit per liter = net profit / volume matches Excel", () => {
    const { checked, failures } = crossCheckMetric(
      "F020", (c) => c.excel.net_profit_per_liter, (c) => runEngine(c).net_profit_per_liter,
    );
    expect(checked).toBeGreaterThan(400);
    expect(failures).toEqual([]);
  });
});

// ------------------------------------------------------------ 11. PROFIT %
describe("Test 11 — Persentase / Profit % (F021A)", () => {
  it("profit % = net profit / TOTAL BIAYA (not / revenue) matches Excel", () => {
    const { checked, failures } = crossCheckMetric(
      "F021A", (c) => c.excel.profit_percentage, (c) => runEngine(c).profit_percentage,
      RATIO_COMPARE,
    );
    expect(checked).toBeGreaterThan(300);
    expect(failures).toEqual([]);
  });

  it("skips the 133 blocks whose layout has no PERSENTASE row", () => {
    const withoutPct = CASES.filter((c) => !c.has_profit_percentage);
    expect(withoutPct.length).toBeGreaterThan(100);
    for (const c of withoutPct) expect(c.excel.profit_percentage).toBeNull();
  });

  it("proves the Excel denominator is Total Biaya, not Revenue", () => {
    let wouldDifferFromRevenue = 0;
    for (const c of CASES) {
      if (c.excel.profit_percentage === null || c.excel.revenue === null) continue;
      const alt = c.excel.net_profit / c.excel.revenue;
      const { status } = compareNumber(c.excel.profit_percentage, alt, RATIO_COMPARE);
      if (status !== "VALID") wouldDifferFromRevenue += 1;
    }
    expect(wouldDifferFromRevenue).toBeGreaterThan(200);
  });
});

// ------------------------------------------- 12. SALE DPP VARIANTS (§7)
describe("Test 12 — Sale DPP variants (F005 / F005B / F005C)", () => {
  it("reproduces the blocks using divisor 1.185 (= PPN 11% + PBBKB 7.5%)", () => {
    const special = CASES.filter((c) => c.include_divisor === 1.185);
    expect(special.length).toBeGreaterThanOrEqual(5);
    const failures: string[] = [];
    for (const c of special) {
      expect(c.sale_pbbkb_rate).toBeCloseTo(0.075, 12);
      const r = runEngine(c);
      for (const [label, excel, system] of [
        ["hjsp", c.excel.harga_jual_setelah_pajak, r.harga_jual_setelah_pajak],
        ["revenue", c.excel.revenue, r.revenue],
        ["ppn_output", c.excel.ppn_output, r.ppn_output],
      ] as const) {
        const { status } = compareNumber(excel, system);
        if (status === "FORMULA_MISMATCH" || status === "UNRESOLVED") {
          failures.push(`${c.id}.${label}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("reproduces the blocks using divisor 1.16 (= PPN 11% + PBBKB 5%)", () => {
    const special = CASES.filter((c) => c.include_divisor === 1.16);
    expect(special.length).toBeGreaterThanOrEqual(5);
    const failures: string[] = [];
    for (const c of special) {
      const r = runEngine(c);
      const { status } = compareNumber(c.excel.harga_jual_setelah_pajak, r.harga_jual_setelah_pajak);
      if (status === "FORMULA_MISMATCH" || status === "UNRESOLVED") failures.push(c.id);
    }
    expect(failures).toEqual([]);
  });

  it("handles the literal-DPP variant (F005B) explicitly", () => {
    const literal = CASES.filter((c) => c.sale_variant === "F005B");
    expect(literal.length).toBeGreaterThan(40);
    for (const c of literal) {
      expect(c.harga_jual_include).toBeNull();
      expect(c.harga_jual_dpp_input).not.toBeNull();
      const r = runEngine(c);
      expect(r.sale_dpp_variant).toBe("F005B");
      expect(r.harga_jual_dpp).toBeCloseTo(c.harga_jual_dpp_input!, 9);
    }
  });

  it("handles the cross-block referenced DPP variant (F005C)", () => {
    const referenced = CASES.filter((c) => c.sale_variant === "F005C");
    expect(referenced.length).toBeGreaterThan(0);
    for (const c of referenced) {
      const r = runEngine(c);
      expect(r.sale_dpp_variant).toBe("F005C");
    }
  });

  it("does not hardcode 1.11 as a universal divisor", () => {
    const divisors = new Set(CASES.map((c) => c.include_divisor).filter((d) => d !== null));
    expect(divisors.size).toBeGreaterThanOrEqual(3);
    expect(divisors.has(1.11)).toBe(true);
    expect(divisors.has(1.185)).toBe(true);
    expect(divisors.has(1.16)).toBe(true);
  });
});

// --------------------------------------- 13. #REF! AUDIT (Phase 2.5 §5)
describe("Test 13 — #REF! audit", () => {
  it("finds every #REF! cell and never treats it as 0", () => {
    expect(fixture.ref_errors.length).toBe(18);
    for (const e of fixture.ref_errors) {
      expect(e.formula.toUpperCase()).toContain("#REF!");
      expect(e.sheet, e.cell).toBeTruthy();
    }
  });

  it("records the formulas that depend on a broken reference", () => {
    expect(fixture.ref_error_dependents.length).toBeGreaterThan(0);
    for (const d of fixture.ref_error_dependents) {
      expect(d.formula).toMatch(/[A-Z]{1,3}\d+/);
    }
  });

  it("no extracted case silently swallowed a #REF! as a value", () => {
    for (const c of CASES) {
      expect(Number.isFinite(c.excel.revenue)).toBe(true);
      expect(Number.isFinite(c.excel.total_cost)).toBe(true);
    }
  });
});

// ------------------------------- 14. UNRESOLVED FORMULA AUDIT (Phase 2.5 §4)
describe("Test 14 — F019B / F021B resolution audit", () => {
  it("F019B now has workbook-wide evidence (68 cells, resolved)", () => {
    expect((fixture.workbook_unresolved_cells["F019B"] ?? []).length).toBe(68);
  });

  it("F021B is identified with a NON-total-cost denominator (10 cells)", () => {
    expect((fixture.workbook_unresolved_cells["F021B"] ?? []).length).toBe(10);
  });
});

// ------------------------------------------------------------ SUMMARY REPORT
describe("Cross-check summary", () => {
  it("aggregates all metrics with zero formula mismatch", () => {
    const all: CrossCheckRow[] = [];
    const metrics: Array<
      [string, (c: ExcelCase) => number | null, (c: ExcelCase) => number | null, CompareOptions?]
    > = [
      ["F006 revenue", (c) => c.excel.revenue, (c) => runEngine(c).revenue],
      ["F015A total_cost", (c) => c.excel.total_cost, (c) => runEngine(c).total_cost],
      ["F016 cost_per_liter", (c) => c.excel.cost_per_liter, (c) => runEngine(c).cost_per_liter],
      ["F017 gross_profit", (c) => c.excel.gross_profit, (c) => runEngine(c).gross_profit],
      ["F018 ppn_difference", (c) => c.excel.ppn_difference, (c) => runEngine(c).ppn_difference],
      ["F019A/B net_profit", (c) => c.excel.net_profit, (c) => runEngine(c).net_profit],
      ["F020 net_profit_per_liter", (c) => c.excel.net_profit_per_liter, (c) => runEngine(c).net_profit_per_liter],
      ["F021A profit_percentage", (c) => c.excel.profit_percentage, (c) => runEngine(c).profit_percentage, RATIO_COMPARE],
    ];
    for (const [label, e, s, opts] of metrics) {
      const { rows } = crossCheckMetric(label, e, s, opts ?? {});
      all.push(...rows);
    }
    const summary = summarise(all);
    // eslint-disable-next-line no-console
    console.log(
      `\nEXCEL CROSS-CHECK SUMMARY\n` +
        `  rows               : ${summary.total}\n` +
        `  compared           : ${summary.compared}\n` +
        `  VALID              : ${summary.valid}\n` +
        `  PRECISION_VARIANCE : ${summary.precision_variance}\n` +
        `  FORMULA_MISMATCH   : ${summary.formula_mismatch}\n` +
        `  SKIPPED            : ${summary.skipped}\n` +
        `  max rel            : ${summary.max_relative_difference?.toExponential(3)}\n`,
    );
    expect(summary.formula_mismatch).toBe(0);
    expect(summary.unresolved).toBe(0);
    expect(summary.valid).toBeGreaterThan(2000);
    // PRECISION_VARIANCE is reported separately and must stay a minority — it is
    // Excel cache rounding, NOT a different formula.
    expect(summary.precision_variance).toBeLessThan(summary.compared * 0.5);
  });
});
