/**
 * Scenario service (PRD §30–§33, Phase 3 §15–§16).
 *
 * RULES ENFORCED HERE + IN THE DATABASE:
 *   - a new scenario NEVER overwrites an older one (V1 -> V2 -> V3);
 *   - creating V2 locks V1 (trg_lock_parent_scenario) and locked scenarios are
 *     read-only (trg_scenario_immutable + trg_inputs_frozen);
 *   - `calculation_results` has no UPDATE policy at all, so a stored result can
 *     never be modified in place — only a NEW scenario can hold new numbers.
 *
 * Comparison is performed by the CALCULATION ENGINE's own `compareScenario()`
 * (lib/calculations/scenario.ts) so the UI cannot drift from the tested logic.
 */

import type { Actor } from "../auth/session";
import { calculateAhs } from "../calculations/ahs";
import { compareScenario, metricValue } from "../calculations/scenario";
import type {
  AhsInput,
  AhsResult,
  CompareMetric,
  ScenarioComparisonRow,
  ScenarioSnapshot,
} from "../calculations/types";
import { eq, type Database } from "../data/db";
import { toNumber } from "../format";
import type {
  Ahs,
  AhsCostItem,
  CalculationResult,
  PriceScenario,
  ScenarioInput,
  ScenarioType,
} from "../types/domain";
import { isActionErr, loadProjectContext } from "./access";
import {
  buildAhsInput,
  DEFAULT_TEMPLATE_ID,
  loadCostItems,
  toInputsView,
  validateAhsInputs,
  type AhsInputsView,
  type CostItemView,
} from "./ahs";
import { buildImpact, recordHistory, type HistoryImpact } from "./history";
import { err, forbidden, notFound, ok, toActionResultError, type ActionResult } from "./result";

export const SCENARIO_NUMERIC_FIELDS = [
  "volume",
  "harga_jual_include",
  "include_divisor",
  "harga_jual_dpp_input",
  "harga_jual_setelah_pajak_input",
  "ppn_rate",
  "sale_ppn_rate",
  "ppn_input_rate",
  "pbbkb_rate",
  "pph_inu_rate",
  "bph_migas_rate",
  "base_price",
  "vendor_price",
  "customer_price",
] as const;

export const SCENARIO_TEXT_FIELDS = [
  "template_id",
  "sale_dpp_variant",
  "net_profit_formula_id",
  "ppn_input_formula_id",
  "pbbkb_difference_applicable",
  "vendor_name",
  "notes",
] as const;

export interface ScenarioView {
  scenario: PriceScenario;
  parent_name: string | null;
  result: CalculationResult | null;
  vendor_price: number | null;
  customer_price: number | null;
  volume: number | null;
  net_profit: number | null;
  net_profit_per_liter: number | null;
  profit_percentage: number | null;
  /** A stored calculation result exists for this scenario. */
  has_result: boolean;
}

export async function listScenarios(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<ScenarioView[]>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;

    const { rows } = await db.select<PriceScenario>("price_scenarios", {
      where: [eq("project_id", projectId)],
      order: [{ column: "created_at", ascending: true }],
    });
    if (rows.length === 0) return ok([]);

    const ids = rows.map((r) => r.id);
    const [inputs, results] = await Promise.all([
      db.select<ScenarioInput>("scenario_inputs", {
        where: [{ column: "scenario_id", op: "in", value: ids }],
      }),
      db.select<CalculationResult>("calculation_results", {
        where: [{ column: "scenario_id", op: "in", value: ids }],
      }),
    ]);

    const inputsByScenario = new Map<string, ScenarioInput[]>();
    for (const input of inputs.rows) {
      const list = inputsByScenario.get(input.scenario_id) ?? [];
      list.push(input);
      inputsByScenario.set(input.scenario_id, list);
    }

    const resultByScenario = new Map(results.rows.map((r) => [r.scenario_id, r]));
    const nameById = new Map(rows.map((r) => [r.id, r.name]));

    const views: ScenarioView[] = rows.map((scenario) => {
      const scenarioInputs = inputsByScenario.get(scenario.id) ?? [];
      const findNum = (key: string) =>
        toNumber(scenarioInputs.find((i) => i.field_key === key)?.value_num);
      const result = resultByScenario.get(scenario.id) ?? null;

      return {
        scenario,
        parent_name: scenario.parent_scenario_id
          ? nameById.get(scenario.parent_scenario_id) ?? null
          : null,
        result,
        vendor_price: findNum("vendor_price") ?? findNum("base_price"),
        customer_price: findNum("customer_price") ?? findNum("harga_jual_include"),
        volume: findNum("volume"),
        net_profit: toNumber(result?.net_profit),
        net_profit_per_liter: toNumber(result?.net_profit_per_liter),
        profit_percentage: toNumber(result?.profit_percentage),
        has_result: result !== null,
      };
    });

    return ok(views);
  } catch (e) {
    return toActionResultError(e, "price_scenarios");
  }
}

