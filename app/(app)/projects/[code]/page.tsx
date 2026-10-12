import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import { resolveProjectCode } from "@/lib/services/projects";
import { loadProjectEditor } from "@/lib/services/editor";
import { ProjectWorkspace } from "@/components/excel/project-workspace";
import { ErrorState } from "@/components/shared/states";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return <ErrorState title="proyek tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />;
  }

  const resolved = await resolveProjectCode(ctx.db, code);
  if (!resolved.ok) {
    return (
      <ErrorState
        title="proyek tidak ditemukan"
        message={resolved.error}
        code={resolved.errorCode}
        action={<Link href="/projects" className="btn-secondary">Kembali ke daftar proyek</Link>}
      />
    );
  }

  const workspace = await loadProjectEditor(ctx.db, ctx.actor, resolved.data.id);
  if (!workspace.ok) {
    return (
      <ErrorState
        title="lembar kerja tidak dapat dimuat"
        message={workspace.error}
        code={workspace.errorCode}
        action={<Link href="/projects" className="btn-secondary">Kembali ke daftar proyek</Link>}
      />
    );
  }

  return <ProjectWorkspace projectId={resolved.data.id} view={workspace.data} />;
}
