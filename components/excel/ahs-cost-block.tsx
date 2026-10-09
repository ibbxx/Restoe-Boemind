/**
 * BLOK BIAYA AHS (bagian merah di workbook).
 *
 * Susunan baris mengikuti blok Excel: kategori di kolom kiri (HPP, PAJAK,
 * COST OF FUND, OPERASIONAL, …), lalu baris item dengan Rate per liter (INPUT),
 * Qty, dan Total. TOTAL tiap baris dan TOTAL BIAYA selalu output engine
 * (`AhsResult`) — React tidak menghitung apa pun, ia hanya menampilkan nilai.
 */

import type { CostLineResult } from "@/lib/calculations/types";
import { formatNumber, formatRp } from "@/lib/format";
import { COST_CATEGORIES, type CostBreakdownGroup, type CostItemView } from "@/lib/services/ahs";
import { CostItemCell } from "./grid-cells";
import { CostRowAdder } from "./cost-row-adder";
import type { WorkbookLayout } from "@/lib/types/workbook";

interface CostRow {
  category: string;
  line: CostLineResult | null;
  item: CostItemView | null;
  /** Baris kategori kosong (belum ada item) — dipakai untuk tombol "+ baris". */
  placeholder: boolean;
}

/**
 * Kategori standar workbook ditampilkan walau belum ada itemnya (seperti di
 * Excel), dan kategori tambahan dari data user ikut ditampilkan.
 */
export function buildCostRows(groups: CostBreakdownGroup[], items: CostItemView[]): CostRow[] {
  const rows: CostRow[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    seen.add(group.category.toUpperCase());
    if (group.items.length === 0) {
      rows.push({ category: group.category, line: null, item: null, placeholder: true });
      continue;
    }
    for (const line of group.items) {
      rows.push({
        category: group.category,
        line,
        item: items.find((item) => item.line_no === line.line_no) ?? null,
        placeholder: false,
      });
    }
  }

  for (const category of COST_CATEGORIES) {
    if (seen.has(category.toUpperCase())) continue;
    rows.push({ category, line: null, item: null, placeholder: true });
  }

  return rows;
}

export function AhsCostBlock({
  projectId,
  groups,
  costItems,
  totalCost,
  canWrite,
  workbook,
}: {
  projectId: string;
  groups: CostBreakdownGroup[];
  costItems: CostItemView[];
  /** TOTAL BIAYA (F015A) — output engine, tidak dijumlah ulang di React. */
  totalCost: number | null;
  canWrite: boolean;
  workbook: WorkbookLayout;
}) {
  const rows = buildCostRows(groups, costItems);

  return (
    <div className="overflow-x-auto workbook-cost-block">
      <table className="sheet-table">
        <colgroup>
          {Array.from({ length: 6 }, (_, offset) => {
            const globalColumn = workbook.ahsStartColumn + offset + 1;
            return <col key={globalColumn} style={{ width: `var(--workbook-column-${globalColumn})` }} />;
          })}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="w-[22%] text-left">
              Kategori
            </th>
            <th scope="col" colSpan={2} className="text-left">
              Item biaya
            </th>
            <th scope="col" className="text-right">
              Rate / liter
            </th>
            <th scope="col" className="text-right">
              Qty
            </th>
            <th scope="col" className="text-right">
              Total (F007)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const previous = index > 0 ? rows[index - 1] : undefined;
            const isGroupStart = !previous || previous.category !== row.category;
            let groupSize = 1;
            if (isGroupStart) {
              while (rows[index + groupSize]?.category === row.category) groupSize++;
            }
            const label = row.item?.description ?? row.line?.description ?? "";

            return (
              <tr key={`${row.category}-${row.item?.id ?? row.line?.line_no ?? index}`}>
                {isGroupStart ? (
                  <th scope="rowgroup" rowSpan={groupSize} className="sheet-label workbook-category">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <span className="font-semibold">{row.category}</span>
                      {canWrite ? <CostRowAdder projectId={projectId} category={row.category} canWrite /> : null}
                    </div>
                  </th>
                ) : null}
                <td colSpan={2} className="p-0">
                  {row.item && canWrite ? (
                    <CostItemCell
                      projectId={projectId}
                      itemId={row.item.id}
                      field="description"
                      align="left"
                      mono={false}
                      raw={row.item.description}
                      display={row.item.description || "—"}
                      title="Nama item biaya"
                    />
                  ) : (
                    <span className={`block px-1 py-0.5 ${row.placeholder ? "text-ink-400" : ""}`}>
                      {label || "—"}
                    </span>
                  )}
                </td>
                <td className="p-0">
                  {row.item && canWrite ? (
                    <CostItemCell
                      projectId={projectId}
                      itemId={row.item.id}
                      field="rate"
                      workbookCell={workbook.byKey[`cost:${row.item.id}:rate`]}
                      raw={row.item.rate === null ? "" : String(row.item.rate)}
                      display={row.item.rate === null ? "—" : formatRp(row.item.rate)}
                      title="Rate per liter — kosong berarti tidak berlaku (bukan 0)"
                    />
                  ) : (
                    <span className="block px-1 py-0.5 text-right text-ink-400">—</span>
                  )}
                </td>
                <td className="p-0">
                  {row.item && canWrite ? (
                    <CostItemCell
                      projectId={projectId}
                      itemId={row.item.id}
                      field="qty"
                      workbookCell={workbook.byKey[`cost:${row.item.id}:qty`]}
                      raw={row.item.qty === null ? "" : String(row.item.qty)}
                      display={row.item.qty === null ? "—" : formatNumber(row.item.qty, 2)}
                      title="Qty (di Excel tidak selalu sama dengan volume)"
                    />
                  ) : (
                    <span className="block px-1 py-0.5 text-right text-ink-400">—</span>
                  )}
                </td>
                <td data-workbook-address={row.item ? workbook.byKey[`cost:${row.item.id}:total`]?.address : undefined}
                  title={row.item ? [workbook.byKey[`cost:${row.item.id}:total`]?.address, workbook.byKey[`cost:${row.item.id}:total`]?.alias].filter(Boolean).join(" · ") : undefined}
                  className="text-right font-mono tabular-nums">
                  {row.line ? (
                    row.line.rate === null ? (
                      <span className="text-ink-400" title="Rate kosong = tidak berlaku; total 0 mengikuti Excel.">
                        0
                      </span>
                    ) : (
                      formatRp(row.line.total)
                    )
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="sheet-subtotal">
            <th scope="row" colSpan={5} className="text-left">
              TOTAL BIAYA (F015A) — {formatNumber(costItems.length)} baris
            </th>
            <td className="text-right font-mono font-semibold">{formatRp(totalCost)}</td>
          </tr>
        </tbody>
      </table>

    </div>
  );
}
