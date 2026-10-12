import Link from "next/link";

import { can } from "@/lib/auth/permissions";
import { requestContext, isContextError } from "@/lib/data/context";
import { blankProjectForm } from "@/lib/services/projects";
import { ProjectForm } from "@/components/project/project-form";
import { PageHeader } from "@/components/shared/primitives";
import { ErrorState } from "@/components/shared/states";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return (
      <>
        <PageHeader title="Proyek baru" />
        <ErrorState title="Form tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />
      </>
    );
  }

  // The database is the enforcement point (projects_insert -> can_write());
  // this only prevents showing a form that could never succeed.
  if (!can("create_project", ctx.actor.role)) {
    return (
      <>
        <PageHeader title="Proyek baru" />
        <ErrorState
          title="Akses tidak tersedia"
          code="FORBIDDEN"
          message="Anda tidak memiliki izin untuk membuat proyek."
          action={
            <Link href="/projects" className="btn-secondary">
              Kembali ke daftar proyek
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
        <PageHeader
        title="Proyek baru"
        breadcrumb={
          <Link href="/projects" className="hover:underline">
            ← proyek
          </Link>
        }
      />

      <div className="space-y-4">
        <ProjectForm mode="create" initial={blankProjectForm()} />
      </div>
    </>
  );
}
