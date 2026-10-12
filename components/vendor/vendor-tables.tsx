import { formatCurrency, formatRp } from "@/lib/format";
import type {
  ProjectVendorView,
  VendorComparisonView,
  VendorPriceRowView,
} from "@/lib/services/vendors";
import { Badge } from "@/components/shared/primitives";

/**
 * "Other Cost" is the sum of the stored non-PPN components. It is an AGGREGATE
 * of values already computed/stored by the engine — no new business formula is
 * introduced here. When every component is missing the cell stays "—".
 */
export function otherCost(price: VendorPriceRowView | null): number | null {
  if (!price) return null;
  const parts = [price.pbbkb_amount, price.pph_amount, price.oat_amount, price.ppn_oat_amount, price.bph_amount];
  const present = parts.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0);
}

export function vendorStatus(entry: ProjectVendorView): { label: string; tone: "positive" | "accent" | "caution" | "neutral" } {
  if (entry.link.is_selected) return { label: "Sumber terpilih", tone: "positive" };
  if (!entry.price || entry.price.base_price === null) return { label: "Harga belum diisi", tone: "caution" };
  return { label: "Sudah dinilai", tone: "accent" };
}

export function TaxCell({ price }: { price: VendorPriceRowView | null }) {
  if (!price || price.ppn_amount === null) return <span className="text-ink-400">—</span>;
  const rate = price.ppn_rate === null ? null : `${(price.ppn_rate * 100).toFixed(2).replace(/\.00$/, "")}%`;
  return (
    <span>
      {formatCurrency(price.ppn_amount)}
      <span className="ml-1 text-2xs text-ink-500">
        {rate ? `(${rate})` : ""}
        {price.ppn_is_formula ? "" : " · diisi langsung"}
      </span>
    </span>
  );
}

export function AllInCell({ price }: { price: VendorPriceRowView | null }) {
  if (!price || price.all_in_amount === null) return <span className="text-ink-400">—</span>;
  return (
    <span className="font-medium">
      {formatCurrency(price.all_in_amount)}
    </span>
  );
}

/** Metrics-as-rows matrix so several vendors can be compared side by side. */
export function VendorComparisonTable({ view }: { view: VendorComparisonView }) {
  if (view.vendors.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-ink-500">
        Belum ada pemasok. Tambahkan pemasok untuk membandingkan harga.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th scope="col">Rincian</th>
            {view.vendors.map((vendor) => (
              <th key={vendor.vendor_id} scope="col" className="text-right">
                <span className="block">{vendor.name}</span>
                <span className="flex justify-end gap-1 pt-0.5">
                  {vendor.is_selected ? <Badge tone="positive">Terpilih</Badge> : null}
                  {vendor.has_price ? null : <Badge tone="caution">Harga belum diisi</Badge>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="text-left text-xs font-medium text-ink-600">
                {row.label}
              </th>
              {row.cells.map((cell, index) => {
                const isBest = row.key === "all_in_amount" && row.best_index === index;
                return (
                  <td
                    key={`${row.key}-${view.vendors[index]?.vendor_id ?? index}`}
                    className={`num ${isBest ? "bg-positive-50 font-semibold text-positive-700" : ""}`}
                  >
                    {cell.value === null ? (
                      <span className="text-ink-400">—</span>
                    ) : (
                      <>
                        {formatCurrency(cell.value)}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th scope="row" className="text-left text-xs font-medium text-ink-600">
              Ketersediaan
            </th>
            {view.vendors.map((vendor) => (
              <td key={`avail-${vendor.vendor_id}`} className="text-right text-xs">
                {vendor.availability ?? <span className="text-ink-400">—</span>}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="text-left text-xs font-medium text-ink-600">
              Catatan
            </th>
            {view.vendors.map((vendor) => (
              <td key={`note-${vendor.vendor_id}`} className="text-right text-xs">
                {vendor.note ?? <span className="text-ink-400">—</span>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {view.unpriced_indexes.length > 0 ? (
        <p className="border-t border-ink-100 px-3 py-2 text-2xs text-caution-700">
          {view.unpriced_indexes.length} pemasok belum memiliki harga. Kolomnya ditandai “—” dan belum ikut perbandingan harga akhir.
        </p>
      ) : null}
    </div>
  );
}

export function ProjectVendorTableRows({ entries }: { entries: ProjectVendorView[] }) {
  return (
    <>
      {entries.map((entry) => (
        <tr key={entry.link.id} id={`vendor-row-${entry.link.id}`}>
          <td>
            <div className="font-medium text-ink-900">{entry.vendor.name}</div>
            <div className="text-2xs text-ink-500">{entry.vendor.contact ?? entry.vendor.permit ?? ""}</div>
          </td>
          <td className="num">
            {entry.price?.base_price === null || !entry.price ? (
              <span className="text-ink-400">—</span>
            ) : (
              formatRp(entry.price.base_price)
            )}
          </td>
          <td className="num">
            <TaxCell price={entry.price} />
          </td>
          <td className="num">
            {otherCost(entry.price) === null ? (
              <span className="text-ink-400">—</span>
            ) : (
              formatRp(otherCost(entry.price))
            )}
          </td>
          <td className="num">
            <AllInCell price={entry.price} />
          </td>
          <td>
            <Badge tone={vendorStatus(entry).tone}>{vendorStatus(entry).label}</Badge>
          </td>
        </tr>
      ))}
    </>
  );
}