export interface ScenarioDetail {
  scenario: PriceScenario;
  inputs: ScenarioInput[];
  result: CalculationResult | null;
  costItems: CostItemView[];
  input: AhsInput | null;
  /** True when the engine reproduces the stored result from the snapshot. */
  reproduced: boolean;
  /** Metrics from the stored result (null = not available, shown as "-"). */
  metrics: Record<string, number | null>;
}

export async function getScenarioDetail(
  db: Database,
  actor: Actor,
  projectId: string,
  scenarioId: string,
): Promise<ActionResult<ScenarioDetail>> {
  try {
    const ctx = await loadProjectContext(db, actor, projectId);
    if (isActionErr(ctx)) return ctx;

    const { rows } = await db.select<PriceScenario>("price_scenarios", {
      where: [eq("id", scenarioId)],
      limit: 1,
    });
    const scenario = rows[0];
    if (!scenario || scenario.project_id !== projectId) return notFound("Scenario");

    const [inputs, results, ahsRows] = await Promise.all([
      db.select<ScenarioInput>("scenario_inputs", { where: [eq("scenario_id", scenarioId)] }),
      db.select<CalculationResult>("calculation_results", {
        where: [eq("scenario_id", scenarioId)],
        limit: 1,
      }),
      db.select<Ahs>("ahs", { where: [eq("project_id", projectId)], limit: 1 }),
    ]);

    const ahs = ahsRows.rows[0] ?? null;
    const costItems = ahs ? await loadCostItems(db, ahs.id, scenarioId) : [];

    const input = ahs ? buildScenarioInput(scenario, inputs.rows, costItems, toInputsView(ahs)) : null;
    let reproduced = false;
    if (input) {
      const recomputed = calculateAhs(input);
      reproduced = recomputed.success === true;
    }

    const result = results.rows[0] ?? null;
    return ok({
      scenario,
      inputs: inputs.rows,
      result,
      costItems,
      input,
      reproduced,
      metrics: {
        revenue: toNumber(result?.revenue),
        total_cost: toNumber(result?.total_cost),
        gross_profit: toNumber(result?.gross_profit),
        ppn_difference: toNumber(result?.ppn_difference),
        net_profit: toNumber(result?.net_profit),
        net_profit_per_liter: toNumber(result?.net_profit_per_liter),
        profit_percentage: toNumber(result?.profit_percentage),
      },
    });
  } catch (e) {
    return toActionResultError(e, "price_scenarios");
  }
}

