import { LocaleType, RedoCommandId, UndoCommandId, Univer } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import "@univerjs/sheets/facade";
import SheetsEnglish from "@univerjs/sheets/locale/en-US";
import { describe, expect, it } from "vitest";

import { isPersistedWorkbookCommand } from "../lib/workbook/univer-commands";

describe("Univer workbook command history", () => {
  it("restores an edited cell with undo and reapplies it with redo", () => {
    const univer = new Univer({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: SheetsEnglish },
    });
    univer.registerPlugin(UniverSheetsPlugin);

    try {
      const api = FUniver.newAPI(univer);
      const workbook = api.createWorkbook({
        id: "history-test",
        name: "History test",
        sheetOrder: ["sheet-1"],
        sheets: {
          "sheet-1": {
            id: "sheet-1",
            name: "Evaluasi",
            rowCount: 10,
            columnCount: 10,
            cellData: { 0: { 0: { v: "Nilai awal" } } },
          },
        },
      });
      const cell = workbook.getActiveSheet().getRange("A1");

      cell.setValue("Nilai hasil edit");
      expect(cell.getValue()).toBe("Nilai hasil edit");

      workbook.undo();
      expect(cell.getValue()).toBe("Nilai awal");

      workbook.redo();
      expect(cell.getValue()).toBe("Nilai hasil edit");
    } finally {
      univer.dispose();
    }
  });

  it("marks undo and redo as changes that must be autosaved", () => {
    expect(isPersistedWorkbookCommand(UndoCommandId)).toBe(true);
    expect(isPersistedWorkbookCommand(RedoCommandId)).toBe(true);
    expect(isPersistedWorkbookCommand("sheet.operation.set-selections")).toBe(false);
  });
});
