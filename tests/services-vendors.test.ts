/**
 * VENDOR SERVICE TESTS (Phase 3 §26: Create / Assign / Price / Comparison PASS).
 *
 * The arithmetic assertions are engine values (F001 / F002A / F002B); the
 * service must not compute PPN or ALL IN on its own.
 */

import { describe, expect, it } from "vitest";

import {
  addVendorToProject,
  buildVendorComparison,
  computeVendorPrice,
  listProjectVendors,
  listVendors,
  removeVendorFromProject,
  saveVendorPrice,
} from "../lib/services/vendors";
import { calculateVendorAllIn, calculateVendorPpn } from "../lib/calculations/vendor";
import { actor, makeDb, seedBase, UUIDS } from "./helpers/db";
import type { VendorPrice } from "../lib/types/domain";

const PROC = actor("PROCUREMENT", UUIDS.procurement);

describe("Vendor master", () => {
  it("lists vendors with usage counts", async () => {
    const db = makeDb(seedBase());
    const list = await listVendors(db, PROC, {});
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.data.total).toBe(2);
      expect(list.data.rows.map((r) => r.vendor.name)).toEqual(["BLASDU", "MEGA UTAMA"]);
    }
  });

  it("searches master data across name/contact/armada/permit", async () => {
    const db = makeDb(seedBase());
    const list = await listVendors(db, PROC, { search: "budi" });
    if (list.ok) {
      expect(list.data.total).toBe(1);
      expect(list.data.rows[0]?.vendor.name).toBe("BLASDU");
    }
  });
});

describe("Assign vendor to project", () => {
  it("adds the vendor to a project", async () => {
    const db = makeDb(seedBase());
    const result = await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1, "armada siap");
    expect(result.ok).toBe(true);

    const listed = await listProjectVendors(db, PROC, UUIDS.projectA);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0]?.vendor.name).toBe("BLASDU");
      expect(listed.data[0]?.availability).toBe("1.500 KL · 12 unit");
      expect(listed.data[0]?.price).toBeNull();
    }
  });

  it("refuses a duplicate assignment", async () => {
    const db = makeDb(seedBase());
    await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1);
    const again = await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.errorCode).toBe("INVALID_INPUT");
  });

  it("refuses assignment for a read-only membership", async () => {
    const db = makeDb(seedBase());
    const result = await addVendorToProject(db, actor("VIEWER", UUIDS.viewer), UUIDS.projectA, UUIDS.vendor1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("NOT_FOUND");
  });

  it("removes a vendor from a project", async () => {
    const db = makeDb(seedBase());
    const added = await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor2);
    if (!added.ok) throw new Error("add failed");
    const removed = await removeVendorFromProject(db, PROC, UUIDS.projectA, added.data.id);
    expect(removed.ok).toBe(true);
    const listed = await listProjectVendors(db, PROC, UUIDS.projectA);
    if (listed.ok) expect(listed.data).toHaveLength(0);
  });
});