/** Rebuild the engine input of a STORED scenario from its own snapshot. */
export function buildScenarioInput(
  scenario: Pick<PriceScenario, "template_id">,
  inputs: ScenarioInput[],
  costItems: CostItemView[],
  fallbackInputs: ReturnType<typeof toInputsView>,
): AhsInput {
  const num = (key: string, fallback: number | null): number | null => {
    const row = inputs.find((i) => i.field_key === key);
    if (!row) return fallback;
    const value = toNumber(row.value_num);
    return value ?? fallback;
  };
  const text = (key: string): string | null => {
    const row = inputs.find((i) => i.field_key === key);
    return row?.value_text ?? null;
  };

  const base: AhsInputsView = {
    volume: num("volume", fallbackInputs.volume),
    harga_jual_include: num("harga_jual_include", fallbackInputs.harga_jual_include),
    include_divisor: num("include_divisor", fallbackInputs.include_divisor ?? 1.11),
    ppn_rate: num("ppn_rate", fallbackInputs.ppn_rate ?? 0.11),
    pbbkb_rate: num("pbbkb_rate", fallbackInputs.pbbkb_rate ?? 0),
    pph_inu_rate: num("pph_inu_rate", fallbackInputs.pph_inu_rate ?? 0),
    bph_migas_rate: num("bph_migas_rate", fallbackInputs.bph_migas_rate ?? 0),
    harga_keekonomian: num("harga_keekonomian", fallbackInputs.harga_keekonomian),
    marketing: fallbackInputs.marketing,
    payment_term: fallbackInputs.payment_term,
    document_scheme: fallbackInputs.document_scheme,
    analysis_date: fallbackInputs.analysis_date,
    notes: fallbackInputs.notes,
  };

  const templateId = text("template_id") ?? scenario.template_id ?? DEFAULT_TEMPLATE_ID;

  return buildAhsInput({
    inputs: base,
    costItems,
    templateId,
    overrides: {
      harga_jual_dpp_input: num("harga_jual_dpp_input", null),
      harga_jual_setelah_pajak_input: num("harga_jual_setelah_pajak_input", null),
      sale_dpp_variant: (text("sale_dpp_variant") as AhsInput["sale_dpp_variant"]) ?? undefined,
      net_profit_formula_id: (text("net_profit_formula_id") as AhsInput["net_profit_formula_id"]) ?? undefined,
      ppn_input_formula_id: (text("ppn_input_formula_id") as AhsInput["ppn_input_formula_id"]) ?? undefined,
      base_price: num("vendor_price", num("base_price", null)),
      sale_ppn_rate: num("sale_ppn_rate", base.ppn_rate ?? 0.11) ?? 0.11,
      ppn_input_rate: num("ppn_input_rate", base.ppn_rate ?? 0.11) ?? 0.11,
      pph_inu_rate: num("pph_inu_rate", base.pph_inu_rate ?? 0) ?? 0,
      bph_migas_rate: num("bph_migas_rate", base.bph_migas_rate ?? 0) ?? 0,
      // Only present when the block recorded it (a missing key must stay absent
      // so the engine keeps its own default instead of receiving `undefined`).
      ...(text("pbbkb_difference_applicable") === null
        ? {}
        : { pbbkb_difference_applicable: text("pbbkb_difference_applicable") !== "false" }),
    },
  });
}

// ---------------------------------------------------------------- create / clone

export interface ScenarioFormValue {
  name: string;
  scenario_type: ScenarioType;
  reason: string;
  template_id?: string | null;
  /** Input overrides relative to the source (or the project's AHS working set). */
  input: Partial<{
    volume: number | null;
    harga_jual_include: number | null;
    include_divisor: number | null;
    ppn_rate: number | null;
    pbbkb_rate: number | null;
    sale_dpp_variant: AhsInput["sale_dpp_variant"];
    net_profit_formula_id: AhsInput["net_profit_formula_id"];
    ppn_input_formula_id: AhsInput["ppn_input_formula_id"];
    harga_jual_dpp_input: number | null;
    harga_jual_setelah_pajak_input: number | null;
    /** Sale-side vs cost-side PPN can differ in Excel (e.g. 0% "Non-PPN"). */
    sale_ppn_rate: number | null;
    ppn_input_rate: number | null;
    pph_inu_rate: number | null;
    bph_migas_rate: number | null;
    harga_keekonomian: number | null;
    /** F019B blocks whose SELISIH PBBKB cell is empty in Excel. */
    pbbkb_difference_applicable: boolean;
    /** Explicit vendor price override (otherwise the HPP 'Harga Dasar' line is used). */
    base_price: number | null;
  }>;
  /** Source scenario to clone from. When null, the project's AHS is the source. */
  source_scenario_id?: string | null;
  /** Per-cost-item rate overrides keyed by description (vendor revision etc.). */
  cost_rate_overrides?: Array<{ description: string; rate: number | null }>;
}

export interface CommitScenarioResult {
  scenario_id: string;
  name: string;
  parent_scenario_id: string | null;
  result: CalculationResult;
  warnings: string[];
}

export async function nextScenarioName(db: Database, projectId: string): Promise<string> {
  const { count } = await db.select("price_scenarios", {
    where: [eq("project_id", projectId)],
    count: true,
  });
  return `V${count + 1}`;
}

