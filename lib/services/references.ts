/**
 * Reference data for forms (customers, products, markets, profiles, vendors).
 *
 * These ARE real master rows from the database. They are not sample/dummy data:
 * when a table is empty the form shows an empty select and the screen explains
 * that the reference must be created first.
 */

import { eq, type Database } from "../data/db";
import { can } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Customer, Market, Product, Profile, Vendor } from "../types/domain";
import { toActionResultError, ok, type ActionResult } from "./result";

export interface ReferenceData {
  customers: Customer[];
  products: Product[];
  markets: Market[];
  profiles: Profile[];
}

export async function loadReferenceData(db: Database): Promise<ActionResult<ReferenceData>> {
  try {
    const [customers, products, markets, profiles] = await Promise.all([
      db.select<Customer>("customers", { order: [{ column: "name", ascending: true }] }),
      db.select<Product>("products", { order: [{ column: "code", ascending: true }] }),
      db.select<Market>("markets", { order: [{ column: "name", ascending: true }] }),
      db.select<Profile>("profiles", { order: [{ column: "full_name", ascending: true }] }),
    ]);

    return ok({
      customers: customers.rows,
      products: products.rows,
      markets: markets.rows,
      profiles: profiles.rows,
    });
  } catch (e) {
    return toActionResultError(e, "customers");
  }
}

export async function listVendorOptions(db: Database): Promise<ActionResult<Vendor[]>> {
  try {
    const { rows } = await db.select<Vendor>("vendors", {
      where: [eq("status", "ACTIVE")],
      order: [{ column: "name", ascending: true }],
    });
    return ok(rows);
  } catch (e) {
    return toActionResultError(e, "vendors");
  }
}

/**
 * Free-text reference resolution for the project form.
 *
 * The form fields are typed by hand instead of
 * picked from a dropdown, so what reaches the server action is human text —
 * "PT Tonasa", "HSD", "pic@test.local". The target columns are uuid FKs, so
 * this maps the typed text back to the master row id BEFORE the project write.
 * A writable actor may create a new customer, product, or market here, so the
 * form stays fully manual while the FK contract remains intact. PIC remains
 * lookup-only because it points to an authenticated profile.
 *
 * A term resolves through an exact id or exact label. We intentionally do not
 * use fuzzy/contains matching: a value such as "solar" must not silently
 * attach to one of several products. When a writable actor enters a value
 * that is not an exact existing row, customer/product/market are created as
 * new master rows and the resulting UUID is used for the project FK. PIC is
 * still lookup-only because it must point to an authenticated profile.
 */
export interface ProjectReferenceTerms {
  customer?: string | null;
  product?: string | null;
  market?: string | null;
  pic?: string | null;
}

export interface ProjectReferenceIds {
  customer_id: string | null;
  product_id: string | null;
  market_id: string | null;
  pic_id: string | null;
}

interface Candidate {
  id: string;
  labels: string[];
}

function matchExactTerm(
  term: string,
  candidates: Candidate[],
  fieldLabel: string,
): { id: string | null; error?: string } {
  const trimmed = term.trim();
  if (trimmed === "") return { id: null };

  const needle = trimmed.toLowerCase();

  const byId = candidates.find((c) => c.id.toLowerCase() === needle);
  if (byId) return { id: byId.id };

  const exact = candidates.filter((c) => c.labels.some((l) => l.trim().toLowerCase() === needle));
  if (exact.length === 1) return { id: exact[0]!.id };
  if (exact.length > 1) {
    return { id: null, error: `${fieldLabel} "${trimmed}" cocok dengan lebih dari satu data master.` };
  }

  return {
    id: null,
    error: `${fieldLabel} "${trimmed}" tidak ditemukan di master data.`,
  };
}

const empty = <T,>(): Promise<{ rows: T[]; count: number }> => Promise.resolve({ rows: [], count: 0 });