describe("Vendor price: engine-backed PPN and ALL IN", () => {
  it("computes PPN with F001 and ALL IN with F002B by default", () => {
    const computed = computeVendorPrice({ base_price: 16396.39, ppn_rate: 0.11 });
    expect(computed.ok).toBe(true);
    if (!computed.ok) return;
    expect(computed.data.ppn).toBeCloseTo(calculateVendorPpn(16396.39, 0.11), 10);
    expect(computed.data.all_in).toBeCloseTo(
      calculateVendorAllIn({ base_price: 16396.39, ppn: computed.data.ppn }, "F002B"),
      10,
    );
    expect(computed.data.all_in_formula_id).toBe("F002B");
    expect(computed.data.ppn_formula_id).toBe("F001");
  });

  it("keeps F002A and F002B as separate formulas", () => {
    const a = computeVendorPrice({ base_price: 1000, ppn_rate: 0.11, bph_amount: 50, all_in_variant: "F002A" });
    const b = computeVendorPrice({ base_price: 1000, ppn_rate: 0.11, bph_amount: 50, all_in_variant: "F002B" });
    if (a.ok && b.ok) {
      expect(a.data.all_in_formula_id).toBe("F002A");
      expect(b.data.all_in_formula_id).toBe("F002B");
      expect(b.data.all_in - a.data.all_in).toBeCloseTo(50, 10);
    }
  });

  it("treats a typed PPN literal as DATA instead of a formula (Excel behaviour)", () => {
    const computed = computeVendorPrice({
      base_price: 1000,
      ppn_is_formula: false,
      ppn_amount: 123.45,
    });
    expect(computed.ok).toBe(true);
    if (computed.ok) {
      expect(computed.data.ppn).toBe(123.45);
      expect(computed.data.ppn_formula_id).toBe("TYPED_LITERAL");
    }
  });

  it("reports a missing vendor price instead of Rp 0 (PRD §11)", async () => {
    const db = makeDb(seedBase());
    await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1);
    const result = await saveVendorPrice(db, PROC, UUIDS.projectA, UUIDS.vendor1, { base_price: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("MISSING_VENDOR_PRICE");
      expect(result.fieldErrors?.base_price).toBeTruthy();
    }
    const rows = await db.select<VendorPrice>("vendor_prices", { count: true });
    expect(rows.count).toBe(0);
  });

  it("stores the engine output and keeps missing components null", async () => {
    const db = makeDb(seedBase());
    await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1);
    const result = await saveVendorPrice(db, PROC, UUIDS.projectA, UUIDS.vendor1, {
      base_price: 16396.39,
      ppn_rate: 0.11,
      note: "harga awal",
      reason: "input harga vendor",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.ppn_amount).toBeCloseTo(1803.6029, 4);
    expect(result.data.all_in_amount).toBeCloseTo(16396.39 + 1803.6029, 4);
    expect(result.data.pbbkb_amount).toBeNull();
    expect(result.data.pph_amount).toBeNull();
    expect(result.data.all_in_formula_id).toBe("F002B");

    const dbRows = await db.select<VendorPrice>("vendor_prices", { count: true });
    expect(dbRows.count).toBe(1);
  });

  it("updates the existing price row instead of inserting a second one", async () => {
    const db = makeDb(seedBase());
    await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1);
    await saveVendorPrice(db, PROC, UUIDS.projectA, UUIDS.vendor1, { base_price: 16396.39 });
    const second = await saveVendorPrice(db, PROC, UUIDS.projectA, UUIDS.vendor1, {
      base_price: 16000,
      reason: "negosiasi ulang",
    });
    expect(second.ok).toBe(true);
    const rows = await db.select<VendorPrice>("vendor_prices", { count: true });
    expect(rows.count).toBe(1);
    if (second.ok) expect(second.data.base_price).toBe(16000);
  });

  it("refuses to price a vendor for a read-only viewer", async () => {
    const db = makeDb(seedBase());
    const result = await saveVendorPrice(db, actor("VIEWER", UUIDS.viewer), UUIDS.projectA, UUIDS.vendor1, {
      base_price: 1000,
    });
    expect(result.ok).toBe(false);
    expect((await db.select<VendorPrice>("vendor_prices", { count: true })).count).toBe(0);
  });
});

describe("Vendor comparison", () => {
  it("compares component by component and picks the cheapest ALL IN", async () => {
    const db = makeDb(seedBase());
    await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1);
    await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor2);
    await saveVendorPrice(db, PROC, UUIDS.projectA, UUIDS.vendor1, { base_price: 16396.39, oat_amount: 500 });
    await saveVendorPrice(db, PROC, UUIDS.projectA, UUIDS.vendor2, { base_price: 14500, pbbkb_amount: 250 });

    const comparison = await buildVendorComparison(db, PROC, UUIDS.projectA);
    expect(comparison.ok).toBe(true);
    if (!comparison.ok) return;

    const view = comparison.data;
    expect(view.vendors.map((v) => v.name)).toEqual(["BLASDU", "MEGA UTAMA"]);
    expect(view.vendors.every((v) => v.has_price)).toBe(true);
    expect(view.unpriced_indexes).toEqual([]);

    const labels = view.rows.map((r) => r.label);
    expect(labels).toEqual([
      "Base Price",
      "PPN",
      "PBBKB",
      "PPH",
      "OAT",
      "PPN OAT",
      "BPH",
      "ALL IN",
    ]);

    const allIn = view.rows.find((r) => r.label === "ALL IN");
    expect(allIn?.best_index).toBe(1); // MEGA UTAMA (14.500) is cheaper
    expect(allIn?.cells[0]?.value).toBeGreaterThan(allIn?.cells[1]?.value ?? 0);

    const oat = view.rows.find((r) => r.label === "OAT");
    expect(oat?.cells[0]?.value).toBe(500);
    expect(oat?.cells[1]?.value).toBeNull(); // missing, NOT 0
  });

  it("excludes a vendor without a price from the ALL IN comparison", async () => {
    const db = makeDb(seedBase());
    await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1);
    await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor2);
    await saveVendorPrice(db, PROC, UUIDS.projectA, UUIDS.vendor1, { base_price: 16000 });

    const comparison = await buildVendorComparison(db, PROC, UUIDS.projectA);
    if (comparison.ok) {
      expect(comparison.data.priced_indexes).toEqual([0]);
      expect(comparison.data.unpriced_indexes).toEqual([1]);
      expect(comparison.data.vendors[1]?.has_price).toBe(false);
      const allIn = comparison.data.rows.find((r) => r.label === "ALL IN");
      expect(allIn?.cells[1]?.value).toBeNull();
    }
  });

  it("returns an empty comparison for a project without vendors", async () => {
    const db = makeDb(seedBase());
    const comparison = await buildVendorComparison(db, PROC, UUIDS.projectA);
    if (comparison.ok) {
      expect(comparison.data.vendors).toEqual([]);
      expect(comparison.data.priced_indexes).toEqual([]);
    }
  });
});