export async function commitScenario(
  db: Database,
  actor: Actor,
  projectId: string,
  form: ScenarioFormValue,
): Promise<ActionResult<CommitScenarioResult>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("membuat scenario (akses read-only)");

  try {
    const { rows: ahsRows } = await db.select<Ahs>("ahs", {
      where: [eq("project_id", projectId)],
      order: [{ column: "created_at", ascending: true }],
      limit: 1,
    });
    const ahs = ahsRows[0];
    if (!ahs) {
      return err("AHS belum dibuat untuk project ini — isi AHS terlebih dahulu.", {
        errorCode: "NOT_FOUND",
      });
    }

    const templateId = form.template_id ?? ahs.template_id ?? DEFAULT_TEMPLATE_ID;
    const projectInputs = toInputsView(ahs);

    // ---- source snapshot ------------------------------------------------
    let sourceCostItems: CostItemView[] = await loadCostItems(db, ahs.id, null);
    let sourceInputs: AhsInputsView = projectInputs;
    let base: AhsInput = buildAhsInput({
      inputs: projectInputs,
      costItems: sourceCostItems,
      templateId,
    });
    let parentScenarioId: string | null = null;
    let parentMetrics: Record<string, number | null> = {};

    const latest = await db.select<PriceScenario>("price_scenarios", {
      where: [eq("project_id", projectId)],
      order: [{ column: "created_at", ascending: false }],
      limit: 1,
    });
    const latestScenario = latest.rows[0] ?? null;

    const sourceScenarioId = form.source_scenario_id ?? latestScenario?.id ?? null;
    if (sourceScenarioId) {
      const sourceDetail = await getScenarioDetail(db, actor, projectId, sourceScenarioId);
      if (!sourceDetail.ok) return sourceDetail;
      const detail = sourceDetail.data;
      if (detail.input) {
        base = detail.input;
        parentScenarioId = detail.scenario.id;
        parentMetrics = { ...detail.metrics };
      }
      if (detail.costItems.length > 0) {
        sourceCostItems = detail.costItems.map((c) => ({ ...c }));
      }
      sourceInputs = {
        volume: detail.input?.volume ?? projectInputs.volume,
        harga_jual_include: detail.input?.harga_jual_include ?? projectInputs.harga_jual_include,
        include_divisor: detail.input?.include_divisor ?? projectInputs.include_divisor,
        ppn_rate: detail.input?.ppn_rate ?? projectInputs.ppn_rate,
        pbbkb_rate: detail.input?.pbbkb_rate ?? projectInputs.pbbkb_rate,
        pph_inu_rate: projectInputs.pph_inu_rate,
        bph_migas_rate: projectInputs.bph_migas_rate,
        harga_keekonomian: projectInputs.harga_keekonomian,
        marketing: projectInputs.marketing,
        payment_term: projectInputs.payment_term,
        document_scheme: projectInputs.document_scheme,
        analysis_date: projectInputs.analysis_date,
        notes: projectInputs.notes,
      };
    }

    if (sourceCostItems.length === 0) {
      return err(
        "Belum ada cost item — Total Cost membutuhkan minimal 1 baris (engine menolak cost_lines kosong).",
        { errorCode: "MISSING_COST_LINES", fieldErrors: { cost_lines: "Belum ada cost item." } },
      );
    }

    // ---- apply overrides -----------------------------------------------
    const merged_ppn_rate = form.input.ppn_rate ?? base.ppn_rate ?? 0.11;
    const merged: AhsInput = {
      ...base,
      volume: form.input.volume ?? base.volume,
      harga_jual_include: form.input.harga_jual_include ?? base.harga_jual_include,
      include_divisor: form.input.include_divisor ?? base.include_divisor ?? 1.11,
      ppn_rate: form.input.ppn_rate ?? base.ppn_rate ?? 0.11,
      pbbkb_rate: form.input.pbbkb_rate ?? base.pbbkb_rate ?? 0,
      ...(form.input.sale_dpp_variant !== undefined ? { sale_dpp_variant: form.input.sale_dpp_variant } : {}),
      ...(form.input.net_profit_formula_id !== undefined
        ? { net_profit_formula_id: form.input.net_profit_formula_id }
        : {}),
      ...(form.input.harga_jual_dpp_input !== undefined
        ? { harga_jual_dpp_input: form.input.harga_jual_dpp_input }
        : {}),
      ...(form.input.harga_jual_setelah_pajak_input !== undefined
        ? { harga_jual_setelah_pajak_input: form.input.harga_jual_setelah_pajak_input }
        : {}),
      ...(form.input.ppn_input_formula_id !== undefined
        ? { ppn_input_formula_id: form.input.ppn_input_formula_id }
        : {}),
      // Sale-side and cost-side PPN are separate INPUTS (a genuine 0% block exists).
      sale_ppn_rate: form.input.sale_ppn_rate ?? base.sale_ppn_rate ?? merged_ppn_rate,
      ppn_input_rate: form.input.ppn_input_rate ?? base.ppn_input_rate ?? merged_ppn_rate,
      pph_inu_rate: form.input.pph_inu_rate ?? base.pph_inu_rate ?? 0,
      bph_migas_rate: form.input.bph_migas_rate ?? base.bph_migas_rate ?? 0,
      harga_keekonomian: form.input.harga_keekonomian ?? base.harga_keekonomian ?? null,
      ...(form.input.pbbkb_difference_applicable !== undefined
        ? { pbbkb_difference_applicable: form.input.pbbkb_difference_applicable }
        : {}),
    };

    if (form.cost_rate_overrides && form.cost_rate_overrides.length > 0) {
      const byDescription = new Map(
        form.cost_rate_overrides.map((o) => [o.description.trim().toLowerCase(), o.rate]),
      );
      merged.cost_lines = merged.cost_lines.map((line) => {
        const next = byDescription.get(line.description.trim().toLowerCase());
        return next === undefined ? line : { ...line, rate: next };
      });
    }

    // VENDOR PRICE = the HPP 'Harga Dasar' cost line.
    // This is the mapping's own definition (docs/EXCEL_MAPPING.md §C.1.2 and
    // lib/calculations/tax.ts both use the HPP Harga Dasar rate as the vendor
    // base price); it is NOT a new formula.
    //
    // Precedence (documented so it cannot drift):
    //   1. an explicit form override,
    //   2. the (possibly overridden) HPP 'Harga Dasar' cost line,
    //   3. the price inherited from the source scenario.
    // Rule 2 before 3 matters: without it a vendor revision on the cost line
    // would be ignored because the source already carried a base price.
    const hppLine = merged.cost_lines.find((line) => /harga\s*dasar/i.test(line.description));
    const vendorPrice = form.input.base_price ?? hppLine?.rate ?? merged.base_price ?? null;
    merged.base_price = vendorPrice;

    const validation = validateAhsInputs({
      volume: merged.volume,
      harga_jual_include: merged.harga_jual_include ?? null,
      harga_jual_dpp_input: merged.harga_jual_dpp_input ?? null,
      include_divisor: merged.include_divisor ?? 1.11,
      ppn_rate: merged.ppn_rate ?? 0.11,
      pbbkb_rate: merged.pbbkb_rate ?? 0,
      pph_inu_rate: merged.pph_inu_rate ?? 0,
      bph_migas_rate: merged.bph_migas_rate ?? 0,
      harga_keekonomian: merged.harga_keekonomian ?? null,
    });
    if (Object.keys(validation).length > 0) {
      return err("Periksa kembali input scenario.", {
        fieldErrors: validation,
        errorCode: "INVALID_INPUT",
      });
    }

    const calculated = calculateAhs(merged);
    if (!calculated.success) {
      return {
        ok: false,
        error: calculated.message,
        errorCode: calculated.errorCode,
        ...(calculated.field ? { fieldErrors: { [calculated.field]: calculated.message } } : {}),
      };
    }
    const result: AhsResult = calculated as unknown as AhsResult;

    // ---- persist --------------------------------------------------------
    const name = form.name.trim() !== "" ? form.name.trim() : await nextScenarioName(db, projectId);

    // Pre-check the (project_id, name) uniqueness so the UI gets a field error
    // instead of a raw constraint violation. The database constraint remains
    // the authority (it also protects concurrent writes).
    const duplicate = await db.select<{ id: string }>("price_scenarios", {
      where: [eq("project_id", projectId), eq("name", name)],
      limit: 1,
    });
    if (duplicate.rows.length > 0) {
      return err(`Nama scenario "${name}" sudah dipakai pada project ini.`, {
        fieldErrors: { name: `${name} sudah dipakai.` },
        errorCode: "INVALID_INPUT",
      });
    }

    if (parentScenarioId) {
      await db.update("price_scenarios", parentScenarioId, { is_locked: true });
    }

    const scenario = await db.insert<PriceScenario>("price_scenarios", {
      project_id: projectId,
      parent_scenario_id: parentScenarioId,
      name,
      scenario_type: form.scenario_type,
      template_id: templateId,
      reason: form.reason,
      is_locked: false,
      created_by: actor.id,
    });

    const numericValues: Record<string, number | null> = {
      volume: merged.volume,
      harga_jual_include: merged.harga_jual_include ?? null,
      include_divisor: merged.include_divisor ?? 1.11,
      ppn_rate: merged.ppn_rate ?? 0.11,
      sale_ppn_rate: merged.sale_ppn_rate ?? merged.ppn_rate ?? 0.11,
      ppn_input_rate: merged.ppn_input_rate ?? merged.ppn_rate ?? 0.11,
      pbbkb_rate: merged.pbbkb_rate ?? 0,
      pph_inu_rate: merged.pph_inu_rate ?? 0,
      bph_migas_rate: merged.bph_migas_rate ?? 0,
      harga_keekonomian: merged.harga_keekonomian ?? null,
      harga_jual_dpp_input: merged.harga_jual_dpp_input ?? null,
      harga_jual_setelah_pajak_input: merged.harga_jual_setelah_pajak_input ?? null,
      customer_price: merged.harga_jual_include ?? null,
      vendor_price: vendorPrice,
      base_price: vendorPrice,
    };

    for (const [field_key, value_num] of Object.entries(numericValues)) {
      await db.insert("scenario_inputs", { scenario_id: scenario.id, field_key, value_num, value_text: null });
    }

    const textValues: Record<string, string | null> = {
      template_id: templateId,
      sale_dpp_variant: merged.sale_dpp_variant ?? result.sale_dpp_variant ?? null,
      net_profit_formula_id: merged.net_profit_formula_id ?? null,
      ppn_input_formula_id: merged.ppn_input_formula_id ?? result.formulas_used.ppn_input ?? null,
      pbbkb_difference_applicable:
        merged.pbbkb_difference_applicable === undefined
          ? null
          : String(merged.pbbkb_difference_applicable),
      notes: form.reason,
    };
    for (const [field_key, value_text] of Object.entries(textValues)) {
      if (value_text === null) continue;
      await db.insert("scenario_inputs", { scenario_id: scenario.id, field_key, value_text });
    }

    for (const [index, line] of result.cost_lines.entries()) {
      await db.insert<AhsCostItem>("ahs_cost_items", {
        ahs_id: ahs.id,
        scenario_id: scenario.id,
        line_no: line.line_no ?? index + 1,
        category: line.category || null,
        description: line.description,
        unit: line.unit ?? null,
        rate: line.rate,
        qty: line.qty,
        total: line.total,
        formula_id: "F007",
        is_summed_in_total: true,
      });
    }

    const stored = await db.insert<CalculationResult>("calculation_results", {
      scenario_id: scenario.id,
      template_id: templateId,
      harga_jual_dpp: result.harga_jual_dpp,
      harga_jual_setelah_pajak: result.harga_jual_setelah_pajak,
      revenue: result.revenue,
      total_cost: result.total_cost,
      cost_per_liter: result.cost_per_liter,
      ppn_output: result.ppn_output,
      ppn_input: result.ppn_input,
      ppn_difference: result.ppn_difference,
      gross_profit: result.gross_profit,
      net_profit: result.net_profit,
      net_profit_per_liter: result.net_profit_per_liter,
      profit_percentage: result.profit_percentage,
      formulas_used: result.formulas_used,
      engine_version: "phase2.5",
      is_valid: true,
    });

    // ---- audit ----------------------------------------------------------
    const warnings: string[] = [];
    const after: Record<string, number | null> = {
      revenue: result.revenue,
      total_cost: result.total_cost,
      gross_profit: result.gross_profit,
      ppn_difference: result.ppn_difference,
      net_profit: result.net_profit,
      net_profit_per_liter: result.net_profit_per_liter,
      profit_percentage: result.profit_percentage,
    };
    const impact: HistoryImpact = parentScenarioId
      ? buildImpact(parentMetrics, after)
      : buildImpact({}, after);

    const audited = await recordHistory(db, {
      projectId,
      scenarioId: scenario.id,
      entity: "price_scenarios",
      entityId: scenario.id,
      action: parentScenarioId ? "CLONE" : "INSERT",
      field: "scenario",
      oldValue: parentScenarioId ? sourceInputs.volume ?? null : null,
      newValue: name,
      reason: form.reason || "Scenario dibuat",
      impact,
      changedBy: actor.id,
    });
    if (!audited) warnings.push("History scenario tidak dapat ditulis.");

    return ok(
      {
        scenario_id: scenario.id,
        name,
        parent_scenario_id: parentScenarioId,
        result: stored,
        warnings,
      },
      warnings,
    );
  } catch (e) {
    return toActionResultError(e, "price_scenarios");
  }
}

