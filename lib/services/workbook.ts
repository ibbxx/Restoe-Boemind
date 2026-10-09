import type { Actor } from "../auth/session";
import { evaluateExpression, type Scope } from "../calculations/expression";
import type { Database } from "../data/db";
import type { WorkbookFormulaEntry, WorkbookGridCellRole } from "../types/sheets";
import type { WorkbookCellMeta } from "../types/workbook";
import { normalizeWorkbookFormula, translateWorkbookFormula } from "../workbook/layout";
import { workbookStyleKey } from "../workbook/document";
import { updateAhsInputCell, updateCostItemCell } from "./ahs";
import { ok, type ActionResult } from "./result";
import { setWorkbookFormula, setWorkbookGridCell } from "./sheets";
import { updateVendorPriceCell } from "./vendors";
import { loadProjectWorkspace, type ProjectWorkspaceView } from "./workspace";

function formulaScope(view: ProjectWorkspaceView): Scope {
  const scope: Scope = {};
  for (const cell of view.workbook.cells) {
    scope[cell.alias] = cell.value;
    if (cell.displayAlias) scope[cell.displayAlias] = cell.value;
  }
  for (const variable of view.sheetVariables) scope[variable.name] = variable.value;
  return scope;
}

function validateCycles(view: ProjectWorkspaceView, targetKey: string, entry: WorkbookFormulaEntry): string | null {
  const formulas = new Map(view.workbook.cells.flatMap((cell) => cell.formulaExpression
    ? [[cell.key, cell.formulaDependencies ?? []] as const] : []));
  formulas.set(targetKey, entry.dependencies);
  const formulaTargets = new Set(formulas.keys());
  const dependencyKeys = (alias: string): string[] => {
    const cell = view.workbook.byAlias[alias];
    if (!cell) return [];
    const direct = formulaTargets.has(cell.key) ? [cell.key] : [];
    if (cell.key.startsWith("vendor:") && cell.kind === "engine" && cell.vendorId) {
      return [...direct, ...view.workbook.cells
        .filter((candidate) => candidate.vendorId === cell.vendorId && formulaTargets.has(candidate.key))
        .map((candidate) => candidate.key)];
    }
    if (cell.key.startsWith("ahs:result:")) {
      return [...direct, ...view.workbook.cells
        .filter((candidate) => (candidate.key.startsWith("ahs:input:") || candidate.key.startsWith("cost:")) && formulaTargets.has(candidate.key))
        .map((candidate) => candidate.key)];
    }
    if (cell.kind === "engine" && cell.itemId) {
      return [...direct, ...view.workbook.cells
        .filter((candidate) => candidate.itemId === cell.itemId && formulaTargets.has(candidate.key))
        .map((candidate) => candidate.key)];
    }
    return direct;
  };
  const dependencies = new Map<string, string[]>();
  for (const [key, refs] of formulas) {
    dependencies.set(key, [...new Set(refs.flatMap(dependencyKeys))]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (key: string): string | null => {
    if (visiting.has(key)) {
      const cycle = [...path.slice(path.indexOf(key)), key]
        .map((item) => view.workbook.byKey[item]?.address ?? item).join(" -> ");
      return `Circular dependency terdeteksi: ${cycle}`;
    }
    if (visited.has(key)) return null;
    visiting.add(key); path.push(key);
    for (const dependency of dependencies.get(key) ?? []) {
      const error = visit(dependency); if (error) return error;
    }
    path.pop(); visiting.delete(key); visited.add(key);
    return null;
  };
  return visit(targetKey);
}

async function applyNumericCell(
  db: Database, actor: Actor, projectId: string, cell: WorkbookCellMeta, raw: string,
): Promise<ActionResult<unknown>> {
  if (cell.kind === "vendor" && cell.vendorId && cell.field) {
    return updateVendorPriceCell(db, actor, projectId, cell.vendorId, cell.field, raw);
  }
  if (cell.kind === "ahs" && cell.field) {
    return updateAhsInputCell(db, actor, projectId, cell.field, raw);
  }
  if (cell.kind === "cost" && cell.itemId && cell.field) {
    return updateCostItemCell(db, actor, projectId, cell.itemId, cell.field, raw);
  }
  return { ok: false, error: `Cell ${cell.address} tidak dapat diedit.`, errorCode: "INVALID_INPUT" };
}

async function recalculateWorkbookFormulas(db: Database, actor: Actor, projectId: string): Promise<string[]> {
  const warnings: string[] = [];
  let loaded = await loadProjectWorkspace(db, actor, projectId);
  if (!loaded.ok) return [loaded.error];
  let view = loaded.data;
  const formulaCount = view.workbook.cells.filter((cell) => cell.formulaExpression).length;
  if (formulaCount === 0) return warnings;

  const maxPasses = formulaCount * 2 + 2;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    const formulaCells = view.workbook.cells.filter((cell) => cell.formulaExpression);
    for (const formulaCell of formulaCells) {
      try {
        const value = evaluateExpression(formulaCell.formulaExpression as string, formulaScope(view));
        if (!Number.isFinite(value)) throw new Error("hasil bukan angka valid");
        if (formulaCell.value !== null && Math.abs(formulaCell.value - value) <= 1e-9) continue;
        let updated: ActionResult<unknown>;
        if (formulaCell.kind === "free" || formulaCell.kind === "label" || formulaCell.overridden) {
          const match = /^([A-Z]+)(\d+)$/.exec(formulaCell.address);
          let columnIndex = 0;
          if (!match) throw new Error("alamat formula tidak valid");
          for (const char of match[1]!) columnIndex = columnIndex * 26 + char.charCodeAt(0) - 64;
          const row = view.workbookDoc.rows[Number(match[2]) - 1];
          const column = view.workbookDoc.columns[columnIndex - 1];
          if (!row || !column) throw new Error("koordinat formula tidak ditemukan");
          const key = workbookStyleKey(row.id, column.id);
          const record = view.workbookDoc.cells[key];
          if (!record) throw new Error("dokumen formula tidak ditemukan");
          updated = await setWorkbookGridCell(db, actor, projectId, {
            rowId: row.id,
            columnId: column.id,
            cell: { ...record, computedValue: value },
          });
        } else {
          updated = await applyNumericCell(db, actor, projectId, formulaCell, String(value));
        }
        if (!updated.ok) {
          warnings.push(`${formulaCell.address}: ${updated.error}`);
          continue;
        }
        changed = true;
        loaded = await loadProjectWorkspace(db, actor, projectId);
        if (!loaded.ok) return [...warnings, loaded.error];
        view = loaded.data;
      } catch (error) {
        warnings.push(`${formulaCell.address}: ${error instanceof Error ? error.message : "formula gagal"}`);
      }
    }
    if (!changed) return [...new Set(warnings)];
  }
  return [...new Set([...warnings, "Perhitungan formula belum mencapai nilai stabil."])];
}

/** Commit tunggal untuk input numerik pada kanvas Vendor + Proyeksi. */
export async function setWorkbookCell(
  db: Database, actor: Actor, projectId: string, cellKey: string, raw: string,
): Promise<ActionResult<{ value: number | null }>> {
  const loaded = await loadProjectWorkspace(db, actor, projectId);
  if (!loaded.ok) return loaded;
  const cell = loaded.data.workbook.byKey[cellKey];
  if (!cell || !cell.editable) {
    return { ok: false, error: "Cell ini merupakan label atau output Calculation Engine.", errorCode: "INVALID_INPUT" };
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("=")) {
    const updated = await applyNumericCell(db, actor, projectId, cell, trimmed);
    if (!updated.ok) return updated;
    const removed = await setWorkbookFormula(db, actor, projectId, cellKey, null);
    if (!removed.ok) return removed;
    const warnings = await recalculateWorkbookFormulas(db, actor, projectId);
    return ok(
      { value: trimmed === "" ? null : Number(trimmed.replaceAll(".", "").replace(",", ".")) },
      warnings.length ? warnings : undefined,
    );
  }

  try {
    const normalized = `=${normalizeWorkbookFormula(trimmed.slice(1))}`;
    const translated = translateWorkbookFormula(normalized, loaded.data.workbook);
    const entry: WorkbookFormulaEntry = { raw: normalized, ...translated };
    const cycle = validateCycles(loaded.data, cellKey, entry);
    if (cycle) return { ok: false, error: cycle, errorCode: "INVALID_INPUT" };
    const value = evaluateExpression(entry.expression, formulaScope(loaded.data));
    if (!Number.isFinite(value)) throw new Error("Hasil formula bukan angka yang valid.");
    const updated = await applyNumericCell(db, actor, projectId, cell, String(value));
    if (!updated.ok) return updated;
    const saved = await setWorkbookFormula(db, actor, projectId, cellKey, entry);
    if (!saved.ok) return saved;
    const warnings = await recalculateWorkbookFormulas(db, actor, projectId);
    return ok({ value }, warnings.length ? warnings : undefined);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Formula tidak valid.", errorCode: "INVALID_INPUT" };
  }
}

export async function setWorkbookGridValue(
  db: Database, actor: Actor, projectId: string,
  input: { cellKey: string; rowId: string; columnId: string; role: WorkbookGridCellRole; raw: string },
): Promise<ActionResult<{ value: number | null }>> {
  const loaded = await loadProjectWorkspace(db, actor, projectId);
  if (!loaded.ok) return loaded;
  const target = loaded.data.workbook.byKey[input.cellKey];
  if (!target) return { ok: false, error: "Cell workbook tidak ditemukan.", errorCode: "INVALID_INPUT" };
  const trimmed = input.raw.trim();
  try {
    let expression: string | null = null;
    let dependencies: string[] = [];
    let computedValue: number | null = null;
    if (trimmed.startsWith("=")) {
      const translated = translateWorkbookFormula(trimmed, loaded.data.workbook);
      expression = translated.expression; dependencies = translated.dependencies;
      const cycle = validateCycles(loaded.data, input.cellKey, { raw: trimmed, expression, dependencies });
      if (cycle) return { ok: false, error: cycle, errorCode: "INVALID_INPUT" };
      computedValue = evaluateExpression(expression, formulaScope(loaded.data));
      if (!Number.isFinite(computedValue)) throw new Error("Hasil formula bukan angka yang valid.");
    } else if (trimmed !== "") {
      const numeric = Number(trimmed.replaceAll(".", "").replace(",", "."));
      computedValue = Number.isFinite(numeric) ? numeric : null;
    }
    const result = await setWorkbookGridCell(db, actor, projectId, {
      rowId: input.rowId, columnId: input.columnId,
      cell: {
        role: input.role,
        raw: input.role === "engine-output" ? null : trimmed,
        ...(input.role === "engine-output" ? { overrideRaw: trimmed, bindingKey: target.key } : {}),
        expression,
        dependencies,
        computedValue,
      },
    });
    if (!result.ok) return result;
    const warnings = await recalculateWorkbookFormulas(db, actor, projectId);
    return ok({ value: computedValue }, warnings.length ? warnings : undefined);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Formula tidak valid.", errorCode: "INVALID_INPUT" };
  }
}
