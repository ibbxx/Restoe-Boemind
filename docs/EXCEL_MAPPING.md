# PHASE 1 — EXCEL MAPPING & SYSTEM ANALYSIS
## `ANALISIS HARGA SATUAN (2026).xlsx` → Digital System

**Status:** ANALYSIS ONLY (dokumen Phase 1, dipertahankan apa adanya sebagai bukti analisis)
**Status lanjutan:** analisis ini sudah **diimplementasikan** di Phase 2 dan diperdalam di Phase 2.5.
Hasil akhir per item §G ada di tabel status di awal §G. Laporan: `docs/PHASE2_REPORT.md` §H,
`docs/EXCEL_COVERAGE_REPORT.md`, `docs/FORMULA_VARIANTS.md`, `docs/SUPABASE_VALIDATION.md`.
**Basis:** `ANALISIS HARGA SATUAN (2026).xlsx` (35 sheet, ±41.504 formula) + `PRD.md`
**Prinsip:** Excel = Source of Truth. Dokumen ini tidak mengubah satu formula pun.
**Tanggal analisis:** 7 Oktober 2026

> **Catatan metode:** seluruh angka & rumus di bawah diekstrak langsung dari workbook
> (`openpyxl`, `data_only=False` untuk formula asli dan `data_only=True` untuk nilai hasil).
> Setiap klaim formula disertai `Sheet!Cell` sebagai bukti. Tidak ada formula yang
> diterjemahkan berdasarkan asumsi.

---

# A. EXCEL INVENTORY (Daftar Sheet & Fungsi)

Workbook memiliki **35 sheet**, **±41.504 formula**, dan **485 blok perhitungan AHS**.

Dimensi kerja nyata (bukan `max_row/max_col` mentah) jauh lebih kecil. Workbook memakai
pola **grid horizontal**: setiap blok perhitungan adalah pasangan
`EVALUASI HARGA VENDOR` + `ANALISIS HARGA SATUAN (AHS)` yang ditempel berulang ke kanan
satu periode/opsi per blok.

| # | Sheet | Sel Terisi | Formula | AHS Block | Klasifikasi | Fungsi |
|---|-------|-----------:|--------:|----------:|-------------|--------|
| 0 | `Proker Procurement` | 126 | 0 | 0 | CONTROL / INDEX | Daftar market & lokasi (Proyek Prioritas / Intensitas Tinggi / Sedang), link maps |
| 1 | `Mamuju` | 198 | 82 | 1 | PROJECT (real cost) | Evaluasi vendor + `REAL COST PBP FULL 247 KL` untuk RSUD Mamuju |
| 2 | `Rekap AHAS` | 1.019 | 0 | 1 | RECAP / REPORT | Rekap penawaran harga solar + evaluasi AHAS proyek (per periode) |
| 3 | `Perhitungan INU` | 455 | 169 | 2 | PROJECT (margin) | Perhitungan margin MUE (Harga Jual/Beli/PPN/PBBKB/Fee) + AHAS MUE & JAGAD |
| 4 | `AHAS Prioritas` | 7.737 | 3.238 | 34 | PROJECT / MASTER-ANALYSIS | AHAS proyek prioritas; memuat varian **CASH** vs **TEMPO** dan skema bagi hasil |
| 5 | `TONASA` | 30.006 | 10.866 | 140 | PROJECT (besar) | Analisis Tonasa Lines lintas periode/lokasi (Teluk Bayur, Samarinda, dll.) |
| 6 | `Eval Vendor TL` | 1.349 | 492 | 6 | EVALUATION (template) | 6 blok evaluasi vendor + AHS; termasuk "Versi Prof Amir" |
| 7 | `Rekap IGIP` | 1.156 | 317 | 1 | RECAP + DELIVERY LOG | Log pengiriman IGIP + rekap; **satu-satunya sheet dengan cross-sheet ref** |
| 8 | `VIRTUE dan OSS` | 332 | 140 | 2 | PROJECT / MARKET | `ANALISIS HARGA SATUAN (CASH)` untuk PT VDNI (VIRTUE) & PT OSS |
| 9 | `AHAS IGIP` | 4.370 | 1.683 | 20 | PROJECT / MASTER-ANALYSIS | AHAS IGIP; varian CASH/TEMPO & opsi solar Jawa vs Sulawesi (50/100/150 KL) |
| 10 | `IWIP ` | 458 | 192 | 0 | PROJECT | `PROYEKSI LABA RUGI (PT IWIP)` untuk 3 volume: 5.000 / 2.000 / 2.000 KL |
| 11 | `WIKA` | 2.988 | 1.122 | 11 | PROJECT | Blok AHS bertanda harga: `(19.200)`, `(18.600)` |
| 12 | `AHAS Coretan` | 301 | 107 | 1 | DRAFT / SCRATCH | "PERHITUNGAN AHAS (CORETAN)" — perhitungan market Bu Ve (Kolaka/Buleleng/Konawe) |
| 13 | `INDORAMA` | 2.594 | 1.134 | 4 | PROJECT / MASTER-ANALYSIS | Real Cost PBP/JAGAD, KOMBINASI, `PROYEKSI LABA RUGI`, `Real Cost 60:40 (RBI)` |
| 14 | `Market Bu Ve` | 961 | 362 | 6 | MARKET | Blok AHS per pelanggan/market Bu Ve |
| 15 | `Market Bu Maya` | 1.071 | 434 | 5 | MARKET | Blok AHS per pelanggan/market Bu Maya |
| 16 | `Market Bu sisca` | 388 | 160 | 2 | MARKET | Blok AHS market Bu Sisca |
| 17 | `JATENG` | 5.570 | 2.206 | 25 | REGIONAL | AHS regional Jawa Tengah, per periode (`P2 FEB-26` … `P2 SEP-26`) |
| 18 | `JABAR` | 5.980 | 2.409 | 28 | REGIONAL | AHS regional Jawa Barat |
| 19 | `JATIM` | 5.024 | 2.085 | 26 | REGIONAL | AHS regional Jawa Timur |
| 20 | `JABODETABEK` | 1.283 | 529 | 6 | REGIONAL | AHS Jabodetabek |
| 21 | `KALSEL` | 2.061 | 816 | 10 | REGIONAL | AHS Kalimantan Selatan |
| 22 | `KALTENG` | 770 | 315 | 4 | REGIONAL | AHS Kalimantan Tengah |
| 23 | `KALTIM` | 7.339 | 2.947 | 36 | REGIONAL | AHS Kalimantan Timur (terbesar ke-2) |
| 24 | `KALBAR` | 207 | 80 | 1 | REGIONAL | AHS Kalimantan Barat |
| 25 | `SULSEL` | 5.338 | 2.133 | 26 | REGIONAL | AHS Sulawesi Selatan |
| 26 | `SULTENG` | 5.940 | 2.370 | 26 | REGIONAL | AHS Sulawesi Tengah |
| 27 | `SULTRA` | 3.048 | 1.153 | 14 | REGIONAL | AHS Sulawesi Tenggara |
| 28 | `SULBAR` | 1.331 | 505 | 6 | REGIONAL | AHS Sulawesi Barat |
| 29 | `BALI` | 414 | 150 | 2 | REGIONAL | AHS Bali |
| 30 | `RIAU` | 777 | 315 | 3 | REGIONAL | AHS Riau |
| 31 | `SUMBAR` | 2.276 | 933 | 12 | REGIONAL | AHS Sumatera Barat |
| 32 | `SUMSEL` | 416 | 156 | 2 | REGIONAL | AHS Sumatera Selatan |
| 33 | `MALUKU` | 4.537 | 1.727 | 22 | REGIONAL | AHS Maluku |
| 34 | `PAPUA` | 413 | 177 | 2 | REGIONAL | AHS Papua |

