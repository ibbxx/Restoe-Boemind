/**
 * In-memory implementation of the Database port.
 *
 * Used ONLY by tests (never by the application): it lets the full user workflow
 * — project → vendor → price → AHS → scenario → comparison → history — run
 * end-to-end through the REAL services without a hosted Supabase.
 *
 * It deliberately mimics the parts of PostgREST/Supabase semantics the services
 * rely on:
 *   - `numeric` columns are returned as NUMBERS (PostgREST returns strings; the
 *     Supabase adapter normalises them the same way — see supabase-db.ts),
 *   - filters/order/range/count behave like `.eq/.ilike/.in/.order/.range`,
 *   - unknown columns throw instead of silently matching everything.
 *
 * It does NOT emulate RLS or triggers: those live in the database and are
 * covered by `npm run validate:supabase`.
 */

import type { Database, Filter, OrderBy, QueryResult, SelectOptions, TableName } from "./db";

export type Row = Record<string, unknown>;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

export function resetMemoryIds(): void {
  counter = 0;
}

/**
 * Menaikkan counter id agar id berikutnya berada DI ATAS `minValue`.
 *
 * Dipakai adapter lokal yang datanya bertahan di disk: counter proses selalu
 * mulai dari 0, sedangkan store sudah berisi id dari proses-proses sebelumnya.
 * Tanpa ini, insert berikutnya memakai ulang id yang sudah ada di tabel lain
 * (`update`/`remove` mencocokkan id), sehingga baris lain bisa ikut terhapus.
 */
export function advanceMemoryIds(minValue: number): void {
  if (Number.isFinite(minValue) && minValue > counter) counter = minValue;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b), "id-ID", { numeric: true });
}

function matches(row: Row, filter: Filter): boolean {
  if (!(filter.column in row)) {
    throw new Error(
      `memory-db: kolom "${filter.column}" tidak ada pada baris (kolom tersedia: ${Object.keys(row).join(", ")}).`,
    );
  }
  const value = row[filter.column];
  const target = filter.value;
  switch (filter.op) {
    case "eq":
      return value === target;
    case "neq":
      return value !== target;
    case "gt":
      return compareValues(value, target) > 0;
    case "gte":
      return compareValues(value, target) >= 0;
    case "lt":
      return compareValues(value, target) < 0;
    case "lte":
      return compareValues(value, target) <= 0;
    case "in":
      return Array.isArray(target) && target.includes(value);
    case "is":
      return target === null ? value === null || value === undefined : value === target;
    case "ilike": {
      const pattern = String(target);
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped.replace(/%+/g, ".*")}$`, "i");
      return regex.test(String(value ?? ""));
    }
    default:
      return false;
  }
}

export interface MemoryDatabaseOptions {
  /** Seed rows per table. Keys must be real column names. */
  seed?: Partial<Record<TableName, Row[]>>;
  /** Simulate a failed request (Phase 3 §23: "failed database request"). */
  failOn?: TableName[];
}

export function createMemoryDatabase(options: MemoryDatabaseOptions = {}): Database {
  const tables = new Map<TableName, Row[]>();
  for (const [table, rows] of Object.entries(options.seed ?? {})) {
    tables.set(table as TableName, (rows ?? []).map((r) => ({ ...r })));
  }
  const failOn = new Set<TableName>(options.failOn ?? []);

  function table(name: TableName): Row[] {
    let rows = tables.get(name);
    if (!rows) {
      rows = [];
      tables.set(name, rows);
    }
    return rows;
  }

  function guard(name: TableName, op: string): void {
    if (failOn.has(name)) {
      throw new Error(`memory-db: simulated failure on ${op} "${name}".`);
    }
  }

  return {
    live: false,

    async select<T>(name: TableName, opts: SelectOptions = {}): Promise<QueryResult<T>> {
      guard(name, "select");
      let rows = table(name).filter((row) => {
        const andOk = (opts.where ?? []).every((f) => matches(row, f));
        const orOk =
          !opts.or || opts.or.length === 0 ? true : opts.or.some((f) => matches(row, f));
        return andOk && orOk;
      });

      const total = rows.length;

      for (const order of [...(opts.order ?? [])].reverse()) {
        rows = stableSort(rows, order);
      }

      if (opts.range) {
        rows = rows.slice(opts.range.from, opts.range.to + 1);
      } else if (opts.limit !== undefined) {
        rows = rows.slice(0, opts.limit);
      }

      return { rows: clone(rows) as T[], count: opts.count ? total : total };
    },

    async insert<T>(name: TableName, values: Record<string, unknown>): Promise<T> {
      guard(name, "insert");
      const now = new Date().toISOString();
      const row: Row = {
        id: (values.id as string) ?? nextId(),
        created_at: (values.created_at as string) ?? now,
        ...values,
      };
      if ("updated_at" in row || name !== "project_history") {
        row.updated_at = (values.updated_at as string) ?? now;
      }
      table(name).push(row);
      return clone(row) as T;
    },

    async update<T>(name: TableName, id: string, patch: Record<string, unknown>): Promise<T> {
      guard(name, "update");
      const rows = table(name);
      const index = rows.findIndex((r) => r.id === id);
      if (index === -1) throw new Error(`memory-db: baris ${id} tidak ditemukan pada "${name}".`);
      const current = rows[index]!;
      const next: Row = { ...current, ...patch };
      if ("updated_at" in current) next.updated_at = new Date().toISOString();
      rows[index] = next;
      return clone(next) as T;
    },

    async remove(name: TableName, id: string): Promise<void> {
      guard(name, "delete");
      const rows = table(name);
      const index = rows.findIndex((r) => r.id === id);
      if (index === -1) return;
      rows.splice(index, 1);
    },
  } satisfies Database;
}

function stableSort(rows: Row[], order: OrderBy): Row[] {
  const ascending = order.ascending !== false;
  return [...rows]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const c = compareValues(a.row[order.column], b.row[order.column]);
      if (c === 0) return a.index - b.index;
      return ascending ? c : -c;
    })
    .map((entry) => entry.row);
}
