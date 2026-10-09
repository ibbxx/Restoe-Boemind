import { revalidatePath } from "next/cache";

export interface ProjectRevalidationOptions {
  dashboard?: boolean;
  reports?: boolean;
  ahs?: boolean;
  scenarios?: boolean;
  commercial?: boolean;
  history?: boolean;
}

/** Keep mutation invalidation aligned with the canonical App Router routes. */
export function revalidateProject(
  projectId: string,
  options: ProjectRevalidationOptions = {},
): void {
  revalidatePath(`/projects/${projectId}`);
  if (options.ahs) revalidatePath(`/projects/${projectId}/ahs`);
  if (options.scenarios) revalidatePath(`/projects/${projectId}/scenarios`);
  if (options.commercial) revalidatePath(`/projects/${projectId}/commercial`);
  if (options.history) revalidatePath(`/projects/${projectId}/history`);
  if (options.dashboard) revalidatePath("/dashboard");
  if (options.reports) revalidatePath("/reports");
}

export function revalidateCollection(path: "/projects" | "/reports" | "/dashboard"): void {
  revalidatePath(path);
}
