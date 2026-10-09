import Link from "next/link";

import { requestContext, isContextError } from "@/lib/data/context";
import { loadCommercialView } from "@/lib/services/commercial";
import { formatDateTime, formatNumber, formatRp } from "@/lib/format";
import { CommercialBreakdown, CommercialResultBlock } from "@/components/commercial/commercial-summary";
import { Badge, Card, CardHeader, PageHeader, ReadOnlyValue } from "@/components/shared/primitives";
import { EmptyState, ErrorState } from "@/components/shared/states";

export const dynamic = "force-dynamic";

/**
 * Commercial analysis (Phase 3 §13).
 *
 * A procurement user must be able to answer "dengan harga/vendor ini project
 * menghasilkan berapa?" in one glance, so the page is ordered
 * INPUT -> CALCULATION -> COMMERCIAL RESULT instead of one long table.
 * Every result is read from `calculation_results` (engine output).
 */
export default async function CommercialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scenario?: string }>;
}) {
  const { id } = await params;
  const { scenario: scenarioParam } = await searchParams;

  const ctx = await requestContext();
  if (isContextError(ctx)) {
    return <ErrorState title="Commercial tidak dapat dimuat" message={ctx.error} code={ctx.errorCode} />;
  }

  const commercial = await loadCommercialView(ctx.db, ctx.actor, id, scenarioParam);
  if (!commercial.ok) {
    return (
      <ErrorState
        title="Commercial tidak dapat dimuat"
        message={commercial.error}
        code={commercial.errorCode}
      />
    );
  }

  const view = commercial.data;

  if (!view.scenario) {
    return (
      <>
        <PageHeader title="Commercial analysis" />
        <EmptyState
          title="Belum ada scenario"
          description="Commercial analysis membaca calculation result dari scenario. Buat scenario pertama dari AHS (V1 — Initial), lalu analisis akan tampil di sini."
          action={
            <div className="flex gap-2">
              <Link href={`/projects/${id}/ahs`} className="btn-primary">
                Buka AHS
              </Link>
              <Link href={`/projects/${id}/scenarios`} className="btn-secondary">
                Buka Scenarios
              </Link>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Commercial analysis"
        description={
          <span>
            Scenario <strong>{view.scenario.name}</strong>
            {view.result ? ` · dihitung ${formatDateTime(view.result.computed_at)}` : " · hasil belum tersimpan"}
            {view.scenario.is_locked ? " · terkunci (read-only)" : ""}
          </span>
        }
        actions={
          <>
            <Link href={`/projects/${id}/scenarios`} className="btn-secondary">
              Scenario &amp; perbandingan
            </Link>
            <Link href={`/reports?project=${id}`} className="btn-primary">
              Export report
            </Link>
          </>
        }
      />

      <div className="space-y-4">
        {view.scenarios.length > 1 ? (
          <Card className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="field-label mb-0">Versi</span>
              {view.scenarios.map((s) => (
                <Link
                  key={s.id}
                  href={`/projects/${id}/commercial?scenario=${s.id}`}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    s.id === view.scenario?.id
                      ? "border-accent-600 bg-accent-50 text-accent-700"
                      : "border-ink-300 text-ink-600 hover:bg-ink-100"
                  }`}
                >
                  {s.name}
                  {s.is_locked ? " 🔒" : ""}
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        {/* 1. INPUT */}
        <Card>
          <CardHeader
            title="1 · Input"
            description="Nilai INPUT — bukan hasil hitung. Perubahan input tidak otomatis mengubah harga customer."
          />
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
            <div>
              <div className="field-label">Customer Price (include)</div>
              <div className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 font-mono text-sm">
                {formatRp(view.inputs.customer_price)}
              </div>
            </div>
            <div>
              <div className="field-label">Vendor Price (base)</div>
              <div className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 font-mono text-sm">
                {formatRp(view.inputs.vendor_price)}
              </div>
            </div>
            <div>
              <div className="field-label">Volume</div>
              <div className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 font-mono text-sm">
                {view.inputs.volume === null ? "—" : `${formatNumber(view.inputs.volume)} L`}
              </div>
            </div>
            <div>
              <div className="field-label">Cost items</div>
              <div className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 font-mono text-sm">
                {formatNumber(view.inputs.cost_item_count)}
              </div>
              <Link href={`/projects/${id}/ahs`} className="mt-1 block text-2xs text-accent-700 hover:underline">
                ubah di AHS →
              </Link>
            </div>
          </div>
        </Card>

        {/* 2. CALCULATION */}
        <Card>
          <CardHeader
            title="2 · Calculation"
            description="Formula registry yang dipakai engine untuk input di atas."
          />
          <div className="p-4">
            <CommercialBreakdown metrics={view.metrics} />
          </div>
        </Card>

        {/* 3. RESULT */}
        <Card>
          <CardHeader
            title="3 · Commercial result"
            description="Hasil akhir — READ ONLY. Angka berasal dari calculation engine, bukan dari browser."
            actions={<Badge tone="accent">{view.scenario.name}</Badge>}
          />
          <div className="p-4">
            {view.result ? (
              <CommercialResultBlock metrics={view.metrics} />
            ) : (
              <EmptyState
                compact
                title="Hasil belum tersimpan"
                description="Scenario ini belum memiliki baris calculation_results."
              />
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Cost lines skenario ini"
              description="Snapshot cost item milik scenario (read-only)."
            />
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Description</th>
                    <th scope="col">Category</th>
                    <th scope="col" className="text-right">Rate</th>
                    <th scope="col" className="text-right">Qty</th>
                    <th scope="col" className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {view.cost_lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-xs text-ink-500">
                        Tidak ada cost line pada snapshot ini.
                      </td>
                    </tr>
                  ) : (
                    view.cost_lines.map((line) => (
                      <tr key={`${line.line_no}-${line.description}`}>
                        <td>
                          {line.description}
                          {!line.applied ? (
                            <span className="ml-2 badge bg-caution-100 text-caution-700">tidak berlaku</span>
                          ) : null}
                        </td>
                        <td className="text-xs text-ink-500">{line.category ?? "—"}</td>
                        <td className="num">{formatRp(line.rate)}</td>
                        <td className="num">{line.qty === null ? "—" : formatNumber(line.qty, 2)}</td>
                        <td className="num">{formatRp(line.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Pajak & margin"
              description="PPN keluaran/masukan dan metrik profit — engine output."
            />
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              <ReadOnlyValue label="PPN Keluaran" value={formatRp(view.metrics.ppn_output)} />
              <ReadOnlyValue label="PPN Masukan" value={formatRp(view.metrics.ppn_input)} />
              <ReadOnlyValue
                label="Selisih PPN"
                value={formatRp(view.metrics.ppn_difference)}
                hint="dikurangkan dari Gross Profit (F019A/B)"
              />
              <ReadOnlyValue label="Cost per Liter" value={formatRp(view.metrics.cost_per_liter)} />
            </div>
            <div className="px-4 pb-4">
              <p className="text-2xs text-ink-500">
                Profit % mengikuti formula Excel existing <span className="font-mono">F021A</span> = Net Profit ÷
                Total Cost — bukan margin standar.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
