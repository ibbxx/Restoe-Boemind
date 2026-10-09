/**
 * CALCULATION INTEGRATION TEST (Phase 3 §26: "Excel Result = System Result").
 *
 * The existing cross-check tests call the calculation engine directly. This
 * test goes the LONG way round, exactly as the application does:
 *
 *   real Excel block (fixture)
 *        ↓  seed
 *   ahs + ahs_cost_items (database)
 *        ↓  commitScenario()  →  INPUT -> VALIDATION -> ENGINE -> RESULT
 *   scenario_inputs + calculation_results (database)
 *        ↓  read back
 *   compare with the Excel cached value
 *
 * If the service layer dropped an input, used the wrong variant or wrote a
 * different column, this test fails even though the engine alone is correct.
 */

import { describe, expect, it } from "vitest";

import { calculateAhs } from "../lib/calculations/ahs";
import { compareNumber, type CrossCheckRow } from "../lib/calculations/cross-check";
import { commitScenario } from "../lib/services/scenarios";
import { getScenarioDetail } from "../lib/services/scenarios";
import { actor, makeDb, UUIDS } from "./helpers/db";
import { loadFixture, toAhsInput, type ExcelCase } from "./helpers/fixture";
import type { AhsCostItem } from "../lib/types/domain";

const fixture = loadFixture();
const CASES = fixture.cases;
const PROC = actor("PROCUREMENT", UUIDS.procurement);

