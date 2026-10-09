/**
 * Project history (append-only audit trail) — PRD §34, Phase 3 §17.
 *
 * The database makes history immutable: trg_history_append_only rejects UPDATE
 * and DELETE for EVERY role, so the UI never offers an edit/delete action and
 * this module exposes no such function.
 *
 * NOTE on scenario inputs: supabase/migrations/0003_protection.sql already
 * writes a history row automatically for every scenario_inputs change
 * (trg_log_scenario_inputs). This service therefore does NOT duplicate those
 * rows; it records the entities the trigger does NOT cover (projects, vendor
 * prices, cost items, scenarios) plus one summary row per scenario creation
 * carrying the calculated impact.
 */

import type { Actor } from "../auth/session";
import { eq, type Database } from "../data/db";
import { toNumber } from "../format";
import { normalisePage, normalisePageSize, buildPage, toRange, type Page } from "./pagination";
import type { HistoryAction, ProjectHistoryRow } from "../types/domain";
import { toActionResultError, type ActionResult } from "./result";
import { ok } from "./result";

export interface HistoryImpact {
  [metric: string]: {
    before: number | null;
    after: number | null;
    delta: number | null;
  };
}

export interface RecordHistoryInput {
  projectId: string;
  scenarioId?: string | null;
  entity: string;
  entityId?: string | null;
  action: HistoryAction;
  field?: string | null;
  oldValue?: string | number | null;
  newValue?: string | number | null;
  reason?: string | null;
  impact?: HistoryImpact | null;
  changedBy: string;
}

function asText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? String(value) : value;
}

/**
 * Append one audit row. Returns false when the audit row could not be written
 * so the caller can surface a warning WITHOUT losing the successful mutation.
 */
export async function recordHistory(
  db: Database,
  input: RecordHistoryInput,
): Promise<boolean> {
  try {
    await db.insert("project_history", {
      project_id: input.projectId,
      scenario_id: input.scenarioId ?? null,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      action: input.action,
      field: input.field ?? null,
      old_value: asText(input.oldValue),
      new_value: asText(input.newValue),
      reason: input.reason ?? null,
      impact_json: input.impact ?? null,
      changed_by: input.changedBy,
    });
    return true;
  } catch {
    return false;
  }
}

export function buildImpact(before: Record<string, number | null>, after: Record<string, number | null>): HistoryImpact {
  const impact: HistoryImpact = {};
  for (const key of Object.keys(after)) {
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    impact[key] = {
      before: b,
      after: a,
      delta: b !== null && a !== null ? a - b : null,
    };
  }
  return impact;
}

/**
 * Any stored audit value -> safe display text. History rows can come from older
 * stores whose `new_value` was a JSON object; those must NEVER reach React as
 * children ("Objects are not valid as a React child").
 */
export function toDisplayText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["name", "label", "title", "value"]) {
      const candidate = record[key];
      if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
    }
    try {
      const json = JSON.stringify(value);
      return json && json !== "{}" ? json : null;
    } catch {
      return null;
    }
  }
  return String(value);
}

export interface HistoryRowView {
  id: string;
  changed_at: string;
  changed_by_name: string;
  changed_by_email: string | null;
  /** Stored action, or the legacy `change_type` on rows written by older stores. */
  action: string;
  entity: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  impact_json: HistoryImpact | null;
  scenario_name: string | null;
}

export interface HistoryFilters {
  entity?: string;
  action?: HistoryAction | "";
  page?: number;
  pageSize?: number;
}

export async function listProjectHistory(
  db: Database,
  actor: Actor,
  projectId: string,
  filters: HistoryFilters = {},
): Promise<ActionResult<Page<HistoryRowView>>> {
  try {
    const page = normalisePage(filters.page);
    const pageSize = normalisePageSize(filters.pageSize);
    const where = [eq("project_id", projectId)];
    if (filters.entity) where.push(eq("entity", filters.entity));
    if (filters.action) where.push(eq("action", filters.action));

    const { rows, count } = await db.select<ProjectHistoryRow>("project_history", {
      where,
      order: [{ column: "changed_at", ascending: false }],
      range: toRange(page, pageSize),
      count: true,
    });

    const profileIds = [...new Set(rows.map((r) => r.changed_by).filter((v): v is string => Boolean(v)))];
    const scenarioIds = [...new Set(rows.map((r) => r.scenario_id).filter((v): v is string => Boolean(v)))];

    const profiles = profileIds.length
      ? (
          await db.select<{ id: string; full_name: string | null; email: string }>("profiles", {
            where: [{ column: "id", op: "in", value: profileIds }],
          })
        ).rows
      : [];
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const scenarios = scenarioIds.length
      ? (
          await db.select<{ id: string; name: string }>("price_scenarios", {
            where: [{ column: "id", op: "in", value: scenarioIds }],
          })
        ).rows
      : [];
    const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

    const views: HistoryRowView[] = rows.map((row) => {
      const profile = row.changed_by ? profileById.get(row.changed_by) : undefined;
      // Older local stores wrote change_type / table_name / record_id / created_at
      // and could store a JSON object as new_value. Normalise once, here, so the
      // view only ever carries display-ready strings.
      const raw = row as unknown as Record<string, unknown>;
      return {
        id: String(row.id),
        changed_at: toDisplayText(row.changed_at ?? raw.created_at) ?? "",
        changed_by_name: profile?.full_name ?? profile?.email ?? "(tidak diketahui)",
        changed_by_email: profile?.email ?? null,
        action: toDisplayText(row.action ?? raw.change_type) ?? "UNKNOWN",
        entity: toDisplayText(row.entity ?? raw.table_name ?? raw.table) ?? "unknown",
        field: toDisplayText(row.field),
        old_value: toDisplayText(row.old_value),
        new_value: toDisplayText(row.new_value),
        reason: toDisplayText(row.reason),
        impact_json: (row.impact_json as HistoryImpact | null) ?? null,
        scenario_name: row.scenario_id ? scenarioById.get(row.scenario_id)?.name ?? null : null,
      };
    });

    return ok(buildPage(views, count, page, pageSize));
  } catch (e) {
    return toActionResultError(e, "project_history");
  }
}

export function historyEntityLabel(entity: string | null | undefined): string {
  const labels: Record<string, string> = {
    projects: "Project",
    vendor_prices: "Vendor Price",
    ahs: "AHS",
    ahs_cost_items: "Cost Item",
    price_scenarios: "Scenario",
    scenario_inputs: "Scenario Input",
    calculation_results: "Calculation Result",
  };
  if (!entity) return "—";
  return labels[entity] ?? entity;
}

/** Presentation of one stored audit value — always a string, never an object. */
export function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return toDisplayText(value) ?? "—";
  const n = toNumber(value);
  if (n === null) return String(value);
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 }).format(n);
}
