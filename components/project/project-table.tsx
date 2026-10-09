import Link from "next/link";

import { formatDateTime, formatNumber } from "@/lib/format";
import {
  statusTone,
  type ProjectListRowView,
} from "@/lib/services/projects";
import { PROJECT_STATUSES } from "@/lib/types/domain";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/shared/primitives";
import { ProjectDeleteButton } from "@/components/project/project-delete-button";

function columns(canDelete: boolean): Array<Column<ProjectListRowView>> {
  return [
  {
    key: "project",
    header: "Project",
    cell: (row) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink-900">{row.name}</div>
        <div className="font-mono text-2xs text-ink-500">
          {row.code}
          {row.period_label ? ` · ${row.period_label}` : ""}
        </div>
      </div>
    ),
  },
  { key: "customer", header: "Customer", cell: (row) => row.customer_name ?? "—" },
  { key: "product", header: "Product", cell: (row) => row.product_label ?? "—" },
  { key: "location", header: "Location", cell: (row) => row.location ?? "—" },
  {
    key: "volume",
    header: "Volume",
    numeric: true,
    cell: (row) =>
      row.volume === null ? <span className="text-ink-400">—</span> : `${formatNumber(row.volume)} L`,
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
  },
  {
    key: "updated",
    header: "Updated",
    cell: (row) => <span className="text-xs">{formatDateTime(row.updated_at)}</span>,
  },
    ...(canDelete
      ? [
          {
            key: "actions",
            header: "Aksi",
            cell: (row) => <ProjectDeleteButton projectId={row.id} projectName={row.name} />,
          } satisfies Column<ProjectListRowView>,
        ]
      : []),
  ];
}

export function ProjectTable({ rows, canDelete }: { rows: ProjectListRowView[]; canDelete: boolean }) {
  return (
    <DataTable
      columns={columns(canDelete)}
      rows={rows}
      rowKey={(row) => row.id}
      rowHref={(row) => `/projects/${row.id}`}
      caption="Daftar project"
      emptyMessage="Tidak ada project yang cocok dengan filter."
    />
  );
}

/** GET-based filter bar: no client JS needed, and the URL is shareable. */
export function ProjectFilterBar({
  search,
  status,
}: {
  search: string;
  status: string;
}) {
  return (
    <form className="flex flex-wrap items-end gap-2 border-b border-ink-200 px-3 py-3" method="get">
      <label className="min-w-[240px] flex-1">
        <span className="field-label">Search</span>
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Project code / name"
        />
      </label>

      <label>
        <span className="field-label">Status</span>
        <select className="input" name="status" defaultValue={status}>
          <option value="">Semua</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn-primary">
          Cari
        </button>
        <Link href="/projects" className="btn-ghost">
          Reset
        </Link>
      </div>
    </form>
  );
}
