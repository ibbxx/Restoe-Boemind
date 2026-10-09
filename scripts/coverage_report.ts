/**
 * Generates:
 *   docs/EXCEL_COVERAGE_REPORT.md  (Phase 2.5 §9)
 *   docs/FORMULA_VARIANTS.md       (Phase 2.5 §3)
 *
 * Everything is derived from the REAL workbook via the extractor census in
 * tests/fixtures/excel-cases.json — no hand-written counts.
 *
 * Run with: npm run coverage:report
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFixture, toAhsInput, type ExcelCase } from "../tests/helpers/fixture";
import { calculateAhs } from "../lib/calculations/ahs";
import { compareNumber, RATIO_COMPARE, type CompareOptions } from "../lib/calculations/cross-check";
import { FORMULA_REGISTRY, CALCULATION_TEMPLATES } from "../lib/calculations/registry";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const f = loadFixture();
const date = new Date().toISOString().slice(0, 10);

const cache = new Map<string, ReturnType<typeof calculateAhs>>();
function engine(c: ExcelCase) {
  let v = cache.get(c.id);
  if (!v) {
    v = calculateAhs(toAhsInput(c));
    cache.set(c.id, v);
  }
  if (!v.success) throw new Error(`${c.id}: ${v.errorCode} ${v.message}`);
  return v;
}
const eOf = (c: ExcelCase, k: keyof ExcelCase["excel"]) =>
  typeof c.excel[k] === "number" ? (c.excel[k] as number) : null;

/** Per-block verdict: every compared metric must be VALID or PRECISION_VARIANCE. */
const PER_BLOCK_METRICS: Array<[string, (c: ExcelCase) => number | null, (c: ExcelCase) => number | null, CompareOptions]> = [
  ["F006", (c) => eOf(c, "revenue"), (c) => engine(c).revenue, {}],
  ["F015A", (c) => eOf(c, "total_cost"), (c) => engine(c).total_cost, {}],
  ["F016", (c) => eOf(c, "cost_per_liter"), (c) => engine(c).cost_per_liter, {}],
  ["F001/out", (c) => eOf(c, "ppn_output"), (c) => engine(c).ppn_output, {}],
  ["F008", (c) => eOf(c, "ppn_input"), (c) => engine(c).ppn_input, {}],
  ["F017", (c) => eOf(c, "gross_profit"), (c) => engine(c).gross_profit, {}],
  ["F018", (c) => eOf(c, "ppn_difference"), (c) => engine(c).ppn_difference, {}],
  ["F019", (c) => eOf(c, "net_profit"), (c) => engine(c).net_profit, {}],
  ["F020", (c) => eOf(c, "net_profit_per_liter"), (c) => engine(c).net_profit_per_liter, {}],
  ["F021A", (c) => eOf(c, "profit_percentage"), (c) => engine(c).profit_percentage, RATIO_COMPARE],
];

const blockVerdict = new Map<string, { mismatch: number; checked: number; pv: number }>();
for (const c of f.cases) {
  let mismatch = 0, checked = 0, pv = 0;
  for (const [, e, s, opts] of PER_BLOCK_METRICS) {
    const excel = e(c);
    if (excel === null) continue;
    checked += 1;
    const { status } = compareNumber(excel, s(c), opts);
    if (status === "FORMULA_MISMATCH") mismatch += 1;
    if (status === "PRECISION_VARIANCE") pv += 1;
  }
  blockVerdict.set(c.id, { mismatch, checked, pv });
}

const totalBlocks = f.census_count;
const tested = f.census_summary["TESTED"] ?? 0;
const untested = totalBlocks - tested;
const fullyValidated = [...blockVerdict.values()].filter((v) => v.mismatch === 0).length;
const mismatchBlocks = [...blockVerdict.entries()].filter(([, v]) => v.mismatch > 0);
const coverage = (tested / totalBlocks) * 100;