## A.1 Temuan struktural penting

1. **Tidak ada tabel relasional.** Workbook adalah kumpulan blok yang di-*copy-paste*.
   Konsep "project" diwakili oleh **sheet** (`TONASA`, `WIKA`, …), "periode/scenario"
   diwakili oleh **posisi blok horizontal** (header baris 1: `P1 JUN-26`, `P2 SEP-26`, dst.),
   dan "vendor" diwakili oleh **kolom di dalam blok**.
2. **Tidak ada Defined Name** (named range) di seluruh workbook → tidak ada konstanta global
   yang bisa dipakai ulang. Semua rate (11%, 7,5%, 0,25%, 3,3%, 22%) **hardcoded literal**
   di dalam formula.
3. **Cross-sheet dependency hampir tidak ada** — hanya **4** sel, semuanya
   `Rekap IGIP → 'AHAS Prioritas'` (contoh: `Rekap IGIP!C69 = 'AHAS Prioritas'!R10`).
   Artinya 34 sheet lain berdiri sendiri → aman dimigrasikan per sheet.
4. **Baris 1 = label periode** (`P1`/`P2` + bulan-tahun). Ini adalah penanda *scenario/versi*
   yang di PRD disebut V1/V2/V3.

---

# B. CALCULATION BLOCK INVENTORY

## B.1 Definisi "Block"

Satu **Calculation Block** = satu unit analisis komersial lengkap, terdiri dari:

```
BLOCK
├── header   : Tgl Analisis, Sumber(Vendor), Lokasi, Marketing, Pembayaran, Dokumen, Diskon
├── [1] Vendor Evaluation Table   ← perbandingan N vendor (biasanya 3–4 kolom)
│        Harga Dasar, PPN, PBBKB, PPH, OAT, PPN OAT, BPH, ALL IN, Note
└── [2] AHS Table (Analisis Harga Satuan)
         ├── Harga Jual:  Harga Dasar (dpp), PBBKB, PPN 11%      → HARGA INCLUDE
         ├── TOTAL PENDAPATAN        = HARGA JUAL × VOLUME
         ├── 18 cost line items      → TOTAL BIAYA / BIAYA PERLITER
         ├── LABA KOTOR              = TOTAL PENDAPATAN − TOTAL BIAYA
         ├── SELISIH PPN             = PPN Keluaran − PPN Masukan
         ├── LABA BERSIH             = LABA KOTOR − SELISIH PPN
         ├── LABA BERSIH PERLITER    = LABA BERSIH ÷ VOLUME
         └── PERSENTASE              = LABA BERSIH ÷ TOTAL BIAYA
```

## B.2 Jumlah block per sheet

**Total: 485 blok AHS** (+ 452 header `EVALUASI HARGA VENDOR`, karena sebagian blok
vendor berdiri sendiri tanpa tabel AHS).

| Sheet | AHS Block | Sheet | AHS Block |
|-------|----------:|-------|----------:|
| TONASA | 140 | SULTRA | 14 |
| KALTIM | 36 | SUMBAR | 12 |
| AHAS Prioritas | 34 | WIKA | 11 |
| JABAR | 28 | KALSEL | 10 |
| JATIM / SULSEL / SULTENG | 26 | Eval Vendor TL / Market Bu Ve / JABODETABEK / SULBAR | 6 |
| JATENG | 25 | Market Bu Maya | 5 |
| MALUKU | 22 | INDORAMA / KALTENG | 4 |
| AHAS IGIP | 20 | RIAU | 3 |
| SULTRA | 14 | Perhitungan INU / VIRTUE dan OSS / Market Bu sisca / BALI / SUMSEL / PAPUA | 2 |
| SUMBAR | 12 | Rekap IGIP / AHAS Coretan / KALBAR | 1 |

## B.3 Varian label block (indikasi skema)

Sebagian besar blok berjudul `ANALISIS HARGA SATUAN (AHS)` (454 dari 485). Varian sisanya
membawa makna bisnis tambahan:

| Judul | Jml | Arti bisnis (dari konteks sheet) |
|-------|----:|----------------------------------|
| `ANALISIS HARGA SATUAN (CASH)` | 6 | Skema pembayaran tunai (VIrtue/OSS) |
| `ANALISIS HARGA SATUAN (CASH 26.626)` | 4 | Harga jual cash spesifik (AHAS Prioritas) |
| `ANALISIS HARGA SATUAN (TEMPO 29.000)` | 4 | Harga jual tempo 30 hari (AHAS Prioritas) |
| `ANALISIS HARGA SATUAN (19.200)` / `(18.600)` | 2 / 2 | Harga jual spesifik (WIKA) |
| `ANALISIS HARGA SATUAN (CASH 26.648)` | 1 | Harga jual cash spesifik (AHAS IGIP) |
| `ANALISIS HARGA SATUAN (AHAS)` | 4 | Varian penamaan internal |

Header lain yang muncul sebagai pemisah blok dan **wajib dipetakan sebagai atribut scenario**:
`AHAS INTERNAL FIX`, `KROSCEK AHAS` (= cross-check), `EVALUASI MANAGEMENT`,
`REAL COST PBP FULL 247 KL`, `REAL COST JAGAD FULL 247 KL`, `KOMBINASI REAL COST PBP 150 KL`,
`KOMBINASI REAL COST JAGAD 97 KL`, `Real Cost 60 : 40 (UNTUK RBI)`, `PROYEKSI LABA RUGI`,
`PROFIT 50% PAK ADIN : 50% KITA`, `50 PAK ADIN : 50 INVESTOR LAIN`, `FULL MODAL INVESTOR BARU`,
`PERHITUNGAN HARGA CASH`, `OPSI 2 (SOLAR JAWA) 150 KL`, `OPSI 1 50 KL`.

> **Kesimpulan B:** Workbook bukan "beberapa formula berbeda yang tidak diketahui", melainkan
> **satu template dominan** (`Template A`) yang diulang 485×, ditambah **beberapa varian
> perhitungan yang terbatas & teridentifikasi**. Ini yang harus dipetakan sebagai
> *calculation template* + *scenario*, bukan digabung paksa menjadi satu formula universal.

---

# C. EXCEL MAPPING

Karena 485 blok memakai template yang sama, mapping dilakukan **per template**, bukan per blok.
Berikutnya: `Sheet!Cell` contoh + daftar varian yang ditemukan.

## C.1 TEMPLATE A — Blok AHS standar (mayoritas 485 blok)

Contoh acuan: **`JATENG`** blok pertama, area `C8:M37`.

