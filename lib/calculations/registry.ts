/**
 * Formula Registry & Calculation Template access layer.
 *
 * The registry JSON is the SAME data that is seeded into Supabase
 * (supabase/seed/0001_formula_registry.sql is generated from it), so the
 * engine and the database can never drift apart.
 *
 * Business arithmetic is NOT hardcoded here: it is evaluated from the
 * registry `expression` via lib/calculations/expression.ts.
 */

import registryJson from "../formulas/formula-registry.json";
import templatesJson from "../formulas/calculation-templates.json";
import { CalculationError } from "./errors";
import { evaluateExpression, type Scope } from "./expression";
import type { CalculationTemplate, FormulaDef } from "./types";

export const FORMULA_REGISTRY: FormulaDef[] =
  registryJson.formulas as unknown as FormulaDef[];

export const CALCULATION_TEMPLATES: CalculationTemplate[] =
  templatesJson.templates as unknown as CalculationTemplate[];

const byId = new Map<string, FormulaDef>(
  FORMULA_REGISTRY.map((f) => [f.formula_id, f]),
);

const templateById = new Map<string, CalculationTemplate>(
  CALCULATION_TEMPLATES.map((t) => [t.template_id, t]),
);

export function getFormula(formulaId: string): FormulaDef {
  const f = byId.get(formulaId);
  if (!f) {
    throw new CalculationError(
      "UNKNOWN_FORMULA",
      `Formula "${formulaId}" tidak terdaftar di Formula Registry.`,
      formulaId,
    );
  }
  return f;
}

export function getTemplate(templateId: string): CalculationTemplate {
  const t = templateById.get(templateId);
  if (!t) {
    throw new CalculationError(
      "UNKNOWN_TEMPLATE",
      `Calculation template "${templateId}" tidak dikenal.`,
      templateId,
    );
  }
  return t;
}

/**
 * Resolve and evaluate a registered formula.
 * Formulas marked UNRESOLVED / inactive refuse to run — they are never guessed.
 */
export function resolveFormula(formulaId: string, scope: Scope): number {
  const f = getFormula(formulaId);
  if (!f.active || f.resolution === "UNRESOLVED") {
    throw new CalculationError(
      "UNRESOLVED_FORMULA",
      `Formula "${formulaId}" (${f.formula_name}) → UNRESOLVED_FORMULA ` +
        `(resolution=${f.resolution}, active=${f.active}) — tidak boleh dihitung. ` +
        `Sumber: ${f.source_sheet}!${f.source_cell}.`,
      formulaId,
    );
  }
  return evaluateExpression(f.expression, scope);
}

/** Same as resolveFormula but returns the value together with provenance. */
export function resolveWithProvenance(
  formulaId: string,
  scope: Scope,
): { value: number; formula_id: string; expression: string; source: string } {
  const f = getFormula(formulaId);
  const value = resolveFormula(formulaId, scope);
  return {
    value,
    formula_id: f.formula_id,
    expression: f.expression,
    source: `${f.source_sheet}!${f.source_cell}`,
  };
}

export function listUnresolved(): FormulaDef[] {
  return FORMULA_REGISTRY.filter((f) => f.resolution === "UNRESOLVED");
}