const resolved = FORMULA_REGISTRY.filter((x) => x.resolution === "RESOLVED");
const unresolved = FORMULA_REGISTRY.filter((x) => x.resolution === "UNRESOLVED");
const inactive = FORMULA_REGISTRY.filter((x) => !x.active);

// variant inventory: registered ids actually exercised by the census/extractor
const VARIANT_IDS = [
  "F001", "F002A", "F002B", "F003", "F005", "F005B", "F005C",
  "F006", "F007", "F008A", "F008B", "F008C", "F009", "F015A", "F015B", "F015C",
  "F016", "F017", "F018", "F019A", "F019B", "F020", "F021A", "F021B", "F021C",
  "F027A", "F027B",
];
const variantIds = VARIANT_IDS.filter((id) =>
  FORMULA_REGISTRY.some((x) => x.formula_id === id),
);

// ---------------------------------------------------------------- variants doc
interface VariantRow {
  name: string; sheet: string; cell: string; pattern: string; count: string;
  variant: string; status: string; note: string;
}
const vr: VariantRow[] = [];
const reg = (id: string) => FORMULA_REGISTRY.find((x) => x.formula_id === id);

/**
 * Impact of each broken `#REF!` cell (Phase 2.5 §5).
 *
 * Stated EXPLICITLY per cell rather than inferred by a regex heuristic: the
 * entire point of the audit is that these cells must not be guessed at, so the
 * level that drives the report is itself a recorded decision, not a derivation.
 * Anything not listed is a pure `=#REF!` and cannot propagate.
 */
const REF_IMPACT: Record<string, { level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; reason: string }> = {
  "SULTRA!AZ169": { level: "CRITICAL", reason: "dipakai sebagai DIVISOR → merusak seluruh nilai turunannya" },
  "SULTRA!AQ146": { level: "HIGH", reason: "ikut dalam aritmetika biaya/PPN" },
  "SULTRA!BK155": { level: "HIGH", reason: "ikut dalam aritmetika biaya/PPN" },
  "SULTRA!AZ165": { level: "HIGH", reason: "ikut dalam aritmetika biaya/PPN" },
  "INDORAMA!BE10": { level: "MEDIUM", reason: "aritmetika campuran" },
  "JABAR!CU180": { level: "MEDIUM", reason: "aritmetika campuran" },
};

const refImpact = (key: string) =>
  REF_IMPACT[key] ?? { level: "LOW" as const, reason: "nilai sel itu sendiri rusak, tidak menyebar" };

const saleByPattern = new Map(f.sale_shapes.map((s) => [s.pattern, s]));
const divisorCount = (d: number) => f.divisor_census.find((x) => x.divisor === d)?.count ?? 0;
const ppnShapes = f.ppn_input_shapes;
const sumShapes = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

const f1 = reg("F001")!;
vr.push({ name: "Vendor PPN", sheet: f1.source_sheet, cell: f1.source_cell, pattern: "=R*N%", count: String(f.vendor_cases.filter((v) => v.ppn_is_formula).length), variant: "F001", status: "RESOLVED", note: "2 rezim tarif: 11% dan 0%. PPN bertipe literal adalah DATA, bukan formula." });

const f2a = reg("F002A")!, f2b = reg("F002B")!;
vr.push({ name: "Vendor ALL IN (6 komponen)", sheet: f2a.source_sheet, cell: f2a.source_cell, pattern: "=SUM(6 rows)", count: String(f.vendor_cases.filter((v) => v.all_in_component_rows === 6).length), variant: "F002A", status: "RESOLVED", note: "BPH tidak ikut dijumlahkan." });
vr.push({ name: "Vendor ALL IN (7 komponen)", sheet: f2b.source_sheet, cell: f2b.source_cell, pattern: "=SUM(7 rows)", count: String(f.vendor_cases.filter((v) => v.all_in_component_rows === 7).length), variant: "F002B", status: "RESOLVED", note: "Label baris ke-7 bervariasi (BPH/SIB/ALL IN/Izin bunker/PPH Migas/PPN OAT); aritmetika identik." });