### C.1.1 Header blok (metadata project/scenario)

| Cell | Type | Field | Formula | Dependency | Output |
|------|------|-------|---------|-----------|--------|
| `H2` | CONSTANT | Block title | `ANALISIS HARGA SATUAN (AHS)` | — | label jenis blok |
| `H3`/`I3` | INPUT | Tanggal analisis (RnD) | `datetime(2026,2,23)` | — | Tgl Analisis |
| `K3`/`L3` | REF/INPUT | Sumber (vendor/inu) | `=D27` | `D27` (Nama INU) | Sumber |
| `E4` | INPUT | Pekerjaan/Material | `Solar B-40` | — | Produk |
| `E5` | INPUT | Customer | `PT Wika` | — | Customer |
| `E6` | INPUT | Lokasi | `Sayung, Demak` | — | Lokasi |
| `I5` | INPUT | Pembayaran | `CBD` | — | Term of payment |
| `L5` | INPUT | Dokumen | `Ppn Only` | — | Skema pajak |
| `I6` | INPUT | Harga Keekonomian | `21200` | — | Harga pasar referensi |
| `L6` | FORMULA | Diskon | `=(I6-J10)/I6` | `I6`, `J10` | % diskon |
| `K7` | FORMULA | Harga Include | `=M9` | `M9` | Harga jual tax-inclusive |

### C.1.2 Vendor Evaluation Table (kolom `C:F`, baris `8:16`)

| Cell | Type | Field | Formula | Dependency | Output |
|------|------|-------|---------|-----------|--------|
| `C8` | CONSTANT | Header | `Uraian` | — | — |
| `D8`,`E8`,`F8` | INPUT | Nama vendor | `PT. Jagad`, `PT WSB`, `PT BEB` | — | Vendor master |
| `C9` | CONSTANT | — | `Harga Dasar` | — | — |
| `D9` | FORMULA | Vendor base (DPP) | `=12800/1.11` | konstanta include | Base Price |
| `C10` | CONSTANT | — | `PPN` | — | — |
| `D10` | FORMULA | Vendor PPN | `=D9*11%` | `D9` | PPN |
| `C11` | CONSTANT | — | `PBBKB` | — | — |
| `C12` | CONSTANT | — | `PPH` | — | — |
| `C13` | CONSTANT | — | `OAT` | — | — |
| `C14` | CONSTANT | — | `PPN OAT` | — | — |
| `C15` | CONSTANT | — | `BPH` | — | — |
| `D16` | FORMULA | **Vendor ALL IN** | `=sum(D9:D14)` | `D9:D14` (6 baris) | All In |
| `F16` | FORMULA | **ALL IN varian 7 baris** | `=SUM(F9:F15)` | `F9:F15` | All In |
| `D17` | INPUT | Note vendor | `Fulldoc` | — | Note |

### C.1.3 AHS — Harga Jual & Volume (baris `8:14`)

| Cell | Type | Field | Formula | Dependency | Output |
|------|------|-------|---------|-----------|--------|
| `H8` | CONSTANT | — | `TOTAL PENDAPATAN` | — | — |
| `M8` | FORMULA | **Revenue** | `=M9*K10` | `M9`, `K10` | Total Pendapatan |
| `H9` | CONSTANT | — | `HARGA JUAL SETELAH PAJAK` | — | — |
| `M9` | FORMULA | Harga jual (DPP+PPN) | `=SUM(J10:J12)` | `J10:J12` | Harga jual |
| `I10` | CONSTANT | — | `Harga Dasar` | — | — |
| `J10` | FORMULA | Harga jual DPP | `=13800/1.11` | konstanta include | DPP jual |
| `K10` | **INPUT** | **Volume** | `10000` | — | Volume (L) |
| `L10` | FORMULA | Pendapatan DPP | `=J10*K10` | `J10`,`K10` | Revenue DPP |
| `I11` | CONSTANT | — | `PBBKB` | — | — |
| `J11` | FORMULA | PBBKB | `=J10*7.5%*0` | `J10` | PBBKB |
| `K11` | FORMULA | Volume | `=K10` | `K10` | Volume |
| `L11` | FORMULA | Total PBBKB | `=J11*K11` | `J11`,`K11` | — |
| `I12` | CONSTANT | — | `PPN 11%` | — | — |
| `J12` | FORMULA | PPN Keluaran/liter | `=J10*11%` | `J10` | PPN Output |
| `K12` | FORMULA | Volume | `=K11` | `K11` | Volume |
| `L12` | FORMULA | **PPN Keluaran (Rp)** | `=J12*K12` | `J12`,`K12` | PPN Output |

### C.1.4 AHS — Cost Engine (baris `15:32`) — *ini "18 cost line items"*

**Struktur seragam:** `I` = kategori/label, `J` = **Rate per liter (INPUT)**, `K` = **Qty/Volume**, `L` = **Total = J×K (FORMULA)**.

| Row | Cell `I` (Cost Item) | Cell `J` (Rate) | Cell `L` (Total) | Formula Total |
|----:|----------------------|-----------------|------------------|---------------|
| 15 | HPP → Harga Dasar | `=D9` (dari vendor base) | `=J15*K15` | `J×K` |
| 16 | OAT | `0` | `=J16*K16` | `J×K` |
| 17 | PBBKB | `=J15*7.5%*0` | `=J17*K17` | `J×K` |
| 18 | PPH INU 0,3% | `0` | `=J18*K18` | `J×K` |
| 19 | BPH Migas 0,25% | `0` | `=J19*K19` | `J×K` |
| 20 | PAJAK → PPN 11% | `=SUM(J15:J19)*11%` | `=J20*K20` | `J×K` |
| 21 | PPH penjualan BUMN 1,5% | `0` | `=J21*K21` | `J×K` |
| 22 | COST OF FUND → Investor | `0` | `=J22*K22` | `J×K` |
| 23 | Bunga Bank | `0` | `=J23*K23` | `J×K` |
| 24 | Diskonto SKBDN 3,3% | `0` | `=J24*K24` | `J×K` |
| 25 | OPERASIONAL → Biaya Operasional | `0` | `=J25*K25` | `J×K` |
| 26 | Bonus Marketing | `50` | `=J26*K26` | `J×K` |
| 27 | ASET → Tangki Solar | `0` | `=J27*K27` | `J×K` |
| 28 | KOORDINASI → Ormas/Lainnya | `0` | `=J28*K28` | `J×K` |
| 29 | RELASI → Biaya Proyek | `0` | `=J29*K29` | `J×K` |
| 30 | Biaya Mediator | `0` | `=J30*K30` | `J×K` |
| 31 | RESIKO → Biaya Resiko | `0` | `=J31*K31` | `J×K` |
| 32 | Kenaikan Harga | `0` | `=J32*K32` | `J×K` |

> **Catatan penting:** `K` (Qty) hampir selalu `=K10` (volume yang sama), sehingga
> `L = Rate × Volume`. Namun ada varian di mana `K` = **jumlah hari** (`K107 = F120*3%*7/30` di AHAS Prioritas)
> dan `K` bertipe bulat (`=F36*50%*2%*2`). **Qty tidak boleh diasumsikan selalu = Volume.**

