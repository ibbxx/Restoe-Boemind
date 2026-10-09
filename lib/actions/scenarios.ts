"use server";

import { redirect } from "next/navigation";

import { actionContext, isContextError } from "./context";
import { formId, formNumber, formOptionalText, formRate, formText } from "./form";
import { commitScenario, renameScenario } from "../services/scenarios";
import type { ScenarioType } from "../types/domain";
import { toActionResultError, type ActionResult } from "../services/result";
import { revalidateProject } from "../revalidation";

export interface ScenarioFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  warnings?: string[];
}

const SCENARIO_TYPE_VALUES: ScenarioType[] = [
  "STANDARD",
  "CASH",
  "TEMPO",
  "INTERNAL_FIX",
  "KROS_CEK",
  "REAL_COST",
  "KOMBINASI",
  "BAGI_HASIL",
  "OPSI_VOLUME",
];

function readScenarioType(value: string): ScenarioType {
  return SCENARIO_TYPE_VALUES.includes(value as ScenarioType)
    ? (value as ScenarioType)
    : "STANDARD";
}

/**
 * Creates a NEW scenario (V(n+1)). It never updates an existing one: the
 * database locks the parent and refuses writes to locked scenarios.
 */
export async function commitScenarioAction(
  _prev: ScenarioFormState | null,
  formData: FormData,
): Promise<ScenarioFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const projectId = formText(formData, "project_id");

  // Per-cost-item rate overrides, posted as `cost_description_<n>` +
  // `cost_rate_<n>` pairs so the table stays dynamic.
  const costRateOverrides: Array<{ description: string; rate: number | null }> = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("cost_description_")) continue;
    const suffix = key.slice("cost_description_".length);
    const description = String(raw);
    const rate = formNumber(formData, `cost_rate_${suffix}`);
    costRateOverrides.push({ description, rate });
  }

  const result = await commitScenario(ctx.db, ctx.actor, projectId, {
    name: formText(formData, "name"),
    scenario_type: readScenarioType(formText(formData, "scenario_type")),
    reason: formText(formData, "reason"),
    template_id: formId(formData, "template_id"),
    source_scenario_id: formId(formData, "source_scenario_id"),
    input: {
      volume: formNumber(formData, "volume"),
      harga_jual_include: formNumber(formData, "harga_jual_include"),
      include_divisor: formNumber(formData, "include_divisor"),
      ppn_rate: formRate(formData, "ppn_rate", 0.11),
      pbbkb_rate: formRate(formData, "pbbkb_rate", 0),
      // Optional: the sale and cost side may use different rates (Excel has
      // genuine 0% "Non-PPN" blocks). Absent fields fall back to ppn_rate.
      sale_ppn_rate: formRate(formData, "sale_ppn_rate", null),
      ppn_input_rate: formRate(formData, "ppn_input_rate", null),
      pph_inu_rate: formRate(formData, "pph_inu_rate", null),
      bph_migas_rate: formRate(formData, "bph_migas_rate", null),
      harga_keekonomian: formNumber(formData, "harga_keekonomian"),
      sale_dpp_variant: formText(formData, "sale_dpp_variant") === "F005B" ? "F005B" : undefined,
      net_profit_formula_id:
        formText(formData, "net_profit_formula_id") === "F019B" ? "F019B" : undefined,
      ppn_input_formula_id:
        formText(formData, "ppn_input_formula_id") === "F008A"
          ? "F008A"
          : formText(formData, "ppn_input_formula_id") === "F008C"
            ? "F008C"
            : undefined,
      harga_jual_dpp_input: formNumber(formData, "harga_jual_dpp_input"),
      harga_jual_setelah_pajak_input: formNumber(formData, "harga_jual_setelah_pajak_input"),
    },
    cost_rate_overrides: costRateOverrides.filter((o) => o.description !== ""),
  });

  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }

  revalidateProject(projectId, { scenarios: true, commercial: true, reports: true, dashboard: true });
  redirect(`/projects/${projectId}/scenarios`);
}

export async function renameScenarioAction(
  _prev: ScenarioFormState | null,
  formData: FormData,
): Promise<ScenarioFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const projectId = formText(formData, "project_id");
  const scenarioId = formText(formData, "scenario_id");
  const result = await renameScenario(ctx.db, ctx.actor, projectId, scenarioId, formText(formData, "name"));
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }
  revalidateProject(projectId, { scenarios: true, history: true });
  return { ok: true, ...(result.warnings ? { warnings: result.warnings } : {}) };
}

/**
 * Deleting a scenario is ADMIN-only in the database and destroys history, so it
 * is exposed behind an explicit confirmation dialog.
 */
export async function deleteScenarioAction(
  projectId: string,
  scenarioId: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;

  if (ctx.actor.role !== "ADMIN") {
    return {
      ok: false,
      error: "Hanya ADMIN yang boleh menghapus scenario (RLS: price_scenarios_delete).",
      errorCode: "FORBIDDEN",
    };
  }

  try {
    await ctx.db.remove("price_scenarios", scenarioId);
    revalidateProject(projectId, { scenarios: true, commercial: true, reports: true, history: true });
    return { ok: true, data: { id: scenarioId } };
  } catch (e) {
    return toActionResultError(e, "price_scenarios");
  }
}
