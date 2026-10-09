"use server";

import type { ActionResult } from "../services/result";
import type { ProjectSheetsView } from "../services/sheets";
import {
  addSheet,
  addSheetColumn,
  addSheetRow,
  removeSheet,
  removeSheetColumn,
  removeSheetRow,
  setSheetCell,
  setSheetRowLabel,
  mergeSheetCells,
  unmergeSheetCells,
  setSheetRangeStyle,
  deleteWorkbookAxis,
  insertWorkbookAxis,
  mergeWorkbookCells,
  resetWorkbookAxisSize,
  resizeWorkbookAxis,
  setWorkbookRangePresentation,
  unmergeWorkbookCells,
  setWorkbookGridCell,
  resetWorkbookGridCellOverride,
} from "../services/sheets";
import type { SheetRange, SheetFill, WorkbookGridRange, WorkbookGridCellRecord } from "../types/sheets";
import { actionContext, isContextError } from "./context";
import { revalidateProject } from "../revalidation";
import type { Database } from "../data/db";
import type { Actor } from "../auth/session";

/**
 * Server actions untuk tabel dinamis. Semuanya menerima argumen biasa (bukan
 * FormData) supaya sel bisa disimpan langsung dari grid spreadsheet; nilai
 * formula tetap dihitung di server.
 */

function revalidate(projectId: string): void {
  revalidateProject(projectId, { ahs: true });
}

async function workbookMutation(projectId: string, mutation: (db: Database, actor: Actor) => Promise<unknown>) {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await mutation(ctx.db, ctx.actor);
  if (typeof result === "object" && result !== null && "ok" in result && result.ok) revalidate(projectId);
  return result;
}

export async function resizeWorkbookAxisAction(projectId: string, input: { axis: "row" | "column"; id: string; size: number; manual?: boolean }) {
  return workbookMutation(projectId, (db, actor) => resizeWorkbookAxis(db, actor, projectId, input));
}

export async function resetWorkbookAxisSizeAction(projectId: string, input: { axis: "row" | "column"; id: string; size?: number }) {
  return workbookMutation(projectId, (db, actor) => resetWorkbookAxisSize(db, actor, projectId, input));
}

export async function setWorkbookRangePresentationAction(projectId: string, input: { range: WorkbookGridRange; fill?: SheetFill; wrap?: boolean }) {
  return workbookMutation(projectId, (db, actor) => setWorkbookRangePresentation(db, actor, projectId, input));
}

export async function mergeWorkbookCellsAction(projectId: string, range: WorkbookGridRange) {
  return workbookMutation(projectId, (db, actor) => mergeWorkbookCells(db, actor, projectId, range));
}

export async function unmergeWorkbookCellsAction(projectId: string, range: WorkbookGridRange) {
  return workbookMutation(projectId, (db, actor) => unmergeWorkbookCells(db, actor, projectId, range));
}

export async function insertWorkbookAxisAction(projectId: string, input: { axis: "row" | "column"; afterId: string }) {
  return workbookMutation(projectId, (db, actor) => insertWorkbookAxis(db, actor, projectId, input));
}

export async function deleteWorkbookAxisAction(projectId: string, input: { axis: "row" | "column"; id: string }) {
  return workbookMutation(projectId, (db, actor) => deleteWorkbookAxis(db, actor, projectId, input));
}

export async function setWorkbookGridCellAction(projectId: string, input: { rowId: string; columnId: string; cell: WorkbookGridCellRecord }) {
  return workbookMutation(projectId, (db, actor) => setWorkbookGridCell(db, actor, projectId, input));
}

export async function resetWorkbookGridCellOverrideAction(projectId: string, input: { rowId: string; columnId: string }) {
  return workbookMutation(projectId, (db, actor) => resetWorkbookGridCellOverride(db, actor, projectId, input));
}

export async function mergeSheetCellsAction(projectId: string, input: { sheet_key: string; range: SheetRange }) {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await mergeSheetCells(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function unmergeSheetCellsAction(projectId: string, input: { sheet_key: string; range: SheetRange }) {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await unmergeSheetCells(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function setSheetRangeStyleAction(projectId: string, input: { sheet_key: string; range: SheetRange; fill: SheetFill }) {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await setSheetRangeStyle(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function setSheetCellAction(
  projectId: string,
  input: { sheet_key: string; row_id: string; column_key: string; raw: string },
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await setSheetCell(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function setSheetRowLabelAction(
  projectId: string,
  input: { sheet_key: string; row_id: string; label: string },
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await setSheetRowLabel(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function addSheetRowAction(
  projectId: string,
  input: { sheet_key: string; label?: string | null },
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await addSheetRow(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function removeSheetRowAction(
  projectId: string,
  input: { sheet_key: string; row_id: string },
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await removeSheetRow(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function addSheetColumnAction(
  projectId: string,
  input: { sheet_key: string; label: string },
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await addSheetColumn(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function removeSheetColumnAction(
  projectId: string,
  input: { sheet_key: string; column_key: string },
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await removeSheetColumn(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function addSheetAction(
  projectId: string,
  title: string,
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await addSheet(ctx.db, ctx.actor, projectId, title);
  if (result.ok) revalidate(projectId);
  return result;
}

export async function removeSheetAction(
  projectId: string,
  sheetKey: string,
): Promise<ActionResult<ProjectSheetsView>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await removeSheet(ctx.db, ctx.actor, projectId, sheetKey);
  if (result.ok) revalidate(projectId);
  return result;
}
