/**
 * PROJECT WORKSPACE = SATU LEMBAR KERJA EXCEL.
 *
 * Kiri  (5/12): EVALUASI HARGA VENDOR (kolom vendor dinamis, sel harga bisa
 *               diedit).
 * Kanan (7/12): ANALISIS HARGA SATUAN (AHS) — header blok, rincian harga jual,
 *               blok biaya per kategori, dan laba.
 *
 * Desktop: dua kolom seperti screenshot workbook. Tablet: tiap blok bisa di-scroll
 * horizontal. Mobile: blok bertumpuk (vendor → AHS).
 */

import type { ProjectWorkspaceView } from "@/lib/services/workspace";
import { WorkbookFrame } from "@/components/excel/workbook-frame";
import { GlobalWorkbookGrid } from "@/components/excel/global-workbook-grid";

export function ProjectWorkspace({
  projectId,
  view,
}: {
  projectId: string;
  view: ProjectWorkspaceView;
}) {
  return (
    <WorkbookFrame projectId={projectId} layout={view.workbook} document={view.workbookDoc} canWrite={view.canWrite}>
      <GlobalWorkbookGrid projectId={projectId} layout={view.workbook} document={view.workbookDoc} canWrite={view.canWrite} />
    </WorkbookFrame>
  );
}