### C.1.5 AHS — Output aggregates (baris `13,14,33:37`)

| Cell | Type | Field | Formula | Dependency | Output |
|------|------|-------|---------|-----------|--------|
| `M13` | FORMULA | **Total Biaya** | `=sum(L15:L32)` | `L15:L32` (18 baris) | Total Cost |
| `M14` | FORMULA | Biaya per Liter | `=sum(J15:J32)` | `J15:J32` | Cost/Liter |
| `M33` | FORMULA | **Laba Kotor** | `=M8-M13` | Revenue, Total Cost | Gross Profit |
| `M34` | FORMULA | **Selisih PPN** | `=L12-L20` | PPN Output, PPN Input | PPN Difference |
| `M35` | FORMULA | **Laba Bersih** | `=M33-M34` | Gross Profit, PPN Diff | Net Profit |
| `M36` | FORMULA | **Laba Bersih/Liter** | `=M35/K10` | Net Profit, Volume | Net Profit/L |
| `M37` | FORMULA | **Persentase** | `=M35/M13` | Net Profit, **Total Biaya** | Profit % |

> ✅ **KONFIRMASI PRD §26:** `PERSENTASE = Laba Bersih ÷ Total Biaya`
> (bukan Laba Bersih ÷ Revenue). Terverifikasi di 364 blok.

## C.2 TEMPLATE B — `Eval Vendor TL` (varian "Versi Prof Amir")

Contoh acuan: **`Eval Vendor TL`** `G4:Q39` (6 blok dalam satu sheet).

Perbedaan struktur vs Template A:

| Aspek | Template A (JATENG) | Template B (Eval Vendor TL) |
|-------|--------------------|---------------------------|
| Vendor base | `=12800/1.11` (diturunkan dari include) | `14500` (INPUT langsung) — `H11` |
| Vendor PPN | `=D9*11%` | `=H11*11%` → `H12` |
| Vendor ALL IN | `=sum(D9:D14)` → `D16` | `=sum(H11:H17)` → `H18` (7 baris) |
| Harga jual DPP | `=13800/1.11` → `J10` | `=21800/1.11` → `N12` |
| Revenue | `=M9*K10` | `=Q11*O12` — persis seperti PRD §17 |
| Total Cost | `=sum(L15:L32)` (18) | `=sum(P17:P34)` (18) |
| Laba Kotor | `=M8-M13` | `=Q10-Q15` — persis seperti PRD §22 |
| Selisih PPN | `=L12-L20` | `=P14-P22` — persis seperti PRD §23 |
| Laba Bersih | `=M33-M34` | `=Q35-Q36` — persis seperti PRD §24 |
| Laba Bersih/L | `=M35/K10` | `=Q37/O12` — persis seperti PRD §25 |
| Persentase | `=M35/M13` | `=Q37/Q15` — persis seperti PRD §26 |

> ✅ Semua contoh `Excel` di PRD §14–§26 **berasal dari Template B** (`Eval Vendor TL`).
> Jadi contoh PRD akurat, tetapi **bukan satu-satunya layout** — 480 blok lain memakai
> penomoran kolom/baris yang berbeda dengan *semantic* yang sama.

### C.2.1 Blok "kombinasi"/bagi hasil di dalam Template B

`Eval Vendor TL` juga memuat blok **pembagian profit** (`I179..AA184`) yang tidak ada di Template A:

| Cell | Field | Formula | Output |
|------|-------|---------|--------|
| `N178` | Laba Bersih/Liter (Profit JO) | `=N177/L152` | 1228,83 |
| `N179` | Profit RBI per Liter 30% | `=N178*30%` | 368,65 |
| `N180` | Profit Investor per Liter 50% | `=N178*50%` | 614,41 |
| `N181` | Profit Partner per Liter 20% | `=N178*20%` | 245,77 |
| `N182` | Profit RBI (Rp) 40% | `=N179*L152` | 5.529.729 |
| `N185` | Modal RBI 50% | `=O155*50%` | 146.107.500 |
| `N186` | Modal Investor 50% | `=O155*50%` | 146.107.500 |

> ⚠️ Perhatikan: **persentase bagi hasil tidak konsisten** (179 = 30% tapi 182 = "40%";
> 180 = 50% tapi 183 berlabel "30%"). Ini butuh klarifikasi user (lihat §G).

## C.3 TEMPLATE C — `PROYEKSI LABA RUGI` (IWIP / INDORAMA)

Contoh: **`IWIP `** `G3:Z42`. Perbedaan:

- Ada blok vendor multi-kolom (`C10:F17`) dengan **PBBKB berbeda per vendor**:
  `C12 = C10*7.5%`, `D12 = D10*7.5%`, `E12 = E10*7.5%` → **bukan** nol.
- `TOTAL BIAYA` **bukan SUM range** tetapi penjumlahan sel terpilih:
  `L14 = K16+K17+K18+K21+K30+K33` (memilih baris biaya tertentu saja).
- Variable volume per blok: 5.000 KL, 2.000 KL, 2.000 KL pada kolom berbeda.
- Ada rate berbeda: `W18 = W16*10%` (PBBKB 10%, bukan 7,5%); `W23 = 4%*23500` (Cost of Fund).

## C.4 TEMPLATE D — `Market Bu Ve` / `Mangsa` (perhitungan harga cash)

Contoh: **`AHAS Coretan`** `O12:V27`, **`Market Bu Ve`**. Blok ini tidak memakai
kolom rate/total standar, melainkan langsung **rate per liter tetap** yang disusun sebagai
"fee + profit" dan dipakai untuk reverse-engineer harga jual:

| Field | Contoh | Formula |
|-------|--------|---------|
| Harga Sumber | `C45` | input/derived |
| Fee Esbi | `300` | input |
| Fee Bu Ve | `350` | input |
| Profit RBI | `=L46` | dari blok AHS terkait |
| Selisih PPN/liter | `=M34` | dari blok AHS terkait |
| Persen | `=L47` | dari blok AHS terkait |
| Harga Jual | `=J17` | Harga Include blok AHS |

## C.5 Blok REKAP (output-oriented, bukan perhitungan)

| Sheet | Bentuk | Mapping |
|-------|--------|---------|
| `Rekap AHAS` (`B12:Q...`) | Tabel rekap: NO, Proyek, Lokasi, Target, Skema, Harga Beli, Harga Jual, Kebutuhan, Fee Keagenan (ESBI), Fee Mediator, Biaya Proyek, Bagi Hasil, Profit, Profit (%), Keterangan, Diterima Proyek | Semua **INPUT/konstanta** (bukan formula) → kandidat `project` + `scenario_summary` |
| `Rekap IGIP` (`B11:K...`) | Log pengiriman: SUMBER, TRANSPORTIR, NOPOL, HARI/JAM TIBA/SELESAI, VOLUME SURAT JALAN, VOLUME FLOWMETER, STATUS SOLAR, KETERANGAN | Data operasional/historis → kandidat `delivery_log` |
| `Rekap IGIP` (`H28`) | `=SUM(H12:H13,H15:H16,H18:H20,H22:H23)` | Agregasi volume terpilih → `delivery_log` aggregate |
| `Proker Procurement` (`B4:F47`) | Daftar market/lokasi + link maps | Kandidat `markets` / `locations` |
| `TONASA` `HK2:HO5` | Evaluasi vendor naratif: Vendor, Armada, Stok, Perijinan, Keterangan | Kandidat `vendor_evaluation` (atribut kualitatif) |