export async function resolveProjectReferences(
  db: Database,
  terms: ProjectReferenceTerms,
  actor?: Actor,
): Promise<{ ids: ProjectReferenceIds; fieldErrors: Record<string, string> }> {
  const ids: ProjectReferenceIds = { customer_id: null, product_id: null, market_id: null, pic_id: null };
  const fieldErrors: Record<string, string> = {};

  const want = {
    customer: terms.customer?.trim() ?? "",
    product: terms.product?.trim() ?? "",
    market: terms.market?.trim() ?? "",
    pic: terms.pic?.trim() ?? "",
  };

  const [customers, products, markets, profiles] = await Promise.all([
    want.customer
      ? db.select<{ id: string; name: string }>("customers")
      : empty<{ id: string; name: string }>(),
    want.product
      ? db.select<{ id: string; code: string; name: string }>("products")
      : empty<{ id: string; code: string; name: string }>(),
    want.market
      ? db.select<{ id: string; name: string }>("markets")
      : empty<{ id: string; name: string }>(),
    want.pic
      ? db.select<{ id: string; full_name: string | null; email: string }>("profiles")
      : empty<{ id: string; full_name: string | null; email: string }>(),
  ]);

  const apply = (key: keyof ProjectReferenceTerms, idField: keyof ProjectReferenceIds, result: { id: string | null; error?: string }) => {
    if (result.error) fieldErrors[key] = result.error;
    else ids[idField] = result.id;
  };

  const canCreateMaster = actor ? can("write_master_data", actor.role) : false;

  if (want.customer) {
    const match = matchExactTerm(want.customer, customers.rows.map((c) => ({ id: c.id, labels: [c.name] })), "Pelanggan");
    if (canCreateMaster && !match.id) {
      const created = await db.insert<{ id: string }>("customers", { name: want.customer });
      ids.customer_id = created.id;
    } else {
      apply("customer", "customer_id", match);
    }
  }

  if (want.product) {
    const match = matchExactTerm(want.product, products.rows.map((p) => ({ id: p.id, labels: [`${p.code} — ${p.name}`, p.code, p.name] })), "Produk");
    if (canCreateMaster && !match.id) {
      const [rawCode, ...nameParts] = want.product.split("—").map((part) => part.trim());
      const name = nameParts.join(" — ").trim() || want.product;
      const baseCode = (rawCode || want.product).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40).toUpperCase() || "MANUAL";
      const existingCodes = await db.select<{ code: string }>("products", { where: [{ column: "code", op: "eq", value: baseCode }] });
      const code = existingCodes.rows.length === 0 ? baseCode : `${baseCode}-${Date.now().toString(36).slice(-4)}`;
      const created = await db.insert<{ id: string }>("products", { code, name, unit: "liter" });
      ids.product_id = created.id;
    } else {
      apply("product", "product_id", match);
    }
  }

  if (want.market) {
    const match = matchExactTerm(want.market, markets.rows.map((m) => ({ id: m.id, labels: [m.name] })), "Lokasi / Pasar");
    if (canCreateMaster && !match.id) {
      const created = await db.insert<{ id: string }>("markets", { name: want.market });
      ids.market_id = created.id;
    } else {
      apply("market", "market_id", match);
    }
  }

  if (want.pic) {
    apply(
      "pic",
      "pic_id",
      matchExactTerm(
        want.pic,
        profiles.rows.map((p) => ({ id: p.id, labels: [p.full_name, p.email].filter((l): l is string => Boolean(l)) })),
        "PIC",
      ),
    );
  }

  return { ids, fieldErrors };
}

export async function listVendorOptionsIncludingInactive(db: Database): Promise<ActionResult<Vendor[]>> {
  try {
    const { rows } = await db.select<Vendor>("vendors", {
      order: [{ column: "name", ascending: true }],
    });
    return ok(rows);
  } catch (e) {
    return toActionResultError(e, "vendors");
  }
}
