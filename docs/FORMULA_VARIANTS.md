# PHASE 2.5 — FORMULA VARIANTS AUDIT

> Dihasilkan otomatis oleh `npm run coverage:report` (scripts/coverage_report.ts).
> Setiap baris berasal dari FORMULA ASLI di workbook `ANALISIS HARGA SATUAN (2026).xlsx`, bukan asumsi.
> Tujuan (Phase 2.5 §3): memastikan Formula Registry benar-benar mencakup variasi yang ada.

**Tanggal:** 2026-10-09
**Formula terdaftar:** 36 · **Template:** 5
**Formula UNRESOLVED:** 0 · **Formula nonaktif:** 1
**Varian terdaftar & dipakai:** 25

---

## 1. Audit varian

| Formula Name | Source Sheet | Source Cell | Formula Pattern | Count | Variant ID | Status |
|---|---|---|---|---|---:|---|---|
| Vendor PPN | `Eval Vendor TL` | `H12` | `=R*N%` | 1107 | F001 | RESOLVED |
| Vendor ALL IN (6 komponen) | `JATENG` | `D16` | `=SUM(6 rows)` | 249 | F002A | RESOLVED |
| Vendor ALL IN (7 komponen) | `Eval Vendor TL` | `H18` | `=SUM(7 rows)` | 892 | F002B | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.11` | 719 | F003 | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.16` | 38 | F003 | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.185` | 21 | F003 | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.188` | 21 | F003 | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.213` | 8 | F003 | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.163` | 7 | F003 | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.21` | 5 | F003 | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.165` | 2 | F003 | RESOLVED |
| Vendor Base dari Harga Include | `JATENG` | `D9` | `=N/1.18` | 1 | F003 | RESOLVED |
| Harga Jual DPP dari include (numerik) | `JATENG` | `J10` | `=N/N` | 387 | F005 | RESOLVED |
| Harga Jual DPP via referensi sel | `JATENG` | `J10` | `=R  ->  =N/N` | 40 | F005 | RESOLVED |
| Harga Jual DPP literal | `AHAS Prioritas` | `AK87` | `=N / angka telanjang` | 41 | F005B | RESOLVED |
| Harga Jual DPP dari blok lain | `SULTRA` | `BK144` | `=R  (harga turunan)` | 1 | F005C | RESOLVED |
| PPN Masukan basis harga dasar | `Eval Vendor TL` | `N22` | `=R*N%` | 258 | F008A | RESOLVED |
| PPN Masukan basis dasar+pungutan | `JATENG` | `J20` | `=SUM(R:R)*N%` | 53 | F008B | RESOLVED |
| PPN Masukan basis dasar+OAT | `VIRTUE dan OSS` | `G20` | `=sum(R:R)*N%` | 100 | F008C | RESOLVED |
| PPN Masukan via referensi silang | `AHAS Prioritas` | `DR191` | `=R` | 8 | (belum ada ID) | UNRESOLVED |
| PPN Masukan tarif 0 (skema Non-PPN) | `JATENG` | `BU232` | `0 / =R(0)` | 2 | F001/F008A (tarif 0) | RESOLVED |
| Total Biaya (seluruh range) | `JATENG` | `M13` | `=sum(R:R)` | 475 | F015A | RESOLVED |
| Total Biaya (baris terpilih) | `IWIP ` | `L14` | `=R+R+R+...` | 1 | F015B | RESOLVED |
| Total Biaya (literal) | `TONASA` | `AA300` | `angka telanjang` | 2 | F015C | RESOLVED (nonaktif) |
| Laba Bersih (2 suku) | `Eval Vendor TL` | `Q37` | `=R-R` | 446 | F019A | RESOLVED |
| Laba Bersih (3 suku) | `AHAS Prioritas` | `FQ35` | `=R-R-R` | 28 | F019B | RESOLVED |
| Persentase (Net / TOTAL BIAYA) | `Eval Vendor TL` | `Q39` | `=R/R` | 334 | F021A | RESOLVED |
| Return on Investor Capital | `AHAS Prioritas` | `DL79` | `=R/R*100%` | 6 | F021B | RESOLVED |
| Persentase terhadap Harga Include | `WIKA` | `BZ115` | `=R/R*100%` | 4 | F021C | RESOLVED |
| Harga Jual Setelah Pajak (jumlah baris) | `JATENG` | `M9` | `=SUM(R:R)` | 464 | F027A | RESOLVED |
| Harga Jual Setelah Pajak (literal) | `AHAS Prioritas` | `W3/AB10` | `angka telanjang` | 2 | F027B | RESOLVED |

---

## 2. Divisor yang benar-benar dipakai workbook

### 2.1 Sisi penjualan (F005, dari formula Harga Dasar blok AHS)

| Divisor | Blok | Contoh formula asli |
|---|---:|---|
| 1.11 | 411 | `Perhitungan INU::M6 =22500/1.11`<br>`Perhitungan INU::Y6 =18500/1.11`<br>`(AHAS Prioritas!CL78)`<br>`AHAS Prioritas::DM1 =29000/1.11` |
| 1.185 | 8 | `AHAS Prioritas::BS2 =22600/1.185`<br>`AHAS Prioritas::J3 =22500/1.185`<br>`AHAS Prioritas::AN3 =21500/1.185`<br>`AHAS Prioritas::BC3 =24068/1.185` |
| 1.16 | 7 | `AHAS Prioritas::CU173 =20895/1.16`<br>`AHAS Prioritas::DB173 =21300/1.16`<br>`AHAS Prioritas::DI173 =21300/1.16`<br>`AHAS Prioritas::DP173 =20895/1.16` |

### 2.2 Sisi vendor (F003, dari seluruh formula `=N/N` di workbook)

