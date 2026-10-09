// @vitest-environment jsdom

/**
 * PROJECT WORKSPACE (MVP acceptance).
 *
 * Flow under test: Dashboard -> Create Project -> Open Project -> Input Vendor
 * -> Input AHS -> Calculate -> Profit/Loss appears.
 *
 * Everything runs through the real services + real Calculation Engine; the
 * render block checks the Excel sheets the user actually opens. No NaN, no
 * Infinity, no mock result and no fake Rp 0.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { createProject } from "../lib/services/projects";
import { addVendorToProject, createVendor, saveVendorPrice, setSelectedVendor } from "../lib/services/vendors";
import { addCostItem, saveAhsInputs } from "../lib/services/ahs";
import { loadProjectWorkspace } from "../lib/services/workspace";
import { setWorkbookCell, setWorkbookGridValue } from "../lib/services/workbook";
import { resetWorkbookGridCellOverride } from "../lib/services/sheets";
import { AhsSheet } from "../components/excel/ahs-sheet";
import { VendorEvaluationSheet } from "../components/excel/vendor-evaluation-sheet";
import { ProjectWorkspace } from "../components/excel/project-workspace";
import { actor, makeDb, UUIDS } from "./helpers/db";

const PROC = actor("PROCUREMENT", UUIDS.procurement);

/** Project with two priced vendors + AHS inputs and cost lines. */
async function seedWorkspace() {
  const db = makeDb();

  const project = await createProject(db, PROC, {
    code: "WS-001",
    name: "Workspace UAT — Solar B35",
    customer_id: null,
    product_id: null,
    market_id: null,
    location: "Semarang",
    period_label: "P1 OKT-26",
    pic_id: null,
    status: "ACTIVE",
  });
  if (!project.ok) throw new Error(project.error);
  const projectId = project.data.id;

  const vendorA = await createVendor(db, PROC, { name: "Vendor A", status: "ACTIVE" });
  const vendorB = await createVendor(db, PROC, { name: "Vendor B", status: "ACTIVE" });
  if (!vendorA.ok || !vendorB.ok) throw new Error("vendor");

  const linkA = await addVendorToProject(db, PROC, projectId, vendorA.data.id);
  const linkB = await addVendorToProject(db, PROC, projectId, vendorB.data.id);
  if (!linkA.ok || !linkB.ok) throw new Error("link");

  await saveVendorPrice(db, PROC, projectId, vendorA.data.id, {
    base_price: 14500,
    ppn_rate: 0.11,
    all_in_variant: "F002B",
  });
  // Vendor B gets an OAT component so the extra Excel row carries data too.
  await saveVendorPrice(db, PROC, projectId, vendorB.data.id, {
    base_price: 16396.39,
    ppn_rate: 0.11,
    oat_amount: 250,
    all_in_variant: "F002B",
  });
  await setSelectedVendor(db, PROC, projectId, linkA.data.id, true);

  const saved = await saveAhsInputs(db, PROC, projectId, {
    volume: 15000,
    harga_jual_include: 21800,
    include_divisor: 1.11,
    ppn_rate: 0.11,
    pbbkb_rate: 0,
    pph_inu_rate: 0,
    bph_migas_rate: 0,
    harga_keekonomian: 24000,
    marketing: "Rani",
    payment_term: "30 hari",
    document_scheme: "PO + BAST",
    analysis_date: "2026-10-01",
  });
  if (!saved.ok) throw new Error(saved.error);

  await addCostItem(db, PROC, projectId, { category: "HPP", description: "Harga Dasar Vendor", rate: 16396.39, qty: 15000 });
  await addCostItem(db, PROC, projectId, { category: "PAJAK", description: "PPN Masukan 11%", rate: 1803.6, qty: 15000 });
  await addCostItem(db, PROC, projectId, { category: "OPERATIONAL", description: "OAT Darat", rate: 450, qty: 15000 });

  return { db, projectId, vendorA: vendorA.data, vendorB: vendorB.data };
}