export async function renameScenario(
  db: Database,
  actor: Actor,
  projectId: string,
  scenarioId: string,
  name: string,
): Promise<ActionResult<PriceScenario>> {
  const ctx = await loadProjectContext(db, actor, projectId);
  if (isActionErr(ctx)) return ctx;
  if (ctx.access === "VIEW") return forbidden("mengubah nama scenario (akses read-only)");

  const trimmed = name.trim();
  if (trimmed === "") {
    return err("Nama scenario wajib diisi.", {
      fieldErrors: { name: "Nama scenario wajib diisi." },
      errorCode: "INVALID_INPUT",
    });
  }

  try {
    const { rows } = await db.select<PriceScenario>("price_scenarios", {
      where: [eq("id", scenarioId)],
      limit: 1,
    });
    const scenario = rows[0];
    if (!scenario || scenario.project_id !== projectId) return notFound("Scenario");
    if (scenario.is_locked) {
      return err(
        `Scenario "${scenario.name}" sudah dikunci karena ada versi berikutnya — read-only (V1 tidak boleh dioverwrite).`,
        { errorCode: "FORBIDDEN" },
      );
    }

    const duplicate = await db.select<{ id: string }>("price_scenarios", {
      where: [eq("project_id", projectId), eq("name", trimmed)],
      limit: 1,
    });
    if (duplicate.rows.length > 0 && duplicate.rows[0]!.id !== scenarioId) {
      return err("Nama scenario sudah dipakai pada project ini.", {
        fieldErrors: { name: "Nama scenario sudah dipakai." },
        errorCode: "INVALID_INPUT",
      });
    }

    const updated = await db.update<PriceScenario>("price_scenarios", scenarioId, { name: trimmed });

    const warnings: string[] = [];
    const audited = await recordHistory(db, {
      projectId,
      scenarioId,
      entity: "price_scenarios",
      entityId: scenarioId,
      action: "UPDATE",
      field: "name",
      oldValue: scenario.name,
      newValue: trimmed,
      reason: "Scenario di-rename",
      changedBy: actor.id,
    });
    if (!audited) warnings.push("History tidak dapat ditulis.");

    return ok(updated, warnings);
  } catch (e) {
    return toActionResultError(e, "price_scenarios");
  }
}

