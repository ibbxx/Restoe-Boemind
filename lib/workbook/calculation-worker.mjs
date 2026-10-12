import { parentPort } from "node:worker_threads";
import { Univer, UniverInstanceType } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";
import "@univerjs/engine-formula/facade";
import "@univerjs/sheets/facade";
import "@univerjs/sheets-formula/facade";
const plugins = [UniverRenderEnginePlugin, UniverFormulaEnginePlugin, UniverDocsPlugin, UniverSheetsPlugin, UniverSheetsFormulaPlugin, UniverSheetsNumfmtPlugin];
let queue = Promise.resolve();
parentPort.on("message", ({ id, snapshot, positions }) => {
  queue = queue.then(async () => {
    const univer = new Univer();
    try {
      for (const plugin of plugins) univer.registerPlugin(plugin);
      const api = FUniver.newAPI(univer);
      univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
      const formula = api.getFormula();
      const done = formula.onCalculationResultApplied(5000);
      formula.executeCalculation();
      await done;
      const workbook = api.getActiveWorkbook();
      const values = {};
      const errors = [];
      for (const [key, position] of Object.entries(positions)) {
        if (!position) { values[key] = null; errors.push(key); continue; }
        const sheet = workbook.getSheetBySheetId(position.sheetId);
        const cell = sheet?.getRange(position.row, position.col).getCellData();
        const value = sheet?.getRange(position.row, position.col).getRawValue();
        if (cell?.t === 4 || typeof value === "string" && /^#(REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|SPILL!|CYCLE!|ERROR!)/.test(value)) {
          values[key] = null; errors.push(key);
        } else values[key] = value === "" || value == null ? null : value;
      }
      parentPort.postMessage({ id, values, errors });
    } catch (error) { parentPort.postMessage({ id, error: error.message }); }
    finally { univer.dispose(); }
  });
});