---

# D. FORMULA REGISTRY DRAFT

Dikompilasi dari seluruh 41.504 formula. **`Source Cell`** = lokasi pertama yang terdokumentasi.
Kolom **Varian** menandai jika ada >1 bentuk (WAJIB jadi parameter template, bukan di-*collapse*).

| ID | Formula Name | Expression | Source Sheet | Source Cell | Varian ditemukan | Active |
|----|--------------|------------|--------------|-------------|------------------|--------|
| F001 | Vendor PPN | `Base × 11%` | Eval Vendor TL | `H12` | 4.952 sel berbentuk `=R*11%` | ✅ |
| F002 | Vendor ALL IN | `SUM(components)` | Eval Vendor TL | `H18` | ⚠️ `SUM(7 baris)` (TL) vs `SUM(6 baris)` (JATENG `D16`) vs `SUM(D9:D15)` | ✅ |
| F003 | Vendor Base dari Include | `Include ÷ 1,11` | JATENG | `D9` | ⚠️ juga `÷1,185` (AHAS Prioritas `R10`), `÷1,213` (MALUKU `BA94`) | ✅ |
| F004 | Diskon | `(HargaKeekonomian − DPP) ÷ HargaKeekonomian` | JATENG | `L6` | 221 sel | ✅ |
| F005 | Harga Jual DPP | `Include ÷ 1,11` | JATENG | `J10` | ⚠️ 828 sel `=N/N`; divisor bervariasi | ✅ |
| F006 | Revenue (TOTAL PENDAPATAN) | `Harga Jual × Volume` | Mamuju | `L7` | 510 sel `=R*R` | ✅ |
| F007 | Cost Line Total | `Rate × Qty` | JATENG | `L15` | 10.382 sel `=R*R`; Qty kadang ≠ Volume | ✅ |
| F008 | PPN Input (Masukan) | `Base × 11%` | JATENG | `J20` | ⚠️ `=J15*11%` vs `=SUM(J15:J19)*11%` (basis berbeda) | ✅ |
| F009 | PBBKB | `Base × 7,5%` (kadang `×0`) | JATENG | `J11` | ⚠️ `7,5%`, `5%` (Mamuju `I16`), `10%` (IWIP `W18`) | ✅ |
| F010 | PPH INU | `Base × 0,3%` | JATENG | `J18` | sering `0` | ✅ |
| F011 | BPH Migas | `Base × 0,25%` | JATENG | `J19` | sering `0` — lihat F006b | ✅ |
| F012 | PPH Penjualan BUMN | `Base × 1,5%` | INDORAMA | `BA67` | `=(BA60+BA62+BA65)*1.5%*6`; sering `0` | ✅ |
| F013 | Diskonto SKBDN | `Base × 3,3%` | JATENG | `J24` | sering `0` | ✅ |
| F014 | Cost of Fund | `(35%×Rate×2%×1)×n` | VIRTUE dan OSS | `G22` | ⚠️ `×0`, `×0.5`, `2%×(A+B)×2` | ✅ |
| F015 | Total Biaya | `SUM(cost L-range)` | JATENG | `M13` | ⚠️ `SUM` range (504) vs `A+B+C` terpilih (IWIP `L14`) | ✅ |
| F016 | Biaya per Liter | `SUM(cost J-range)` | JATENG | `M14` | 505 sel | ✅ |
| F017 | Laba Kotor (Gross Profit) | `Revenue − Total Cost` | Eval Vendor TL | `Q35` | 372 sel `=R-R` | ✅ |
| F018 | Selisih PPN (PPN Difference) | `PPN Output − PPN Input` | Eval Vendor TL | `Q36` | 696 sel `=R-R` | ✅ |
| F019 | Laba Bersih (Net Profit) | `Laba Kotor − Selisih PPN` | Eval Vendor TL | `Q37` | 348 sel (1 sel varian `−PBBKB`) | ✅ |
| F020 | Laba Bersih/Liter | `Laba Bersih ÷ Volume` | Eval Vendor TL | `Q38` | 459 sel | ✅ |
| F021 | Persentase (Profit %) | `Laba Bersih ÷ Total Biaya` | Eval Vendor TL | `Q39` | 364 sel | ✅ |
| F022 | Gross Profit (MUE) | `HargaJual − HargaBeli − Σbiaya` | Perhitungan INU | `B8` | `=F8-D8-D10-D11-D12` | ✅ |
| F023 | Net Margin MUE | `GrossProfit − Σ(fee)` | Perhitungan INU | `B14` | `=B8-sum(B9:B13)` | ✅ |
| F024 | Est PPh Badan | `NetMargin × 22%` | Perhitungan INU | `B17` | `=B16*22%`; juga `Profit MUE = C40-C41` | ✅ |
| F025 | Profit Bagi Hasil/L | `LabaBersih/L × %` | Eval Vendor TL | `N179` | ⚠️ 30%/40%/50%/20% tidak konsisten | ✅ |
| F026 | Volume Rekap | `SUM(selected rows)` | Rekap IGIP | `H28` | `=SUM(H12:H13,H15:H16,H18:H20,H22:H23)` | ✅ |
| F027 | Harga Jual Include | `Harga jual (DPP + PPN)` | JATENG | `M9` | 508 sel | ✅ |
| F028 | Diskon Reverse | `(HargaMkt × (1−Diskon))` | INDORAMA | `AA14` | `=18500/1.11` | ✅ |

## D.1 Registry metadata (skema wajib per PRD §27)

```text
formula_id           text  PK       -- F001, F002, ...
formula_name         text           -- "Vendor PPN"
expression           text           -- "Base * 0.11"
expression_ast       jsonb          -- opsional: representasi terstruktur
source_sheet         text           -- "Eval Vendor TL"
source_cell          text           -- "H12"
source_excel_formula text           -- "=H11*11%"
version              int            -- 1,2,3...
description          text
template_id          text  FK       -- A / B / C / D
is_active            boolean
created_at           timestamptz
```

---

# E. DATABASE SCHEMA PROPOSAL

Schema diturunkan dari struktur **bisnis nyata** yang ditemukan, bukan dari tampilan sheet.
Tabel minimum PRD dipertahankan, dengan penambahan yang **dibuktikan** oleh temuan mapping.

