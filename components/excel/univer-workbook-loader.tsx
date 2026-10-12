"use client";

import dynamic from "next/dynamic";

const UniverWorkbook = dynamic(() => import("./univer-workbook"), {
  ssr: false,
  loading: () => <div className="univer-workbook-loading">Membuka lembar kerja…</div>,
});

export function UniverWorkbookLoader(props: {
  projectId: string;
  snapshot: Record<string, unknown>;
  canWrite: boolean;
  revision?: number;
  needsMapping?: boolean;
}) {
  return <UniverWorkbook key={props.projectId} {...props} />;
}
