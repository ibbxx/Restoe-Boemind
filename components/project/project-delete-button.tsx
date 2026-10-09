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
      confirmTitle={`Hapus project "${projectName}"?`}
      confirmMessage="The project and its vendor, AHS, scenario, and history data will be deleted. This cannot be undone."
      action={() => deleteProjectAction(projectId)}
      onDone={(result) => {
        if (result.ok) router.refresh();
      }}
    />
  );
}
