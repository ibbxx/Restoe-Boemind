/**
 * ANALISIS HARGA SATUAN (AHS) — sheet kanan workspace.
 *
 * Bentuknya mengikuti blok workbook: header blok, band HARGA INCLUDE, TOTAL
 * PENDAPATAN, rincian harga jual per liter, TOTAL BIAYA, blok biaya per kategori
 * (HPP, PAJAK, COST OF FUND, …), lalu LABA KOTOR → PERSENTASE dan Notes.
 *
 * ANGKA: semua nilai komersial adalah output Calculation Engine (`AhsResult`).
 * INPUT: sel yang bisa diklik-diketik (volume, harga jual, rate, qty, marketing,
 * notes) disimpan lewat server action — tidak ada formula yang jalan di browser.
 */

import type { AhsResult } from "@/lib/calculations/types";
import { formatNumber, formatPercentFromRatio, formatRp } from "@/lib/format";
import type { AhsBundle, CostBreakdownGroup, CostItemView } from "@/lib/services/ahs";
import type { ProjectDetailView } from "@/lib/services/projects";
import type { WorkspaceAhsHeader } from "@/lib/services/workspace";
import type { ComputedSheet, SheetVariable } from "@/lib/types/sheets";
import { CalculationErrorState } from "@/components/shared/states";
import { AhsCostBlock } from "./ahs-cost-block";
import { DynamicSheet } from "./dynamic-sheet";
import { AhsInputCell } from "./grid-cells";
import type { WorkbookLayout } from "@/lib/types/workbook";

