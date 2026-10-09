# PHASE 2.5 — EXCEL CROSS-CHECK REPORT

> Dihasilkan otomatis oleh `npm run crosscheck:report` (scripts/crosscheck_report.ts).
> Semua nilai "Excel" dibaca langsung dari workbook asli `ANALISIS HARGA SATUAN (2026).xlsx`.
> **Tidak ada mock result dan tidak ada nilai yang dikarang.**

**Tanggal:** 2026-10-09
**Sumber:** `ANALISIS HARGA SATUAN (2026).xlsx`
**Blok AHS diekstrak:** 466 dari 485 · **Blok vendor diekstrak:** 1196

---

## 1. Ringkasan

| Status | Jumlah |
|---|---:|
| **VALID** | 5,738 |
| **PRECISION_VARIANCE** | 1,025 |
| **FORMULA_MISMATCH** | 0 |
| UNRESOLVED | 0 |
| SKIPPED | 132 |
| **TOTAL pembandingan** | **6,895** |
| Dibandingkan (bukan SKIPPED) | 6,763 |

**Deviasi relatif maksimum:** 5.824e-8

Status di atas BUKAN satu toleransi tunggal. Masing-masing punya arti berbeda:

| Status | Arti | Ambang |
|---|---|---|
| `VALID` | engine dan Excel identik pada tingkat pembulatan aritmetika | ≤ 0.01 absolut **atau** ≤ 1e-12 relatif |
| `PRECISION_VARIANCE` | angka berbeda, tetapi jauh terlalu kecil untuk menjadi formula lain — artefak presisi nilai cache Excel. **Dilaporkan, tidak disembunyikan.** | ≤ 0.0001 relatif |
| `FORMULA_MISMATCH` | perbedaan semantik nyata: engine TIDAK meniru Excel | > 0.0001 relatif |
| `UNRESOLVED` | salah satu sisi tidak punya nilai | — |
| `SKIPPED` | perbandingan tidak dilakukan, dengan alasan eksplisit (varian blok tanpa metrik tsb, sel literal, `#REF!`) | — |

**Tidak ada `FORMULA_MISMATCH`.** Tidak ada toleransi yang dipakai untuk menyembunyikan perbedaan formula.

### 1.1 Analisis PRECISION_VARIANCE

| Metrik | Nilai |
|---|---:|
| Jumlah baris | 1,025 |
| Deviasi absolut terbesar | 5.0000 |
| Deviasi relatif terbesar | 5.824e-8 |
| Ambang mismatch | 0.0001 |

- `SULSEL::BB181` F017 — |Δ| = 5.000004 (rel 2.39e-9)
- `SULSEL::BB181` F015A — |Δ| = 5.000000 (rel 2.76e-10)
- `SULSEL::BB181` F019A/B — |Δ| = 4.401805 (rel 2.43e-9)
- `MALUKU::BE45` F015A — |Δ| = 3.000000 (rel 1.16e-10)
- `MALUKU::BE45` F017 — |Δ| = 2.999996 (rel 2.07e-9)

Semua baris di atas berada ≥ 1.700× di bawah ambang `FORMULA_MISMATCH`. Penyebabnya adalah
**nilai cache Excel**, bukan formula: metrik seperti `LABA BERSIH = LABA KOTOR − SELISIH PPN`
adalah selisih dua nilai berorde ~10⁹, sehingga pembulatan penyimpanan Excel teramplifikasi
saat dibandingkan. Semuanya tetap dicetak di sini agar tidak hilang.

---

## 2. Hasil per formula

