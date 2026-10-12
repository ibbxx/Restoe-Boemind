import { describe, expect, it } from "vitest";
import { defaultSheetsDoc, MIN_UNIVER_COLUMN_COUNT, MIN_UNIVER_ROW_COUNT, normalizeUniverWorkbookSnapshot, parseSheetsDoc } from "../lib/services/sheets";
import { bindingPosition } from "../lib/workbook/bindings";

describe("project spreadsheet", () => {
  it("starts with a general 200 by 50 canvas and project bindings", () => {
    const doc = defaultSheetsDoc();
    const snapshot = doc.univerWorkbook!;
    const sheets = snapshot.sheets as Record<string, { rowCount: number; columnCount: number; cellData: object }>;
    expect(sheets.ahs!.rowCount).toBe(MIN_UNIVER_ROW_COUNT);
    expect(sheets.ahs!.columnCount).toBe(MIN_UNIVER_COLUMN_COUNT);
    expect(bindingPosition(snapshot, "project.volume")).toMatchObject({ sheetId: "procurement_inputs", row: 7, col: 1 });
    expect(bindingPosition(snapshot, "ahs.volume")).toMatchObject({ sheetId: "ahs", row: 9, col: 13 });
  });

  it("expands saved axes without changing sparse content", () => {
    const old = { sheets: { custom: { id: "custom", name: "Custom", rowCount: 64, columnCount: 16, cellData: { 3: { 2: { v: "keep" } } } } } };
    const normalized = normalizeUniverWorkbookSnapshot(old) as typeof old;
    expect(normalized.sheets.custom.rowCount).toBe(200);
    expect(normalized.sheets.custom.columnCount).toBe(50);
    expect(normalized.sheets.custom.cellData[3][2].v).toBe("keep");
    expect(old.sheets.custom.rowCount).toBe(64);
  });

  it("reads a saved custom sheet", () => {
    const parsed = parseSheetsDoc({ version: 5, sheets: [{ key: "custom", title: "Custom", columns: [], rows: [] }], univerWorkbook: { sheets: { custom: { name: "Custom", rowCount: 64, columnCount: 16, cellData: { 4: { 1: { v: 42 } } } } } } });
    const sheet = (parsed.univerWorkbook!.sheets as Record<string, { rowCount: number; cellData: Record<number, Record<number, { v: number }>> }>).custom;
    expect(sheet!.rowCount).toBe(200);
    expect(sheet!.cellData[4]![1]!.v).toBe(42);
  });
});
