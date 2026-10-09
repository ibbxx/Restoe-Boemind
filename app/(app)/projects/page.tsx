import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import { can } from "@/lib/auth/permissions";
import { listProjects, parseProjectStatus } from "@/lib/services/projects";
import { normalisePage } from "@/lib/services/pagination";
import { formatNumber } from "@/lib/format";
import { Pagination } from "@/components/shared/data-table";
import { Card, CardHeader, PageHeader } from "@/components/shared/primitives";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ProjectFilterBar, ProjectTable } from "@/components/project/project-table";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  status?: string;
  page?: string;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return (
      <>
        <PageHeader title="Projects" />
        <ErrorState title="Projects tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />
      </>
    );
  }

  const page = normalisePage(Number(params.page) || undefined);
  const pageSize = 25;
  const search = params.q ?? "";
  const status = parseProjectStatus(params.status);

  const result = await listProjects(ctx.db, ctx.actor, {
    search,
    status,
    sort: "updated_at",
    direction: "desc",
    page,
    pageSize,
  });

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Projects" />
        <ErrorState title="Projects tidak dapat dimuat" message={result.error} code={result.errorCode} />
      </>
    );
  }

  const data = result.data;
  const hasFilters = search !== "" || status !== "";

  return (
    <>
      <PageHeader
        title="Projects"
        actions={
          <>
            <Link href="/reports" className="btn-secondary">
              Reports
            </Link>
            <Link href="/projects/new" className="btn-primary">
              New project
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader
          title={`Projects (${formatNumber(data.total)})`}
        />
        <ProjectFilterBar
          search={search}
          status={status}
        />

        {data.total === 0 ? (
          hasFilters ? (
            <div className="p-4">
              <EmptyState
                compact
                title="No matching projects"
                action={
                  <Link href="/projects" className="btn-secondary">
                    Reset
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No projects yet"
                action={
                  <Link href="/projects/new" className="btn-primary">
                    Create project
                  </Link>
                }
              />
            </div>
          )
        ) : (
          <>
            <ProjectTable rows={data.rows} canDelete={can("delete_project", ctx.actor.role)} />
            <Pagination
              page={data}
              basePath="/projects"
              params={{
                q: search,
                status,
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