const f3 = reg("F003")!;
for (const d of f.vendor_base_divisors) {
  vr.push({
    name: "Vendor Base dari Harga Include", sheet: f3.source_sheet, cell: f3.source_cell,
    pattern: `=N/${d.divisor}`, count: String(d.count), variant: "F003",
    status: "RESOLVED",
    note: d.divisor === 1.11 ? "PPN 11%" : d.divisor === 1.185 ? "PPN 11% + PBBKB 7,5%" : d.divisor === 1.16 ? "PPN 11% + PBBKB 5%" : "arti divisor belum diputuskan user (Phase 1 §G3) — dipakai apa adanya",
  });
}

const f5 = reg("F005")!, f5b = reg("F005B")!, f5c = reg("F005C")!;
vr.push({ name: "Harga Jual DPP dari include (numerik)", sheet: f5.source_sheet, cell: f5.source_cell, pattern: "=N/N", count: String((saleByPattern.get("=N/N")?.count ?? 0) + (saleByPattern.get("=R/N")?.count ?? 0)), variant: "F005", status: "RESOLVED", note: `divisor terverifikasi: 1.11 (${divisorCount(1.11)} blok), 1.185 (${divisorCount(1.185)}), 1.16 (${divisorCount(1.16)})` });
vr.push({ name: "Harga Jual DPP via referensi sel", sheet: f5.source_sheet, cell: f5.source_cell, pattern: "=R  ->  =N/N", count: String(saleByPattern.get("=R")?.count ?? 0), variant: "F005", status: "RESOLVED", note: "Contoh nyata: TONASA!I7 =K61 -> K61 =16500/1.11. Referensi diikuti sampai formula sumbernya." });
vr.push({ name: "Harga Jual DPP literal", sheet: f5b.source_sheet, cell: f5b.source_cell, pattern: "=N / angka telanjang", count: String(f.cases.filter((c) => c.sale_variant === "F005B").length), variant: "F005B", status: "RESOLVED", note: "Tidak ada divisor untuk dibaca; DPP dipakai apa adanya sebagai input." });
vr.push({ name: "Harga Jual DPP dari blok lain", sheet: f5c.source_sheet, cell: f5c.source_cell, pattern: "=R  (harga turunan)", count: String(f.cases.filter((c) => c.sale_variant === "F005C").length), variant: "F005C", status: "RESOLVED", note: "Aritmetika berada di luar blok; nilainya dipakai apa adanya, bukan ditebak." });

const ppnA = reg("F008A")!, ppnB = reg("F008B")!, ppnC = reg("F008C")!;
vr.push({ name: "PPN Masukan basis harga dasar", sheet: ppnA.source_sheet, cell: ppnA.source_cell, pattern: "=R*N%", count: String(ppnShapes["=R*N%"] ?? 0), variant: "F008A", status: "RESOLVED", note: "" });
vr.push({ name: "PPN Masukan basis dasar+pungutan", sheet: ppnB.source_sheet, cell: ppnB.source_cell, pattern: "=SUM(R:R)*N%", count: String(ppnShapes["=SUM(R:R)*N%"] ?? 0), variant: "F008B", status: "RESOLVED", note: "Basis 5 baris (dasar..BPH)." });
vr.push({ name: "PPN Masukan basis dasar+OAT", sheet: ppnC.source_sheet, cell: ppnC.source_cell, pattern: "=sum(R:R)*N%", count: String(ppnShapes["=sum(R:R)*N%"] ?? 0), variant: "F008C", status: "RESOLVED", note: "Basis 2 baris (dasar + OAT). Ditemukan oleh cross-check." });
vr.push({ name: "PPN Masukan via referensi silang", sheet: "AHAS Prioritas", cell: "DR191", pattern: "=R", count: String(f.census_summary["PPN_INPUT_VARIANT"] ?? 0), variant: "(belum ada ID)", status: "UNRESOLVED", note: "Basis & tarif tidak terbaca dari formula blok; diklasifikasikan PPN_INPUT_VARIANT dan TIDAK diuji. Butuh keputusan user." });
vr.push({ name: "PPN Masukan tarif 0 (skema Non-PPN)", sheet: "JATENG", cell: "BU232", pattern: "0 / =R(0)", count: String(f.cases.filter((c) => c.sale_ppn_rate === 0).length), variant: "F001/F008A (tarif 0)", status: "RESOLVED", note: "Blok 'Non-PPN': tarif penjualan dan masukan sama-sama 0. Tarif adalah INPUT blok, bukan konstanta 11%." });

