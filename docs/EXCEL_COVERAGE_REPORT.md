# PHASE 2.5 — EXCEL COVERAGE REPORT

> Dihasilkan otomatis oleh `npm run coverage:report` (scripts/coverage_report.ts).
> Seluruh angka berasal dari census extractor atas workbook asli
> `ANALISIS HARGA SATUAN (2026).xlsx` — bukan perkiraan.

**Tanggal:** 2026-10-09
**Sumber:** `ANALISIS HARGA SATUAN (2026).xlsx`
**Blok AHS (title cell) di workbook:** 485
**Blok vendor diekstrak:** 1196

---

## 1. Metrik utama

| Metric | Count |
|---|---:|
| Total Calculation Blocks | 485 |
| Tested Blocks | 466 |
| Untested Blocks | 19 |
| Resolved Formulas | 36 |
| Unresolved Formulas | 0 |
| Formula Variants (terdaftar & dipakai) | 25 |
| #REF! Cells | 18 |
| Custom Formula Blocks | 2 |
| Fully Validated Blocks | 466 |

### Coverage

```text
Validated Coverage % = Validated Blocks / Total Blocks × 100
                     = 466 / 485 × 100
                     = 96.1%
```

`Fully Validated Blocks` = blok TESTED yang seluruh metrik pembandingnya berstatus
`VALID` atau `PRECISION_VARIANCE` (tidak ada satu pun `FORMULA_MISMATCH`).
Saat ini **466 dari 466** blok TESTED memenuhi itu.

> **Perbandingan dengan Phase 2:** Phase 2 menguji 254 blok (52,4%) dan melewatkan 231 blok
> tanpa klasifikasi rinci. Phase 2.5 menguji **466 blok (96.1%)** dan
> mengklasifikasikan sisanya satu per satu.

---

## 2. Klasifikasi seluruh blok

| Klasifikasi | Jumlah | Arti |
|---|---:|---|
| TESTED | 466 | Diekstrak & dibandingkan terhadap workbook |
| CUSTOM_FORMULA_BLOCK | 2 | Total Biaya DAN Biaya per Liter diketik manual; range biaya tidak dapat diturunkan dari formula |
| PPN_INPUT_VARIANT | 8 | Basis/tarif PPN masukan tidak terbaca dari formula blok (referensi silang) |
| INCOMPLETE | 5 | Satu/lebih metrik inti memang tidak ada di blok |
| ANNOTATION_TITLE | 2 | Judul berupa kalimat penjelas, bukan blok perhitungan |
| NO_LABEL_COL | 1 | Tidak ada kolom label dengan penanda inti |
| SALE_FORMULA_VARIANT | 1 | Bentuk formula harga jual yang belum dipetakan |

### 2.1 Daftar blok yang TIDAK diuji (masing-masing dengan alasan)

**PPN_INPUT_VARIANT** (8)

| Blok | Detail |
|---|---|
| `AHAS Prioritas::DP173` | basis/rate tidak dapat ditentukan dari formula/ilai blok (per-liter=402116000) |
| `AHAS Prioritas::I304` | basis/rate tidak dapat ditentukan dari formula/ilai blok (per-liter=0) |
| `JATENG::AH267` | basis/rate tidak dapat ditentukan dari formula/ilai blok (per-liter=0) |
| `KALTIM::EO227` | basis/rate tidak dapat ditentukan dari formula/ilai blok (per-liter=0) |
| `SULTENG::HI2` | basis/rate tidak dapat ditentukan dari formula/ilai blok (per-liter=0) |
| `SULTENG::EG134` | basis/rate tidak dapat ditentukan dari formula/ilai blok (per-liter=0) |
| `SULTRA::H48` | basis/rate tidak dapat ditentukan dari formula/ilai blok (per-liter=0) |
| `SULBAR::AS2` | basis/rate tidak dapat ditentukan dari formula/ilai blok (per-liter=0) |

**CUSTOM_FORMULA_BLOCK** (2)

| Blok | Detail |
|---|---|
| `TONASA::V289` | literal total 844685437.1621621 + literal cost/liter |
| `TONASA::V333` | literal total 922956150.0 + literal cost/liter |

**NO_LABEL_COL** (1)

| Blok | Detail |
|---|---|
| `INDORAMA::AY46` | - |

**ANNOTATION_TITLE** (2)

| Blok | Detail |
|---|---|
| `Market Bu Ve::W50` | - |
| `Market Bu Ve::W97` | - |

**INCOMPLETE** (5)

| Blok | Detail |
|---|---|
| `JABAR::DV313` | missing=ppn_difference |
| `JABAR::EH313` | missing=net_profit_per_liter |
| `JABAR::DV355` | missing=gross_profit |
| `JABAR::ET355` | missing=ppn_difference |
| `SULTRA::AU135` | missing=total_cost |

**SALE_FORMULA_VARIANT** (1)

| Blok | Detail |
|---|---|
| `SULTRA::BW94` | =BK144*1.1 |

---

## 3. Blok dengan FORMULA_MISMATCH

**Tidak ada.** Seluruh blok TESTED berstatus VALID atau PRECISION_VARIANCE pada setiap metrik yang tersedia di Excel.

---

## 4. Audit `#REF!` (Phase 2.5 §5)

Alamat tujuan yang hilang **tidak dicatat oleh Excel** — itulah definisi `#REF!` — sehingga kolom
`Broken Reference` menyatakan berapa rujukan yang hilang, bukan mengarang alamat pengganti.

