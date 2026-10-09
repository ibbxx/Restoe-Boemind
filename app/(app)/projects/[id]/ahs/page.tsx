import Link from "next/link";

import { canWriteProject, type ProjectAccess } from "@/lib/auth/permissions";
import { requestContext, isContextError } from "@/lib/data/context";
import { resolveProjectAccess } from "@/lib/services/access";
import { getAhsBundle } from "@/lib/services/ahs";
import { formatNumber } from "@/lib/format";
import { AhsInputsForm } from "@/components/ahs/ahs-inputs-form";
import { CostItemsPanel } from "@/components/ahs/cost-items-panel";
import { AhsResultPanel } from "@/components/ahs/result-panel";
import { Card, CardHeader, PageHeader } from "@/components/shared/primitives";
import { CalculationErrorState, EmptyState, ErrorState } from "@/components/shared/states";

export const dynamic = "force-dynamic";

export default async function ProjectAhsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return <ErrorState title="AHS tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />;
  }

  const [access, bundle] = await Promise.all([
    resolveProjectAccess(ctx.db, ctx.actor, id),
    getAhsBundle(ctx.db, ctx.actor, id),
  ]);

  if (!bundle.ok) {
    return <ErrorState title="AHS tidak dapat dimuat" message={bundle.error} code={bundle.errorCode} />;
  }

  const canWrite = canWriteProject(access as ProjectAccess);
  const view = bundle.data;

  if (!view.ahs) {
    return (
      <>
        <PageHeader title="AHS" />
        <EmptyState
          title="No AHS yet"
          action={
            <Link href={`/projects/${id}`} className="btn-secondary">
              Open workspace
            </Link>
          }
        />
        <div className="mt-4">
          <Card>
            <CardHeader
              title="Create AHS"
            />
            <AhsInputsForm projectId={id} inputs={null} canWrite={canWrite} />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AHS"
        description={
          <span>
            Template: <strong>{view.template?.template_id ?? view.ahs.template_id}</strong>
            {view.template ? ` — ${view.template.template_name}` : ""}
            {view.template ? ` · blok Excel ${view.template.source_block}` : ""}
          </span>
        }
        actions={
          <Link href={`/projects/${id}/commercial`} className="btn-secondary">
            Commercial analysis
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Input"
            description=""
          />
          <AhsInputsForm projectId={id} inputs={view.inputs} canWrite={canWrite} />
        </Card>

        <Card>
          <CardHeader
            title={`Cost items (${formatNumber(view.costItems.length)})`}
            description=""
          />
          <CostItemsPanel projectId={id} items={view.costItems} canWrite={canWrite} />
        </Card>

        {view.previewError ? (
          <CalculationErrorState
            message={view.previewError.message}
            code={view.previewError.errorCode}
            field={view.previewError.field}
          />
        ) : null}

        <AhsResultPanel
          result={view.preview}
          costItems={view.costItems}
          pendingReason={
            view.costItems.length === 0
              ? "Add a cost item to calculate results."
              : "Complete volume and customer price to calculate results."
          }
        />

      </div>
    </>
  );
}
