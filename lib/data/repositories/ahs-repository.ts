import type { Database } from "../db";
import type { Actor } from "../../auth/session";
import {
  getAhsBundle,
  saveAhsInputs,
  addCostItem,
  updateCostItem,
  removeCostItem,
  previewAhsCalculation,
  type AhsBundle,
  type AhsInputFormValue,
  type CostItemFormValue,
  type CostItemView,
} from "../../services/ahs";
import type { ActionResult } from "../../services/result";

export interface IAhsRepository {
  getBundle(actor: Actor, projectId: string): Promise<ActionResult<AhsBundle>>;
  saveInputs(actor: Actor, projectId: string, inputs: AhsInputFormValue): Promise<ActionResult<{ id: string; preview: import("../../calculations/types").AhsResult | null }>>;
  addCost(actor: Actor, projectId: string, input: CostItemFormValue): Promise<ActionResult<CostItemView>>;
  updateCost(actor: Actor, projectId: string, itemId: string, patch: Partial<CostItemFormValue>): Promise<ActionResult<CostItemView>>;
  removeCost(actor: Actor, projectId: string, itemId: string): Promise<ActionResult<{ id: string }>>;
  previewCalculation(actor: Actor, projectId: string, overrides?: Partial<AhsInputFormValue>): Promise<ActionResult<{ result: import("../../calculations/types").AhsResult; formulas_used: Record<string, string> }>>;
}

export function createAhsRepository(db: Database): IAhsRepository {
  return {
    async getBundle(actor, projectId) {
      return getAhsBundle(db, actor, projectId);
    },
    async saveInputs(actor, projectId, inputs) {
      return saveAhsInputs(db, actor, projectId, inputs);
    },
    async addCost(actor, projectId, input) {
      return addCostItem(db, actor, projectId, input);
    },
    async updateCost(actor, projectId, itemId, patch) {
      return updateCostItem(db, actor, projectId, itemId, patch as CostItemFormValue);
    },
    async removeCost(actor, projectId, itemId) {
      return removeCostItem(db, actor, projectId, itemId);
    },
    async previewCalculation(actor, projectId, overrides) {
      const safe = overrides
        ? {
            volume: overrides.volume ?? null,
            harga_jual_include: overrides.harga_jual_include ?? null,
            include_divisor: overrides.include_divisor ?? undefined,
            ppn_rate: overrides.ppn_rate ?? undefined,
            pbbkb_rate: overrides.pbbkb_rate ?? undefined,
          }
        : undefined;
      return previewAhsCalculation(db, actor, projectId, safe);
    },
  };
}