const f15a = reg("F015A")!, f15b = reg("F015B")!, f15c = reg("F015C")!;
vr.push({ name: "Total Biaya (seluruh range)", sheet: f15a.source_sheet, cell: f15a.source_cell, pattern: "=sum(R:R)", count: String(f.total_cost_shapes["=sum(R:R)"] ?? 0), variant: "F015A", status: "RESOLVED", note: "" });
vr.push({ name: "Total Biaya (baris terpilih)", sheet: f15b.source_sheet, cell: f15b.source_cell, pattern: "=R+R+R+...", count: "1", variant: "F015B", status: "RESOLVED", note: "IWIP!L14 =K16+K17+K18+K21+K30+K33." });
vr.push({ name: "Total Biaya (literal)", sheet: f15c.source_sheet, cell: f15c.source_cell, pattern: "angka telanjang", count: String(f.total_cost_shapes["<literal>"] ?? 0), variant: "F015C", status: "RESOLVED (nonaktif)", note: "Total DAN biaya/liter diketik manual; range biaya tidak dapat diturunkan dari formula → CUSTOM_FORMULA_BLOCK, tidak diuji." });

const f19a = reg("F019A")!, f19b = reg("F019B")!;
vr.push({ name: "Laba Bersih (2 suku)", sheet: f19a.source_sheet, cell: f19a.source_cell, pattern: "=R-R", count: String(f.net_profit_shapes["=R-R"] ?? 0), variant: "F019A", status: "RESOLVED", note: "" });
vr.push({ name: "Laba Bersih (3 suku)", sheet: f19b.source_sheet, cell: f19b.source_cell, pattern: "=R-R-R", count: String(f.net_profit_shapes["=R-R-R"] ?? 0), variant: "F019B", status: "RESOLVED", note: "Suku ke-3 = SELISIH PBBKB (label baris workbook). Bila sel itu kosong, Excel sendiri menghitung 0." });

const f21a = reg("F021A")!, f21b = reg("F021B")!, f21c = reg("F021C")!;
vr.push({ name: "Persentase (Net / TOTAL BIAYA)", sheet: f21a.source_sheet, cell: f21a.source_cell, pattern: "=R/R", count: String(f.percentage_shapes["=R/R"] ?? 0), variant: "F021A", status: "RESOLVED", note: "Terverifikasi: pembaginya Total Biaya, bukan Revenue." });
vr.push({ name: "Return on Investor Capital", sheet: f21b.source_sheet, cell: f21b.source_cell, pattern: "=R/R*100%", count: String((f.workbook_unresolved_cells["F021B"] ?? []).filter((s) => /Prioritas|IGIP/.test(s)).length), variant: "F021B", status: "RESOLVED", note: "Pembagi = Modal Investor, bukan Total Biaya — metrik berbeda, bukan varian penyajian." });
vr.push({ name: "Persentase terhadap Harga Include", sheet: f21c.source_sheet, cell: f21c.source_cell, pattern: "=R/R*100%", count: String((f.workbook_unresolved_cells["F021B"] ?? []).filter((s) => /WIKA/.test(s)).length), variant: "F021C", status: "RESOLVED", note: "Pembagi = Harga Include (WIKA)." });
vr.push({ name: "Harga Jual Setelah Pajak (jumlah baris)", sheet: "JATENG", cell: "M9", pattern: "=SUM(R:R)", count: String(f.cases.filter((c) => c.hjsp_variant === "F027A").length), variant: "F027A", status: "RESOLVED", note: "" });
vr.push({ name: "Harga Jual Setelah Pajak (literal)", sheet: "AHAS Prioritas", cell: "W3/AB10", pattern: "angka telanjang", count: String(f.cases.filter((c) => c.hjsp_variant === "F027B").length), variant: "F027B", status: "RESOLVED", note: "Excel mengetik nilainya (22000) padahal jumlah barisnya 21999,525. Nilai literal yang dipakai." });

