// @vitest-environment jsdom

/**
 * SPREADSHEET GRID (interaksi seperti Excel).
 *
 * Alur yang diuji: klik sel -> ketik formula langsung -> klik sel tujuan
 * (alamatnya masuk ke formula) -> Enter. Nilai tidak dihitung di komponen:
 * `onCommitCell` mengirim teks mentah ke server, dan di sini kita memastikan
 * teksnya benar-benar berisi alamat sel yang diklik.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SpreadsheetGrid } from "../components/excel/spreadsheet-grid";
import type { ComputedSheet } from "../lib/types/sheets";

const SHEET: ComputedSheet = {
  key: "uji",
  title: "UJI",
  columns: [
    { key: "harga_inu", label: "Harga INU" },
    { key: "biaya", label: "Biaya" },
  ],
  rows: [
    {
      id: "r1",
      ref: "harga_dasar",
      label: "Harga Dasar",
      cells: [
        { key: "harga_inu", value: 17000, expr: null, error: null, note: null },
        { key: "biaya", value: null, expr: null, error: null, note: null },
      ],
    },
    {
      id: "r2",
      ref: "ppn",
      label: "PPN",
      cells: [
        { key: "harga_inu", value: null, expr: "vendor_ppn", error: null, note: null },
        { key: "biaya", value: 1803, expr: null, error: null, note: null },
      ],
    },
  ],
};

describe("SpreadsheetGrid — edit formula langsung di sel", () => {
  it("selects a block by dragging and keeps the rectangle after pointer release", () => {
    // jsdom has no native PointerEvent; MouseEvent exposes the button field here.
    const previous = window.PointerEvent;
    window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
    try {
      render(<SpreadsheetGrid sheet={SHEET} canWrite onCommitCell={async () => ({ ok: true })} onMerge={async () => ({ ok: true })} />);
      fireEvent.pointerDown(screen.getByTestId("cell-A1").closest("td")!, { button: 0 });
      fireEvent.pointerEnter(screen.getByTestId("cell-B2").closest("td")!);
      fireEvent.pointerUp(window);
      expect(screen.getByTestId("selected-range").textContent).toBe("A1:B2");
      expect(screen.getByTestId("cell-B2").closest("td")?.getAttribute("aria-selected")).toBe("true");
    } finally { window.PointerEvent = previous; }
  });
  it("selects a rectangle with Shift and sends its range to formatting and merge actions", async () => {
    const fill = vi.fn(async () => ({ ok: true }));
    const merge = vi.fn(async () => ({ ok: true }));
    render(<SpreadsheetGrid sheet={SHEET} canWrite onCommitCell={async () => ({ ok: true })} onMerge={merge} onSetFill={fill} />);
    fireEvent.click(screen.getByTestId("cell-A1"));
    fireEvent.click(screen.getByTestId("cell-B2"), { shiftKey: true });
    fireEvent.click(screen.getByText("Format sel"));
    expect(screen.getByTestId("selected-range").textContent).toBe("A1:B2");
    fireEvent.click(screen.getByRole("button", { name: "Warna Hijau" }));
    const range = { startRowId: "r1", endRowId: "r2", startColumnKey: "harga_inu", endColumnKey: "biaya" };
    await waitFor(() => expect(fill).toHaveBeenCalledWith(range, "green"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Merge cells" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Merge cells" }));
    await waitFor(() => expect(merge).toHaveBeenCalledWith(range));
  });

  it("renders a merged anchor and restores the raw formula for direct editing", async () => {
    const range = { startRowId: "r1", endRowId: "r1", startColumnKey: "harga_inu", endColumnKey: "biaya" };
    const commit = vi.fn(async () => ({ ok: true }));
    render(<SpreadsheetGrid sheet={{ ...SHEET, merges: [range], styles: { r1: { harga_inu: "yellow" } } }} canWrite onCommitCell={commit} onUnmerge={async () => ({ ok: true })} />);
    expect(screen.queryByTestId("cell-B1")).toBeNull();
    expect(screen.getByTestId("cell-A1").closest("td")?.getAttribute("colspan")).toBe("2");
    expect(screen.getByTestId("cell-A1").closest("td")?.className).toContain("sheet-fill-yellow");
    fireEvent.click(screen.getByTestId("cell-A1"));
    fireEvent.keyDown(screen.getByTestId("cell-input-A1"), { key: "=" });
    fireEvent.change(screen.getByTestId("cell-input-A1"), { target: { value: "=B2*2" } });
    expect((screen.getByTestId("cell-input-A1") as HTMLInputElement).value).toBe("=B2*2");
    fireEvent.keyDown(screen.getByTestId("cell-input-A1"), { key: "Enter" });
    await waitFor(() => expect(commit).toHaveBeenCalledWith("r1", "harga_inu", "=B2*2"));
  });
  it("membangun formula di sel dan memasukkan alamat sel yang diklik", async () => {
    const onCommitCell = vi.fn(async () => ({ ok: true }));
    render(<SpreadsheetGrid sheet={SHEET} canWrite onCommitCell={onCommitCell} />);

    // Klik sel A1, lalu ketik formula langsung di sel.
    fireEvent.click(screen.getByTestId("cell-A1"));
    fireEvent.change(screen.getByTestId("cell-input-A1"), { target: { value: "=17000*" } });

    // Klik sel B2 -> alamatnya masuk ke formula (point mode).
    fireEvent.click(screen.getByTestId("cell-B2"));
    expect((screen.getByTestId("cell-input-A1") as HTMLInputElement).value).toBe("=17000*B2");

    // Enter menyimpan formula mentah ke server.
    fireEvent.keyDown(screen.getByTestId("cell-input-A1"), { key: "Enter" });
    await waitFor(() => expect(onCommitCell).toHaveBeenCalledWith("r1", "harga_inu", "=17000*B2"));
  });

  it("membangun range sum(A1:B2) dengan input langsung dan klik sel", async () => {
    const onCommitCell = vi.fn(async () => ({ ok: true }));
    render(<SpreadsheetGrid sheet={SHEET} canWrite onCommitCell={onCommitCell} />);

    // Rumus lama tampil sebagai nilai terhitung; saat diedit muncul ekspresi mentah.
    fireEvent.click(screen.getByTestId("cell-A2"));
    fireEvent.keyDown(screen.getByTestId("cell-input-A2"), { key: "F2" });
    expect((screen.getByTestId("cell-input-A2") as HTMLInputElement).value).toBe("=vendor_ppn");
    fireEvent.keyDown(screen.getByTestId("cell-input-A2"), { key: "Escape" });

    // Sel kosong: sum( -> klik sel awal -> : -> klik sel akhir -> )
    fireEvent.click(screen.getByTestId("cell-B1"));
    fireEvent.change(screen.getByTestId("cell-input-B1"), { target: { value: "=sum(" } });
    fireEvent.click(screen.getByTestId("cell-A1"));
    fireEvent.change(screen.getByTestId("cell-input-B1"), { target: { value: "=sum(A1:" } });
    fireEvent.click(screen.getByTestId("cell-B2"));
    fireEvent.change(screen.getByTestId("cell-input-B1"), { target: { value: "=sum(A1:B2)" } });
    expect((screen.getByTestId("cell-input-B1") as HTMLInputElement).value).toBe("=sum(A1:B2)");

    fireEvent.keyDown(screen.getByTestId("cell-input-B1"), { key: "Enter" });
    await waitFor(() => expect(onCommitCell).toHaveBeenCalledWith("r1", "biaya", "=sum(A1:B2)"));
  });

  it("menampilkan pesan error formula dari server tanpa mengubah nilainya jadi 0", () => {
    const sheet: ComputedSheet = {
      ...SHEET,
      rows: [
        SHEET.rows[0]!,
        {
          id: "r3",
          ref: "rusak",
          label: "Rusak",
          cells: [
            {
              key: "harga_inu",
              value: null,
              expr: "angka_salah * 2",
              error: 'Variabel "angka_salah" tidak tersedia untuk formula "angka_salah * 2".',
              note: null,
            },
            { key: "biaya", value: null, expr: null, error: null, note: null },
          ],
        },
      ],
    };
    render(<SpreadsheetGrid sheet={sheet} canWrite onCommitCell={async () => ({ ok: true })} />);
    const broken = screen.getByTestId("cell-A2");
    expect(broken.textContent).toBe("#ERROR!");
    expect(broken.getAttribute("title")).toContain("angka_salah");
  });
});
