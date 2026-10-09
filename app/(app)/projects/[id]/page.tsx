import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import { loadProjectWorkspace } from "@/lib/services/workspace";
import { ProjectWorkspace } from "@/components/excel/project-workspace";
import { ErrorState } from "@/components/shared/states";

export const dynamic = "force-dynamic";

/**
 * Project detail is the WORKSPACE, not a dashboard: opening a project drops the
 * user straight into the two Excel blocks (vendor evaluation + AHS). Values come
 * from the repository and the Calculation Engine through `loadProjectWorkspace`.
 */
export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return <ErrorState title="Project tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />;
  }

  const workspace = await loadProjectWorkspace(ctx.db, ctx.actor, id);
  if (!workspace.ok) {
    return (
      <ErrorState
        title="Workspace tidak dapat dimuat"
        message={workspace.error}
        code={workspace.errorCode}
        action={
          <Link href="/projects" className="btn-secondary">
            Kembali ke daftar project
          </Link>
        }
      />
    );
  }

  return <ProjectWorkspace projectId={id} view={workspace.data} />;
}