```text
-- ============ IDENTITY ============
users                  -- Supabase Auth (auth.users)
profiles               -- id, email, full_name, role, created_at
                       --   role ∈ {ADMIN, PROCUREMENT, PIC, VIEWER}

-- ============ MASTER DATA ============
markets                -- dari 'Proker Procurement'
                       -- id, name, province, location, maps_url, priority_class, pic_note
vendors                -- dari nama kolom vendor (D8/E8/F8, D106/E106, …)
                       -- id, name, contact, armada, stock, permit, address, notes, status
products               -- dari 'Pekerjaan/Material': HSD, Solar B-40, MFO
                       -- id, code, name, unit
customers              -- dari 'Customer': PT Wika, Tonasa Lines, IGIP, Indorama, …
                       -- id, name, type(BUMN/BUMS/SWASTA), default_term

-- ============ PROJECT ============
projects               -- dari sheet name + header blok
                       -- id, code, name, customer_id, product_id, market_id,
                       -- location, period_label, pic_id, status, notes
project_vendors        -- dari vendor table per blok
                       -- id, project_id, vendor_id, is_selected, evaluation_note
delivery_logs          -- dari 'Rekap IGIP' B11:K27
                       -- id, project_id, source, transporter, nopol, arrived_at,
                       -- finished_at, volume_surat_jalan, volume_flowmeter,
                       -- solar_status, remark

-- ============ CALCULATION TEMPLATES ============
calculation_templates  -- A: AHS_STANDARD, B: VENDOR_EVAL_PROFAMIR,
                       -- C: PROYEKSI_LABA_RUGI, D: MARKET_CASH
                       -- id, code, name, description, version, is_active
template_input_fields  -- id, template_id, field_key, label, data_type, unit, is_required
template_cost_lines    -- id, template_id, line_no, category, label, default_rate,
                       --   rate_source, qty_source, is_summed_in_total, notes
formula_registry       -- lihat §D.1

-- ============ SCENARIO (immutable versioning) ============
price_scenarios        -- id, project_id, parent_scenario_id, name, scenario_type,
                       -- template_id, reason, created_by, created_at, is_locked
                       --   scenario_type ∈ {CASH, TEMPO, INTERNAL_FIX, KROS_CEK,
                       --                    REAL_COST, KOMBINASI, BAGI_HASIL, OPSI_VOLUME}
scenario_inputs        -- id, scenario_id, field_key, value_num, value_text, value_date
                       --   ← SEMUA INPUT blok (volume, harga, rate, qty, diskon, term)
scenario_costs         -- id, scenario_id, cost_line_id, rate_num, qty_num, total_num
                       --   ← "18 cost line items" per blok (rate & qty boleh NULL, bukan 0)
vendor_prices          -- id, project_id, vendor_id, scenario_id, base_price, ppn_rate,
                       --   ppn_amount, pbbkb_rate, pbbkb_amount, pph_amount, oat_amount,
                       --   ppn_oat_amount, bph_amount, all_in_amount, price_source,
                       --   raw_include_price, divisor, note, created_at
calculation_results    -- id, scenario_id, revenue, total_cost, cost_per_liter,
                       --   ppn_output, ppn_input, ppn_difference, gross_profit,
                       --   net_profit, net_profit_per_liter, profit_percentage,
                       --   template_id, formula_version, computed_at, is_valid
profit_shares          -- id, scenario_id, party, role, share_percent,
                       --   profit_per_liter, profit_amount, capital_amount, notes

-- ============ GOVERNANCE ============
project_history        -- id, project_id, scenario_id, entity, entity_id, action,
                       --   field, old_value, new_value, reason, impact_json,
                       --   changed_by, changed_at   (append-only)
cross_check_runs       -- id, scenario_id, expected_json, actual_json, status,
                       --   status ∈ {VALID, WARNING, ERROR}, diff_json, run_at
```

## E.1 Keputusan desain penting

1. **`vendor_prices` terpisah dari `vendors`** (PRD §11) — dibuktikan: harga vendor berbeda
   per project/scenario/period (`H11=14500` vs `I11=16396,39` vs `H55=17850`).
2. **`scenario_inputs` key-value** (EAV) untuk input — karena jumlah & nama input
   berbeda antar template (Template B punya "Fee Bhimantara" `T64`, Template A tidak).
3. **`scenario_costs` normalisasi 18 baris** — PRD §20 menuntut Total Cost dapat
   di-*breakdown*; mapping membuktikan breakdown-nya = baris `L15:L32`.
4. **`raw_include_price` + `divisor` disimpan eksplisit** — karena `÷1.11`, `÷1.185`,
   `÷1.213` semuanya ada; menyimpan hasil akhir saja akan menghilangkan logika pajak.
5. **`NULL` ≠ `0`** (PRD §11) — terbukti: banyak sel ber-`K` `0` yang memang nol, tetapi ada
   sel `VALUE 0` yang sebenarnya "kosong" (mis. `Perhitungan INU!D11` = `0` untuk kolom
   yang tidak dipakai). Perlu flag `is_null` eksplisit.
6. **`is_locked` pada `price_scenarios`** — V1/V2/V3 immutable (PRD §31).
7. **`project_history` append-only** dengan `old_value`/`new_value`/`impact_json` (PRD §34).

---

# F. CALCULATION ENGINE ARCHITECTURE

## F.1 Prinsip

```text
INPUT (scenario_inputs + scenario_costs + vendor_prices)
        │
        ▼
VALIDATION (lib/validation)
        │
        ▼
CALCULATION ENGINE (lib/calculations)  ← HANYA di server (Server Action / Route Handler)
        │
        ├──────────────► calculation_results (persist)
        ▼
UI (read-only untuk calculated field)
```

Calculated field **tidak pernah** dihitung di React component.

## F.2 Struktur modul (sesuai PRD §38)

```text
lib/calculations/
  vendor.ts      calculateVendorPpn, calculateVendorAllIn, calculateVendorBaseFromInclude
  revenue.ts     calculateRevenue, calculateHargaJualDpp
  cost.ts        calculateCostLineTotal, calculateTotalCost, calculateCostPerLiter
  tax.ts         calculatePpnOutput, calculatePpnInput, calculatePpnDifference
  profit.ts      calculateGrossProfit, calculateNetProfit,
                 calculateNetProfitPerLiter, calculateProfitPercentage
  ahs.ts         calculateAhs(templateId, inputs) -> AhsResult   ← orchestrator
  scenario.ts    calculateScenario, compareScenario
  cross-check.ts runCrossCheck(scenarioId, excelExpected)
  templates/     A_standard.ts, B_vendor_eval.ts, C_proyeksi.ts, D_market_cash.ts
```

## F.3 Kontrak tipe inti

```ts
type AhsInput = {
  volume: number;
  hargaJualInclude: number;      // Harga jual (tax-inclusive)
  includeDivisor: number;        // 1.11 | 1.185 | 1.213  ← HARUS eksplisit
  diskonPct?: number;
  pbbkbRate: number;             // 0.075 | 0.05 | 0.10
  ppnRate: number;               // 0.11
  ppnInputBase: 'base' | 'base_plus_levies';
  costLines: Array<{ lineNo: number; label: string; category: string;
                     ratePerLiter: number | null; qty: number | null }>;
  templateId: 'A' | 'B' | 'C' | 'D';
};

type AhsResult = {
  revenue: number; totalCost: number; costPerLiter: number;
  ppnOutput: number; ppnInput: number; ppnDifference: number;
  grossProfit: number; netProfit: number;
  netProfitPerLiter: number; profitPercentage: number;
};
```

## F.4 Aturan implementasi