export function AhsSheet({
  projectId,
  project,
  header,
  bundle,
  result,
  costGroups,
  costItems,
  canWrite,
  hargaJualSheet = null,
  resultPointsSheet = null,
  variables = [],
  workbook,
}: {
  projectId: string;
  project: ProjectDetailView;
  header: WorkspaceAhsHeader;
  bundle: AhsBundle;
  result: AhsResult | null;
  costGroups: CostBreakdownGroup[];
  costItems: CostItemView[];
  canWrite: boolean;
  /** Sheet dinamis "rincian harga jual" (rate / qty / total per baris). */
  hargaJualSheet?: ComputedSheet | null;
  resultPointsSheet?: ComputedSheet | null;
  variables?: SheetVariable[];
  workbook: WorkbookLayout;
}) {
  return (
    <section className="excel-sheet workbook-ahs" aria-label="Analisis harga satuan">
      <h2 className="sheet-title-alt">PROYEKSI LABA RUGI</h2>

      <div className="workbook-metadata">
        <table className="sheet-table workbook-metadata-right">
          <AhsColGroup workbook={workbook} start={3} count={3} />
          <tbody>
            <InfoRow label="Sumber" value={header.source_vendor ?? project.project.period_label} />
            <InfoRow label="Lokasi" value={header.location ?? project.project.location} />
            <InputRow label="Dokumen">
              <AhsInputCell projectId={projectId} field="document_scheme" mono={false} align="left"
                address={workbook.byKey["ahs:input:document_scheme"]?.address}
                alias="proyeksi_document_scheme"
                raw={header.document_scheme ?? ""} display={header.document_scheme ?? "—"} readOnly={!canWrite} />
            </InputRow>
            <InfoRow label="Diskon" value={formatPercentFromRatio(header.diskon)} />
          </tbody>
        </table>

        <table className="sheet-table workbook-metadata-left">
          <AhsColGroup workbook={workbook} start={0} count={3} />
          <tbody>
            <InputRow label="Tgl Analisis (RnD)">
              <AhsInputCell
                projectId={projectId}
                field="analysis_date"
                address={workbook.byKey["ahs:input:analysis_date"]?.address}
                alias="proyeksi_analysis_date"
                mono={false}
                align="left"
                raw={header.analysis_date ?? ""}
                display={header.analysis_date ?? "—"}
                readOnly={!canWrite}
              />
            </InputRow>
            <InputRow label="Marketing">
              <AhsInputCell
                projectId={projectId}
                field="marketing"
                address={workbook.byKey["ahs:input:marketing"]?.address}
                alias="proyeksi_marketing"
                mono={false}
                align="left"
                raw={header.marketing ?? ""}
                display={header.marketing ?? "—"}
                readOnly={!canWrite}
              />
            </InputRow>
            <InputRow label="Pembayaran">
              <AhsInputCell
                projectId={projectId}
                field="payment_term"
                address={workbook.byKey["ahs:input:payment_term"]?.address}
                alias="proyeksi_payment_term"
                mono={false}
                align="left"
                raw={header.payment_term ?? ""}
                display={header.payment_term ?? "—"}
                readOnly={!canWrite}
              />
            </InputRow>
            <InputRow label="Harga Keekonomian">
              <AhsInputCell
                projectId={projectId}
                field="harga_keekonomian"
                workbookCell={workbook.byKey["ahs:input:harga_keekonomian"]}
                raw={header.harga_keekonomian === null ? "" : String(header.harga_keekonomian)}
                display={header.harga_keekonomian === null ? "—" : formatRp(header.harga_keekonomian)}
                readOnly={!canWrite}
              />
            </InputRow>
          </tbody>
        </table>
      </div>

      <table className="sheet-table">
        <AhsColGroup workbook={workbook} />
        <tbody>
          <tr>
            <th scope="row" className="sheet-head-label w-[26%] text-left">
              HARGA INCLUDE
            </th>
            <td className="sheet-head p-0">
              <AhsInputCell
                projectId={projectId}
                field="harga_jual_include"
                workbookCell={workbook.byKey["ahs:input:harga_jual_include"]}
                raw={header.harga_jual_include === null ? "" : String(header.harga_jual_include)}
                display={header.harga_jual_include === null ? "—" : formatRp(header.harga_jual_include)}
                readOnly={!canWrite}
              />
            </td>
            <th scope="row" className="sheet-head-label w-[14%] text-left">
              VOLUME
            </th>
            <td className="sheet-head p-0">
              <AhsInputCell
                projectId={projectId}
                field="volume"
                workbookCell={workbook.byKey["ahs:input:volume"]}
                raw={header.volume === null ? "" : String(header.volume)}
                display={header.volume === null ? "—" : `${formatNumber(header.volume)} L`}
                readOnly={!canWrite}
              />
            </td>
            <th scope="row" className="sheet-head-label w-[12%] text-left">
              DIVISOR
            </th>
            <td className="sheet-head p-0">
              <AhsInputCell
                projectId={projectId}
                field="include_divisor"
                workbookCell={workbook.byKey["ahs:input:include_divisor"]}
                raw={bundle.inputs?.include_divisor === null || bundle.inputs === null ? "" : String(bundle.inputs.include_divisor)}
                display={bundle.inputs?.include_divisor === null || bundle.inputs === null ? "—" : formatNumber(bundle.inputs.include_divisor, 4)}
                readOnly={!canWrite}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <table className="sheet-table">
        <AhsColGroup workbook={workbook} />
        <tbody>
          {result === null ? (
            <tr>
              <td colSpan={6} className="px-3 py-3 text-center text-xs text-ink-600">
                Belum ada hasil: isi volume, harga jual dan minimal satu cost item. Semua angka dihitung
                Calculation Engine.
              </td>
            </tr>
          ) : (
            <>
              <ResultRow label="TOTAL PENDAPATAN" value={formatRp(result.revenue)} tone="sheet-revenue" strong cell={workbook.byKey["ahs:result:revenue"]} />
              <ResultRow
                label="HARGA JUAL SETELAH PAJAK"
                value={formatRp(result.harga_jual_setelah_pajak)}
                tone="sheet-revenue"
                cell={workbook.byKey["ahs:result:harga_jual_setelah_pajak"]}
              />
            </>
          )}
        </tbody>
      </table>

      {hargaJualSheet ? (
        <div className="sheet-block workbook-sale-detail">
          <div className="sheet-block-head">
            HARGA JUAL
          </div>
          <DynamicSheet
            embedded
            projectId={projectId}
            sheet={hargaJualSheet}
            variables={variables}
            canWrite={canWrite}
          />
        </div>
      ) : null}

      {result ? (
        <>
          <table className="sheet-table">
            <AhsColGroup workbook={workbook} />
            <tbody>
              <ResultRow label="TOTAL BIAYA" value={formatRp(result.total_cost)} tone="sheet-cost" strong cell={workbook.byKey["ahs:result:total_cost"]} />
              <ResultRow label="BIAYA PER LITER (F016)" value={formatRp(result.cost_per_liter)} tone="sheet-cost" cell={workbook.byKey["ahs:result:cost_per_liter"]} />
            </tbody>
          </table>

          <AhsCostBlock
            projectId={projectId}
            groups={costGroups}
            costItems={costItems}
            totalCost={result.total_cost}
            canWrite={canWrite}
            workbook={workbook}
          />

          <table className="sheet-table">
            <AhsColGroup workbook={workbook} />
            <tbody>
              <ResultRow label="LABA KOTOR" value={formatRp(result.gross_profit)} tone="sheet-profit" strong cell={workbook.byKey["ahs:result:gross_profit"]} />
              <ResultRow label="SELISIH PPN" value={formatRp(result.ppn_difference)} tone="sheet-profit" cell={workbook.byKey["ahs:result:ppn_difference"]} />
              <ResultRow label="SELISIH PBBKB" value={formatRp(result.pbbkb_difference)} tone="sheet-profit" cell={workbook.byKey["ahs:result:pbbkb_difference"]} />
              <ResultRow
                label="LABA BERSIH"
                value={formatRp(result.net_profit)}
                tone={result.net_profit < 0 ? "sheet-cost" : "sheet-answer"}
                strong
                cell={workbook.byKey["ahs:result:net_profit"]}
              />
              <ResultRow
                label="LABA BERSIH PER LITER"
                value={formatRp(result.net_profit_per_liter)}
                tone={result.net_profit < 0 ? "sheet-cost" : "sheet-profit"}
                cell={workbook.byKey["ahs:result:net_profit_per_liter"]}
              />
              <ResultRow
                label="PERSENTASE"
                value={formatPercentFromRatio(result.profit_percentage)}
                tone={result.net_profit < 0 ? "sheet-cost" : "sheet-profit"}
                cell={workbook.byKey["ahs:result:profit_percentage"]}
              />
            </tbody>
          </table>
        </>
      ) : null}

      {resultPointsSheet ? (
        <div className="workbook-result-points">
          <DynamicSheet projectId={projectId} sheet={resultPointsSheet} variables={variables} canWrite={canWrite} />
        </div>
      ) : null}

      <table className="sheet-table">
        <AhsColGroup workbook={workbook} />
        <tbody>
          <tr>
            <th scope="row" className="sheet-label w-[18%] text-left align-top">
              Keterangan
            </th>
            <td colSpan={5} className="p-0">
              <AhsInputCell
                projectId={projectId}
                field="notes"
                address={workbook.byKey["ahs:input:notes"]?.address}
                alias="proyeksi_notes"
                mono={false}
                align="left"
                raw={bundle.inputs?.notes ?? ""}
                display={bundle.inputs?.notes || "—"}
                readOnly={!canWrite}
              />
            </td>
          </tr>
        </tbody>
      </table>

      {bundle.previewError ? (
        <CalculationErrorState
          message={bundle.previewError.message}
          code={bundle.previewError.errorCode}
          field={bundle.previewError.field}
        />
      ) : null}
    </section>
  );
}