| Formula | Metrik | Dibandingkan | VALID | PRECISION_VARIANCE | SKIPPED | Max rel | Blok terburuk |
|---|---|---:|---:|---:|---:|---:|---|
| F006 | Revenue | 466 | 466 | 0 | 0 | 2.50e-16 | `AHAS Coretan::G12` |
| F015A | Total Cost | 466 | 297 | 169 | 0 | 6.29e-10 | `TONASA::EK554` |
| F016 | Biaya per Liter | 466 | 466 | 0 | 0 | 5.32e-10 | `WIKA::AL2` |
| F001 (jual) | PPN Keluaran | 466 | 302 | 164 | 0 | 4.56e-10 | `TONASA::DX641` |
| F008A/B/C | PPN Masukan | 466 | 425 | 41 | 0 | 6.26e-10 | `Market Bu sisca::G44` |
| F017 | Laba Kotor | 466 | 341 | 125 | 0 | 2.83e-8 | `SUMBAR::AU2` |
| F018 | Selisih PPN | 466 | 405 | 61 | 0 | 4.00e-8 | `TONASA::I7` |
| F019A/B | Laba Bersih | 466 | 290 | 176 | 0 | 5.81e-8 | `SUMBAR::AU2` |
| F020 | Laba Bersih/Liter | 466 | 466 | 0 | 0 | 5.81e-8 | `SUMBAR::AU2` |
| F021A | Persentase (Net / TOTAL BIAYA) | 334 | 45 | 289 | 132 | 5.82e-8 | `SUMBAR::AU2` |
| F007 | Cost line total | 8,389 | 8,389 | 0 | 0 | 6.85e-10 | `WIKA::AL45 r58` |
| F001 | Vendor PPN | 1,107 | 1,107 | 0 | 0 | 5.68e-10 | - |
| F002A/F002B | Vendor ALL IN | 1,128 | 1,128 | 0 | 0 | 2.20e-16 | - |

---

## 3. Cakupan blok (Phase 2.5 §9)

| Klasifikasi | Blok |
|---|---:|
| TESTED | 466 |
| PPN_INPUT_VARIANT | 8 |
| INCOMPLETE | 5 |
| CUSTOM_FORMULA_BLOCK | 2 |
| ANNOTATION_TITLE | 2 |
| NO_LABEL_COL | 1 |
| SALE_FORMULA_VARIANT | 1 |
| **TOTAL blok** | **485** |

**Validated Coverage % = 466 / 485 × 100 = 96.1%**

Tidak ada blok yang "diam-diam dianggap valid": setiap blok yang tidak masuk `TESTED` punya
klasifikasi eksplisit beserta alasannya. Rincian per blok ada di `docs/EXCEL_COVERAGE_REPORT.md`.

---

## 4. Varian formula Excel yang terbukti (Phase 2.5 §7)

### 4.1 Divisor harga jual (F005) — dibaca dari formula, bukan diasumsikan

| Divisor | Blok | Arti (dari formula blok itu sendiri) |
|---|---:|---|
| 1.11 | 411 | PPN 11% |
| 1.185 | 8 | PPN 11% + PBBKB 7,5% |
| 1.16 | 7 | PPN 11% + PBBKB 5% |

Perubahan Phase 2.5: extractor tidak lagi hanya menerima `=N/divisor`. Numerator boleh
**referensi sel** yang diikuti sampai formula sumbernya, dan motif yang sama dipakai untuk
divisor vendor (F003) di bawah.

### 4.2 Cacah bentuk formula (dari sel Excel nyata)

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

### 4.3 Label baris komponen ke-7 (aritmetika identik, penamaan berbeda)

Termasuk label agregat bervarian `LABA KOTOR (RP)` / `LABA BERSIH (RP)` — pencocokan label
kini menormalkan akhiran dalam tanda kurung, yang memulihkan 89+ blok yang sebelumnya terlempar.

---

## 5. Audit `#REF!` (Phase 2.5 §5)

**18 sel** berisi `#REF!`. Tidak ada yang di-resolve menjadi 0.

| Sheet | Cell | Formula |
|---|---|---|
| TONASA | `E89` | `=#REF!` |
| TONASA | `R89` | `=#REF!` |
| TONASA | `R232` | `=#REF!` |
| INDORAMA | `BE10` | `=BA10+#REF!` |
| INDORAMA | `D32` | `=#REF!` |
| JATENG | `D38` | `=#REF!` |
| JATENG | `BC38` | `=#REF!` |
| JABAR | `CU180` | `=#REF!-#REF!` |
| KALSEL | `V3` | `=#REF!` |
| SULTRA | `AQ146` | `=#REF!*11%` |
| SULTRA | `BK155` | `=BH152-#REF!` |
| SULTRA | `AP165` | `=#REF!` |
| SULTRA | `AZ165` | `=AZ141-#REF!` |
| SULTRA | `AZ169` | `=AZ167/#REF!` |
| MALUKU | `D38` | `=#REF!` |
| MALUKU | `P38` | `=#REF!` |
| MALUKU | `AB38` | `=#REF!` |
| MALUKU | `AO38` | `=#REF!` |

**12 sel** lain merujuk ke sel rusak tersebut:

