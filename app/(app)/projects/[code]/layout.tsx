import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import { resolveProjectCode, getProjectDetail } from "@/lib/services/projects";
import { ProjectHeader } from "@/components/project/project-header";
import { ErrorState } from "@/components/shared/states";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  const detail = await getProjectDetail(ctx.db, ctx.actor, resolved.data.id);
  if (!detail.ok) {
    return (
      <ErrorState
        title="proyek tidak ditemukan"
        code={detail.errorCode}
        message={detail.error}
        action={<Link href="/projects" className="btn-secondary">Kembali ke daftar proyek</Link>}
      />
    );
  }

  return (
    <>
      <ProjectHeader view={detail.data} />
      {children}
    </>
  );
}
