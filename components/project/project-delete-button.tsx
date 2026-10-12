"use client";

import { useRouter } from "next/navigation";

import { deleteProjectAction } from "@/lib/actions/projects";
import { AsyncActionButton } from "@/components/shared/forms";

export function ProjectDeleteButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();

  return (
    <AsyncActionButton
      variant="danger"
      label="Hapus"
      pendingLabel="Menghapus…"
      confirmTitle={`Hapus proyek "${projectName}"?`}
      confirmMessage="Proyek beserta data pemasok dan lembar kerjanya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
      action={() => deleteProjectAction(projectId)}
      onDone={(result) => {
        if (result.ok) router.refresh();
      }}
    />
  );
}
