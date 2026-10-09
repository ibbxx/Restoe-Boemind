import type { Database } from "../db";
import type { Actor } from "../../auth/session";
import {
  commitScenario,
  getScenarioDetail,
  listScenarios,
  compareScenarios,
  renameScenario,
  nextScenarioName,
  type ScenarioFormValue,
  type CommitScenarioResult,
  type ScenarioDetail,
  type ScenarioView,
  type ScenarioComparisonTableView,
} from "../../services/scenarios";
import type { ActionResult } from "../../services/result";

export interface IScenarioRepository {
  list(actor: Actor, projectId: string): Promise<ActionResult<ScenarioView[]>>;
  getDetail(actor: Actor, projectId: string, scenarioId: string): Promise<ActionResult<ScenarioDetail>>;
  commit(actor: Actor, projectId: string, input: ScenarioFormValue): Promise<ActionResult<CommitScenarioResult>>;
  compare(actor: Actor, projectId: string, scenarioIds: string[]): Promise<ActionResult<ScenarioComparisonTableView>>;
  rename(actor: Actor, projectId: string, scenarioId: string, newName: string): Promise<ActionResult<{ id: string }>>;
  getNextName(projectId: string): Promise<string>;
}

export function createScenarioRepository(db: Database): IScenarioRepository {
  return {
    async list(actor, projectId) {
      return listScenarios(db, actor, projectId);
    },
    async getDetail(actor, projectId, scenarioId) {
      return getScenarioDetail(db, actor, projectId, scenarioId);
    },
    async commit(actor, projectId, input) {
      return commitScenario(db, actor, projectId, input);
    },
    async compare(actor, projectId, scenarioIds) {
      return compareScenarios(db, actor, projectId, scenarioIds);
    },
    async rename(actor, projectId, scenarioId, newName) {
      return renameScenario(db, actor, projectId, scenarioId, newName);
    },
    async getNextName(projectId) {
      return nextScenarioName(db, projectId);
    },
  };
}