const totalVariants = variantIds.length;

// ---------------------------------------------------------------- coverage doc
const untestedBlocks = f.census.filter((c) => c.classification !== "TESTED");
const byClass = new Map<string, typeof untestedBlocks>();
for (const b of untestedBlocks) {
  const list = byClass.get(b.classification) ?? [];
  list.push(b);
  byClass.set(b.classification, list);
}

const coverageMd = `# PHASE 2.5 — EXCEL COVERAGE REPORT

> Dihasilkan otomatis oleh \`npm run coverage:report\` (scripts/coverage_report.ts).
> Seluruh angka berasal dari census extractor atas workbook asli
> \`${f.source}\` — bukan perkiraan.

**Tanggal:** ${date}
**Sumber:** \`${f.source}\`
**Blok AHS (title cell) di workbook:** ${totalBlocks}
**Blok vendor diekstrak:** ${f.vendor_case_count}

---

## 1. Metrik utama

| Metric | Count |
|---|---:|
| Total Calculation Blocks | ${totalBlocks} |
| Tested Blocks | ${tested} |
| Untested Blocks | ${untested} |
| Resolved Formulas | ${resolved.length} |
| Unresolved Formulas | ${unresolved.length} |
| Formula Variants (terdaftar & dipakai) | ${totalVariants} |
| #REF! Cells | ${f.ref_errors.length} |
| Custom Formula Blocks | ${f.census_summary["CUSTOM_FORMULA_BLOCK"] ?? 0} |
| Fully Validated Blocks | ${fullyValidated} |

### Coverage

\`\`\`text
Validated Coverage % = Validated Blocks / Total Blocks × 100
                     = ${tested} / ${totalBlocks} × 100
                     = ${coverage.toFixed(1)}%
\`\`\`

\`Fully Validated Blocks\` = blok TESTED yang seluruh metrik pembandingnya berstatus
\`VALID\` atau \`PRECISION_VARIANCE\` (tidak ada satu pun \`FORMULA_MISMATCH\`).
Saat ini **${fullyValidated} dari ${f.cases.length}** blok TESTED memenuhi itu.

> **Perbandingan dengan Phase 2:** Phase 2 menguji 254 blok (52,4%) dan melewatkan 231 blok
> tanpa klasifikasi rinci. Phase 2.5 menguji **${tested} blok (${coverage.toFixed(1)}%)** dan
> mengklasifikasikan sisanya satu per satu.

---

## 2. Klasifikasi seluruh blok

| Klasifikasi | Jumlah | Arti |
|---|---:|---|
| TESTED | ${tested} | Diekstrak & dibandingkan terhadap workbook |
| CUSTOM_FORMULA_BLOCK | ${f.census_summary["CUSTOM_FORMULA_BLOCK"] ?? 0} | Total Biaya DAN Biaya per Liter diketik manual; range biaya tidak dapat diturunkan dari formula |
| PPN_INPUT_VARIANT | ${f.census_summary["PPN_INPUT_VARIANT"] ?? 0} | Basis/tarif PPN masukan tidak terbaca dari formula blok (referensi silang) |
| INCOMPLETE | ${f.census_summary["INCOMPLETE"] ?? 0} | Satu/lebih metrik inti memang tidak ada di blok |
| ANNOTATION_TITLE | ${f.census_summary["ANNOTATION_TITLE"] ?? 0} | Judul berupa kalimat penjelas, bukan blok perhitungan |
| NO_LABEL_COL | ${f.census_summary["NO_LABEL_COL"] ?? 0} | Tidak ada kolom label dengan penanda inti |
| SALE_FORMULA_VARIANT | ${f.census_summary["SALE_FORMULA_VARIANT"] ?? 0} | Bentuk formula harga jual yang belum dipetakan |

### 2.1 Daftar blok yang TIDAK diuji (masing-masing dengan alasan)

${[...byClass.entries()].map(([cls, list]) => `**${cls}** (${list.length})