// ---------------------------------------------------------------- comparison

/**
 * Direction table.
 *
 * Recipe: the polarity comes from the ENGINE's own arithmetic, not from a new
 * business rule:
 *   - profit metrics (F017/F019A/F019B/F020/F021A) increase the outcome, so a
 *     rise is favourable;
 *   - `ppn_difference` (F018) is SUBTRACTED from gross profit in F019A/F019B,
 *     so a fall is favourable;
 *   - `total_cost` (F015A) is SUBTRACTED in F017, so a fall is favourable;
 *   - `revenue` (F006) is ADDED in F017, so a rise is favourable;
 *   - `vendor_price` feeds HPP (a cost), `customer_price` feeds revenue;
 *   - `volume` has NO direction implied by any formula (F006 x volume and F020
 *     / volume cancel out), so it is reported as NEUTRAL instead of being
 *     interpreted.
 */
export const METRIC_POLARITY: Record<CompareMetric, "higher" | "lower" | "neutral"> = {
  vendor_price: "lower",
  customer_price: "higher",
  volume: "neutral",
  revenue: "higher",
  total_cost: "lower",
  gross_profit: "higher",
  ppn_difference: "lower",
  net_profit: "higher",
  net_profit_per_liter: "higher",
  profit_percentage: "higher",
};

