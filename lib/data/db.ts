/**
 * Database port.
 *
 * Services talk to this narrow interface, never to Supabase directly. Two
 * implementations exist:
 *   - lib/data/supabase-db.ts  → real PostgREST calls (RLS enforced by Supabase)
 *   - lib/data/memory-db.ts    → in-memory adapter used ONLY by tests
 *
 * Every service is therefore exercised against the exact same code path that
 * production uses; only the transport differs.
 *
 * RLS NOTE: the Supabase adapter performs raw queries and lets PostgreSQL
 * enforce Row Level Security — the app never appends its own "role" filter as a
 * substitute for RLS. The memory adapter runs *after* that gate, so permission
 * tests assert the service-level guards that mirror RLS (see
 * lib/auth/permissions.ts and tests/permissions.test.ts).
 */

export type TableName =
  | "profiles"
  | "markets"
  | "vendors"
  | "products"
  | "customers"
  | "projects"
  | "project_members"
  | "project_vendors"
  | "vendor_prices"
  | "ahs"
  | "ahs_cost_items"
  | "calculation_templates"
  | "formula_registry"
  | "project_sheets";

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "is"
  | "ilike";

export interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

export interface OrderBy {
  column: string;
  ascending?: boolean;
}

export interface SelectOptions {
  /** All filters are ANDed. */
  where?: Filter[];
  /** Optional OR group: `(f1 OR f2 OR ...) AND <where...>`. */
  or?: Filter[];
  order?: OrderBy[];
  /** 0-based inclusive row range (PostgREST semantics). */
  range?: { from: number; to: number };
  limit?: number;
  /** When true the adapter also returns the total row count ignoring `range`. */
  count?: boolean;
}

export interface QueryResult<T> {
  rows: T[];
  /** Total matching rows (respects `where`, ignores `range`). */
  count: number;
}

export interface Database {
  /** Atomic unit of work. Local adapters roll back thrown errors. */
  transaction?<T>(work: (tx: Database) => Promise<T>): Promise<T>;
  backup?(reason?: string): Promise<string>;
  close?(): Promise<void>;
  readonly local?: boolean;
  select<T = Record<string, unknown>>(
    table: TableName,
    options?: SelectOptions,
  ): Promise<QueryResult<T>>;
  insert<T = Record<string, unknown>>(
    table: TableName,
    values: Record<string, unknown>,
  ): Promise<T>;
  update<T = Record<string, unknown>>(
    table: TableName,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<T>;
  remove(table: TableName, id: string): Promise<void>;
  /** True when the adapter is connected to a real database. */
  readonly live: boolean;
}

export class TransactionAborted extends Error {
  constructor(readonly result: unknown) { super("Transaction aborted"); }
}

/** A failed ActionResult must roll back just like a thrown exception. */
export async function atomic<T>(db: Database, work: (tx: Database) => Promise<T>): Promise<T> {
  if (!db.transaction) return work(db);
  try {
    return await db.transaction(async (tx) => {
      const result = await work(tx);
      if (result && typeof result === "object" && "ok" in result && result.ok === false) {
        throw new TransactionAborted(result);
      }
      return result;
    });
  } catch (error) {
    if (error instanceof TransactionAborted) return error.result as T;
    throw error;
  }
}

export class DatabaseError extends Error {
  readonly table: TableName;
  readonly detail: string;

  constructor(table: TableName, detail: string, message?: string) {
    super(message ?? `Database error pada "${table}": ${detail}`);
    this.name = "DatabaseError";
    this.table = table;
    this.detail = detail;
  }
}

export function eq(column: string, value: unknown): Filter {
  return { column, op: "eq", value };
}

export function inList(column: string, values: unknown[]): Filter {
  return { column, op: "in", value: values };
}

export function ilike(column: string, pattern: string): Filter {
  return { column, op: "ilike", value: pattern };
}

/**
 * Case-insensitive "contains" search across several columns.
 * Returns an OR group for `SelectOptions.or` (an AND would match nothing).
 */
export function searchAcross(columns: string[], term: string): Filter[] | undefined {
  const trimmed = term.trim();
  if (trimmed === "" || columns.length === 0) return undefined;
  return columns.map((c) => ilike(c, `%${trimmed}%`));
}