/** One isolated project per case keeps every scenario a V1 on a clean slate. */
async function seedCaseFromExcel(c: ExcelCase) {
  const db = makeDb({
    projects: [
      {
        id: UUIDS.projectA,
        code: "CASE",
        name: `Case ${c.id}`,
        customer_id: null,
        product_id: null,
        market_id: null,
        location: null,
        period_label: null,
        pic_id: null,
        status: "ACTIVE",
        notes: null,
        created_by: UUIDS.procurement,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    profiles: [
      {
        id: UUIDS.procurement,
        email: "proc@test.local",
        full_name: "Procurement Tester",
        role: "PROCUREMENT",
        is_active: true,
      },
    ],
  });

  const templateLetter = c.template;
  const templateId =
    templateLetter === "B"
      ? "T_B_VENDOR_EVAL_PROFAMIR"
      : templateLetter === "C"
        ? "T_C_PROYEKSI_LABA_RUGI"
        : templateLetter === "D"
          ? "T_D_MARKET_CASH"
          : templateLetter === "E"
            ? "T_E_AHS_PROFIT_SHARE"
            : "T_A_AHS_STANDARD";

  await db.insert("ahs", {
    id: "00000000-0000-4000-8000-0000000000e1",
    project_id: UUIDS.projectA,
    template_id: templateId,
    title: c.title,
    volume: c.volume,
    // The AHS working set carries a single PPN rate; the sale/cost split and the
    // remaining variants live in the scenario snapshot (below).
    harga_jual_include: c.harga_jual_include,
    include_divisor: c.include_divisor ?? 1.11,
    ppn_rate: c.ppn_input_rate ?? 0.11,
    pbbkb_rate: c.sale_pbbkb_rate,
    pph_inu_rate: 0,
    bph_migas_rate: 0,
    harga_keekonomian: null,
  });

  const costItems: AhsCostItem[] = [];
  for (const [index, line] of c.cost_lines.entries()) {
    const row = await db.insert<AhsCostItem>("ahs_cost_items", {
      ahs_id: "00000000-0000-4000-8000-0000000000e1",
      scenario_id: null,
      line_no: index + 1,
      category: line.category,
      description: line.description,
      unit: null,
      rate: line.rate,
      qty: line.qty,
      total: line.rate === null ? 0 : line.rate * (line.qty ?? 0),
      formula_id: "F007",
    });
    costItems.push(row);
  }

  return { db, templateId, costItems };
}

async function commitExcelCase(c: ExcelCase) {
  const { db, templateId } = await seedCaseFromExcel(c);

  const result = await commitScenario(db, PROC, UUIDS.projectA, {
    name: "V1",
    scenario_type: "STANDARD",
    reason: `integration case ${c.id}`,
    template_id: templateId,
    input: {
      sale_ppn_rate: c.sale_ppn_rate,
      ppn_input_rate: c.ppn_input_rate,
      harga_jual_dpp_input: c.harga_jual_dpp_input,
      sale_dpp_variant: c.sale_variant === "F005B" ? "F005B" : undefined,
      harga_jual_setelah_pajak_input: c.harga_jual_setelah_pajak_input,
      net_profit_formula_id: c.net_profit_formula_id,
      pbbkb_difference_applicable: c.pbbkb_difference_applicable,
      ppn_input_formula_id: c.ppn_input_formula_id,
    },
  });

  return { db, result };
}

function check(label: string, c: ExcelCase, excel: number | null, system: number | null): CrossCheckRow | null {
  if (excel === null || excel === undefined) return null;
  const { difference, relative, status, note } = compareNumber(excel, system ?? null);
  return {
    formula: label,
    source: `${c.sheet}!${c.title_cell}`,
    label: c.id,
    excel,
    system: system ?? 0,
    difference,
    relative_difference: relative,
    status,
    ...(note ? { note } : {}),
  };
}

describe("Integration preconditions", () => {
  it("has real extracted Excel cases to drive the workflow", () => {
    expect(CASES.length).toBeGreaterThan(460);
  });

  it("the service path reproduces the direct engine result for a first case", async () => {
    const first = CASES[0]!;
    const { db, result } = await commitExcelCase(first);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const direct = calculateAhs(toAhsInput(first));
    expect(direct.success).toBe(true);
    if (!direct.success) return;

    expect(Number(result.data.result.revenue)).toBeCloseTo(direct.revenue, 6);
    expect(Number(result.data.result.total_cost)).toBeCloseTo(direct.total_cost, 6);
    expect(Number(result.data.result.net_profit)).toBeCloseTo(direct.net_profit, 6);

    // The app never writes calculated columns on `ahs`.
    const ahs = await db.select<{ revenue: number | null; net_profit: number | null }>("ahs", {});
    expect(ahs.rows[0]?.revenue ?? null).toBeNull();
    expect(ahs.rows[0]?.net_profit ?? null).toBeNull();
  });
});

describe("Excel -> database -> service -> engine -> database -> Excel", () => {
  it("reproduces Revenue, Total Cost, Gross Profit and Net Profit for EVERY extracted block", async () => {
    const rows: CrossCheckRow[] = [];
    let committed = 0;
    const failures: string[] = [];

    for (const c of CASES) {
      const { db, result } = await commitExcelCase(c);
      if (!result.ok) {
        failures.push(`${c.id}: commitScenario failed — ${result.error} (${result.errorCode})`);
        continue;
      }
      committed += 1;

      for (const [label, excel, system] of [
        ["F006 revenue", c.excel.revenue, Number(result.data.result.revenue)],
        ["F015A total_cost", c.excel.total_cost, Number(result.data.result.total_cost)],
        ["F017 gross_profit", c.excel.gross_profit, Number(result.data.result.gross_profit)],
        ["F019A/B net_profit", c.excel.net_profit, Number(result.data.result.net_profit)],
      ] as const) {
        const row = check(label, c, excel, system);
        if (row) rows.push(row);
      }

      // Re-reading through the service must give the stored values back.
      const detail = await getScenarioDetail(db, PROC, UUIDS.projectA, result.data.scenario_id);
      if (!detail.ok) failures.push(`${c.id}: getScenarioDetail failed — ${detail.error}`);
      else if (!detail.data.reproduced) failures.push(`${c.id}: engine could not reproduce the snapshot`);
    }

    const mismatches = rows.filter((r) => r.status === "FORMULA_MISMATCH" || r.status === "UNRESOLVED");
    // eslint-disable-next-line no-console
    console.log(
      `\nINTEGRATION CROSS-CHECK (service path)\n` +
        `  cases committed : ${committed}/${CASES.length}\n` +
        `  rows compared   : ${rows.length}\n` +
        `  VALID           : ${rows.filter((r) => r.status === "VALID").length}\n` +
        `  PRECISION_VAR   : ${rows.filter((r) => r.status === "PRECISION_VARIANCE").length}\n` +
        `  MISMATCH        : ${mismatches.length}\n`,
    );

    expect(failures).toEqual([]);
    expect(committed).toBe(CASES.length);
    expect(rows.length).toBeGreaterThan(1800);
    expect(mismatches).toEqual([]);
  });

  it("reproduces PPN difference, PPN output, profit/liter and profit % where Excel provides them", async () => {
    const failures: string[] = [];
    let compared = 0;

    for (const c of CASES.slice(0, 200)) {
      const { result } = await commitExcelCase(c);
      if (!result.ok) {
        failures.push(`${c.id}: ${result.error}`);
        continue;
      }
      const stored = result.data.result;

      for (const [label, excel, system] of [
        ["F001 ppn_output", c.excel.ppn_output, Number(stored.ppn_output)],
        ["F008A/B/C ppn_input", c.excel.ppn_input, Number(stored.ppn_input)],
        ["F018 ppn_difference", c.excel.ppn_difference, Number(stored.ppn_difference)],
        ["F020 net_profit_per_liter", c.excel.net_profit_per_liter, Number(stored.net_profit_per_liter)],
        ["F021A profit_percentage", c.excel.profit_percentage, Number(stored.profit_percentage)],
      ] as const) {
        const row = check(label, c, excel, system);
        if (!row) continue;
        compared += 1;
        if (row.status === "FORMULA_MISMATCH" || row.status === "UNRESOLVED") {
          failures.push(`${c.id} ${label} excel=${excel} system=${system}`);
        }
      }
    }

    expect(failures).toEqual([]);
    expect(compared).toBeGreaterThan(500);
  });

  it("stores the variant provenance so the result can be audited later", async () => {
    const b019 = CASES.find((c) => c.net_profit_formula_id === "F019B");
    const c005 = CASES.find((c) => c.sale_variant === "F005B");
    const a008 = CASES.find((c) => c.ppn_input_formula_id === "F008A");
    expect(b019 && c005 && a008).toBeTruthy();

    for (const c of [b019!, c005!, a008!]) {
      const { db, result } = await commitExcelCase(c);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const detail = await getScenarioDetail(db, PROC, UUIDS.projectA, result.data.scenario_id);
      expect(detail.ok).toBe(true);
      if (!detail.ok) continue;

      expect(detail.data.scenario.template_id).toBeTruthy();
      expect(detail.data.input).not.toBeNull();
      const fields = new Set(detail.data.inputs.map((i) => i.field_key));
      expect(fields.has("volume")).toBe(true);
      expect(fields.has("sale_ppn_rate")).toBe(true);
      expect(fields.has("ppn_input_rate")).toBe(true);
      expect(fields.has("template_id")).toBe(true);

      // Excel's own cached value in the workbook must round-trip.
      const { status } = compareNumber(c.excel.net_profit, Number(result.data.result.net_profit));
      expect(["VALID", "PRECISION_VARIANCE"], c.id).toContain(status);
    }
  });
});
