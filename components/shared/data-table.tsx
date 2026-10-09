import Link from "next/link";

import type { Page } from "@/lib/services/pagination";
import { formatNumber } from "@/lib/format";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Right-align numeric columns and use the tabular figure class. */
  numeric?: boolean;
  className?: string;
  headerClassName?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  emptyMessage = "Tidak ada data.",
  caption,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  emptyMessage?: string;
  caption?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-ink-500" data-testid="table-empty">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${column.numeric ? "text-right" : ""} ${column.headerClassName ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={rowKey(row)} className={href ? "cursor-pointer" : ""}>
                {columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={`${column.numeric ? "num" : ""} ${column.className ?? ""}`}
                  >
                    {href && index === 0 ? (
                      <Link href={href} className="font-medium text-accent-700 hover:underline">
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  basePath,
  params,
}: {
  page: Page<unknown>;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const link = (target: number) => {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== "") searchParams.set(key, value);
    }
    searchParams.set("page", String(target));
    return `${basePath}?${searchParams.toString()}`;
  };

  if (page.total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-3 py-2 text-xs text-ink-600">
      <span>
        Menampilkan <span className="font-mono">{formatNumber(page.from)}</span>–
        <span className="font-mono">{formatNumber(page.to)}</span> dari{" "}
        <span className="font-mono">{formatNumber(page.total)}</span>
      </span>
      <div className="flex items-center gap-1">
        <PageLink disabled={page.page <= 1} href={link(page.page - 1)}>
          ← Sebelumnya
        </PageLink>
        <span className="px-2 font-mono">
          {page.page} / {page.totalPages}
        </span>
        <PageLink disabled={page.page >= page.totalPages} href={link(page.page + 1)}>
          Selanjutnya →
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  disabled,
  href,
  children,
}: {
  disabled: boolean;
  href: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-ink-200 px-2 py-1 text-ink-400" aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="rounded-md border border-ink-300 px-2 py-1 hover:bg-ink-100">
      {children}
    </Link>
  );
}
