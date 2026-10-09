import Link from "next/link";

import { canWriteProject, type ProjectAccess } from "@/lib/auth/permissions";
import { requestContext, isContextError } from "@/lib/data/context";
import { resolveProjectAccess } from "@/lib/services/access";
import { getAhsBundle } from "@/lib/services/ahs";
import { compareScenarios, listScenarios, nextScenarioName } from "@/lib/services/scenarios";
import { Card, CardHeader, PageHeader } from "@/components/shared/primitives";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ScenarioComparisonTable, ScenarioTable } from "@/components/scenario/scenario-panels";
import { RenameScenarioForm, ScenarioForm } from "@/components/scenario/scenario-form";

export const dynamic = "force-dynamic";

/**
 * Scenarios (Phase 3 §15–§16).
 * V1 is immutable once V2 exists — enforced by the database (trg_lock_parent_scenario
 * + trg_scenario_immutable), not by hiding a button.
 */
export default async function ScenariosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;

  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return <ErrorState title="Scenarios tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />;
  }

  const [access, scenarios, bundle, nextName] = await Promise.all([
    resolveProjectAccess(ctx.db, ctx.actor, id),
    listScenarios(ctx.db, ctx.actor, id),
    getAhsBundle(ctx.db, ctx.actor, id),
    nextScenarioName(ctx.db, id),
  ]);

  if (!scenarios.ok) {
    return <ErrorState title="Scenarios tidak dapat dimuat" message={scenarios.error} code={scenarios.errorCode} />;
  }

  const canWrite = canWriteProject(access as ProjectAccess);
  const list = scenarios.data;

  const requested = (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const compareIds =
    requested.length >= 2
      ? requested
      : list
          .slice(-3)
          .map((s) => s.scenario.id);

  const comparison =
    compareIds.length >= 2 ? await compareScenarios(ctx.db, ctx.actor, id, compareIds) : null;

  const costItems = bundle.ok ? bundle.data.costItems : [];
  const inputs = bundle.ok ? bundle.data.inputs : null;

  return (
    <>
      <PageHeader
        title="Scenarios"
        description="Setiap perubahan komersial menjadi versi baru. Versi lama tidak pernah ditimpa."
        actions={
          <Link href={`/projects/${id}/commercial`} className="btn-secondary">
            Commercial analysis
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={`Saved scenarios (${list.length})`}
          />
          {list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                compact
                title="No scenario created yet."
              />
            </div>
          ) : (
            <>
              <ScenarioTable projectId={id} scenarios={list} />
              <div className="border-t border-ink-100 px-3 py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="field-label mb-0">Rename unlocked versions</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {list.map((s) => (
                      <RenameScenarioForm
                        key={s.scenario.id}
                        projectId={id}
                        scenarioId={s.scenario.id}
                        name={s.scenario.name}
                        disabled={s.scenario.is_locked || !canWrite}
                        disabledReason={
                          s.scenario.is_locked
                          ? "Locked by a newer version."
                            : "Read-only access."
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>

        {canWrite ? (
          <Card>
            <CardHeader
              title="New scenario"
            />
            <ScenarioForm
              projectId={id}
              nextName={nextName}
              scenarios={list.map((s) => ({
                id: s.scenario.id,
                name: s.scenario.name,
                is_locked: s.scenario.is_locked,
              }))}
              costItems={costItems}
              defaults={{
                volume: inputs?.volume ?? null,
                harga_jual_include: inputs?.harga_jual_include ?? null,
                include_divisor: inputs?.include_divisor ?? null,
                ppn_rate: inputs?.ppn_rate ?? null,
                pbbkb_rate: inputs?.pbbkb_rate ?? null,
              }}
            />
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-xs text-ink-500">
              Role Anda read-only pada project ini — pembuatan scenario akan ditolak database (RLS).
            </p>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Scenario comparison"
              description=""
            actions={
              compareIds.length >= 2 ? (
                <Link
                  href={`/projects/${id}/scenarios?v=${compareIds.join(",")}`}
                  className="btn-secondary text-xs"
                >
                  Versi terpilih
                </Link>
              ) : null
            }
          />
          {comparison && comparison.ok ? (
            <ScenarioComparisonTable view={comparison.data} />
          ) : comparison && !comparison.ok ? (
            <ErrorState message={comparison.error} code={comparison.errorCode} />
          ) : (
            <p className="px-4 py-3 text-xs text-ink-500">
              Select at least 2 versions to compare.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