1. **Satu fungsi = satu F-ID.** `calculateProfitPercentage` WAJIB `netProfit / totalCost`
   (F021). Jangan "memperbaiki" jadi `/revenue`.
2. **Rate & divisor adalah parameter, bukan konstanta.** Semua `11%`, `7,5%`, `1,11`,
   `1,185` di-*lift* dari formula ke input/registry.
3. **`qty` independen dari volume.** `L = rate × qty`, dan `qty` boleh ≠ volume.
4. **Total Cost dihitung dari daftar baris yang di-*flag*** (`is_summed_in_total`),
   bukan selalu seluruh range — Template C membuktikan hal ini.
5. **`#REF!` tidak boleh di-*resolve* jadi 0.** Sel yang rusak harus masuk `cross_check_runs`
   dengan status `ERROR`.

---

# G. AMBIGUITIES / RISKS

> Ini bagian yang **wajib diputuskan user sebelum implementasi**. Saya tidak mengasumsikan.

**Status setiap item setelah Phase 2.5** (bukti lengkap ada di dokumen yang disebut di atas;
✅ = terjawab dengan bukti workbook, 🟠 = masih keputusan bisnis user dan **tidak ditebak**):

| Item | Status akhir Phase 2.5 |
|---|---|
| G1 `ALL IN` dua bentuk | ✅ Diterima sebagai dua varian nyata: `F002A` (6 komponen) / `F002B` (7 komponen) — keduanya cocok dengan Excel |
| G2 Basis PPN masukan | ✅ Tiga varian terdaftar `F008A`/`F008B`/`F008C`; 8 blok tetap `PPN_INPUT_VARIANT` → **tidak diuji** |
| G3 Divisor bervariasi | 🟠 Kini dibaca sebagai **input**, bukan konstanta. `1.185` = PPN 11% + PBBKB 7,5%, `1.16` = PPN 11% + PBBKB 5%; `1.213` (8 sel), `1.188` (21), `1.163` (7), `1.21` (5) belum dijelaskan tarif mana pun dan dipakai apa adanya |
| G4 Rate PBBKB `7,5%`/`5%`/`10%`/`0` | 🟠 Tarif dibaca per blok; `×0` di Template A **ditiru**, bukan "diperbaiki" |
| G5 Qty ≠ Volume | 🟠 Masih keputusan bisnis |
| G6 Bagi hasil tidak konsisten | 🟠 Masih keputusan bisnis |
| G7 18 sel `#REF!` | ✅ Diaudit per sel + klasifikasi dampak CRITICAL/HIGH/MEDIUM/LOW; **tidak satu pun** dijadikan 0 |
| G8 Sel kosong vs bernilai 0 | ✅ Dibedakan eksplisit (`NULL` = tidak berlaku vs `0`); tidak ada substitusi diam-diam |
| G9 Harga jual literal | ✅ Menjadi varian `F005B` dan `F027B`; 2 blok yang murni literal → `CUSTOM_FORMULA_BLOCK` (tidak diuji) |
| G10 Granularitas "project" | 🟠 Masih keputusan bisnis |
| G11 Kolom vendor tidak konsisten | 🟠 Komponen ke-7 dibaca **posisional**, sehingga tidak bergantung pada nama kolom |
| G12 Sheet working/scrap | 🟠 Masih keputusan bisnis |

### G1. 🔴 `ALL IN` vendor punya dua bentuk berbeda
- `Eval Vendor TL!H18` = `SUM(H11:H17)` → **7 baris** (termasuk BPH).
- `JATENG!D16` = `sum(D9:D14)` → **6 baris** (BPH dikecualikan).
- Bahkan dalam satu sheet: `JATENG!D16=sum(D9:D14)` vs `JATENG!F16=SUM(F9:F15)`.
- **Keputusan diperlukan:** mana yang benar? Atau memang per-vendor berbeda?

### G2. 🔴 Basis PPN Masukan (PPN Input) tidak konsisten
- `JATENG!J20` = `SUM(J15:J19)*11%` → basis = Harga Dasar + OAT + PBBKB + PPH INU + BPH Migas.
- `Eval Vendor TL!N22` = `N17*11%` → basis = Harga Dasar saja.
- `VIRTUE dan OSS!G20` = `sum(G15:G16)*11%`.
- **Dampak:** `SELISIH PPN` (dan karenanya `LABA BERSIH`) berubah. Ini sensitif.

### G3. 🟠 Divisor harga include bervariasi: `1,11` / `1,185` / `1,213`
- `1,11` = PPN 11%.
- `1,185` = ? (AHAS Prioritas `R10 = 18600/1.185`; `Rekap IGIP!P16 = 18600/1.185`).
- `1,213` = ? (MALUKU `BA94 = (22870/1.213)+1200`).
- **Keputusan diperlukan:** rumus/arti `1,185` dan `1,213`.

### G4. 🟠 Rate PBBKB berbeda: `7,5%` / `5%` / `10%` / `0`
- `JATENG!J11 = J10*7.5%*0` (secara efektif **selalu 0** karena `×0`).
- `Mamuju!I16 = I14*5%`, `IWIP!W18 = W16*10%`, `VIRTUE!B11 = B9*10%`.
- **Keputusan:** apakah multiplier `×0` di Template A memang sengaja menonaktifkan PBBKB?

### G5. 🟠 Qty (`K`) tidak selalu = Volume
- Umumnya `K15 = K10` (volume). Tapi `AHAS Prioritas!K107 = F120*3%*7/30` (berbasis hari).
- **Risiko tinggi** jika engine mengasumsikan `Total = Rate × Volume`.

### G6. 🟠 Bagi hasil tidak konsisten
- `N179` (RBI 30%) vs `N182` berlabel "40%" tapi `=N179*L152` (memakai rate 30%).
- `N180` (Investor 50%) vs `N183` berlabel "30%" tapi `=N180*L157` (memakai rate 50%).
- `N181` (Partner 20%) vs `N184` berlabel "30%" tapi `=N181*L152`.
- **Keputusan:** label atau rate yang benar?

### G7. 🔴 18 sel `#REF!` (formula rusak)
```
TONASA!E89, TONASA!R89, TONASA!R232
INDORAMA!BE10, INDORAMA!D32
JATENG!D38, JATENG!BC38
JABAR!CU180
KALSEL!V3
SULTRA!AQ146, SULTRA!BK155, SULTRA!AP165, SULTRA!AZ165, SULTRA!AZ169
MALUKU!D38, MALUKU!P38, MALUKU!AB38, MALUKU!AO38
```
- Beberapa dipakai sebagai divisor (`SULTRA!AZ169 = AZ167/#REF!`) → merusak downstream.
- **Wajib diklarifikasi**, jangan dianggap 0.

### G8. 🟠 Sel kosong yang bernilai `0` vs sel yang benar-benar kosong
- Contoh: `Perhitungan INU!D11 = 0` (formula `=D8*0.3%` → di-hardcode `0`? perlu cek),
  sedangkan `AHAS Prioritas!H16 = formulir menunjuk ke sel kosong` (`None`).
- **Keputusan:** kolom mana yang "tidak berlaku" (NULL) vs "bernilai nol".

