// @vitest-environment jsdom

/**
 * WORKSPACE LAYOUT + TABEL DINAMIS (render).
 *
 * Memeriksa bahwa satu halaman workspace benar-benar menampilkan:
 *   - EVALUASI HARGA VENDOR (kolom vendor dinamis)
 *   - RINCIAN HARGA JUAL (rate/qty/total, formula dinamis)
 *   - ANALISIS HARGA SATUAN (AHS) dengan hasil engine
 * dan tidak pernah menampilkan NaN/undefined atau nilai 0 palsu.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { createProject } from "../lib/services/projects";
import { addVendorToProject, createVendor, saveVendorPrice, setSelectedVendor } from "../lib/services/vendors";
import { addCostItem, saveAhsInputs } from "../lib/services/ahs";
import { loadProjectWorkspace } from "../lib/services/workspace";
import { ProjectWorkspace } from "../components/excel/project-workspace";
import { actor, makeDb, UUIDS } from "./helpers/db";

const PROC = actor("PROCUREMENT", UUIDS.procurement);

async function seed() {
  const db = makeDb();

  const project = await createProject(db, PROC, {
    code: "WS-SHEET",
    name: "Workspace Spreadsheet",
    customer_id: null,
    product_id: null,
    market_id: null,
    location: "Cianjur",
    period_label: "P1 OKT-26",
    pic_id: null,
    status: "ACTIVE",
  });
  if (!project.ok) throw new Error(project.error);
  const projectId = project.data.id;

  const vendor = await createVendor(db, PROC, { name: "PT Rivina", status: "ACTIVE" });
  if (!vendor.ok) throw new Error(vendor.error);
  const link = await addVendorToProject(db, PROC, projectId, vendor.data.id);
  if (!link.ok) throw new Error(link.error);
  await saveVendorPrice(db, PROC, projectId, vendor.data.id, {
    base_price: 17000,
    ppn_rate: 0.11,
    all_in_variant: "F002B",
  });
  await setSelectedVendor(db, PROC, projectId, link.data.id, true);

  const saved = await saveAhsInputs(db, PROC, projectId, {
    volume: 50000,
    harga_jual_include: 22900,
    include_divisor: 1.11,
    ppn_rate: 0.11,
    pbbkb_rate: 0,
    harga_keekonomian: 24000,
    marketing: "Rina",
    payment_term: "30 Hari",
    document_scheme: "PPN",
  });
  if (!saved.ok) throw new Error(saved.error);

  await addCostItem(db, PROC, projectId, {
    category: "HPP",
    description: "Harga Dasar",
    rate: 17845,
    qty: 50000,
  });
  await addCostItem(db, PROC, projectId, {
    category: "PAJAK",
    description: "PPN 11%",
    rate: 1962.95,
    qty: 50000,
  });

  return { db, projectId };
}

describe("Workspace = satu lembar kerja Excel", () => {
  it("menampilkan vendor dan AHS tanpa panel tabel tambahan", async () => {
    const { db, projectId } = await seed();
    const workspace = await loadProjectWorkspace(db, PROC, projectId);
    expect(workspace.ok).toBe(true);
    if (!workspace.ok) return;
    const view = workspace.data;

    render(<ProjectWorkspace projectId={projectId} view={view} />);

    // Hanya blok utama workbook tampil di halaman.
    expect(screen.getByDisplayValue("EVALUASI HARGA VENDOR")).toBeTruthy();
    expect(screen.getByDisplayValue("PROYEKSI LABA RUGI")).toBeTruthy();
    expect(screen.getByDisplayValue("HARGA JUAL")).toBeTruthy();
    expect(screen.getByDisplayValue("POIN PERHITUNGAN TAMBAHAN")).toBeTruthy();
    expect(screen.queryByText("Tabel tambahan & simulasi")).toBeNull();
    expect(screen.queryByText("KONVERSI SATUAN JAGAD")).toBeNull();
    expect(screen.queryByText("Tambah baris ke kategori:")).toBeNull();
    expect(screen.getByTestId("workbook-physical-grid").querySelector("table")).toBeNull();

    // Hasil engine tampil (bukan NaN, bukan 0 palsu).
    const result = view.ahs.preview;
    expect(result).not.toBeNull();
    if (!result) return;
    for (const label of ["TOTAL PENDAPATAN", "TOTAL BIAYA", "LABA KOTOR", "LABA BERSIH", "PERSENTASE"]) {
      expect(screen.getAllByDisplayValue(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText(`Cell ${view.workbook.byKey["ahs:result:total_cost"]!.address}`)).toBeTruthy();

    // Konversi tetap dihitung server meski tidak ditampilkan di workspace.
    const konversi = view.sheets.find((sheet) => sheet.key === "konversi");
    expect(konversi).toBeTruthy();
    const allIn = konversi!.rows.find((row) => row.ref === "all_in");
    const hargaInu = allIn?.cells.find((cell) => cell.key === "harga_inu")?.value ?? null;
    expect(hargaInu).toBeCloseTo(17000 + 17000 * 0.11, 6);

    // Referensi maju (COST JNE = baris COST di bawahnya) juga terhitung.
    const costJne = konversi!.rows.find((row) => row.ref === "cost_jne")?.cells[0]?.value ?? null;
    const cost = konversi!.rows.find((row) => row.ref === "cost")?.cells[0]?.value ?? null;
    expect(costJne).not.toBeNull();
    expect(costJne).toBeCloseTo(cost as number, 6);

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("Infinity");
    expect(text).not.toContain("undefined");

    // Sel bisa diedit (input), bukan teks mati: sel harga vendor & sel dinamis.
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(10);
  });
});
