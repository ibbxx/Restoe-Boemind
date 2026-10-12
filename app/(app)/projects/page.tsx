import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import { can } from "@/lib/auth/permissions";
import { listProjects, parseProjectStatus } from "@/lib/services/projects";
import { normalisePage } from "@/lib/services/pagination";
import { formatNumber } from "@/lib/format";
import { Pagination } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/primitives";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ProjectFilterBar, ProjectTable } from "@/components/project/project-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
        <PageHeader title="Proyek" />
        <ErrorState title="proyek tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />
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
        <PageHeader title="Proyek" />
        <ErrorState title="proyek tidak dapat dimuat" message={result.error} code={result.errorCode} />
      </>
    );
  }

  const data = result.data;
  const hasFilters = search !== "" || status !== "";
  const canCreate = can("create_project", ctx.actor.role);

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <PageHeader
        title="Proyek"
        actions={canCreate ? (
          <Link href="/projects/new" className={buttonVariants({ className: "projects-create-button" })}>
            Buat proyek
          </Link>
        ) : undefined}
      />

      <Card className="projects-card">
        <CardHeader>
          <CardTitle>Daftar proyek</CardTitle>
          <CardDescription>
            {formatNumber(data.total)} proyek{hasFilters ? " sesuai filter" : " terdaftar"}
          </CardDescription>
        </CardHeader>
        <ProjectFilterBar
          search={search}
          status={status}
          hasFilters={hasFilters}
        />

        {data.total === 0 ? (
          hasFilters ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                compact
                title="Tidak ada proyek yang cocok"
                description="Coba ubah kata kunci atau status yang dipilih."
                showDescription
                action={
                  <Link href="/projects" className={buttonVariants({ variant: "outline" })}>
                    Hapus filter
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              <EmptyState
                title="Belum ada proyek"
                description="Proyek yang dibuat akan tampil di daftar ini."
                showDescription
                action={canCreate ? <Link href="/projects/new" className={buttonVariants()}>Buat proyek</Link> : undefined}
              />
            </div>
          )
        ) : (
          <>
            <ProjectTable rows={data.rows} canDelete={can("delete_project", ctx.actor.role)} />
            {data.totalPages > 1 ? (
              <div className="projects-pagination">
                <Pagination
                  page={data}
                  basePath="/projects"
                  params={{ q: search, status }}
                />
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
