"use client";

import Link from "next/link";
import { useState } from "react";

import { PROJECT_ACCESS_LABELS, type ProjectAccess } from "@/lib/auth/permissions";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ProjectDetailView } from "@/lib/services/projects";
import { statusTone } from "@/lib/project-status";
import { Badge } from "@/components/shared/primitives";
import { PROJECT_STATUS_LABELS } from "@/lib/types/domain";

export function ProjectHeader({ view }: { view: ProjectDetailView }) {
  const project = view.project;
  const [minimized, setMinimized] = useState(false);

  const fields: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Pelanggan", value: view.customer_name ?? "—" },
    { label: "Produk", value: view.product_label ?? "—" },
    { label: "Lokasi", value: project.location ?? "—" },
    {
      label: "Volume",
      value: view.volume === null ? "—" : `${formatNumber(view.volume)} L`,
    },
    { label: "Periode", value: project.period_label ?? "—" },
    { label: "PIC", value: view.pic_name ?? "—" },
  ];

  return (
    <div className={minimized ? "mb-2" : "mb-4"} data-project-header data-minimized={minimized}>
      <div className={`${minimized ? "mb-0" : "mb-3"} flex flex-wrap items-start justify-between gap-3`}>
        <div className="min-w-0">
          <div className="text-2xs text-ink-500">
            <Link href="/projects" className="hover:underline">
              ← proyek
            </Link>
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold text-ink-900">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <Badge tone={statusTone(project.status)}>{PROJECT_STATUS_LABELS[project.status] ?? project.status}</Badge>
            <Badge tone={view.access === "FULL" ? "accent" : "neutral"}>
              {PROJECT_ACCESS_LABELS[view.access as ProjectAccess] ?? view.access}
            </Badge>
            <span>{view.vendor_count} vendors</span>
            <span aria-hidden="true">·</span>
            <span>Diperbarui {formatDateTime(project.updated_at)}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 p-2"
          onClick={() => setMinimized((current) => !current)}
          aria-expanded={!minimized}
          aria-controls="project-header-content"
          aria-label={minimized ? "Tampilkan detail proyek" : "Minimalkan detail proyek"}
          title={minimized ? "Tampilkan detail proyek" : "Minimalkan detail proyek"}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {minimized ? <path d="m6 9 6 6 6-6" /> : <path d="m18 15-6-6-6 6" />}
          </svg>
        </button>
      </div>

      <div id="project-header-content" className={minimized ? "hidden" : undefined}>
        <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-ink-200 bg-white px-4 py-3 md:grid-cols-3 xl:grid-cols-6">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="field-label">{field.label}</dt>
              <dd className="truncate text-sm text-ink-800">{field.value}</dd>
            </div>
          ))}
        </dl>

      </div>
    </div>
  );
}