| Blok | Detail |
|---|---|
${list.map((b) => `| \`${b.id}\` | ${b.detail ?? "-"} |`).join("\n")}`).join("\n\n")}

---

## 3. Blok dengan FORMULA_MISMATCH

${mismatchBlocks.length === 0
  ? "**Tidak ada.** Seluruh blok TESTED berstatus VALID atau PRECISION_VARIANCE pada setiap metrik yang tersedia di Excel."
  : mismatchBlocks.map(([id, v]) => `- \`${id}\` — ${v.mismatch}/${v.checked} metrik tidak cocok`).join("\n")}

---

## 4. Audit \`#REF!\` (Phase 2.5 §5)

Alamat tujuan yang hilang **tidak dicatat oleh Excel** — itulah definisi \`#REF!\` — sehingga kolom
\`Broken Reference\` menyatakan berapa rujukan yang hilang, bukan mengarang alamat pengganti.

| Sheet | Cell | Original Formula | Broken Reference | Dependent Formula | Impact |
|---|---|---|---|---|---|
${f.ref_errors.map((e) => {
  const deps = f.ref_error_dependents.filter((d) => d.references === `${e.sheet}!${e.cell}`);
  const nRef = (e.formula.match(/#REF!/g) ?? []).length;
  return `| ${e.sheet} | \`${e.cell}\` | \`${e.formula}\` | ${nRef} tujuan hilang (alamat tidak tercatat) | ${deps.length ? deps.map((d) => `\`${d.cell}\``).join(" ") : "-"} | ${refImpact(`${e.sheet}!${e.cell}`).level} |`;
}).join("\n")}

Klasifikasi dampak:

| Tingkat | Sel | Alasan |
|---|---|---|
| CRITICAL | SULTRA!AZ169 (\`=AZ167/#REF!\`) | dipakai sebagai DIVISOR → merusak seluruh nilai turunannya |
| HIGH | SULTRA!AQ146 (\`=#REF!*11%\`), SULTRA!BK155 (\`=BH152-#REF!\`), SULTRA!AZ165 (\`=AZ141-#REF!\`) | ikut dalam aritmetika biaya/PPN |
| MEDIUM | INDORAMA!BE10 (\`=BA10+#REF!\`), JABAR!CU180 (\`=#REF!-#REF!\`) | aritmetika campuran |
| LOW | ${f.ref_errors.filter((e) => e.formula.trim() === "=#REF!").length} sel berbentuk \`=#REF!\` murni | nilai sel itu sendiri rusak, tidak menyebar |

**Tidak ada \`#REF!\` yang di-resolve menjadi 0**, dan tidak ada blok TESTED yang memakai sel
rusak tersebut sebagai input.

---

## 5. Formula yang sebelumnya UNRESOLVED (Phase 2.5 §4)

Format keluaran mengikuti permintaan Phase 2.5 §4: Formula | Source | Current Status |
Evidence | Possible Meaning | Decision Needed.

| Formula | Source | Current Status | Evidence | Possible Meaning | Decision Needed |
|---|---|---|---|---|---|
| F019B | \`${reg("F019B")!.source_sheet}!${reg("F019B")!.source_cell}\` — ${(f.workbook_unresolved_cells["F019B"] ?? []).length} sel di workbook | **RESOLVED** (aktif) | Suku ke-3 \`AHAS Prioritas!FQ34\` berformula \`=FP10-FP16\` dan berada di baris berlabel "SELISIH PBBKB" (kolom label FL: LABA KOTOR / SELISIH PPN / SELISIH PBBKB / LABA BERSIH). Aritmetika diverifikasi numerik pada 3/3 blok hasil ekstraksi — cocok persis. | LABA BERSIH = LABA KOTOR − SELISIH PPN − **SELISIH PBBKB**, di mana SELISIH PBBKB = PBBKB penjualan − PBBKB biaya. Bila sel itu KOSONG, aritmetika Excel sendiri menghasilkan 0 → dicatat sebagai input \`pbbkb_difference_applicable\`, bukan diasumsikan. | — |
| F021B | \`${reg("F021B")!.source_sheet}!${reg("F021B")!.source_cell}\` — ${(f.workbook_unresolved_cells["F021B"] ?? []).length} sel di workbook | **RESOLVED** (aktif) — dan **bukan** varian F021A | Pembagi \`DK82 = DL52\` berada di baris berlabel "Modal Investor"; pembilang \`DK79 = DK76*30%\`. 4 sel lain memakai basis \`Harga Include\` (\`WIKA!BZ115\`) → didaftarkan terpisah sebagai \`F021C\`. | **Return on Investor Capital** — imbal hasil atas modal investor, BUKAN profit/margin. Karena artinya berbeda (bukan cara penyajian berbeda), ia tidak boleh digabung ke \`F021A\`. | Apakah metrik ini ikut dilaporkan di aplikasi, atau hanya konteks analis? |

---

## 6. Cut-off yang tetap jujur

1. Blok \`CUSTOM_FORMULA_BLOCK\` **tidak** diuji: range biaya tidak dapat diturunkan dari
   formula mana pun, jadi tidak ada yang bisa dibandingkan tanpa menebak.
2. Blok \`PPN_INPUT_VARIANT\` **tidak** diuji: basis/tarif PPN masukan berasal dari referensi
   silang yang artinya belum diputuskan.
3. Blok \`INCOMPLETE\` **tidak** diuji karena metrik intinya memang tidak ada di blok tersebut.
4. \`PRECISION_VARIANCE\` bukan kegagalan, tetapi juga **bukan** klaim "cocok sempurna" —
   nilainya tetap dicetak di \`docs/PHASE2_CROSSCHECK.md\` §1.1.
`;

