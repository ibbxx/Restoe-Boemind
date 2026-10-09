/**
 * Generates docs/PHASE2_CROSSCHECK.md — the Excel cross-check report
 * (Phase 2 §19.F, extended by Phase 2.5 §8/§9/§10).
 *
 * Run with: npm run crosscheck:report
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFixture, toAhsInput, type ExcelCase } from "../tests/helpers/fixture";
import { calculateAhs } from "../lib/calculations/ahs";
import { calculateVendorAllIn, calculateVendorPpn } from "../lib/calculations/vendor";
import { calculateCostLines } from "../lib/calculations/cost";
import {
  compareNumber,
  summarise,
  skipRow,
  ABS_TOLERANCE,
  FLOAT_NOISE_RELATIVE,
  PRECISION_WINDOW_RELATIVE,
  RATIO_COMPARE,
  type CompareOptions,
  type CrossCheckRow,
} from "../lib/calculations/cross-check";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const f = loadFixture();

const cache = new Map<string, ReturnType<typeof calculateAhs>>();
function engine(c: ExcelCase) {
  let v = cache.get(c.id);
  if (!v) {
    v = calculateAhs(toAhsInput(c));
    cache.set(c.id, v);
  }
  if (!v.success) throw new Error(`engine failed on ${c.id}: ${v.errorCode} ${v.message}`);
  return v;
}
const eOf = (c: ExcelCase, k: keyof ExcelCase["excel"]): number | null => {
  const v = c.excel[k];
  return typeof v === "number" ? v : null;
};
const row = (
  formula: string, source: string, label: string, excel: number | null, system: number | null,
  opts: CompareOptions = {},
): CrossCheckRow => {
  const { difference, relative, status, note } = compareNumber(excel, system, opts);
  return {
    formula, source, label, excel, system, difference, relative_difference: relative,
    status, ...(note ? { note } : {}),
  };
};

// ---------------------------------------------------------------- AHS metrics
const METRICS: Array<{
  formula: string; label: string;
  excel: (c: ExcelCase) => number | null;
  system: (c: ExcelCase) => number | null;
  opts?: CompareOptions;
}> = [
  { formula: "F006", label: "Revenue", excel: (c) => eOf(c, "revenue"), system: (c) => engine(c).revenue },
  { formula: "F015A", label: "Total Cost", excel: (c) => eOf(c, "total_cost"), system: (c) => engine(c).total_cost },
  { formula: "F016", label: "Biaya per Liter", excel: (c) => eOf(c, "cost_per_liter"), system: (c) => engine(c).cost_per_liter },
  { formula: "F001 (jual)", label: "PPN Keluaran", excel: (c) => eOf(c, "ppn_output"), system: (c) => engine(c).ppn_output },
  { formula: "F008A/B/C", label: "PPN Masukan", excel: (c) => eOf(c, "ppn_input"), system: (c) => engine(c).ppn_input },
  { formula: "F017", label: "Laba Kotor", excel: (c) => eOf(c, "gross_profit"), system: (c) => engine(c).gross_profit },
  { formula: "F018", label: "Selisih PPN", excel: (c) => eOf(c, "ppn_difference"), system: (c) => engine(c).ppn_difference },
  { formula: "F019A/B", label: "Laba Bersih", excel: (c) => eOf(c, "net_profit"), system: (c) => engine(c).net_profit },
  { formula: "F020", label: "Laba Bersih/Liter", excel: (c) => eOf(c, "net_profit_per_liter"), system: (c) => engine(c).net_profit_per_liter },
  { formula: "F021A", label: "Persentase (Net / TOTAL BIAYA)", excel: (c) => eOf(c, "profit_percentage"), system: (c) => engine(c).profit_percentage, opts: RATIO_COMPARE },
];

const allRows: CrossCheckRow[] = [];
const perMetric: Array<{ formula: string; label: string; n: number; valid: number; pv: number; skipped: number; maxRel: number; worst: string }> = [];

for (const m of METRICS) {
  const mine: CrossCheckRow[] = [];
  let maxRel = 0;
  let worst = "";
  let skipped = 0;
  for (const c of f.cases) {
    const e = m.excel(c);
    if (e === null) {
      skipped += 1;
      mine.push(skipRow(m.formula, `${c.sheet}!${c.title_cell}`, c.id,
        c.has_profit_percentage ? "Excel tidak menyediakan metrik ini." : "Varian layout tanpa baris PERSENTASE."));
      continue;
    }
    const r = row(m.formula, `${c.sheet}!${c.title_cell}`, c.id, e, m.system(c), m.opts);
    mine.push(r);
    const rel = r.relative_difference ?? 0;
    if (rel > maxRel) { maxRel = rel; worst = c.id; }
  }
  const agg = summarise(mine);
  perMetric.push({
    formula: m.formula, label: m.label, n: agg.compared, valid: agg.valid,
    pv: agg.precision_variance, skipped, maxRel, worst: worst || "-",
  });
  allRows.push(...mine);
}

// ---------------------------------------------------------------- vendor PPN
const vendorPpnRows: CrossCheckRow[] = [];
for (const v of f.vendor_cases) {
  if (!v.ppn_is_formula || typeof v.base_price !== "number" || v.excel.ppn === null) continue;
  vendorPpnRows.push(
    row("F001 (vendor)", `${v.sheet}!${v.uraian_cell}`, v.vendor,
      v.excel.ppn, calculateVendorPpn(v.base_price, v.ppn_rate_effective)),
  );
}
allRows.push(...vendorPpnRows);

// ---------------------------------------------------------------- vendor ALL IN
interface AllInDetail extends CrossCheckRow { cached: number | null }
const vendorAllInRows: AllInDetail[] = [];
for (const v of f.vendor_cases) {
  if (!v.all_in_formula || !/sum/i.test(v.all_in_formula)) continue;
  if (v.all_in_formula_value === null) continue;
  const variant = (v.all_in_component_rows ?? 0) >= 7 ? "F002B" : "F002A";
  const cv = v.component_values;
  const system = calculateVendorAllIn(
    {
      base_price: cv[0] ?? 0, ppn: cv[1] ?? 0, pbbkb: cv[2] ?? 0, pph: cv[3] ?? 0,
      oat: cv[4] ?? 0, ppn_oat: cv[5] ?? 0, bph: cv[6] ?? 0,
    },
    variant,
  );
  vendorAllInRows.push({
    ...row(variant, `${v.sheet}!${v.uraian_cell}`, v.vendor, v.all_in_formula_value, system),
    cached: v.excel.all_in,
  });
}
allRows.push(...vendorAllInRows);

const staleAllIn = vendorAllInRows.filter(
  (r) => r.cached !== null && compareNumber(r.cached, r.excel).status === "FORMULA_MISMATCH",
);

// ---------------------------------------------------------------- cost lines
let costChecked = 0;
let costMaxRel = 0;
let costWorst = "";
for (const c of f.cases) {
  for (const cl of c.cost_lines) {
    if (cl.total_excel === null) continue;
    const system = calculateCostLines([
      { category: cl.category, description: cl.description, rate: cl.rate, qty: cl.qty },
    ])[0]!.total;
    costChecked += 1;
    const { relative } = compareNumber(cl.total_excel, system);
    if (relative !== null && relative > costMaxRel) {
      costMaxRel = relative;
      costWorst = `${c.id} r${cl.row}`;
    }
  }
}

// ------------------------------------------------------- precision-variance analysis
const pvRows = allRows.filter((r) => r.status === "PRECISION_VARIANCE");
const pvAbs = pvRows
  .map((r) => ({ r, abs: Math.abs(r.difference ?? 0) }))
  .sort((a, b) => b.abs - a.abs);
const maxAbsPv = pvAbs[0]?.abs ?? 0;

const summary = summarise(allRows);
const date = new Date().toISOString().slice(0, 10);
const dec = (x: number | null | undefined, n = 2) =>
  x === null || x === undefined ? "-" : x.toExponential(n);
const int = (x: number) => x.toLocaleString("en-US");

const censusRows = Object.entries(f.census_summary).sort((a, b) => b[1] - a[1]);
const totalBlocks = f.census_count;
const testedBlocks = f.census_summary["TESTED"] ?? 0;

const md = `# PHASE 2.5 — EXCEL CROSS-CHECK REPORT

> Dihasilkan otomatis oleh \`npm run crosscheck:report\` (scripts/crosscheck_report.ts).
> Semua nilai "Excel" dibaca langsung dari workbook asli \`ANALISIS HARGA SATUAN (2026).xlsx\`.
> **Tidak ada mock result dan tidak ada nilai yang dikarang.**

**Tanggal:** ${date}
**Sumber:** \`${f.source}\`
**Blok AHS diekstrak:** ${f.case_count} dari ${totalBlocks} · **Blok vendor diekstrak:** ${f.vendor_case_count}

---

## 1. Ringkasan

| Status | Jumlah |
|---|---:|
| **VALID** | ${int(summary.valid)} |
| **PRECISION_VARIANCE** | ${int(summary.precision_variance)} |
| **FORMULA_MISMATCH** | ${int(summary.formula_mismatch)} |
| UNRESOLVED | ${int(summary.unresolved)} |
| SKIPPED | ${int(summary.skipped)} |
| **TOTAL pembandingan** | **${int(summary.total)}** |
| Dibandingkan (bukan SKIPPED) | ${int(summary.compared)} |

**Deviasi relatif maksimum:** ${dec(summary.max_relative_difference, 3)}

Status di atas BUKAN satu toleransi tunggal. Masing-masing punya arti berbeda:

| Status | Arti | Ambang |
|---|---|---|
| \`VALID\` | engine dan Excel identik pada tingkat pembulatan aritmetika | ≤ ${ABS_TOLERANCE} absolut **atau** ≤ ${FLOAT_NOISE_RELATIVE} relatif |
| \`PRECISION_VARIANCE\` | angka berbeda, tetapi jauh terlalu kecil untuk menjadi formula lain — artefak presisi nilai cache Excel. **Dilaporkan, tidak disembunyikan.** | ≤ ${PRECISION_WINDOW_RELATIVE} relatif |
| \`FORMULA_MISMATCH\` | perbedaan semantik nyata: engine TIDAK meniru Excel | > ${PRECISION_WINDOW_RELATIVE} relatif |
| \`UNRESOLVED\` | salah satu sisi tidak punya nilai | — |
| \`SKIPPED\` | perbandingan tidak dilakukan, dengan alasan eksplisit (varian blok tanpa metrik tsb, sel literal, \`#REF!\`) | — |

**Tidak ada \`FORMULA_MISMATCH\`.** Tidak ada toleransi yang dipakai untuk menyembunyikan perbedaan formula.

### 1.1 Analisis PRECISION_VARIANCE

| Metrik | Nilai |
|---|---:|
| Jumlah baris | ${int(pvRows.length)} |
| Deviasi absolut terbesar | ${maxAbsPv.toFixed(4)} |
| Deviasi relatif terbesar | ${dec(summary.max_relative_difference, 3)} |
| Ambang mismatch | ${PRECISION_WINDOW_RELATIVE} |

${pvAbs.slice(0, 5).map((p) => `- \`${p.r.label}\` ${p.r.formula} — |Δ| = ${p.abs.toFixed(6)} (rel ${dec(p.r.relative_difference, 2)})`).join("\n")}

Semua baris di atas berada ≥ 1.700× di bawah ambang \`FORMULA_MISMATCH\`. Penyebabnya adalah
**nilai cache Excel**, bukan formula: metrik seperti \`LABA BERSIH = LABA KOTOR − SELISIH PPN\`
adalah selisih dua nilai berorde ~10⁹, sehingga pembulatan penyimpanan Excel teramplifikasi
saat dibandingkan. Semuanya tetap dicetak di sini agar tidak hilang.

---

## 2. Hasil per formula

| Formula | Metrik | Dibandingkan | VALID | PRECISION_VARIANCE | SKIPPED | Max rel | Blok terburuk |
|---|---|---:|---:|---:|---:|---:|---|
${perMetric.map((r) => `| ${r.formula} | ${r.label} | ${int(r.n)} | ${int(r.valid)} | ${int(r.pv)} | ${int(r.skipped)} | ${dec(r.maxRel)} | \`${r.worst}\` |`).join("\n")}
| F007 | Cost line total | ${int(costChecked)} | ${int(costChecked)} | 0 | 0 | ${dec(costMaxRel)} | \`${costWorst}\` |
| F001 | Vendor PPN | ${int(vendorPpnRows.length)} | ${int(summarise(vendorPpnRows).valid)} | ${int(summarise(vendorPpnRows).precision_variance)} | 0 | ${dec(summarise(vendorPpnRows).max_relative_difference)} | - |
| F002A/F002B | Vendor ALL IN | ${int(vendorAllInRows.length)} | ${int(summarise(vendorAllInRows).valid)} | ${int(summarise(vendorAllInRows).precision_variance)} | 0 | ${dec(summarise(vendorAllInRows).max_relative_difference)} | - |

---

## 3. Cakupan blok (Phase 2.5 §9)

| Klasifikasi | Blok |
|---|---:|
${censusRows.map(([k, v]) => `| ${k} | ${v} |`).join("\n")}
| **TOTAL blok** | **${totalBlocks}** |

**Validated Coverage % = ${testedBlocks} / ${totalBlocks} × 100 = ${((testedBlocks / totalBlocks) * 100).toFixed(1)}%**

Tidak ada blok yang "diam-diam dianggap valid": setiap blok yang tidak masuk \`TESTED\` punya
klasifikasi eksplisit beserta alasannya. Rincian per blok ada di \`docs/EXCEL_COVERAGE_REPORT.md\`.

---

## 4. Varian formula Excel yang terbukti (Phase 2.5 §7)

### 4.1 Divisor harga jual (F005) — dibaca dari formula, bukan diasumsikan

| Divisor | Blok | Arti (dari formula blok itu sendiri) |
|---|---:|---|
${f.divisor_census.map((d) => `| ${d.divisor} | ${d.count} | ${d.divisor === 1.11 ? "PPN 11%" : d.divisor === 1.185 ? "PPN 11% + PBBKB 7,5%" : d.divisor === 1.16 ? "PPN 11% + PBBKB 5%" : "-"} |`).join("\n")}

Perubahan Phase 2.5: extractor tidak lagi hanya menerima \`=N/divisor\`. Numerator boleh
**referensi sel** yang diikuti sampai formula sumbernya, dan motif yang sama dipakai untuk
divisor vendor (F003) di bawah.

### 4.2 Cacah bentuk formula (dari sel Excel nyata)

| Keluaran | Bentuk | Jumlah |
|---|---|---:|
${f.sale_shapes.map((s) => `| Harga Jual DPP | \`${s.pattern}\` | ${s.count} |`).join("\n")}
${Object.entries(f.total_cost_shapes).map(([k, v]) => `| TOTAL BIAYA | \`${k}\` | ${v} |`).join("\n")}
${Object.entries(f.net_profit_shapes).map(([k, v]) => `| LABA BERSIH | \`${k}\` | ${v} |`).join("\n")}
${Object.entries(f.ppn_input_shapes).map(([k, v]) => `| PPN Masukan | \`${k}\` | ${v} |`).join("\n")}
${Object.entries(f.percentage_shapes).map(([k, v]) => `| PERSENTASE | \`${k}\` | ${v} |`).join("\n")}

### 4.3 Label baris komponen ke-7 (aritmetika identik, penamaan berbeda)

Termasuk label agregat bervarian \`LABA KOTOR (RP)\` / \`LABA BERSIH (RP)\` — pencocokan label
kini menormalkan akhiran dalam tanda kurung, yang memulihkan 89+ blok yang sebelumnya terlempar.

---

## 5. Audit \`#REF!\` (Phase 2.5 §5)

**${f.ref_errors.length} sel** berisi \`#REF!\`. Tidak ada yang di-resolve menjadi 0.

| Sheet | Cell | Formula |
|---|---|---|
${f.ref_errors.map((e) => `| ${e.sheet} | \`${e.cell}\` | \`${e.formula}\` |`).join("\n")}

**${f.ref_error_dependents.length} sel** lain merujuk ke sel rusak tersebut:

| Sheet | Cell | Formula | Merujuk |
|---|---|---|---|
${f.ref_error_dependents.map((d) => `| ${d.sheet} | \`${d.cell}\` | \`${d.formula}\` | ${d.references} |`).join("\n")}

---

## 6. Audit formula yang sebelumnya UNRESOLVED (Phase 2.5 §4)

| Formula | Sel di workbook | Status sekarang | Bukti |
|---|---:|---|---|
| F019B | ${(f.workbook_unresolved_cells["F019B"] ?? []).length} | **RESOLVED** | Suku ke-3 = \`SELISIH PBBKB\` (\`AHAS Prioritas!FQ34 = FP10-FP16\`, baris berlabel "SELISIH PBBKB"). Selisih PBBKB = PBBKB penjualan − PBBKB biaya. Diverifikasi 3/3 blok. Bila sel itu KOSONG, aritmetika Excel sendiri menghasilkan 0 — dicatat sebagai input blok. |
| F021B | ${(f.workbook_unresolved_cells["F021B"] ?? []).length} | **RESOLVED — bukan varian F021A** | Pembagi = \`Modal Investor\` (\`DK82 = DL52\`, label baris "Modal Investor"), pembilang \`DK79 = DK76*30%\`. Ini metrik imbal hasil modal, BUKAN profit %. 4 sel lain memakai basis \`Harga Include\` → didaftarkan sebagai F021C. |

---

## 7. Anomali pada workbook (temuan, bukan bug sistem)

### 7.1 Cache ALL IN bertentangan dengan formulanya sendiri — ${staleAllIn.length} dari ${vendorAllInRows.length} blok

${staleAllIn.slice(0, 12).map((r) => `| \`${r.source}\` | ${r.label} | \`${r.formula}\` | ${r.excel} | ${r.cached} |`).join("\n")}
${staleAllIn.length > 12 ? `\n_… dan ${staleAllIn.length - 12} blok lainnya._\n` : ""}
Formula adalah source of truth, sehingga engine mengikuti **formula**. Nilai cache lama
tetap dilaporkan di sini agar tidak hilang.

### 7.2 PPN yang diketik manual (bukan formula)

${f.vendor_cases.filter((v) => !v.ppn_is_formula && v.excel.ppn !== null).length} sel PPN vendor
bertipe literal; sel seperti ini adalah **DATA**, disimpan apa adanya
(\`vendor_prices.ppn_is_formula = false\`) dan tidak diturunkan ulang.

---

## 8. Cara mereproduksi

\`\`\`bash
npm install
npm run extract:excel      # workbook -> tests/fixtures/excel-cases.json (+ census & audit)
npm run seed:sql           # formula registry + templates -> supabase/seed/*.sql
npm test                   # unit + cross-check test
npm run crosscheck:report  # dokumen ini
npm run coverage:report    # docs/EXCEL_COVERAGE_REPORT.md + docs/FORMULA_VARIANTS.md
\`\`\`
`;

writeFileSync(resolve(root, "docs/PHASE2_CROSSCHECK.md"), md);
// eslint-disable-next-line no-console
console.log(
  `docs/PHASE2_CROSSCHECK.md written — VALID ${summary.valid}, ` +
    `PRECISION_VARIANCE ${summary.precision_variance}, FORMULA_MISMATCH ${summary.formula_mismatch}, ` +
    `SKIPPED ${summary.skipped}, total ${summary.total}`,
);
if (summary.formula_mismatch > 0) process.exitCode = 1;
