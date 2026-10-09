/* Hallmark · pre-emit critique: P5 H4 E5 S5 R4 V3
 * Excel-first vendor worksheet on the shared spreadsheet surface (sheet-* tokens);
 * no gradients, no icon cards, no saturated Excel fills, no pure-black grid.
 */

/**
 * EVALUASI HARGA VENDOR — kolom kiri workspace.
 *
 * Seperti sheet Excel: baris Uraian (Harga Dasar, PPN, PBBKB, PPH, OAT, PPN OAT,
 * BPH, TOTAL) dengan satu kolom per vendor. Nama vendor cukup DIKETIK di sini
 * (tidak ada master data terpisah) dan setiap sel harga bisa diisi langsung.
 * Vendor yang harganya belum diisi tampil "—", bukan Rp 0.
 */

import { formatNumber, formatRp } from "@/lib/format";
import type { ProjectDetailView } from "@/lib/services/projects";
import type { ProjectVendorView, VendorComparisonView } from "@/lib/services/vendors";
import {
  AddVendorForm,
  RemoveVendorButton,
  SelectVendorButton,
  VendorPriceForm,
} from "@/components/vendor/vendor-forms";
import { VendorNameCell, VendorPriceCell } from "./grid-cells";
import type { WorkbookLayout } from "@/lib/types/workbook";

/** Workbook row order (docs/EXCEL_MAPPING.md §C.1.2). */
const SHEET_ROWS: Array<{ key: keyof NonNullable<ProjectVendorView["price"]> & string; label: string }> = [
  { key: "base_price", label: "Harga Dasar" },
  { key: "ppn_amount", label: "PPN" },
  { key: "pbbkb_amount", label: "PBBKB" },
  { key: "pph_amount", label: "PPH" },
  { key: "oat_amount", label: "OAT" },
  { key: "ppn_oat_amount", label: "PPN OAT" },
  { key: "bph_amount", label: "BPH" },
  { key: "all_in_amount", label: "TOTAL" },
];

