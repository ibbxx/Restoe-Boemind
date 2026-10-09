import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import { getProjectDetail } from "@/lib/services/projects";
import { ProjectHeader } from "@/components/project/project-header";
import { ErrorState } from "@/components/shared/states";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return <ErrorState title="Project tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />;
  }

  const detail = await getProjectDetail(ctx.db, ctx.actor, id);
  if (!detail.ok) {
    return (
      <ErrorState
        title="Project tidak ditemukan"
        code={detail.errorCode}
        message={detail.error}
        action={
          <Link href="/projects" className="btn-secondary">
            Kembali ke daftar project
          </Link>
        }
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