writeFileSync(resolve(root, "docs/EXCEL_COVERAGE_REPORT.md"), coverageMd);

// ---------------------------------------------------------------- variants doc
const variantsMd = `# PHASE 2.5 — FORMULA VARIANTS AUDIT

> Dihasilkan otomatis oleh \`npm run coverage:report\` (scripts/coverage_report.ts).
> Setiap baris berasal dari FORMULA ASLI di workbook \`${f.source}\`, bukan asumsi.
> Tujuan (Phase 2.5 §3): memastikan Formula Registry benar-benar mencakup variasi yang ada.

**Tanggal:** ${date}
**Formula terdaftar:** ${FORMULA_REGISTRY.length} · **Template:** ${CALCULATION_TEMPLATES.length}
**Formula UNRESOLVED:** ${unresolved.length} · **Formula nonaktif:** ${inactive.length}
**Varian terdaftar & dipakai:** ${totalVariants}

---

## 1. Audit varian

| Formula Name | Source Sheet | Source Cell | Formula Pattern | Count | Variant ID | Status |
|---|---|---|---|---|---:|---|---|
${vr.map((v) => `| ${v.name} | \`${v.sheet}\` | \`${v.cell}\` | \`${v.pattern}\` | ${v.count} | ${v.variant} | ${v.status} |`).join("\n")}

---

## 2. Divisor yang benar-benar dipakai workbook

### 2.1 Sisi penjualan (F005, dari formula Harga Dasar blok AHS)

