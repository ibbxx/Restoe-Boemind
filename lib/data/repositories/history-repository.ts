import type { Database } from "../db";
import type { Actor } from "../../auth/session";
import {
  listProjectHistory,
  recordHistory,
  type HistoryRowView,
  type HistoryFilters,
  type RecordHistoryInput,
} from "../../services/history";
import type { ActionResult } from "../../services/result";
import type { Page } from "../../services/pagination";

export interface IHistoryRepository {
  list(actor: Actor, projectId: string, options?: HistoryFilters): Promise<ActionResult<Page<HistoryRowView>>>;
  record(input: RecordHistoryInput): Promise<boolean>;
}

export function createHistoryRepository(db: Database): IHistoryRepository {
  return {
    async list(actor, projectId, options) {
      return listProjectHistory(db, actor, projectId, options);
    },
    async record(input) {
      return recordHistory(db, input);
    },
  };
}
