import { revalidatePath } from "next/cache";

/** Keep mutation invalidation aligned with the canonical App Router routes. */
export function revalidateProject(
  _projectId: string,
): void {
  revalidatePath("/projects/[code]", "layout");
}

export function revalidateCollection(path: "/projects"): void {
  revalidatePath(path);
}