export type ComparisonIndicator = "IMPROVEMENT" | "DECLINE" | "NO_CHANGE" | "NEUTRAL";

export function indicatorFor(
  metric: CompareMetric,
  difference: number | null,
  tolerance = 1e-9,
): ComparisonIndicator {
  const polarity = METRIC_POLARITY[metric];
  // NEUTRAL doubles as "not interpretable": either the metric has no implied
  // direction, or a value is missing on one side. A missing value must never be
  // rendered as "No Change".
  if (polarity === "neutral" || difference === null) return "NEUTRAL";
  if (Math.abs(difference) <= tolerance) return "NO_CHANGE";
  const improved = polarity === "higher" ? difference > 0 : difference < 0;
  return improved ? "IMPROVEMENT" : "DECLINE";
}

export interface ScenarioComparisonColumn {
  scenario_id: string;
  name: string;
  is_locked: boolean;
  is_baseline: boolean;
}

export interface ScenarioComparisonTableView {
  columns: ScenarioComparisonColumn[];
  rows: Array<
    ScenarioComparisonRow & {
      /** Indicator vs the immediately previous version (V2 vs V1). */
      indicator: ComparisonIndicator;
      /** Indicator across the whole visible range (last vs first). */
      overall_indicator: ComparisonIndicator;
    }
  >;
}

