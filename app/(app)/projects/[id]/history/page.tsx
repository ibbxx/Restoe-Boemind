import { requestContext, isContextError } from "@/lib/data/context";
import { listProjectHistory } from "@/lib/services/history";
import { normalisePage, normalisePageSize } from "@/lib/services/pagination";
import { HISTORY_ACTIONS, HISTORY_ENTITIES } from "@/lib/types/history";
import { Pagination } from "@/components/shared/data-table";
import { Card, CardHeader, PageHeader } from "@/components/shared/primitives";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { HistoryTable } from "@/components/history/history-table";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entity?: string; action?: string; page?: string; size?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return <ErrorState title="History tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />;
  }

  const page = normalisePage(Number(sp.page) || undefined);
  const pageSize = normalisePageSize(Number(sp.size) || undefined);
  const entity = sp.entity ?? "";
  const action = (sp.action ?? "") as "" | (typeof HISTORY_ACTIONS)[number];

  const history = await listProjectHistory(ctx.db, ctx.actor, id, {
    entity: entity || undefined,
    action: action || undefined,
    page,
    pageSize,
  });

  if (!history.ok) {
    return <ErrorState title="History tidak dapat dimuat" message={history.error} code={history.errorCode} />;
  }

  const data = history.data;

  return (
    <>
      <PageHeader
        title="Project history"
      />

      <Card>
        <CardHeader
          title={`Changes (${data.total})`}
        />

        <form className="flex flex-wrap items-end gap-2 border-b border-ink-200 px-3 py-3" method="get">
          <label>
            <span className="field-label">Entity</span>
            <select className="input" name="entity" defaultValue={entity}>
              <option value="">All</option>
              {HISTORY_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Action</span>
            <select className="input" name="action" defaultValue={action}>
              <option value="">All</option>
              {HISTORY_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-secondary">
            Apply
          </button>
        </form>

        {data.total === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              title="No changes"
            />
          </div>
        ) : (
          <>
            <HistoryTable rows={data.rows} />
            <Pagination
              page={data}
              basePath={`/projects/${id}/history`}
              params={{ entity, action, size: String(pageSize) }}
            />
          </>
        )}
      </Card>
    </>
  );
}