export function VendorEvaluationSheet({
  projectId,
  project,
  entries,
  comparison,
  canWrite,
  workbook,
}: {
  projectId: string;
  project: ProjectDetailView;
  entries: ProjectVendorView[];
  comparison: VendorComparisonView | null;
  canWrite: boolean;
  workbook: WorkbookLayout;
}) {
  const bestIndex =
    comparison?.rows.find((row) => row.key === "all_in_amount")?.best_index ?? undefined;

  return (
    <section className="excel-sheet workbook-vendor" aria-label="Evaluasi harga vendor">
      <h2 className="sheet-title">EVALUASI HARGA VENDOR</h2>

      <table className="sheet-table workbook-vendor-info">
        <tbody>
          <InfoRow label="Pekerjaan / Material" value={project.product_label ?? project.project.name} />
          <InfoRow label="Customer" value={project.customer_name} />
          <InfoRow label="Lokasi" value={project.project.location} />
          <InfoRow label="Periode" value={project.project.period_label} />
        </tbody>
      </table>

      {entries.length === 0 ? (
        <p className="sheet-block px-3 py-3 text-xs text-ink-600">
          Belum ada kolom vendor. Tambahkan vendor di bawah — kolom dan harga akan muncul di sini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="sheet-table">
            <colgroup>
              {Array.from({ length: workbook.vendorColumnCount }, (_, index) => (
                <col key={index} style={{ width: `var(--workbook-column-${index + 1})` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  Uraian
                </th>
                {entries.map((entry, index) => (
                  <th
                    key={entry.link.id}
                    scope="col"
                    className={`text-right ${index === bestIndex ? "bg-positive-50" : ""}`}
                  >
                    {canWrite ? (
                      <VendorNameCell
                        projectId={projectId}
                        vendorId={entry.vendor.id}
                        align="right"
                        mono={false}
                        raw={entry.vendor.name}
                        display={entry.vendor.name}
                        title="Klik untuk mengganti nama vendor"
                      />
                    ) : (
                      <span className="block break-words font-semibold normal-case tracking-normal">
                        {entry.vendor.name}
                      </span>
                    )}
                    {entry.link.is_selected ? (
                      <span className="block text-2xs font-normal text-positive-700">✓ harga dipakai</span>
                    ) : entry.price?.base_price == null ? (
                      <span className="block text-2xs font-normal text-caution-700">belum ada harga</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHEET_ROWS.map((row) => (
                <tr key={row.key} className={row.key === "all_in_amount" ? "sheet-subtotal" : ""}>
                  <th scope="row" className="sheet-label">
                    {row.label}
                  </th>
                  {entries.map((entry, index) => {
                    const value = entry.price ? entry.price[row.key] : null;
                    const isBest = row.key === "all_in_amount" && index === bestIndex;
                    // ALL IN selalu output engine; PPN hanya bisa diketik saat blok
                    // memakai nilai literal (ppn_is_formula = false).
                    const isEngineCell =
                      row.key === "all_in_amount" ||
                      (row.key === "ppn_amount" && entry.price?.ppn_is_formula !== false);
                    const workbookCell = workbook.byKey[`vendor:${entry.vendor.id}:${row.key}`];
                    return (
                      <td
                        key={`${entry.link.id}-${row.key}`}
                        className={`p-0 ${
                          isBest ? "bg-positive-50 font-semibold text-positive-700" : "text-ink-800"
                        }`}
                      >
                        {typeof value === "number" && isEngineCell ? (
                          <span
                            data-workbook-address={workbookCell?.address}
                            title={[workbookCell?.address, workbookCell?.alias, `${row.label} — ${entry.vendor.name}`].filter(Boolean).join(" · ")}
                            className={`block px-1 py-0.5 text-right font-mono tabular-nums ${
                              isBest ? "text-positive-700" : ""
                            }`}
                          >
                            {formatRp(value)}
                          </span>
                        ) : canWrite && entry.price ? (
                          <VendorPriceCell
                            projectId={projectId}
                            vendorId={entry.vendor.id}
                            field={row.key}
                            workbookCell={workbookCell}
                            raw={value === null || value === undefined ? "" : String(value)}
                            display={typeof value === "number" ? formatRp(value) : "—"}
                            title={`${row.label} — ${entry.vendor.name}`}
                          />
                        ) : (
                          <span className="block px-1 py-0.5 text-right font-mono tabular-nums text-ink-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="workbook-vendor-notes">
                <th scope="row" className="sheet-label">
                  Note
                </th>
                {entries.map((entry) => {
                  const note = entry.price?.note ?? null;
                  return (
                    <td key={`${entry.link.id}-note`} className="p-0">
                      {canWrite && entry.price ? (
                        <VendorPriceCell
                          projectId={projectId}
                          vendorId={entry.vendor.id}
                          field="note"
                          mono={false}
                          align="left"
                          raw={note ?? ""}
                          display={note && note.trim() !== "" ? note : "—"}
                          title={`Catatan harga vendor ${entry.vendor.name}`}
                        />
                      ) : (
                        <span className="block px-1 py-0.5 text-ink-600">
                          {note && note.trim() !== "" ? note : "—"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {canWrite ? (
        <p className="text-2xs text-ink-500">
          Klik sel harga untuk mengisi langsung seperti spreadsheet (kosong = “—”, bukan Rp 0).
        </p>
      ) : null}

      <details className="sheet-block workbook-controls">
        <summary className="sheet-block-head">Kelola vendor &amp; harga</summary>

        <AddVendorForm projectId={projectId} canWrite={canWrite} />

        {entries.map((entry) => (
          <div key={entry.link.id} className="border-t border-ink-100">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
              <div className="min-w-0">
                <span className="text-xs font-medium text-ink-900">{entry.vendor.name}</span>
                {entry.availability ? (
                  <span className="ml-2 text-2xs text-ink-500">{entry.availability}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <SelectVendorButton
                  projectId={projectId}
                  linkId={entry.link.id}
                  isSelected={entry.link.is_selected}
                  canWrite={canWrite}
                />
                <RemoveVendorButton
                  projectId={projectId}
                  linkId={entry.link.id}
                  vendorName={entry.vendor.name}
                  canWrite={canWrite}
                />
              </div>
            </div>
            <VendorPriceForm projectId={projectId} entry={entry} canWrite={canWrite} />
          </div>
        ))}
      </details>

      {comparison && comparison.unpriced_indexes.length > 0 ? (
        <p className="border border-caution-100 bg-caution-50 px-2 py-1 text-2xs text-caution-700">
          {formatNumber(comparison.unpriced_indexes.length)} vendor belum diisi harga.
        </p>
      ) : null}

      {!canWrite ? (
        <p className="text-2xs text-ink-500">Anda hanya dapat melihat nilai pada project ini.</p>
      ) : null}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <tr>
      <th scope="row" className="sheet-label w-[38%]">
        {label}
      </th>
      <td className="break-words text-ink-800">{value && value.trim() !== "" ? value : "—"}</td>
    </tr>
  );
}