### G9. 🟠 `HARGA JUAL SETELAH PAJAK` kadang berisi angka literal, bukan formula
- 15 sel berbentuk `=N` / `=N/N` (mis. `JATENG!AP184 = 21000`, `EB96 = 15000/1.11`).
- Artinya harga jual kadang di-*override* manual, kadang dihitung.
- **Keputusan:** apakah override manual boleh (dan tercatat sebagai scenario_reason)?

### G10. 🟡 "Project" belum ada di Excel
- Sheet = region/project, tetapi satu sheet memuat banyak customer & lokasi
  (mis. `TONASA` memuat Teluk Bayur, Samarinda, Cilegon, …).
- **Keputusan:** granularitas `projects` — apakah per (customer × lokasi × periode)?

### G11. 🟡 Kolom vendor tidak konsisten
- Ada blok dengan 3 vendor (`C/D/E`), 4 vendor (`C/D/E/F`), atau 2 vendor.
- `Perhitungan INU` punya nama perusahaan sebagai kolom (`I12=PT Jagad`, `J12=PT Genco`,
  `K12=PT Petrocon`) tetapi **nilainya 0** (kolom placeholder).
- **Keputusan:** jumlah vendor maksimum & perlakukan kolom placeholder.

### G12. 🟡 `AHAS Coretan`, `Market Bu *`, `KROSCEK AHAS` = working/scrap?
- Perlu konfirmasi mana yang **data produksi** dan mana **coretan** yang tidak perlu dimigrasi.

---

# H. MIGRATION / IMPLEMENTATION PLAN

## H.0 Kondisi codebase saat ini

```text
/  (project root)
├── PRD.md
├── ANALISIS HARGA SATUAN (2026).xlsx
└── docs/EXCEL_MAPPING.md   ← dokumen ini
```

> **Belum ada** `package.json`, `next.config`, `app/`, `supabase/`, maupun git.
> Karena itu Next.js + Supabase belum bisa dijalankan/test sampai di-*scaffold*.
> **Saya berhenti di sini** sesuai instruksi: mapping harus divalidasi lebih dulu.

## H.1 Urutan kerja (selaras PRD §47)

| Tahap | Deliverable | Status |
|-------|-------------|--------|
| 1 | Excel Mapping (dokumen ini) | ✅ selesai |
| 2 | Klarifikasi §G (G1–G12) | ⏳ **butuh keputusan user** |
| 3 | Normalisasi blok → dataset kanonik (JSON) + validasi parsing | ⏳ |
| 4 | Golden-test dataset (Excel Input → Expected Result) dari blok asli | ⏳ |
| 5 | Scaffold Next.js + TS + Supabase | ⏳ |
| 6 | Schema + migrasi SQL + RLS | ⏳ |
| 7 | Calculation engine + unit test terhadap golden dataset | ⏳ |
| 8 | Cross-check runner (VALID/WARNING/ERROR) | ⏳ |
| 9 | Auth + RLS + role | ⏳ |
| 10 | UI (Dashboard → Project → Vendor → AHS → Scenario → History → Report) | ⏳ |
| 11 | Deployment Vercel | ⏳ |

## H.2 Rekomendasi langkah berikutnya (paling efisien)

1. **Bangun dulu "Excel Extract Canonicalizer"** (script Node/Python) yang membaca workbook
   dan mengubah 485 blok → `blocks.json` ternormalisasi
   (`sheet, blockIndex, header, vendors[], costLines[], outputs, rawFormulas[]`).
   Ini menjadi **golden dataset** untuk cross-check dan tidak menyentuh aplikasi.
2. **Kunci Template A/B/C/D** di `calculation_templates` + `template_cost_lines`
   berdasarkan temuan §C.
3. **Baru** scaffold Next.js/Supabase (tahap 5).

## H.3 Definisi sukses Phase 1 (acceptance)

- [x] Semua 35 sheet terklasifikasi (A)
- [x] Semua 485 blok terinventarisasi (B)
- [x] Mapping Template A–D lengkap dengan `Sheet!Cell` (C)
- [x] Formula Registry draft + metadata (D)
- [x] Schema proposal + alasan desain (E)
- [x] Arsitektur calculation engine (F)
- [x] Daftar ambiguities G1–G12 (G)
- [x] Rencana migrasi (H)
- [ ] **Keputusan user atas G1–G12** (menunggu input)

---

## LAMPIRAN 1 — Ringkasan bentuk formula dominan (71 bentuk unik)

| Jml | Bentuk | Contoh |
|----:|--------|--------|
| 14.899 | `=R` | `Mamuju!J10 =J9` |
| 10.382 | `=R*R` | `Mamuju!L7 =L8*J9` |
| 4.952 | `=R*N%` | `Mamuju!B9 =B8*11%` |
| 2.432 | `=sum(R:R)` | `Mamuju!J6 =sum(I9:I11)` |
| 2.412 | `=R-R` | `Mamuju!L32 =L7-L12` |
| 1.995 | `=SUM(R:R)` | `Mamuju!L8 =SUM(I9:I11)` |
| 903 | `=R/R` | `Mamuju!L35 =L34/J9` |
| 903 | `=R*N%*N` | `Perhitungan INU!O15 =O14*7.5%*0` |
| 828 | `=N/N` | `Mamuju!D8 =16100/1.11` |
| 277 | `=R*N` | `AHAS Prioritas!CE58 =CD58*100000` |
| 221 | `=(R-R)/R` | `Perhitungan INU!AC10 =(Z10-AA14)/Z10` |
| 201 | `=R-R-R-R-R` | `Mamuju!B36 =C28-B28-B30-B31-B32` |
| 136 | `=N%*R` | `Perhitungan INU!U47 =0.25%*V34` |
| 68 | `=R-R-R` | `AHAS Prioritas!FQ35 =FQ32-FQ33-FQ34` |

## LAMPIRAN 2 — Konvensi header baris 1 (periode/scenario)

Setiap sheet regional/project menuliskan label periode di baris 1 pada kolom awal setiap blok:

```
JATENG : B1='P2 FEB-26' O1='P1 Apr-26' AB1='P2 Apr-26' BA1='P1 May-26' ... GD1='P2 SEP-26'
TONASA : B1='P2 MAR-26' O1='P2 APR-26' AN1='P1 MEI-26' ... HJ1='P1 Okt-26'
AHAS Prioritas: B1='P2 JULI-26' AD1='P1 August-26' BI1='P2 August-26' BZ1='P1 September-26'
```

→ Ini **bukti** bahwa "scenario/versi" di Excel = blok terpisah (bukan overwrite),
selaras PRD §30–§31.

---

**End of Phase 1 Analysis.** Tidak ada file aplikasi/kode yang dibuat.

---

> **Catatan (setelah Phase 2.5):** analisis Phase 1 di atas tetap menjadi rujukan bukti dan tidak
ditulis ulang. Tahap berikutnya sudah dijalankan: Phase 2 (database + calculation engine) dan
Phase 2.5 (excel coverage, formula hardening, final validation). Keputusan §G yang belum dijawab
**tetap tidak ditebak** oleh sistem — lihat tabel status di awal §G dan `docs/PHASE2_REPORT.md` §H.4.