function ResultRow({
  label,
  value,
  tone,
  strong = false,
  cell,
}: {
  label: string;
  value: string;
  tone: string;
  strong?: boolean;
  cell?: import("@/lib/types/workbook").WorkbookCellMeta;
}) {
  return (
    <tr className={tone}>
      <th scope="row" colSpan={5} className={`text-left ${strong ? "font-semibold" : "font-medium"}`}>
        {label}
      </th>
      <td data-workbook-address={cell?.address} title={[cell?.address, cell?.alias].filter(Boolean).join(" · ") || undefined}
        className={`text-right font-mono tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <tr>
      <th scope="row" className="sheet-label w-[42%]">
        {label}
      </th>
      <td colSpan={2} className="break-words text-ink-800">
        {value && String(value).trim() !== "" ? value : "—"}
      </td>
    </tr>
  );
}

function InputRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row" className="sheet-head-label w-[42%] text-left">
        {label}
      </th>
      <td colSpan={2} className="sheet-head p-0">{children}</td>
    </tr>
  );
}

function AhsColGroup({ workbook, start = 0, count = 6 }: { workbook: WorkbookLayout; start?: number; count?: number }) {
  return (
    <colgroup>
      {Array.from({ length: count }, (_, offset) => {
        const globalColumn = workbook.ahsStartColumn + start + offset + 1;
        return <col key={globalColumn} style={{ width: `var(--workbook-column-${globalColumn})` }} />;
      })}
    </colgroup>
  );
}
