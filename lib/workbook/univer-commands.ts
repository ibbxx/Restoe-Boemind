import { RedoCommandId, UndoCommandId } from "@univerjs/core";

export function isPersistedWorkbookCommand(id: string): boolean {
  return id === UndoCommandId
    || id === RedoCommandId
    || id.startsWith("sheet.mutation.") && !/formula-calculation|set-active|selection/.test(id)
    || ["sheet.command.set-defined-name", "sheet.command.remove-defined-name"].includes(id)
    || /^(sheet.command.(set-range-values|set-style|set-border|merge|unmerge|insert|remove|move|clear|paste|auto-fill))/.test(id);
}
