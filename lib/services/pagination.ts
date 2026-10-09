export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZES = [10, 25, 50, 100];

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 1-based index of the first row on this page (0 when empty). */
  from: number;
  /** 1-based index of the last row on this page (0 when empty). */
  to: number;
}

export function normalisePageSize(size: number | undefined): number {
  if (!size || !Number.isFinite(size)) return DEFAULT_PAGE_SIZE;
  return PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE;
}

export function normalisePage(page: number | undefined): number {
  if (!page || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

/** PostgREST uses an inclusive, 0-based range. */
export function toRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function buildPage<T>(rows: T[], total: number, page: number, pageSize: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
    from: rows.length === 0 ? 0 : (page - 1) * pageSize + 1,
    to: rows.length === 0 ? 0 : (page - 1) * pageSize + rows.length,
  };
}

export function isLastPage(p: Page<unknown>): boolean {
  return p.page >= p.totalPages;
}