| Divisor | Sel | Contoh |
|---|---:|---|
| 1.11 | 719 | `Mamuju!D8 =16100/1.11`<br>`Mamuju!E8 =17300/1.11`<br>`Mamuju!I9 =21300/1.11`<br>`Perhitungan INU!O14 =22500/1.11` |
| 1.16 | 38 | `AHAS Prioritas!CW181 =20895/1.16`<br>`AHAS Prioritas!DD181 =21300/1.16`<br>`AHAS Prioritas!DK181 =21300/1.16`<br>`AHAS Prioritas!DR181 =20895/1.16` |
| 1.185 | 21 | `AHAS Prioritas!E10 =18000/1.185`<br>`AHAS Prioritas!R10 =18600/1.185`<br>`AHAS Prioritas!BU10 =22600/1.185`<br>`AHAS Prioritas!L11 =22500/1.185` |
| 1.188 | 21 | `AHAS Prioritas!AG10 =22610/1.188`<br>`AHAS Prioritas!AV10 =22610/1.188`<br>`KALTIM!T55 =15350/1.188`<br>`SULSEL!BK279 =25200/1.188` |
| 1.213 | 8 | `MALUKU!AO30 =26042/1.213`<br>`MALUKU!AO52 =26042/1.213`<br>`MALUKU!BA52 =26042/1.213`<br>`MALUKU!BM52 =26042/1.213` |
| 1.163 | 7 | `TONASA!DT296 =20150/1.163`<br>`JATIM!BM56 =16250/1.163`<br>`JATIM!EZ146 =20184/1.163`<br>`JATIM!FX190 =22000/1.163` |
| 1.21 | 5 | `JABODETABEK!AP96 =20750/1.21`<br>`JABODETABEK!AQ96 =20892/1.21`<br>`JABODETABEK!BC96 =20750/1.21`<br>`JABODETABEK!BD96 =20892/1.21` |
| 1.165 | 2 | `TONASA!HM296 =24500/1.165`<br>`TONASA!IA296 =24500/1.165` |
| 1.18 | 1 | `Rekap IGIP!S33 =22000/1.18` |

> **1.185** = PPN 11% + PBBKB 7,5% dan **1.16** = PPN 11% + PBBKB 5% konsisten dengan
> blok-blok yang tarif penjualan PBBKB-nya aktif. **1.213 / 1.188 / 1.163 / 1.21** belum
> dijelaskan oleh tarif mana pun yang terlihat dan tetap dipakai apa adanya (Phase 1 §G3).

---

## 3. Bentuk formula tiap keluaran (census langsung dari sel Excel)

| Keluaran | Bentuk | Jumlah |
|---|---|---:|
| Harga Jual DPP | `=N/N` | 385 |
| Harga Jual DPP | `=R` | 40 |
| Harga Jual DPP | `=N` | 28 |
| Harga Jual DPP | `<literal>` | 19 |
| Harga Jual DPP | `=R/N` | 2 |
| Harga Jual DPP | `=R*N` | 1 |
| TOTAL BIAYA | `=sum(R:R)` | 475 |
| TOTAL BIAYA | `<literal>` | 2 |
| LABA BERSIH | `=R-R` | 446 |
| LABA BERSIH | `=R-R-R` | 28 |
| PPN Masukan | `=R*N%` | 258 |
| PPN Masukan | `=R` | 25 |
| PPN Masukan | `=sum(R:R)*N%` | 100 |
| PPN Masukan | `=SUM(R)*N%` | 27 |
| PPN Masukan | `=SUM(R:R)*N%` | 53 |
| PPN Masukan | `<literal>` | 6 |
| PPN Masukan | `=R*N` | 5 |
| PERSENTASE | `=R/R` | 334 |

---

## 4. Tarif sebagai INPUT, bukan konstanta

| Tarif | Nilai yang teramati | Sumber |
|---|---|---|
| PPN penjualan | 0.11 dan **0** (skema "Non-PPN") | dibaca dari sel rate penjualan per blok |
| PPN masukan | 0.11, 0, dan basis A/B/C | dibaca dari formula baris `PPN 11%` biaya |
| PBBKB penjualan | 0.075, 0.05, 0 | dibaca dari formula baris `PBBKB` penjualan |
| Divisor harga jual | 1.11, 1.185, 1.16 | dibaca dari formula Harga Dasar |
| Divisor vendor | 1.11, 1.16, 1.185, 1.188, 1.213, 1.163, 1.21, 1.165, 1.18 | dibaca dari formula harga dasar vendor |

**Tidak ada satu pun tarif/divisor yang di-hardcode sebagai aturan universal.** Engine menerima
semuanya sebagai input; blok yang tarifnya 0 tetap menghasilkan 0 tanpa "diperbaiki".

---

## 5. Prosedur menemukan varian (dapat direproduksi)

1. `npm run extract:excel` — census 485 blok + cacah bentuk formula + cacah divisor.
2. Extractor mencocokkan tiap sel keluaran dengan formula aslinya; **setiap** bentuk yang tidak
   dikenali diklasifikasikan (bukan dilewati diam-diam).
3. `npm test` — cross-check per metrik dengan diagnosis VALID / PRECISION_VARIANCE /
   FORMULA_MISMATCH / UNRESOLVED / SKIPPED.
4. `npm run coverage:report` — dokumen ini + `docs/EXCEL_COVERAGE_REPORT.md`.

**Aturan:** setiap bentuk baru yang terbukti dari workbook menjadi `formula_id` terpisah
(mis. F005B/F005C, F015C, F019B, F021B, F021C, F027B). Tidak ada varian yang digabung paksa,
dan tidak ada yang ditebak.
