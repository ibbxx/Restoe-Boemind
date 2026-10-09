/**
 * Project workspace — the single read model behind the Excel-like project
 * screen (Excel blocks EVALUASI HARGA VENDOR + ANALISIS HARGA SATUAN).
 *
 * It only ASSEMBLES repository data and Calculation Engine output:
 *   - project + references       -> lib/services/projects
 *   - vendor columns (dynamic)   -> lib/services/vendors (engine ALL IN / PPN)
 *   - AHS header + inputs + result -> lib/services/ahs (engine F005..F021)
 *
 * No arithmetic happens here and none happens in React: every computed cell is
 * already the engine's own output.
 */

import { canWriteProject, type ProjectAccess } from "../auth/permissions";
import type { Actor } from "../auth/session";
import { eq, type Database } from "../data/db";
import type { ComputedSheet, ProjectSheetRow, SheetVariable, WorkbookGridDoc } from "../types/sheets";
import type { WorkbookLayout } from "../types/workbook";
import { buildWorkbookLayout, workbookAlias, workbookColumnLetter } from "../workbook/layout";
import { ensureWorkbookAxes, workbookStyleKey } from "../workbook/document";
import { buildSheetVariables, computeSheets, defaultSheetsDoc, parseSheetsDoc } from "./sheets";
import { resolveProjectAccess } from "./access";
import {
  getAhsBundle,
  groupCostBreakdown,
  type AhsBundle,
  type CostBreakdownGroup,
} from "./ahs";
import { getProjectDetail, type ProjectDetailView } from "./projects";
import { ok, toActionResultError, type ActionResult } from "./result";
import {
  buildVendorComparison,
  listProjectVendors,
  type ProjectVendorView,
  type VendorComparisonView,
} from "./vendors";

/** Excel header cells of the AHS block that are worth showing in the sheet. */
export interface WorkspaceAhsHeader {
  analysis_date: string | null;
  marketing: string | null;
  payment_term: string | null;
  harga_keekonomian: number | null;
  /** Excel "Sumber (vendor/inu)" — the vendor selected on this project. */
  source_vendor: string | null;
  location: string | null;
  document_scheme: string | null;
  /** F004 engine output (ratio); null when harga keekonomian is empty. */
  diskon: number | null;
  harga_jual_include: number | null;
  volume: number | null;
}

export interface ProjectWorkspaceView {
  project: ProjectDetailView;
  canWrite: boolean;
  /** Dynamic vendor columns, in project order. */
  vendors: ProjectVendorView[];
  comparison: VendorComparisonView | null;
  ahs: AhsBundle;
  /** Engine cost lines grouped by their own category (HPP, PAJAK, ...). */
  costGroups: CostBreakdownGroup[];
  header: WorkspaceAhsHeader;
  /**
   * Tabel dinamis (kolom, baris, formula ditentukan user) dengan nilai yang
   * sudah dihitung server. Hanya nilai INPUT/OUTPUT yang dibawa ke UI —
   * Calculation Engine tidak diubah dan `AhsResult` tetap sumber angka AHS.
   */
  sheets: ComputedSheet[];
  /** Variabel yang boleh dipakai di formula tabel dinamis (read-only). */
  sheetVariables: SheetVariable[];
  /** Satu coordinate system untuk seluruh blok Vendor + Proyeksi. */
  workbook: WorkbookLayout;
  /** Persisted v4 physical axes, merge, wrap, fill and placement metadata. */
  workbookDoc: WorkbookGridDoc;
}

