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
        <PageHeader title="New project" />
        <ErrorState title="Form tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />
      </>
    );
  }

  // The database is the enforcement point (projects_insert -> can_write());
  // this only prevents showing a form that could never succeed.
  if (!can("create_project", ctx.actor.role)) {
    return (
      <>
        <PageHeader title="New project" />
        <ErrorState
          title="Access denied"
          code="FORBIDDEN"
          message={`The ${ctx.actor.role} role cannot create projects.`}
          action={
            <Link href="/projects" className="btn-secondary">
              Back to projects
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
        <PageHeader
        title="New project"
        description="Validasi dilakukan sebelum database write. Setelah tersimpan Anda diarahkan ke halaman project."
        breadcrumb={
          <Link href="/projects" className="hover:underline">
            ← Projects
          </Link>
        }
      />

      <div className="space-y-4">
        <ProjectForm mode="create" initial={blankProjectForm()} />
      </div>
    </>
  );
}
