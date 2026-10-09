/**
 * DYNAMIC SHEETS TESTS — tabel dinamis tanpa mengubah Calculation Engine.
 *
 * Yang diuji:
 *   1. Dokumen default (rincian harga jual + konversi satuan) memakai output
 *      engine & harga vendor sebagai variabel — bukan angka yang ditulis di UI.
 *   2. FORMULA user (termasuk referensi maju antar baris) dihitung di server.
 *   3. Nilai kosong tetap "—" (tidak pernah diam-diam menjadi 0).
 *   4. Mutation tunduk pada guard akses project.
 */

import { describe, expect, it } from "vitest";

import {
  addSheet,
  addSheetColumn,
  addSheetRow,
  buildSheetVariables,
  computeSheets,
  defaultSheetsDoc,
  loadProjectSheets,
  setSheetCell,
  setSheetRowLabel,
  mergeSheetCells,
  unmergeSheetCells,
  setSheetRangeStyle,
  removeSheetColumn,
  parseSheetsDoc,
  resizeWorkbookAxis,
  resetWorkbookAxisSize,
  setWorkbookRangePresentation,
  mergeWorkbookCells,
  insertWorkbookAxis,
  deleteWorkbookAxis,
  type ProjectSheetsView,
} from "../lib/services/sheets";
import { saveVendorPrice, addVendorToProject, setSelectedVendor } from "../lib/services/vendors";
import { actor, makeDb, seedAhs, seedBase, UUIDS } from "./helpers/db";

const PROC = actor("PROCUREMENT", UUIDS.procurement);
const PIC = actor("PIC", UUIDS.pic);

/** Project A dengan AHS, cost item dan satu vendor terpilih. */
async function seedProject() {
  const db = makeDb(seedBase());
  await seedAhs(db, UUIDS.projectA, {
    volume: 15000,
    hargaJualInclude: 22626,
    costLines: [
      { category: "HPP", description: "Harga Dasar", rate: 16396.39, qty: 15000 },
      { category: "PAJAK", description: "PPN 11%", rate: 1803.6, qty: 15000 },
    ],
  });

  const link = await addVendorToProject(db, PROC, UUIDS.projectA, UUIDS.vendor1);
  if (!link.ok) throw new Error(link.error);
  await saveVendorPrice(db, PROC, UUIDS.projectA, UUIDS.vendor1, {
    base_price: 14500,
    ppn_rate: 0.11,
    all_in_variant: "F002B",
  });
  await setSelectedVendor(db, PROC, UUIDS.projectA, link.data.id, true);

  return db;
}

function cell(sheetKey: string, rowRef: string, columnKey: string, view: ProjectSheetsView) {
  const sheet = view.sheets.find((s) => s.key === sheetKey);
  if (!sheet) throw new Error(`sheet ${sheetKey} tidak ada`);
  const row = sheet.rows.find((r) => r.ref === rowRef);
  if (!row) throw new Error(`row ${rowRef} tidak ada di ${sheetKey}`);
  const found = row.cells.find((c) => c.key === columnKey);
  if (!found) throw new Error(`kolom ${columnKey} tidak ada`);
  return found;
}

