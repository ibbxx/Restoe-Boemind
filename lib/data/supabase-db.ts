/**
 * Supabase implementation of the Database port (PostgREST under the hood).
 *
 * RLS is enforced by PostgreSQL here — this adapter never adds a "role" filter
 * of its own, so the database stays the security boundary (Phase 3 §21).
 *
 * `numeric` columns come back from PostgREST as STRINGS. They are returned as
 * received and normalised in the services with `toNumber()`; that keeps the
 * adapter free of schema knowledge and makes the string/number handling
 * identical for every table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DatabaseError,
  type Database,
  type Filter,
  type QueryResult,
  type SelectOptions,
  type TableName,
} from "./db";

type Row = Record<string, unknown>;

interface PostgrestLike {
  select: (columns?: string, opts?: Record<string, unknown>) => PostgrestLike;
  insert: (values: Row) => PostgrestLike;
  update: (patch: Row) => PostgrestLike;
  delete: () => PostgrestLike;
  eq: (column: string, value: unknown) => PostgrestLike;
  neq: (column: string, value: unknown) => PostgrestLike;
  gt: (column: string, value: unknown) => PostgrestLike;
  gte: (column: string, value: unknown) => PostgrestLike;
  lt: (column: string, value: unknown) => PostgrestLike;
  lte: (column: string, value: unknown) => PostgrestLike;
  in: (column: string, values: unknown[]) => PostgrestLike;
  is: (column: string, value: null) => PostgrestLike;
  ilike: (column: string, pattern: string) => PostgrestLike;
  or: (filters: string) => PostgrestLike;
  order: (column: string, opts?: { ascending?: boolean }) => PostgrestLike;
  range: (from: number, to: number) => PostgrestLike;
  limit: (n: number) => PostgrestLike;
  single: () => PostgrestLike;
  maybeSingle: () => PostgrestLike;
  then: Promise<{ data: unknown; error: unknown; count?: number | null }>["then"];
}

function quoteIn(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const s = String(value);
  return /[",()]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

function applyFilter(builder: PostgrestLike, filter: Filter): PostgrestLike {
  switch (filter.op) {
    case "eq":
      return builder.eq(filter.column, filter.value);
    case "neq":
      return builder.neq(filter.column, filter.value);
    case "gt":
      return builder.gt(filter.column, filter.value);
    case "gte":
      return builder.gte(filter.column, filter.value);
    case "lt":
      return builder.lt(filter.column, filter.value);
    case "lte":
      return builder.lte(filter.column, filter.value);
    case "in":
      return builder.in(filter.column, (filter.value as unknown[]) ?? []);
    case "is":
      return builder.is(filter.column, filter.value as null);
    case "ilike":
      return builder.ilike(filter.column, String(filter.value));
    default:
      throw new DatabaseError("projects", `operator filter tidak dikenal: ${String(filter.op)}`);
  }
}

function orExpression(filters: Filter[]): string {
  return filters
    .map((f) => `${f.column}.${f.op}.${quoteIn(f.value)}`)
    .join(",");
}

export function createSupabaseDatabase(client: SupabaseClient): Database {
  function from(table: TableName): PostgrestLike {
    return client.from(table) as unknown as PostgrestLike;
  }

  async function run<T>(
    table: TableName,
    op: string,
    builder: PostgrestLike,
  ): Promise<{ data: T; count: number }> {
    const { data, error, count } = await builder;
    if (error) {
      const detail =
        typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
      throw new DatabaseError(table, detail, `Gagal ${op} pada "${table}": ${detail}`);
    }
    return { data: data as T, count: count ?? 0 };
  }

  return {
    live: true,

    async select<T>(table: TableName, opts: SelectOptions = {}): Promise<QueryResult<T>> {
      let builder = from(table).select("*", { count: opts.count === false ? undefined : "exact" });
      for (const filter of opts.where ?? []) builder = applyFilter(builder, filter);
      if (opts.or && opts.or.length > 0) builder = builder.or(orExpression(opts.or));
      for (const order of opts.order ?? []) {
        builder = builder.order(order.column, { ascending: order.ascending !== false });
      }
      if (opts.range) builder = builder.range(opts.range.from, opts.range.to);
      else if (opts.limit !== undefined) builder = builder.limit(opts.limit);

      const { data, count } = await run<T[]>(table, "select", builder);
      const rows = Array.isArray(data) ? (data as Row[]) : data ? [data as Row] : [];
      return { rows: rows as T[], count: count || rows.length };
    },

    async insert<T>(table: TableName, values: Record<string, unknown>): Promise<T> {
      const { data } = await run<T>(table, "insert", from(table).insert(values).select().single());
      return data;
    },

    async update<T>(table: TableName, id: string, patch: Record<string, unknown>): Promise<T> {
      const { data } = await run<T>(
        table,
        "update",
        from(table).update(patch).eq("id", id).select().single(),
      );
      return data;
    },

    async remove(table: TableName, id: string): Promise<void> {
      await run<null>(table, "delete", from(table).delete().eq("id", id));
    },
  } satisfies Database;
}