| Sheet | Cell | Original Formula | Broken Reference | Dependent Formula | Impact |
|---|---|---|---|---|---|
| TONASA | `E89` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `E90` | LOW |
| TONASA | `R89` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `R90` | LOW |
| TONASA | `R232` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `R233` | LOW |
| INDORAMA | `BE10` | `=BA10+#REF!` | 1 tujuan hilang (alamat tidak tercatat) | - | MEDIUM |
| INDORAMA | `D32` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `D33` | LOW |
| JATENG | `D38` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `D39` | LOW |
| JATENG | `BC38` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `BC39` | LOW |
| JABAR | `CU180` | `=#REF!-#REF!` | 2 tujuan hilang (alamat tidak tercatat) | - | MEDIUM |
| KALSEL | `V3` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | - | LOW |
| SULTRA | `AQ146` | `=#REF!*11%` | 1 tujuan hilang (alamat tidak tercatat) | - | HIGH |
| SULTRA | `BK155` | `=BH152-#REF!` | 1 tujuan hilang (alamat tidak tercatat) | - | HIGH |
| SULTRA | `AP165` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `AP169` | LOW |
| SULTRA | `AZ165` | `=AZ141-#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `AZ167` | HIGH |
| SULTRA | `AZ169` | `=AZ167/#REF!` | 1 tujuan hilang (alamat tidak tercatat) | - | CRITICAL |
| MALUKU | `D38` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `D39` | LOW |
| MALUKU | `P38` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `P39` | LOW |
| MALUKU | `AB38` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `AB39` | LOW |
| MALUKU | `AO38` | `=#REF!` | 1 tujuan hilang (alamat tidak tercatat) | `AO39` | LOW |

Klasifikasi dampak:

| Tingkat | Sel | Alasan |
|---|---|---|
| CRITICAL | SULTRA!AZ169 (`=AZ167/#REF!`) | dipakai sebagai DIVISOR → merusak seluruh nilai turunannya |
| HIGH | SULTRA!AQ146 (`=#REF!*11%`), SULTRA!BK155 (`=BH152-#REF!`), SULTRA!AZ165 (`=AZ141-#REF!`) | ikut dalam aritmetika biaya/PPN |
| MEDIUM | INDORAMA!BE10 (`=BA10+#REF!`), JABAR!CU180 (`=#REF!-#REF!`) | aritmetika campuran |
| LOW | 12 sel berbentuk `=#REF!` murni | nilai sel itu sendiri rusak, tidak menyebar |

**Tidak ada `#REF!` yang di-resolve menjadi 0**, dan tidak ada blok TESTED yang memakai sel
rusak tersebut sebagai input.

---

## 5. Formula yang sebelumnya UNRESOLVED (Phase 2.5 §4)

Format keluaran mengikuti permintaan Phase 2.5 §4: Formula | Source | Current Status |
Evidence | Possible Meaning | Decision Needed.

| Formula | Source | Current Status | Evidence | Possible Meaning | Decision Needed |
|---|---|---|---|---|---|
| F019B | `AHAS Prioritas!FQ35` — 68 sel di workbook | **RESOLVED** (aktif) | Suku ke-3 `AHAS Prioritas!FQ34` berformula `=FP10-FP16` dan berada di baris berlabel "SELISIH PBBKB" (kolom label FL: LABA KOTOR / SELISIH PPN / SELISIH PBBKB / LABA BERSIH). Aritmetika diverifikasi numerik pada 3/3 blok hasil ekstraksi — cocok persis. | LABA BERSIH = LABA KOTOR − SELISIH PPN − **SELISIH PBBKB**, di mana SELISIH PBBKB = PBBKB penjualan − PBBKB biaya. Bila sel itu KOSONG, aritmetika Excel sendiri menghasilkan 0 → dicatat sebagai input `pbbkb_difference_applicable`, bukan diasumsikan. | — |
| F021B | `AHAS Prioritas!DL79` — 10 sel di workbook | **RESOLVED** (aktif) — dan **bukan** varian F021A | Pembagi `DK82 = DL52` berada di baris berlabel "Modal Investor"; pembilang `DK79 = DK76*30%`. 4 sel lain memakai basis `Harga Include` (`WIKA!BZ115`) → didaftarkan terpisah sebagai `F021C`. | **Return on Investor Capital** — imbal hasil atas modal investor, BUKAN profit/margin. Karena artinya berbeda (bukan cara penyajian berbeda), ia tidak boleh digabung ke `F021A`. | Apakah metrik ini ikut dilaporkan di aplikasi, atau hanya konteks analis? |

---

## 6. Cut-off yang tetap jujur

1. Blok `CUSTOM_FORMULA_BLOCK` **tidak** diuji: range biaya tidak dapat diturunkan dari
   formula mana pun, jadi tidak ada yang bisa dibandingkan tanpa menebak.
2. Blok `PPN_INPUT_VARIANT` **tidak** diuji: basis/tarif PPN masukan berasal dari referensi
   silang yang artinya belum diputuskan.
3. Blok `INCOMPLETE` **tidak** diuji karena metrik intinya memang tidak ada di blok tersebut.
4. `PRECISION_VARIANCE` bukan kegagalan, tetapi juga **bukan** klaim "cocok sempurna" —
   nilainya tetap dicetak di `docs/PHASE2_CROSSCHECK.md` §1.1.
