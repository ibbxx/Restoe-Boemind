"use server";

import { setWorkbookCell, setWorkbookGridValue } from "../services/workbook";
import { revalidateProject } from "../revalidation";
import { actionContext, isContextError } from "./context";

export async function setWorkbookCellAction(projectId: string, cellKey: string, raw: string) {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await setWorkbookCell(ctx.db, ctx.actor, projectId, cellKey, raw);
  if (result.ok) revalidateProject(projectId, { ahs: true, reports: true, commercial: true, history: true });
  return result;
}

export async function setWorkbookGridValueAction(projectId: string, input: Parameters<typeof setWorkbookGridValue>[3]) {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;
  const result = await setWorkbookGridValue(ctx.db, ctx.actor, projectId, input);
  if (result.ok) revalidateProject(projectId, { ahs: true, reports: true, commercial: true, history: true });
  return result;
}