export async function loadProjectWorkspace(
  db: Database,
  actor: Actor,
  projectId: string,
): Promise<ActionResult<ProjectWorkspaceView>> {
  try {
    const [detail, access, entries, comparison, bundle] = await Promise.all([
      getProjectDetail(db, actor, projectId),
      resolveProjectAccess(db, actor, projectId),
      listProjectVendors(db, actor, projectId),
      buildVendorComparison(db, actor, projectId),
      getAhsBundle(db, actor, projectId),
    ]);

    if (!detail.ok) return detail;
    if (!entries.ok) return entries;
    if (!bundle.ok) return bundle;

    const selected = entries.data.find((entry) => entry.link.is_selected) ?? null;
    const inputs = bundle.data.inputs;

    const header: WorkspaceAhsHeader = {
      analysis_date: inputs?.analysis_date ?? null,
      marketing: inputs?.marketing ?? null,
      payment_term: inputs?.payment_term ?? null,
      harga_keekonomian: inputs?.harga_keekonomian ?? null,
      source_vendor: selected?.vendor.name ?? null,
      location: detail.data.project.location ?? null,
      document_scheme: inputs?.document_scheme ?? null,
      diskon: bundle.data.preview?.diskon ?? null,
      harga_jual_include: inputs?.harga_jual_include ?? null,
      volume: inputs?.volume ?? null,
    };

    // Tabel dinamis: dokumen dibaca dari repository, nilainya dihitung service
    // `sheets` (evaluator ekspresi yang sama dengan engine, tanpa mengubah engine).
    const { rows: sheetRows } = await db.select<ProjectSheetRow>("project_sheets", {
      where: [eq("project_id", projectId)],
      limit: 1,
    });
    const sheetDoc = sheetRows[0] ? parseSheetsDoc(sheetRows[0].doc) : defaultSheetsDoc();
    const sheetVariables = buildSheetVariables({
      inputs: bundle.data.inputs,
      result: bundle.data.preview,
      costItems: bundle.data.costItems,
      vendor: selected,
      vendors: entries.data,
    });
    const computedSheets = computeSheets(sheetDoc, sheetVariables);
    const workbook = buildWorkbookLayout({
      vendors: entries.data,
      inputs: bundle.data.inputs,
      result: bundle.data.preview,
      costItems: bundle.data.costItems,
      sheets: computedSheets,
    });
    const workbookDoc = ensureWorkbookAxes(sheetDoc.workbook!, workbook.columnCount, workbook.rowCount);
    const addressIndex = (address: string) => {
      const match = /^([A-Z]+)(\d+)$/.exec(address);
      if (!match) return null;
      let column = 0;
      for (const char of match[1]!) column = column * 26 + char.charCodeAt(0) - 64;
      return { column: column - 1, row: Number(match[2]!) - 1 };
    };
    for (const cell of workbook.cells) {
      if (workbookDoc.placements[cell.key]) continue;
      const index = addressIndex(cell.address);
      if (!index || !workbookDoc.rows[index.row] || !workbookDoc.columns[index.column]) continue;
      workbookDoc.placements[cell.key] = {
        rowId: workbookDoc.rows[index.row]!.id,
        columnId: workbookDoc.columns[index.column]!.id,
      };
    }
    for (const cell of workbook.cells) {
      const formula = sheetDoc.workbookFormulas?.[cell.key];
      cell.formula = formula?.raw ?? null;
      cell.formulaExpression = formula?.expression ?? null;
      cell.formulaDependencies = formula?.dependencies ?? [];
    }
    const businessAt = new Map<string, (typeof workbook.cells)[number]>();
    for (const cell of workbook.cells) {
      const placement = workbookDoc.placements[cell.key];
      if (!placement) continue;
      const coordinateKey = workbookStyleKey(placement.rowId, placement.columnId);
      businessAt.set(coordinateKey, cell);
      const saved = workbookDoc.cells[coordinateKey];
      workbookDoc.cells[coordinateKey] = {
        role: cell.kind === "engine" ? "engine-output" : "business-input",
        raw: saved?.raw ?? null,
        bindingKey: cell.key,
        ...(saved?.overrideRaw ? { overrideRaw: saved.overrideRaw } : {}),
        ...(saved?.expression ? { expression: saved.expression, dependencies: saved.dependencies ?? [] } : {}),
        ...(saved?.computedValue !== undefined ? { computedValue: saved.computedValue } : {}),
      };
      if (saved?.overrideRaw) {
        const numeric = saved.computedValue ?? Number(saved.overrideRaw.replaceAll(".", "").replace(",", "."));
        cell.engineValue = cell.value;
        cell.overridden = true;
        cell.formula = saved.overrideRaw;
        cell.formulaExpression = saved.expression ?? null;
        cell.formulaDependencies = saved.dependencies ?? [];
        if (Number.isFinite(numeric)) cell.value = numeric;
        else if (!saved.overrideRaw.startsWith("=")) cell.text = saved.overrideRaw;
      }
    }
    for (let row = 0; row < workbookDoc.rows.length; row += 1) {
      for (let column = 0; column < workbookDoc.columns.length; column += 1) {
        const rowId = workbookDoc.rows[row]!.id; const columnId = workbookDoc.columns[column]!.id;
        const coordinateKey = workbookStyleKey(rowId, columnId);
        if (businessAt.has(coordinateKey)) continue;
        const saved = workbookDoc.cells[coordinateKey];
        const raw = saved?.raw ?? "";
        const numeric = raw !== "" ? Number(raw.replaceAll(".", "").replace(",", ".")) : Number.NaN;
        const key = `grid:${rowId}:${columnId}`;
        workbook.cells.push({
          key,
          alias: `grid_${workbookAlias(rowId)}_${workbookAlias(columnId)}`,
          address: `${workbookColumnLetter(column)}${row + 1}`,
          label: raw,
          kind: saved?.role === "label" ? "label" : "free",
          editable: true,
          value: saved?.computedValue ?? (Number.isFinite(numeric) ? numeric : null),
          text: Number.isFinite(numeric) ? null : raw,
          formula: raw.startsWith("=") ? raw : null,
          formulaExpression: saved?.expression ?? null,
          formulaDependencies: saved?.dependencies ?? [],
        });
      }
    }
    workbook.byKey = Object.fromEntries(workbook.cells.map((cell) => [cell.key, cell]));
    workbook.byAddress = Object.fromEntries(workbook.cells.map((cell) => [cell.address, cell]));
    workbook.byAlias = Object.fromEntries(workbook.cells.flatMap((cell) => [
      [cell.alias, cell] as const,
      ...(cell.displayAlias ? [[cell.displayAlias, cell] as const] : []),
    ]));

    return ok({
      project: detail.data,
      canWrite: canWriteProject(access as ProjectAccess),
      vendors: entries.data,
      comparison: comparison.ok ? comparison.data : null,
      ahs: bundle.data,
      costGroups: bundle.data.preview ? groupCostBreakdown(bundle.data.preview) : [],
      header,
      sheets: computedSheets,
      sheetVariables,
      workbook,
      workbookDoc,
    });
  } catch (e) {
    return toActionResultError(e, "project_workspace");
  }
}
