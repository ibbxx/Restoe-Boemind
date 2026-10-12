/** Editable Univer spreadsheet for one project. */

import { UniverWorkbookLoader } from "@/components/excel/univer-workbook-loader";

export function ProjectWorkspace({
  projectId,
  view,
}: {
  projectId: string;
  view: { univerWorkbook: Record<string, unknown>; canWrite: boolean; revision?: number; needsMapping?: boolean };
}) {
  return <UniverWorkbookLoader
    projectId={projectId}
    snapshot={view.univerWorkbook}
    canWrite={view.canWrite}
    revision={view.revision}
    needsMapping={view.needsMapping}
  />;
}