describe("Dynamic sheets", () => {
  it("adds a named profit point and reloads its formula from the stored document", async () => {
    const db = await seedProject();
    const added = await addSheetRow(db, PROC, UUIDS.projectA, { sheet_key: "poin_perhitungan" });
    if (!added.ok) throw new Error(added.error);
    const row = added.data.sheets.find(s => s.key === "poin_perhitungan")!.rows[0]!;
    const named = await setSheetRowLabel(db, PROC, UUIDS.projectA, { sheet_key: "poin_perhitungan", row_id: row.id, label: "Laba RBI per liter" });
    expect(named.ok).toBe(true);
    await setSheetCell(db, PROC, UUIDS.projectA, { sheet_key: "poin_perhitungan", row_id: row.id, column_key: "nilai", raw: "=net_profit_per_liter*40%" });
    const loaded = await loadProjectSheets(db, PROC, UUIDS.projectA);
    if (!loaded.ok) throw new Error(loaded.error);
    const point = loaded.data.sheets.find(s => s.key === "poin_perhitungan")!.rows[0]!;
    const profit = loaded.data.variables.find(v => v.name === "net_profit_per_liter")!.value!;
    expect(point.label).toBe("Laba RBI per liter");
    expect(point.cells[0]!.expr).toBe("net_profit_per_liter*40%");
    expect(point.cells[0]!.value).toBeCloseTo(profit * 0.4);
  });
  it("persists merge/style, protects content, aliases references, and unmerges without losing anchor", async () => {
    const db = await seedProject();
    const created = await addSheet(db, PROC, UUIDS.projectA, "Merge test");
    if (!created.ok) throw new Error(created.error);
    const sheet = created.data.sheets.at(-1)!;
    const row = sheet.rows[0]!;
    const range = { startRowId: row.id, endRowId: row.id, startColumnKey: "uraian_1", endColumnKey: "uraian_2" };
    const input = { sheet_key: sheet.key, range };
    await setSheetCell(db, PROC, UUIDS.projectA, { sheet_key: sheet.key, row_id: row.id, column_key: "uraian_1", raw: "25" });
    await setSheetCell(db, PROC, UUIDS.projectA, { sheet_key: sheet.key, row_id: row.id, column_key: "uraian_2", raw: "0" });
    expect((await mergeSheetCells(db, PROC, UUIDS.projectA, input)).ok).toBe(false);
    await setSheetCell(db, PROC, UUIDS.projectA, { sheet_key: sheet.key, row_id: row.id, column_key: "uraian_2", raw: "" });
    expect((await mergeSheetCells(db, PROC, UUIDS.projectA, input)).ok).toBe(true);
    expect((await mergeSheetCells(db, PROC, UUIDS.projectA, input)).ok).toBe(false);
    expect((await setSheetCell(db, PROC, UUIDS.projectA, { sheet_key: sheet.key, row_id: row.id, column_key: "uraian_2", raw: "99" })).ok).toBe(false);
    expect((await removeSheetColumn(db, PROC, UUIDS.projectA, { sheet_key: sheet.key, column_key: "uraian_2" })).ok).toBe(false);
    await setSheetRangeStyle(db, PROC, UUIDS.projectA, { ...input, fill: "green" });
    const extended = await addSheetRow(db, PROC, UUIDS.projectA, { sheet_key: sheet.key });
    if (!extended.ok) throw new Error(extended.error);
    const nextRow = extended.data.sheets.at(-1)!.rows.at(-1)!;
    const formula = await setSheetCell(db, PROC, UUIDS.projectA, { sheet_key: sheet.key, row_id: nextRow.id, column_key: "uraian_1", raw: "=SUM(A1:B1)+B1" });
    if (!formula.ok) throw new Error(formula.error);
    expect(formula.data.sheets.at(-1)!.rows.at(-1)!.cells[0]!.value).toBe(50);
    await addSheetColumn(db, PROC, UUIDS.projectA, { sheet_key: sheet.key, label: "Extra" });
    const loaded = await loadProjectSheets(db, PROC, UUIDS.projectA);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.data.doc.version).toBe(5);
    expect(loaded.data.sheets.at(-1)!.merges).toEqual([range]);
    expect(loaded.data.sheets.at(-1)!.styles?.[row.id]?.uraian_2).toBe("green");
    const unmerged = await unmergeSheetCells(db, PROC, UUIDS.projectA, input);
    if (!unmerged.ok) throw new Error(unmerged.error);
    expect(unmerged.data.sheets.at(-1)!.merges).toEqual([]);
    expect(unmerged.data.sheets.at(-1)!.rows[0]!.cells[0]!.value).toBe(25);
    expect(unmerged.data.sheets.at(-1)!.rows[0]!.cells[1]!.value).toBeNull();
    const history = await db.select<{ field: string }>("project_history");
    expect(history.rows.some(h => h.field === `merge:${sheet.key}`)).toBe(true);
    expect(history.rows.some(h => h.field === `style:${sheet.key}`)).toBe(true);
  });

  it("reads legacy documents without modifying their input object", () => {
    const legacy = { version: 1, sheets: [{ key: "old", title: "OLD", rows: [], columns: [] }] };
    const doc = parseSheetsDoc(legacy);
    expect(doc.version).toBe(5);
    expect(doc.workbookFormulas).toEqual({});
    expect(doc.sheets[0]!.merges).toEqual([]);
    expect(doc.sheets[0]!.styles).toEqual({});
    expect(doc.workbook?.columns.length).toBeGreaterThan(1);
    expect(doc.workbook?.rows.length).toBeGreaterThan(1);
    expect(legacy).not.toHaveProperty("sheets.0.merges");
  });

  it("persists v4 coordinate resize, wrap, merge expansion, and delete guards", async () => {
    const db = await seedProject();
    const initial = await loadProjectSheets(db, PROC, UUIDS.projectA);
    if (!initial.ok) throw new Error(initial.error);
    const grid = initial.data.doc.workbook!;
    const firstColumn = grid.columns[0]!;
    const firstRow = grid.rows[0]!;
    const secondColumn = grid.columns[1]!;

    expect((await resizeWorkbookAxis(db, PROC, UUIDS.projectA, { axis: "column", id: firstColumn.id, size: 177 })).ok).toBe(true);
    expect((await resizeWorkbookAxis(db, PROC, UUIDS.projectA, { axis: "row", id: firstRow.id, size: 55 })).ok).toBe(true);
    const range = { startRowId: firstRow.id, endRowId: firstRow.id, startColumnId: firstColumn.id, endColumnId: secondColumn.id };
    expect((await setWorkbookRangePresentation(db, PROC, UUIDS.projectA, { range, wrap: true, fill: "yellow" })).ok).toBe(true);
    expect((await mergeWorkbookCells(db, PROC, UUIDS.projectA, range)).ok).toBe(true);
    const inserted = await insertWorkbookAxis(db, PROC, UUIDS.projectA, { axis: "column", afterId: firstColumn.id });
    if (!inserted.ok) throw new Error(inserted.error);
    const insertedId = inserted.data.doc.workbook!.columns[1]!.id;
    expect(inserted.data.doc.workbook!.merges).toEqual([range]);
    expect((await deleteWorkbookAxis(db, PROC, UUIDS.projectA, { axis: "column", id: insertedId })).ok).toBe(false);

    const reset = await resetWorkbookAxisSize(db, PROC, UUIDS.projectA, { axis: "row", id: firstRow.id, size: 38 });
    if (!reset.ok) throw new Error(reset.error);
    expect(reset.data.doc.workbook!.columns[0]!.size).toBe(177);
    expect(reset.data.doc.workbook!.rows[0]).toMatchObject({ size: 38 });
    expect(reset.data.doc.workbook!.rows[0]!.manual).toBeUndefined();
    expect(reset.data.doc.workbook!.styles[`${firstRow.id}::${firstColumn.id}`]).toMatchObject({ wrap: true, fill: "yellow" });
  });
  it("computes the default sheets from engine output and the selected vendor", async () => {
    const db = await seedProject();
    const loaded = await loadProjectSheets(db, PROC, UUIDS.projectA);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const view = loaded.data;
    const vendorPrice = view.variables.find((v) => v.name === "vendor_harga_dasar");
    expect(vendorPrice?.value).toBeCloseTo(14500, 6);

    // Rincian harga jual: rate = DPP engine, qty = volume, total = rate x qty.
    const dpp = view.variables.find((v) => v.name === "harga_jual_dpp")!.value!;
    const volume = view.variables.find((v) => v.name === "volume")!.value!;
    expect(cell("harga_jual", "harga_dasar", "rate", view).value).toBeCloseTo(dpp, 6);
    expect(cell("harga_jual", "harga_dasar", "qty", view).value).toBeCloseTo(volume, 6);
    expect(cell("harga_jual", "harga_dasar", "total", view).value).toBeCloseTo(dpp * volume, 4);

    // Konversi: harga INU dari harga vendor, biaya dari cost item AHS.
    expect(cell("konversi", "harga_dasar", "harga_inu", view).value).toBeCloseTo(14500, 6);
    expect(cell("konversi", "harga_dasar", "biaya", view).value).toBeCloseTo(16396.39, 6);
    expect(cell("konversi", "ppn", "harga_inu", view).value).toBeCloseTo(14500 * 0.11, 6);
    expect(cell("konversi", "ppn", "biaya", view).value).toBeCloseTo(1803.6, 6);

    // Referensi MAJU: COST JNE = baris COST yang ada di bawahnya.
    const selisihPpn = cell("konversi", "selisih_ppn", "harga_inu", view).value!;
    const bphMigas = cell("konversi", "bph_migas", "harga_inu", view).value!;
    expect(selisihPpn).toBeCloseTo(1803.6 - 14500 * 0.11, 6);
    expect(bphMigas).toBeCloseTo(0.0025 * 16396.39, 6);
    expect(cell("konversi", "cost", "harga_inu", view).value).toBeCloseTo(selisihPpn + bphMigas, 6);
    expect(cell("konversi", "cost_jne", "harga_inu", view).value).toBeCloseTo(selisihPpn + bphMigas, 6);

    // ALL IN = jumlah baris Harga INU di atasnya (komponen kosong diabaikan,
    // seperti sel kosong di Excel — tapi tetap "—", bukan 0).
    expect(cell("konversi", "all_in", "harga_inu", view).value).toBeCloseTo(14500 + 14500 * 0.11, 6);
    expect(cell("konversi", "pbbkb", "harga_inu", view).value).toBeNull();
    expect(cell("konversi", "pbbkb", "harga_inu", view).error).toBeNull();
    expect(cell("konversi", "pbbkb", "harga_inu", view).note).toBeTruthy();
  });

  it("keeps invalid input visible: a typo is an error, not a silent zero", async () => {
    const db = await seedProject();
    const doc = defaultSheetsDoc();
    const variables = buildSheetVariables({
      inputs: null,
      result: null,
      costItems: [],
      vendor: null,
    });
    const sheets = computeSheets(doc, variables);
    for (const sheet of sheets) {
      for (const row of sheet.rows) {
        for (const c of row.cells) {
          expect(c.error === null || typeof c.error === "string").toBe(true);
        }
      }
    }

    const saved = await setSheetCell(db, PROC, UUIDS.projectA, {
      sheet_key: "konversi",
      row_id: "konversi-fee-jne",
      column_key: "harga_inu",
      raw: "angka_salah_ketik * 2",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const broken = cell("konversi", "fee_jne", "harga_inu", saved.data);
    expect(broken.value).toBeNull();
    expect(broken.error).toContain("angka_salah_ketik");
  });

  it("accepts a user-defined formula, row, column and an extra table", async () => {
    const db = await seedProject();

    const formula = await setSheetCell(db, PROC, UUIDS.projectA, {
      sheet_key: "konversi",
      row_id: "konversi-bph-migas",
      column_key: "harga_inu",
      raw: "=harga_dasar_biaya * bph_migas_rate",
    });
    expect(formula.ok).toBe(true);

    const row = await addSheetRow(db, PROC, UUIDS.projectA, { sheet_key: "konversi", label: "Margin INU" });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    const created = row.data.sheets.find((s) => s.key === "konversi")!.rows.at(-1)!;
    expect(created.ref).toBe("margin_inu");

    const filled = await setSheetCell(db, PROC, UUIDS.projectA, {
      sheet_key: "konversi",
      row_id: created.id,
      column_key: "harga_inu",
      raw: "=all_in_biaya - all_in_harga_inu",
    });
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    const margin = cell("konversi", "margin_inu", "harga_inu", filled.data);
    const allInBiaya = cell("konversi", "all_in", "biaya", filled.data).value;
    const allInHargaInu = cell("konversi", "all_in", "harga_inu", filled.data).value;
    if (allInBiaya === null || allInHargaInu === null) throw new Error("ALL IN harus terhitung");
    expect(margin.value).toBeCloseTo(allInBiaya - allInHargaInu, 6);

    const column = await addSheetColumn(db, PROC, UUIDS.projectA, { sheet_key: "konversi", label: "Catatan" });
    expect(column.ok).toBe(true);

    const table = await addSheet(db, PROC, UUIDS.projectA, "Konversi Satuan MUE");
    expect(table.ok).toBe(true);
    if (!table.ok) return;
    expect(table.data.sheets.map((s) => s.key)).toContain("konversi_satuan_mue");
    expect(table.data.sheets).toHaveLength(4);
  });

  it("menerima formula alamat sel ala Excel: B2, sum(B2:B6), dan sel literal", async () => {
    const db = await seedProject();

    // Konversi: A = Harga INU, B = Biaya.
    // A1 (Harga Dasar · Harga INU) = harga vendor 14.500.
    const multiplied = await setSheetCell(db, PROC, UUIDS.projectA, {
      sheet_key: "konversi",
      row_id: "konversi-harga-dasar",
      column_key: "biaya",
      raw: "=A1*2",
    });
    expect(multiplied.ok).toBe(true);
    if (!multiplied.ok) return;
    expect(cell("konversi", "harga_dasar", "biaya", multiplied.data).value).toBeCloseTo(29000, 6);

    // B2 = PPN · Biaya (cost item AHS) => A2 kali 11%.
    const percent = await setSheetCell(db, PROC, UUIDS.projectA, {
      sheet_key: "konversi",
      row_id: "konversi-ppn",
      column_key: "harga_inu",
      raw: "=B2*11%",
    });
    expect(percent.ok).toBe(true);
    if (!percent.ok) return;
    expect(cell("konversi", "ppn", "harga_inu", percent.data).value).toBeCloseTo(1803.6 * 0.11, 6);

    // RANGE: sum(B1:B3) — B1 sudah diubah di langkah pertama, sel kosong
    // (B3 = PBBKB · Biaya) diabaikan seperti sel kosong Excel, bukan 0.
    const ranged = await setSheetCell(db, PROC, UUIDS.projectA, {
      sheet_key: "konversi",
      row_id: "konversi-pph",
      column_key: "biaya",
      raw: "=sum(B1:B3)",
    });
    expect(ranged.ok).toBe(true);
    if (!ranged.ok) return;
    const pphBiaya = cell("konversi", "pph", "biaya", ranged.data);
    expect(pphBiaya.error).toBeNull();
    expect(pphBiaya.value).toBeCloseTo(29000 + 1803.6, 4);

    // Sel literal juga bisa direferensikan alamatnya (FEE JNE = 500 di A8).
    const literalRef = await setSheetCell(db, PROC, UUIDS.projectA, {
      sheet_key: "konversi",
      row_id: "konversi-cross-check",
      column_key: "harga_inu",
      raw: "=A8+100",
    });
    expect(literalRef.ok).toBe(true);
    if (!literalRef.ok) return;
    expect(cell("konversi", "cross_check", "harga_inu", literalRef.data).value).toBeCloseTo(600, 6);
  });

  it("menjumlahkan range dua dimensi (A1:B2) seperti Excel", async () => {
    const db = await seedProject();
    const ranged = await setSheetCell(db, PROC, UUIDS.projectA, {
      sheet_key: "konversi",
      row_id: "konversi-cross-check",
      column_key: "harga_inu",
      raw: "=sum(A1:B2)",
    });
    expect(ranged.ok).toBe(true);
    if (!ranged.ok) return;

    // A1 Harga Dasar·Harga INU (harga vendor), B1 Harga Dasar·Biaya (cost item),
    // A2 PPN·Harga INU (A1 x ppn_rate), B2 PPN·Biaya (cost item).
    const value = cell("konversi", "cross_check", "harga_inu", ranged.data).value;
    expect(value).toBeCloseTo(14500 + 16396.39 + 14500 * 0.11 + 1803.6, 6);
  });

  it("guards mutations for a read-only project access", async () => {
    const base = seedBase();
    const db = makeDb({
      ...base,
      project_members: [
        ...(base.project_members ?? []),
        { id: "pm-view", project_id: UUIDS.projectB, profile_id: UUIDS.viewer, access_level: "VIEW" },
      ],
    });
    const viewerActor = actor("PIC", UUIDS.viewer);
    const viewer = await setSheetCell(db, viewerActor, UUIDS.projectB, {
      sheet_key: "konversi",
      row_id: "konversi-harga-dasar",
      column_key: "harga_inu",
      raw: "1000",
    });
    expect(viewer.ok).toBe(false);
    if (viewer.ok) return;
    expect(viewer.errorCode).toBe("FORBIDDEN");
  });
});
