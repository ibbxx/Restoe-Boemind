// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkbookSaveBar } from "../components/excel/workbook-save-bar";

describe("WorkbookSaveBar", () => {
  it("keeps passive status text separate from clickable actions", () => {
    const retry = vi.fn();
    const toggleMapping = vi.fn();
    render(<WorkbookSaveBar
      state="error"
      message="Koneksi terputus."
      canWrite
      mapping={false}
      onRetry={retry}
      onDownloadDraft={vi.fn()}
      onLoadLatest={vi.fn()}
      onToggleMapping={toggleMapping}
    />);

    const retryButton = screen.getByRole("button", { name: "Coba simpan lagi" });
    const mappingButton = screen.getByRole("button", { name: "Hubungkan isian" });
    const status = screen.getByRole("status");

    expect(status.textContent).toContain("Belum tersimpan");
    expect(status.contains(retryButton)).toBe(false);
    expect(status.contains(mappingButton)).toBe(false);
    expect(retryButton.closest(".univer-save-actions")).not.toBeNull();
    expect(mappingButton.closest(".univer-save-actions")).not.toBeNull();

    fireEvent.click(retryButton);
    fireEvent.click(mappingButton);
    expect(retry).toHaveBeenCalledOnce();
    expect(toggleMapping).toHaveBeenCalledOnce();
  });

  it("exposes both conflict recovery actions", () => {
    const downloadDraft = vi.fn();
    const loadLatest = vi.fn();
    render(<WorkbookSaveBar
      state="conflict"
      canWrite={false}
      mapping={false}
      onRetry={vi.fn()}
      onDownloadDraft={downloadDraft}
      onLoadLatest={loadLatest}
      onToggleMapping={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Unduh draf" }));
    fireEvent.click(screen.getByRole("button", { name: "Muat versi terbaru" }));
    expect(downloadDraft).toHaveBeenCalledOnce();
    expect(loadLatest).toHaveBeenCalledOnce();
  });
});
