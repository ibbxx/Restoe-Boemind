import Link from "next/link";

import { PROJECT_ACCESS_LABELS, type ProjectAccess } from "@/lib/auth/permissions";
import { formatDateTime, formatNumber } from "@/lib/format";
import { statusTone, type ProjectDetailView } from "@/lib/services/projects";
import { Badge } from "@/components/shared/primitives";
import { NavTabs, type NavTab } from "@/components/shared/nav";

export function ProjectHeader({ view }: { view: ProjectDetailView }) {
  const project = view.project;

  const fields: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Customer", value: view.customer_name ?? "—" },
    { label: "Product", value: view.product_label ?? "—" },
    { label: "Location", value: project.location ?? "—" },
    {
      label: "Volume",
      value: view.volume === null ? "—" : `${formatNumber(view.volume)} L`,
    },
    { label: "Period", value: project.period_label ?? "—" },
    { label: "PIC", value: view.pic_name ?? "—" },
  ];

  return (
    <div className="mb-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xs text-ink-500">
            <Link href="/projects" className="hover:underline">
              ← Projects
            </Link>
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold text-ink-900">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <Badge tone={statusTone(project.status)}>{project.status}</Badge>
            <Badge tone={view.access === "FULL" ? "accent" : "neutral"}>
              {PROJECT_ACCESS_LABELS[view.access as ProjectAccess] ?? view.access}
            </Badge>
            <span>{view.vendor_count} vendors</span>
            <span aria-hidden="true">·</span>
            <span>{view.scenario_count} scenarios</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatDateTime(project.updated_at)}</span>
          </div>
        </div>
        {view.latest_scenario_id ? (
          <div className="text-right text-2xs text-ink-500">
            <div className="field-label">Latest scenario</div>
            <Badge tone="accent">{view.latest_scenario_name}</Badge>
          </div>
        ) : (
          <div className="text-right text-2xs text-ink-500">
            <div className="field-label">Latest scenario</div>
            <span>None</span>
          </div>
        )}
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-ink-200 bg-white px-4 py-3 md:grid-cols-3 xl:grid-cols-6">
        {fields.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="field-label">{field.label}</dt>
            <dd className="truncate text-sm text-ink-800">{field.value}</dd>
          </div>
        ))}
      </dl>

      <ProjectTabs projectId={project.id} />
    </div>
  );
}

export function ProjectTabs({ projectId }: { projectId: string }) {
  // Vendor & riwayat tidak punya halaman sendiri: harga vendor diisi di
  // workspace dan riwayat perubahan tetap tersimpan otomatis.
  const tabs: NavTab[] = [
    { href: `/projects/${projectId}`, label: "Workspace" },
    { href: `/projects/${projectId}/ahs`, label: "AHS" },
  ];
  return <NavTabs tabs={tabs} exact />;
}