| Sheet | Cell | Formula | Merujuk |
|---|---|---|---|
| TONASA | `E90` | `=E88+E89` | TONASA!E89 |
| TONASA | `R90` | `=R88+R89` | TONASA!R89 |
| TONASA | `R233` | `=R231+R232` | TONASA!R232 |
| INDORAMA | `D33` | `=SUM(D27:D32)` | INDORAMA!D32 |
| JATENG | `D39` | `=D37+D38` | JATENG!D38 |
| JATENG | `BC39` | `=BC37+BC38` | JATENG!BC38 |
| SULTRA | `AZ167` | `=AZ165-AZ166` | SULTRA!AZ165 |
| SULTRA | `AP169` | `=AQ161-AP161-AP163-AP164-AP165` | SULTRA!AP165 |
| MALUKU | `D39` | `=D37+D38` | MALUKU!D38 |
| MALUKU | `P39` | `=P37+P38` | MALUKU!P38 |
| MALUKU | `AB39` | `=AB37+AB38` | MALUKU!AB38 |
| MALUKU | `AO39` | `=AO37+AO38` | MALUKU!AO38 |

---

## 6. Audit formula yang sebelumnya UNRESOLVED (Phase 2.5 §4)

| Formula | Sel di workbook | Status sekarang | Bukti |
|---|---:|---|---|
| F019B | 68 | **RESOLVED** | Suku ke-3 = `SELISIH PBBKB` (`AHAS Prioritas!FQ34 = FP10-FP16`, baris berlabel "SELISIH PBBKB"). Selisih PBBKB = PBBKB penjualan − PBBKB biaya. Diverifikasi 3/3 blok. Bila sel itu KOSONG, aritmetika Excel sendiri menghasilkan 0 — dicatat sebagai input blok. |
| F021B | 10 | **RESOLVED — bukan varian F021A** | Pembagi = `Modal Investor` (`DK82 = DL52`, label baris "Modal Investor"), pembilang `DK79 = DK76*30%`. Ini metrik imbal hasil modal, BUKAN profit %. 4 sel lain memakai basis `Harga Include` → didaftarkan sebagai F021C. |

---

## 7. Anomali pada workbook (temuan, bukan bug sistem)

### 7.1 Cache ALL IN bertentangan dengan formulanya sendiri — 17 dari 1128 blok

| `AHAS Prioritas!FE7` | Pak Isak | `F002B` | 23463 | 21978 |
| `AHAS Prioritas!FE51` | Pak Isak | `F002B` | 24648 | 23088 |
| `JATENG!Q139` | PT SKS | `F002A` | 26730 | 26797.5 |
| `JATIM!CK8` | PT Genco | `F002A` | 23821 | 23929 |
| `JATIM!CX8` | PT Genco | `F002A` | 23821 | 23929 |
| `JATIM!BJ55` | PT SKS | `F002A` | 14886.4 | 14924.8 |
| `JATIM!BX55` | PT Genco | `F002A` | 18703.5 | 18745.63 |
| `JATIM!CK55` | PT Genco | `F002A` | 25597 | 25705 |
| `JATIM!CX55` | PT Genco | `F002A` | 24460.36 | 24568.36 |
| `KALTIM!BL54` | PT SKS | `F002A` | 28809 | 28881.75 |
| `KALTIM!CK54` | PT Laros | `F002A` | 25300 | 25342.13 |
| `KALTIM!CJ147` | PT Laros | `F002A` | 0 | 42.13 |

_… dan 5 blok lainnya._

Formula adalah source of truth, sehingga engine mengikuti **formula**. Nilai cache lama
tetap dilaporkan di sini agar tidak hilang.

### 7.2 PPN yang diketik manual (bukan formula)

42 sel PPN vendor
bertipe literal; sel seperti ini adalah **DATA**, disimpan apa adanya
(`vendor_prices.ppn_is_formula = false`) dan tidak diturunkan ulang.

---

## 8. Cara mereproduksi

```bash
npm install
npm run extract:excel      # workbook -> tests/fixtures/excel-cases.json (+ census & audit)
npm run seed:sql           # formula registry + templates -> supabase/seed/*.sql
npm test                   # unit + cross-check test
npm run crosscheck:report  # dokumen ini
npm run coverage:report    # docs/EXCEL_COVERAGE_REPORT.md + docs/FORMULA_VARIANTS.md
```
