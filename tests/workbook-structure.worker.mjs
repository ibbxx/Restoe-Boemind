import { parentPort, workerData } from "node:worker_threads";
import { Direction, LocaleType, Univer, UniverInstanceType } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverSheetsPlugin, InsertRowByRangeCommand, RemoveRowByRangeCommand } from "@univerjs/sheets";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";
import "@univerjs/engine-formula/facade";
import "@univerjs/sheets/facade";
import "@univerjs/sheets-formula/facade";

const univer = new Univer({ locale: LocaleType.EN_US, locales: { [LocaleType.EN_US]: {} } });
try {
  for (const plugin of [UniverRenderEnginePlugin, UniverFormulaEnginePlugin, UniverDocsPlugin, UniverSheetsPlugin, UniverSheetsFormulaPlugin, UniverSheetsNumfmtPlugin]) univer.registerPlugin(plugin);
  const api = FUniver.newAPI(univer);
  univer.createUnit(UniverInstanceType.UNIVER_SHEET, workerData.snapshot);
  const params = { unitId: workerData.snapshot.id, subUnitId: "ahs", range: { startRow: 7, endRow: 7, startColumn: 0, endColumn: 0 } };
  const inserted = await api.executeCommand(InsertRowByRangeCommand.id, { ...params, direction: Direction.UP });
  const afterInsert = api.getActiveWorkbook().save();
  const removed = await api.executeCommand(RemoveRowByRangeCommand.id, { ...params, range: { ...params.range, startRow: 10, endRow: 10 } });
  const afterRemove = api.getActiveWorkbook().save();
  parentPort.postMessage({ inserted, removed, afterInsert, afterRemove });
} catch (error) { parentPort.postMessage({ error: String(error) }); }
finally { univer.dispose(); }