export async function compareScenarios(
  db: Database,
  actor: Actor,
  projectId: string,
  scenarioIds: string[],
): Promise<ActionResult<ScenarioComparisonTableView>> {
  try {
    const snapshots: ScenarioSnapshot[] = [];
    const columns: ScenarioComparisonColumn[] = [];

    for (const [index, scenarioId] of scenarioIds.entries()) {
      const detail = await getScenarioDetail(db, actor, projectId, scenarioId);
      if (!detail.ok) return detail;
      const d = detail.data;
      if (!d.input) {
        return err(
          `Scenario "${d.scenario.name}" tidak dapat direkonstruksi (AHS/cost item tidak ditemukan).`,
          { errorCode: "NOT_FOUND" },
        );
      }
      const calculated = calculateAhs(d.input);
      if (!calculated.success) {
        return {
          ok: false,
          error: `Scenario "${d.scenario.name}" gagal dihitung ulang: ${calculated.message}`,
          errorCode: calculated.errorCode,
        };
      }
      snapshots.push({
        scenario_id: d.scenario.id,
        project_id: projectId,
        parent_scenario_id: d.scenario.parent_scenario_id,
        name: d.scenario.name,
        template_id: d.scenario.template_id,
        input: d.input,
        result: calculated as unknown as AhsResult,
        created_by: d.scenario.created_by ?? "",
        created_at: d.scenario.created_at,
        reason: d.scenario.reason ?? "",
      });
      columns.push({
        scenario_id: d.scenario.id,
        name: d.scenario.name,
        is_locked: d.scenario.is_locked,
        is_baseline: index === 0,
      });
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    if (!first || !last) {
      return ok({ columns: [], rows: [] });
    }

    // Engine-provided metric rows (labels: Vendor Price, Customer Price, ...).
    const baseRows = compareScenario(first, last);

    // Per-version deltas: compare each adjacent pair and collect the indicator.
    const perMetricValues = baseRows.map((row) => {
      const values: Array<number | null> = snapshots.map((snapshot) => metricValue(snapshot, row.metric));
      return { metric: row.metric, values };
    });

    const rows = baseRows.map((row) => {
      const entry = perMetricValues.find((v) => v.metric === row.metric);
      const values = entry?.values ?? [];
      const previous = values.length >= 2 ? values[values.length - 2] : undefined;
      const current = values.length >= 1 ? values[values.length - 1] : undefined;
      // A metric that is missing on either side has NO delta: it must never be
      // reported as "no change" (that would turn "not available" into "equal").
      const adjacentDelta =
        previous !== undefined && previous !== null && current !== undefined && current !== null
          ? current - previous
          : null;
      return {
        ...row,
        indicator: indicatorFor(row.metric, adjacentDelta),
        overall_indicator: indicatorFor(row.metric, row.difference),
      };
    });

    return ok({ columns, rows });
  } catch (e) {
    return toActionResultError(e, "price_scenarios");
  }
}