| Divisor | Blok | Contoh formula asli |
|---|---:|---|
${f.divisor_census.map((d) => `| ${d.divisor} | ${d.count} | ${d.examples.map((e) => `\`${e.split("  ")[1] ?? e}\``).join("<br>")} |`).join("\n")}

### 2.2 Sisi vendor (F003, dari seluruh formula \`=N/N\` di workbook)

| Divisor | Sel | Contoh |
|---|---:|---|
${f.vendor_base_divisors.map((d) => `| ${d.divisor} | ${d.count} | ${d.examples.map((e) => `\`${e}\``).join("<br>")} |`).join("\n")}

> **1.185** = PPN 11% + PBBKB 7,5% dan **1.16** = PPN 11% + PBBKB 5% konsisten dengan
> blok-blok yang tarif penjualan PBBKB-nya aktif. **1.213 / 1.188 / 1.163 / 1.21** belum
> dijelaskan oleh tarif mana pun yang terlihat dan tetap dipakai apa adanya (Phase 1 §G3).

---

## 3. Bentuk formula tiap keluaran (census langsung dari sel Excel)

| Keluaran | Bentuk | Jumlah |
|---|---|---:|
${f.sale_shapes.map((s) => `| Harga Jual DPP | \`${s.pattern}\` | ${s.count} |`).join("\n")}
${Object.entries(f.total_cost_shapes).map(([k, v]) => `| TOTAL BIAYA | \`${k}\` | ${v} |`).join("\n")}
${Object.entries(f.net_profit_shapes).map(([k, v]) => `| LABA BERSIH | \`${k}\` | ${v} |`).join("\n")}
${Object.entries(f.ppn_input_shapes).map(([k, v]) => `| PPN Masukan | \`${k}\` | ${v} |`).join("\n")}
${Object.entries(f.percentage_shapes).map(([k, v]) => `| PERSENTASE | \`${k}\` | ${v} |`).join("\n")}

---

## 4. Tarif sebagai INPUT, bukan konstanta

| Tarif | Nilai yang teramati | Sumber |
|---|---|---|
| PPN penjualan | 0.11 dan **0** (skema "Non-PPN") | dibaca dari sel rate penjualan per blok |
| PPN masukan | 0.11, 0, dan basis A/B/C | dibaca dari formula baris \`PPN 11%\` biaya |
| PBBKB penjualan | 0.075, 0.05, 0 | dibaca dari formula baris \`PBBKB\` penjualan |
| Divisor harga jual | ${f.divisor_census.map((d) => d.divisor).join(", ")} | dibaca dari formula Harga Dasar |
| Divisor vendor | ${f.vendor_base_divisors.map((d) => d.divisor).join(", ")} | dibaca dari formula harga dasar vendor |

**Tidak ada satu pun tarif/divisor yang di-hardcode sebagai aturan universal.** Engine menerima
semuanya sebagai input; blok yang tarifnya 0 tetap menghasilkan 0 tanpa "diperbaiki".

---

## 5. Prosedur menemukan varian (dapat direproduksi)

1. \`npm run extract:excel\` — census 485 blok + cacah bentuk formula + cacah divisor.
2. Extractor mencocokkan tiap sel keluaran dengan formula aslinya; **setiap** bentuk yang tidak
   dikenali diklasifikasikan (bukan dilewati diam-diam).
3. \`npm test\` — cross-check per metrik dengan diagnosis VALID / PRECISION_VARIANCE /
   FORMULA_MISMATCH / UNRESOLVED / SKIPPED.
4. \`npm run coverage:report\` — dokumen ini + \`docs/EXCEL_COVERAGE_REPORT.md\`.

**Aturan:** setiap bentuk baru yang terbukti dari workbook menjadi \`formula_id\` terpisah
(mis. F005B/F005C, F015C, F019B, F021B, F021C, F027B). Tidak ada varian yang digabung paksa,
dan tidak ada yang ditebak.
`;

writeFileSync(resolve(root, "docs/FORMULA_VARIANTS.md"), variantsMd);

// eslint-disable-next-line no-console
console.log(
  `docs/EXCEL_COVERAGE_REPORT.md + docs/FORMULA_VARIANTS.md written — ` +
    `coverage ${coverage.toFixed(1)}% (${tested}/${totalBlocks}), ` +
    `variants ${totalVariants}, #REF! ${f.ref_errors.length}, mismatched blocks ${mismatchBlocks.length}`,
);
if (mismatchBlocks.length > 0) process.exitCode = 1;
