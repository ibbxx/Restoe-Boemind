import Link from "next/link";

import { formatDateTime, formatNumber } from "@/lib/format";
import type { ProjectListRowView } from "@/lib/services/projects";
import { statusTone } from "@/lib/project-status";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/types/domain";
import { Badge } from "@/components/shared/primitives";
import { ProjectDeleteButton } from "@/components/project/project-delete-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function projectHref(code: string) {
  return `/projects/${encodeURIComponent(code)}`;
}

function ProjectStatus({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{PROJECT_STATUS_LABELS[status] ?? status}</Badge>;
}

export function ProjectTable({ rows, canDelete }: { rows: ProjectListRowView[]; canDelete: boolean }) {
  return (
    <>
      <div className="hidden overflow-x-auto xl:block">
        <Table className="projects-table table-fixed">
          <TableCaption className="sr-only">Daftar proyek</TableCaption>
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[20%]" />
            <col className="w-[17%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            {canDelete ? <col className="w-[12%]" /> : null}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Proyek</TableHead>
              <TableHead scope="col">Pelanggan / lokasi</TableHead>
              <TableHead scope="col">Produk / volume</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Diperbarui</TableHead>
              {canDelete ? <TableHead scope="col" className="text-right">Aksi</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={projectHref(row.code)} className="projects-title-link">
                    {row.name}
                  </Link>
                  <span className="projects-meta mt-1 block">
                    {row.code}{row.period_label ? ` · ${row.period_label}` : ""}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="block text-ink-800">{row.customer_name ?? "—"}</span>
                  {row.location ? <span className="projects-meta mt-1 block">{row.location}</span> : null}
                </TableCell>
                <TableCell>
                  <span className="block text-ink-800">{row.product_label ?? "—"}</span>
                  {row.volume !== null ? <span className="projects-meta mt-1 block">{formatNumber(row.volume)} L</span> : null}
                </TableCell>
                <TableCell><ProjectStatus status={row.status} /></TableCell>
                <TableCell className="text-xs text-ink-600">{formatDateTime(row.updated_at)}</TableCell>
                {canDelete ? (
                  <TableCell className="text-right">
                    <ProjectDeleteButton projectId={row.id} projectName={row.name} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="projects-list xl:hidden" aria-label="Daftar proyek">
        {rows.map((row) => (
          <li key={row.id} className="projects-list-item">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={projectHref(row.code)} className="projects-title-link">
                  {row.name}
                </Link>
                <span className="projects-meta mt-1 block">
                  {row.code}{row.period_label ? ` · ${row.period_label}` : ""}
                </span>
              </div>
              <ProjectStatus status={row.status} />
            </div>
            <dl className="projects-list-details">
              <div>
                <dt>Pelanggan</dt>
                <dd>{row.customer_name ?? "—"}</dd>
              </div>
              <div>
                <dt>Lokasi</dt>
                <dd>{row.location ?? "—"}</dd>
              </div>
              <div>
                <dt>Produk</dt>
                <dd>{row.product_label ?? "—"}</dd>
              </div>
              <div>
                <dt>Volume</dt>
                <dd>{row.volume === null ? "—" : `${formatNumber(row.volume)} L`}</dd>
              </div>
            </dl>
            <div className="projects-list-footer">
              <span>Diperbarui {formatDateTime(row.updated_at)}</span>
              {canDelete ? <ProjectDeleteButton projectId={row.id} projectName={row.name} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** GET-based filters keep the current view shareable. */
export function ProjectFilterBar({
  search,
  status,
  hasFilters,
}: {
  search: string;
  status: string;
  hasFilters: boolean;
}) {
  return (
    <form className="projects-filter-bar" method="get" role="search" aria-label="Filter proyek">
      <label className="min-w-0">
        <span className="field-label">Cari proyek</span>
        <Input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Nama atau kode proyek"
        />
      </label>

      <label className="min-w-0">
        <span className="field-label">Status</span>
        <select className="input" name="status" defaultValue={status}>
          <option value="">Semua status</option>
          {PROJECT_STATUSES.map((projectStatus) => (
            <option key={projectStatus} value={projectStatus}>
              {PROJECT_STATUS_LABELS[projectStatus]}
            </option>
          ))}
        </select>
      </label>

      <div className="projects-filter-actions">
        <Button type="submit">Terapkan</Button>
        {hasFilters ? <Link href="/projects" className={buttonVariants({ variant: "outline" })}>Atur ulang</Link> : null}
      </div>
    </form>
  );
}