describe("MVP flow — vendor input, AHS input, calculate, profit appears", () => {
  it("edits free cells, recalculates cross-grid formulas, and can override/reset engine output", async () => {
    const { db, projectId } = await seedWorkspace();
    const coordinate = (view: Awaited<ReturnType<typeof loadProjectWorkspace>> & { ok: true }, address: string) => {
      const match = /^([A-Z]+)(\d+)$/.exec(address)!;
      let columnIndex = 0;
      for (const char of match[1]!) columnIndex = columnIndex * 26 + char.charCodeAt(0) - 64;
      return {
        cellKey: view.data.workbook.byAddress[address]!.key,
        rowId: view.data.workbookDoc.rows[Number(match[2]) - 1]!.id,
        columnId: view.data.workbookDoc.columns[columnIndex - 1]!.id,
      };
    };

    let loaded = await loadProjectWorkspace(db, PROC, projectId);
    if (!loaded.ok) throw new Error(loaded.error);
    const a40 = coordinate(loaded, "A40");
    expect((await setWorkbookGridValue(db, PROC, projectId, { ...a40, role: "free", raw: "10" })).ok).toBe(true);

    loaded = await loadProjectWorkspace(db, PROC, projectId);
    if (!loaded.ok) throw new Error(loaded.error);
    const b40 = coordinate(loaded, "B40");
    expect((await setWorkbookGridValue(db, PROC, projectId, { ...b40, role: "free", raw: "=A40*2" })).ok).toBe(true);
    expect((await setWorkbookGridValue(db, PROC, projectId, { ...a40, role: "free", raw: "15" })).ok).toBe(true);

    loaded = await loadProjectWorkspace(db, PROC, projectId);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.data.workbook.byAddress.B40!.value).toBe(30);

    const engine = loaded.data.workbook.cells.find((cell) => cell.key === "ahs:result:net_profit")!;
    const engineCoordinate = coordinate(loaded, engine.address);
    expect((await setWorkbookGridValue(db, PROC, projectId, {
      ...engineCoordinate, cellKey: engine.key, role: "engine-output", raw: "=A40*3",
    })).ok).toBe(true);
    loaded = await loadProjectWorkspace(db, PROC, projectId);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.data.workbook.byKey[engine.key]!.overridden).toBe(true);
    expect(loaded.data.workbook.byKey[engine.key]!.value).toBe(45);

    expect((await resetWorkbookGridCellOverride(db, PROC, projectId, engineCoordinate)).ok).toBe(true);
    loaded = await loadProjectWorkspace(db, PROC, projectId);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.data.workbook.byKey[engine.key]!.overridden).toBeFalsy();
    expect(loaded.data.workbook.byKey[engine.key]!.value).toBe(loaded.data.ahs.preview!.net_profit);
  });

  it("assembles the workspace from the repository + real Calculation Engine", async () => {
    const { db, projectId } = await seedWorkspace();
    const workspace = await loadProjectWorkspace(db, PROC, projectId);
    expect(workspace.ok).toBe(true);
    if (!workspace.ok) return;
    const view = workspace.data;

    // Dynamic vendor columns, not a fixed list.
    expect(view.vendors).toHaveLength(2);
    expect(view.vendors.map((v) => v.vendor.name)).toEqual(["Vendor A", "Vendor B"]);
    expect(view.header.source_vendor).toBe("Vendor A");

    // Engine result is present and every number is finite.
    const result = view.ahs.preview;
    expect(result).not.toBeNull();
    if (!result) return;

    const numeric = [
      result.harga_jual_dpp,
      result.harga_jual_setelah_pajak,
      result.revenue,
      result.total_cost,
      result.cost_per_liter,
      result.ppn_output,
      result.ppn_input,
      result.ppn_difference,
      result.gross_profit,
      result.net_profit,
      result.net_profit_per_liter,
      result.profit_percentage,
    ];
    for (const value of numeric) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(JSON.stringify(result)).not.toContain("null,null");
    expect(String(result.net_profit)).not.toBe("NaN");

    // Profit / loss is a real engine value with the engine's own identities.
    expect(result.revenue).toBeCloseTo(result.harga_jual_setelah_pajak * 15000, 4);
    expect(result.gross_profit).toBeCloseTo(result.revenue - result.total_cost, 4);
    expect(result.net_profit).toBeCloseTo(result.gross_profit - result.ppn_difference, 4);
    expect(result.net_profit_per_liter).toBeCloseTo(result.net_profit / 15000, 6);

    // F004 diskon is engine output, not a React formula.
    expect(result.diskon).not.toBeNull();
    expect(result.diskon!).toBeCloseTo((24000 - result.harga_jual_dpp) / 24000, 10);
    expect(view.header.diskon).toBeCloseTo(result.diskon!, 10);

    // Cost categories are the engine's own grouping and cover Total Cost.
    const groupTotal = view.costGroups.reduce((sum, group) => sum + group.total, 0);
    expect(view.costGroups.map((g) => g.category).sort()).toEqual(["HPP", "OPERATIONAL", "PAJAK"]);
    expect(groupTotal).toBeCloseTo(result.total_cost, 6);
  });

  it("keeps missing values missing (no fake Rp 0) and a vendor without price unpriced", async () => {
    const db = makeDb();
    const project = await createProject(db, PROC, { code: "WS-002", name: "Kosong", status: "ACTIVE" });
    if (!project.ok) throw new Error(project.error);

    const vendor = await createVendor(db, PROC, { name: "Vendor Tanpa Harga", status: "ACTIVE" });
    if (!vendor.ok) throw new Error(vendor.error);
    await addVendorToProject(db, PROC, project.data.id, vendor.data.id);

    const workspace = await loadProjectWorkspace(db, PROC, project.data.id);
    expect(workspace.ok).toBe(true);
    if (!workspace.ok) return;

    // No AHS block, no cost item -> no result, and the error is null (not a fake 0).
    expect(workspace.data.ahs.preview).toBeNull();
    expect(workspace.data.ahs.previewError).toBeNull();
    expect(workspace.data.costGroups).toEqual([]);
    expect(workspace.data.header.diskon).toBeNull();
    expect(workspace.data.header.volume).toBeNull();

    // The unpriced vendor stays null in every price cell.
    const entry = workspace.data.vendors[0];
    expect(entry?.price?.base_price ?? null).toBeNull();
    expect(workspace.data.comparison?.unpriced_indexes).toEqual([0]);
  });
});

describe("Excel sheets render the engine's numbers", () => {
  it("renders one sticky coordinate frame above and left of the complete workspace", async () => {
    const { db, projectId } = await seedWorkspace();
    const workspace = await loadProjectWorkspace(db, PROC, projectId);
    if (!workspace.ok) throw new Error(workspace.error);
    const address = workspace.data.workbook.byKey["ahs:input:volume"]!.address;
    const { container } = render(<ProjectWorkspace projectId={projectId} view={workspace.data} />);
    expect(screen.getByLabelText("Koordinat kolom workbook")).toBeTruthy();
    expect(screen.getByLabelText("Koordinat baris workbook")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Toolbar workbook global" })).toBeTruthy();
    expect(screen.getByLabelText("Formula bar")).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Ubah lebar kolom A" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Ubah tinggi baris 1" })).toBeTruthy();
    const physicalGrid = screen.getByTestId("workbook-physical-grid");
    expect(physicalGrid.querySelectorAll("table")).toHaveLength(0);
    expect(physicalGrid.querySelectorAll("[data-workbook-address]")).toHaveLength(
      workspace.data.workbookDoc.rows.length * workspace.data.workbookDoc.columns.length,
    );
    const volumeCell = container.querySelector(`[data-workbook-address="${address}"]`);
    expect(volumeCell).toBeTruthy();
    fireEvent.pointerDown(volumeCell as Element);
    fireEvent.focus(volumeCell?.querySelector("input") as Element);
    expect(screen.getByTitle("Cell aktif").textContent).toBe(address);
    expect(screen.getByLabelText("Formula bar").hasAttribute("disabled")).toBe(false);
  });

  it("stores global A:1 formulas and recalculates Proyeksi when Vendor changes", async () => {
    const { db, projectId } = await seedWorkspace();
    let workspace = await loadProjectWorkspace(db, PROC, projectId);
    if (!workspace.ok) throw new Error(workspace.error);
    const vendor = workspace.data.vendors.find((entry) => entry.link.is_selected)!;
    const vendorTotal = workspace.data.workbook.byKey[`vendor:${vendor.vendor.id}:all_in_amount`];
    const vendorBase = workspace.data.workbook.byKey[`vendor:${vendor.vendor.id}:base_price`];
    const salePrice = workspace.data.workbook.byKey["ahs:input:harga_jual_include"];
    expect(vendorTotal && vendorBase && salePrice).toBeTruthy();

    const colonAddress = vendorTotal!.address.replace(/^([A-Z]+)(\d+)$/, "$1:$2");
    const formula = await setWorkbookCell(db, PROC, projectId, salePrice!.key, `=${colonAddress}*1.2`);
    if (!formula.ok) throw new Error(formula.error);

    workspace = await loadProjectWorkspace(db, PROC, projectId);
    if (!workspace.ok) throw new Error(workspace.error);
    expect(workspace.data.workbook.byKey[salePrice!.key]?.formula).toBe(`=${vendorTotal!.address}*1.2`);
    expect(workspace.data.ahs.inputs?.harga_jual_include).toBeCloseTo(
      (workspace.data.workbook.byKey[vendorTotal!.key]?.value ?? 0) * 1.2,
    );

    const changed = await setWorkbookCell(db, PROC, projectId, vendorBase!.key, "15000");
    if (!changed.ok) throw new Error(changed.error);
    workspace = await loadProjectWorkspace(db, PROC, projectId);
    if (!workspace.ok) throw new Error(workspace.error);
    expect(workspace.data.ahs.inputs?.harga_jual_include).toBeCloseTo(
      (workspace.data.workbook.byKey[vendorTotal!.key]?.value ?? 0) * 1.2,
    );
  });

  it("rejects a Vendor-Proyeksi formula cycle", async () => {
    const { db, projectId } = await seedWorkspace();
    let workspace = await loadProjectWorkspace(db, PROC, projectId);
    if (!workspace.ok) throw new Error(workspace.error);
    const vendor = workspace.data.vendors.find((entry) => entry.link.is_selected)!;
    const vendorTotal = workspace.data.workbook.byKey[`vendor:${vendor.vendor.id}:all_in_amount`]!;
    const vendorBase = workspace.data.workbook.byKey[`vendor:${vendor.vendor.id}:base_price`]!;
    const salePrice = workspace.data.workbook.byKey["ahs:input:harga_jual_include"]!;
    const netProfit = workspace.data.workbook.byKey["ahs:result:net_profit"]!;
    const first = await setWorkbookCell(db, PROC, projectId, salePrice.key, `=${vendorTotal.address}*1.2`);
    if (!first.ok) throw new Error(first.error);
    workspace = await loadProjectWorkspace(db, PROC, projectId);
    if (!workspace.ok) throw new Error(workspace.error);
    const cycle = await setWorkbookCell(db, PROC, projectId, vendorBase.key, `=${netProfit.address}`);
    expect(cycle.ok).toBe(false);
    if (!cycle.ok) expect(cycle.error).toContain("Circular dependency");
  });

  it("renders the vendor matrix with dynamic columns, OAT row and '—' for missing cells", async () => {
    const { db, projectId } = await seedWorkspace();
    const workspace = await loadProjectWorkspace(db, PROC, projectId);
    if (!workspace.ok) throw new Error(workspace.error);

    // A third, unpriced vendor: its column must show "—", never Rp 0.
    const vendorC = await createVendor(db, PROC, { name: "Vendor C", status: "ACTIVE" });
    if (!vendorC.ok) throw new Error(vendorC.error);
    const linkC = await addVendorToProject(db, PROC, projectId, vendorC.data.id);
    if (!linkC.ok) throw new Error(linkC.error);

    const refreshed = await loadProjectWorkspace(db, PROC, projectId);
    if (!refreshed.ok) throw new Error(refreshed.error);
    const view = refreshed.data;

    render(
      <VendorEvaluationSheet
        projectId={projectId}
        project={view.project}
        entries={view.vendors}
        comparison={view.comparison}
        canWrite
        workbook={view.workbook}
      />,
    );

    expect(screen.getByText("EVALUASI HARGA VENDOR")).toBeTruthy();
    for (const name of ["Vendor A", "Vendor B", "Vendor C"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    for (const row of ["Harga Dasar", "PPN", "PBBKB", "PPH", "OAT", "PPN OAT", "BPH", "TOTAL"]) {
      expect(screen.getAllByText(row).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("belum ada harga").length).toBeGreaterThan(0);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("NaN");
    expect(text).toContain("—");
  });

  it("renders the AHS sheet rows from AhsResult and never NaN", async () => {
    const { db, projectId } = await seedWorkspace();
    const workspace = await loadProjectWorkspace(db, PROC, projectId);
    if (!workspace.ok) throw new Error(workspace.error);
    const view = workspace.data;

    render(
      <AhsSheet
        projectId={projectId}
        project={view.project}
        header={view.header}
        bundle={view.ahs}
        result={view.ahs.preview}
        costGroups={view.costGroups}
        costItems={view.ahs.costItems}
        canWrite
        workbook={view.workbook}
      />,
    );

    expect(screen.getByText("PROYEKSI LABA RUGI")).toBeTruthy();
    for (const label of [
      "TOTAL PENDAPATAN",
      "HARGA JUAL SETELAH PAJAK",
      "TOTAL BIAYA",
      "BIAYA PER LITER (F016)",
      "HPP",
      "PAJAK",
      "OPERATIONAL",
      "LABA KOTOR",
      "SELISIH PPN",
      "LABA BERSIH",
      "LABA BERSIH PER LITER",
      "PERSENTASE",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("Infinity");
    expect(text).not.toContain("undefined");
    expect(text).toContain("Sumber");
    expect(text).toContain("Vendor A");
  });
});
