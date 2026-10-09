# PHASE 2 — DATABASE + CALCULATION ENGINE (Implementation Report)

> Laporan konsolidasi seluruh deliverable Phase 2 (A–G), sesuai permintaan Phase 2 §19.
> **Acuan:** `docs/EXCEL_MAPPING.md` (Phase 1) dan workbook asli `ANALISIS HARGA SATUAN (2026).xlsx`.
> **Prinsip:** Excel = Source of Truth. Tidak ada UI/dashboard, tidak ada dummy/mock result,
> tidak ada formula bisnis yang di-hardcode di luar Formula Registry.

**Tanggal:** 2026-10-07
**Status:** selesai — 51 test lulus, cross-check 4775 VALID / 0 WARNING / 0 ERROR, migrasi + seed terverifikasi.
*(Angka baris ini = baseline Phase 2, bukan angka akhir.)*

> ⚠️ **Angka di dokumen ini adalah baseline Phase 2.** Phase 2.5 memperluas cakupan
> (254 → 466 blok), memperdalam taxonomy, dan menyelesaikan formula `UNRESOLVED`.
> **Angka final ada di [§H](#h-phase-25--excel-coverage-formula-hardening--final-validation)**
> dan di `docs/EXCEL_COVERAGE_REPORT.md`, `docs/FORMULA_VARIANTS.md`,
> `docs/SUPABASE_VALIDATION.md`. Bagian yang berubah sudah ditandai *“Phase 2.5:”*.

| # | Deliverable | File utama | Status |
|---|---|---|---|
| A | Database migration | `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_protection.sql` | ✅ |
| B | Calculation engine | `lib/calculations/*.ts` (14 modul) | ✅ |
| C | Formula registry (seed) | `lib/formulas/formula-registry.json` → `supabase/seed/0001_formula_registry.sql` | ✅ |
| D | Calculation templates (seed) | `lib/formulas/calculation-templates.json` → `supabase/seed/0002_*.sql`, `0003_*.sql` | ✅ |
| E | Automated tests | `tests/excel-crosscheck.test.ts`, `tests/engine-behaviour.test.ts` | ✅ 67 lulus (Phase 2.5) |
| F | Excel cross-check report | `docs/PHASE2_CROSSCHECK.md` | ✅ 0 `FORMULA_MISMATCH` (Phase 2.5) |
| G | Implementation notes | §G dokumen ini | ✅ |

---

# A. DATABASE MIGRATION

Tiga file migrasi SQL siap jalan di Supabase (urut, idempoten terhadap `on conflict` pada seed):

```
supabase/migrations/0001_schema.sql        # tabel, enum, constraint, index, trigger updated_at
supabase/migrations/0002_rls.sql           # RLS + helper role/akses
supabase/migrations/0003_protection.sql    # calculated-field guard, scenario immutability, audit
```

## A.1 Tabel (21)

Semua tabel yang diminta Phase 2 §1 tersedia, **ditambah tabel yang strukturnya benar-benar
muncul di Excel** (§G10–G12 Phase 1), bukan sekadar daftar PRD:

| Domain | Tabel | Asal di workbook |
|---|---|---|
| Identity & akses | `profiles`, `project_members` | PRD + kebutuhan ownership |
| Master | `markets`, `vendors`, `products`, `customers` | blok vendor/AHS nyata (market, customer) |
| Project | `projects`, `project_vendors` | sheet = region/project |
| Formula | `formula_registry`, `calculation_templates`, `template_formulas` | Phase 1 §D/§E |
| AHS | `ahs`, `ahs_cost_items` | cost engine `JATENG!J15:L32` dll |
| Vendor | `vendor_prices` | `EVALUASI HARGA VENDOR` |
| Scenario | `price_scenarios`, `scenario_inputs`, `calculation_results` | label blok CASH/TEMPO/dll |
| Hasil tambahan | `profit_shares`, `delivery_logs` | F025 bagi hasil, F026 Rekap IGIP |
| Audit | `project_history`, `cross_check_runs` | Phase 2 §15, §16 |

`ahs_cost_items`, `vendor_prices`, `scenario_inputs` dan `calculation_results` semuanya
FK ke `price_scenarios` → snapshot scenario tidak tercampur antar versi.

## A.2 Konvensi kolom

- **PK:** `uuid default gen_random_uuid()` (kecuali `formula_registry`/`calculation_templates` PK = `text` id stabil seperti `F002A`, `T_A_AHS_STANDARD`).
- **FK:** eksplisit + aksi `on delete cascade`/`set null` (mis. `ahs.project_id → projects on delete cascade`).
- **Unique:** `ahs_cost_items (ahs_id, line_no)`, `scenario_inputs (scenario_id, field_key)`, `price_scenarios (project_id, name)`, `template_formulas (template_id, step)`.
- **Timestamp:** `created_at` + `updated_at default now()`, trigger `set_updated_at()` otomatis.
- **Traceability:** `created_by uuid references profiles (id)` di tabel transaksional.
- **Status/version:** `scenario_type` (enum), `price_scenarios.is_locked`, `formula_registry.version`, `calculation_templates.version`, `active`.
- **Tanpa denormalisasi tanpa alasan.** Nilai calculated hanya disimpan di `ahs.calculated_*` / `calculation_results`.

## A.3 Bukti eksekusi

Migrasi dijalankan dengan `ON_ERROR_STOP=1` terhadap **PostgreSQL 14 lokal** → `SCHEMA OK / RLS OK / PROTECTION OK`.
Seed dijalankan → *Phase 2.5:* **36 formula (35 aktif), 6 template, 45 `template_formulas`** terpasang
(baseline Phase 2: 32 / 4 / 35). Integritas diuji ulang: **0** formula `UNRESOLVED` yang aktif,
**0** `template_formulas` yatim.
Proteksi diuji dengan skrip eksekusi terpisah (bukan klaim): lihat §A.5.

## A.4 RLS (Phase 2 §2)

- `alter table ... enable row level security` untuk **seluruh 21 tabel** (loop `do $$`).
- **Tidak ada policy `allow all`.**
- Helper: `current_role_name()` (dari `profiles.role`), `is_admin()`, `can_write()`, `has_project_access(uuid)`, `can_write_project(uuid)` — semua `security definer`, `stable`.
- Role: `ADMIN`, `PROCUREMENT`, `PIC`, `VIEWER`.
- Contoh policy: `projects_select` (admin/procurement atau member), `ahs_update` (hanya yang punya akses tulis project), `project_history_delete` (admin saja), `formula_registry_write` (admin saja).

## A.5 Proteksi lapis database (Phase 2 §2 & §15)

Semua **diverifikasi dengan menjalankan SQL** (bukan diasumsikan):

| Aturan | Trigger/Fungsi | Hasil eksekusi |
|---|---|---|
| Calculated field `ahs`/`calculation_results` tidak bisa diubah user | `protect_calculated_fields()` | ✅ UPDATE ditolak; kolom non-calculated tetap bisa diedit |
| Engine boleh menulis calculated field | GUC `app.calculation_engine='on'` | ✅ diizinkan |
| V1 otomatis terkunci saat V2 dibuat | `lock_parent_scenario()` | ✅ `is_locked=true` |
| Scenario terkunci tidak bisa diubah / ditulis inputnya | `enforce_scenario_immutability()`, `reject_locked_scenario_write()` pada `scenario_inputs` & `ahs_cost_items` | ✅ ditolak |
| `project_history` append-only | `history_is_append_only()` | ✅ UPDATE & DELETE ditolak |
| Audit perubahan input harga otomatis | `log_scenario_price_change()` | ✅ menulis baris `project_history` (field, old→new, actor, timestamp) |
| `UNRESOLVED` + `active=true` ditolak | check constraint di `formula_registry` | ✅ ditolak |
| Duplikat `(project_id, name)` ditolak | unique constraint | ✅ ditolak |

## A.6 Batasan yang tidak bisa diverifikasi di environment ini

*Phase 2.5: bagian ini kini punya dokumen dan bukti tersendiri — `docs/SUPABASE_VALIDATION.md`.*

- Perilaku RLS **khusus Supabase** (`auth.uid()` → `auth.users`, PostgREST) **belum diuji**; di PostgreSQL lokal `auth.uid()` di-stub. Ini tetap **NOT YET TESTED** dan tidak diklaim.
- Belum ada project Supabase/credentials, jadi belum ada eksekusi terhadap instance Supabase nyata.
- Yang **sudah** diuji (Phase 2.5, PostgreSQL lokal, role nyata): migrasi 3/3, seed 3/3, 54 policy pada 21 tabel, 18 trigger, dan **role matrix 47/47 PASS, 0 FAIL** — termasuk penemuan & perbaikan satu bug produksi (cast `history_action`, lihat `docs/SUPABASE_VALIDATION.md` §2.5).

---

# B. CALCULATION ENGINE

```
lib/calculations/
├── errors.ts        # CalculationError, Result<T>, fail(), toResult() — model kegagalan eksplisit
├── expression.ts    # tokenizer + parser aman (TANPA eval), dukung % postfix & sum/min/max/abs/round
├── types.ts         # FormulaDef, CalculationTemplate, AhsInput/Result, ScenarioSnapshot, CompareMetric
├── registry.ts      # getFormula/getTemplate/resolveFormula/resolveWithProvenance/listUnresolved
├── validation.ts    # validateNumeric / validateAhsInput / validateCostLine / validateVendorPrice / validateProject|ScenarioId
├── vendor.ts        # F001 PPN, F002A/B ALL IN, F003 base dari include
├── revenue.ts       # F005 DPP, F004 diskon, F006 revenue
├── cost.ts          # F007 cost line, F015A/B total, F016 biaya per liter
├── tax.ts           # F008A/B/C PPN masukan, F009 PBBKB, F010 PPH INU, F011 BPH, F013 diskonto, F018 selisih
├── profit.ts        # F017 laba kotor, F019A laba bersih, F020 /liter, F021A %, F022–F025 varian MUE & bagi hasil
├── ahs.ts           # orkestrator satu blok + assertFinite() guard
├── scenario.ts      # ScenarioStore, create/clone/calculate/compareScenario, metricValue
├── cross-check.ts   # compareNumber, buildRow, summarise, toleransi
└── index.ts         # barrel export
```

## B.1 Pipeline (Phase 2 §6)

```
INPUT → VALIDATION → FORMULA RESOLUTION → CALCULATION → RESULT → PERSIST RESULT
  │          │                │                 │            │            │
  │      validation.ts    registry.ts       vendor/tax/   Result<T>   scenario.ts + DB
  │                                        cost/profit
  └─ input mentah      └─ formula_id dari    └─ evaluateExpression(scope)  └─ snapshot
     (AhsInput)           template             (bukan hardcode)
```

`calculateAhs()` adalah satu-satunya entry point blok: template di-resolve dulu (`getTemplate`),
lalu validasi mengumpulkan **semua** masalah (bukan hanya yang pertama), lalu setiap langkah
memakai `formula_id` dari `template.formula_definition` — engine tidak pernah menulis rumus bisnis sendiri.

## B.2 Determinisme (Phase 2 §6)

Diuji tiga cara (`tests/engine-behaviour.test.ts`):

- input identik → output identik untuk kasus tunggal;
- deterministik untuk **setiap blok hasil ekstraksi** (2 run masing-masing);
- deterministik pada **100 pengulangan berurutan**.

Tidak ada `Date.now()`, `Math.random()`, atau urutan `Object.keys` yang memengaruhi nilai hasil.

## B.3 Error handling (Phase 2 §18)

Engine **tidak pernah** mengembalikan `NaN` / `Infinity` / `undefined`.
`ErrorCode`: `MISSING_INPUT`, `INVALID_NUMBER`, `ZERO_VOLUME`, `NEGATIVE_VALUE`,
`UNKNOWN_FORMULA`, `UNRESOLVED_FORMULA`, `DIVISION_BY_ZERO`, `EXPRESSION_ERROR`,
`UNKNOWN_TEMPLATE`, `MISSING_COST_LINES`, `MISSING_VENDOR_PRICE`, `INVALID_SCENARIO`.

Bentuk keluaran gagal persis seperti yang diminta:

```ts
{ success: false, errorCode: "ZERO_VOLUME", message: "...", field: "volume" }
```

`ahs.ts` menutup seluruh perhitungan dengan `assertFinite()` sebagai jaring terakhir.
`expression.ts` melempar `DIVISION_BY_ZERO` alih-alih `Infinity`, dan melempar
`MISSING_INPUT` untuk variabel tak dikenal alih-alih memperlakukannya sebagai `0`.

## B.4 Sel kosong ≠ 0 (Phase 2 §8)

- `ahs_cost_items.rate` / `.qty` boleh `NULL` = **TIDAK BERLAKU**, dibedakan dari `0` = bernilai nol.
- `validateAhsInput` melaporkan `MISSING_INPUT`, bukan men-substitusi `0` (diuji: "keeps a null cost rate as null (NOT APPLICABLE, not 0)").
- `vendor.ts` mengembalikan `MISSING_VENDOR_PRICE` (PRD §11), bukan `Rp 0`.
- Baris biaya yang tidak dijumlahkan totalnya ditandai `ahs_cost_items.is_summed_in_total = false`.

---

# C. FORMULA REGISTRY (SEED)

**Sumber tunggal:** `lib/formulas/formula-registry.json` → digenerate ke SQL oleh `npm run seed:sql`.
Engine dan database membaca file yang **sama**, jadi registry DB tidak bisa drift dari engine.

*Phase 2.5:* **36 formula** terdaftar (32 pada Phase 2). Tiap baris menyimpan: `formula_id, formula_name, expression,
excel_formula (ASLI, tidak pernah ditulis ulang), source_sheet, source_cell, source_block,
version, description, resolution, active`.

## C.1 Variasi Excel disimpan TERPISAH (Phase 2 §3)

| Grup | Varian | Perbedaan | Bukti Excel | Status |
|---|---|---|---|---|
| ALL IN | `F002A` | 6 komponen (tanpa BPH) | `JATENG!D16 =sum(D9:D14)` | RESOLVED |
| | `F002B` | 7 komponen (dengan BPH) | `Eval Vendor TL!H18 =sum(H11:H17)` | RESOLVED |
| PPN masukan | `F008A` | basis = harga dasar | `Eval Vendor TL!N22 =N17*11%` | RESOLVED |
| | `F008B` | basis = dasar+OAT+PBBKB+PPH INU+BPH | `JATENG!J20 =SUM(J15:J19)*11%` | RESOLVED |
| | `F008C` | basis = dasar+OAT | `VIRTUE dan OSS!G20 =sum(G15:G16)*11%` | RESOLVED |
| Total biaya | `F015A` | sum seluruh range | `JATENG!M13 =sum(L15:L32)` | RESOLVED |
| | `F015B` | baris terpilih | `IWIP!L14 =K16+K17+K18+K21+K30+K33` | RESOLVED |
| Laba bersih | `F019A` | 2 suku | `Eval Vendor TL!Q37 =Q35-Q36` | RESOLVED |
| | `F019B` | 3 suku; suku ke-3 = `SELISIH PBBKB` *(Phase 2.5)* | `AHAS Prioritas!FQ35 =FQ32-FQ33-FQ34` | RESOLVED |
| Profit % | `F021A` | net / **total biaya** | `Eval Vendor TL!Q39 =Q37/Q15` | RESOLVED |
| | `F021B` | `=DK79/DK82*100%`; pembagi = **Modal Investor** *(Phase 2.5)* | `AHAS Prioritas!DL79` | RESOLVED |

> **`F008C` ditemukan oleh cross-check Phase 2 ini**, bukan Phase 1. Sebelum didaftarkan,
> 11 blok gagal dengan deviasi 9,09% (= 1/11); setelah dijadikan formula terpisah, semuanya VALID.

## C.2 Formula UNRESOLVED (Phase 2 §7) — *Phase 2.5: kini 0*

Phase 2 menandai `F019B` dan `F021B` sebagai `UNRESOLVED` karena operand-nya belum
bisa dipastikan. **Phase 2.5 menyelesaikan keduanya dari dependency Excel, bukan tebakan**
(detail: `docs/FORMULA_VARIANTS.md`, `docs/PHASE2_CROSSCHECK.md` §6):

- `F019B` — suku ke-3 = **`SELISIH PBBKB`** (`AHAS Prioritas!FQ34 = FP10-FP16`; baris berlabel
  "SELISIH PBBKB" pada kolom label yang sama: LABA KOTOR / SELISIH PPN / SELISIH PBBKB /
  LABA BERSIH). Tersebar di 68 sel; aritmetikanya diverifikasi numerik pada **3/3 blok**
  (cocok persis). Bila sel itu **kosong**, aritmetika Excel sendiri menghasilkan 0 — itu
  properti blok, jadi masuk sebagai input `pbbkb_difference_applicable`, bukan asumsi. **RESOLVED.**
- `F021B` — pembagi = **Modal Investor** (`DK82 = DL52`, label baris "Modal Investor"),
  pembilang `DK79 = DK76*30%` → metrik **Return on Investor Capital**, jadi **bukan** varian
  `F021A`. 4 sel lain memakai basis **Harga Include** → didaftarkan sebagai `F021C`. **RESOLVED.**

Selain itu Phase 2.5 masih menonaktifkan **1** formula, tetapi alasannya berbeda — bukan
karena formula tidak diketahui, melainkan karena bloknya sendiri literal:

- `F015C` — 2 blok (`TONASA!V289`, `TONASA!V333`) mengetik Total Biaya **dan** Biaya per Liter
  sebagai angka literal, sehingga tidak ada formula yang bisa diuji. Formula tetap terdaftar
  demi traceability dengan `active=false`, dan bloknya diklasifikasikan `CUSTOM_FORMULA_BLOCK`.

Check constraint DB menolak baris `resolution='UNRESOLVED'` dengan `active=true`, dan
`resolveFormula()` **melempar** `UNRESOLVED_FORMULA` bila dipanggil — jadi jalur ini tidak bisa
dipakai secara tidak sengaja (diuji eksplisit).

---

# D. CALCULATION TEMPLATES (SEED)

*Phase 2.5:* **5 template** (4 pada Phase 2; bertambah `T_E_AHS_PROFIT_SHARE` untuk layout AHS
yang tidak punya baris `PERSENTASE`). Tiap template menyimpan
`template_id, template_name, source_sheet, source_block, input_definition, formula_definition,
dependency_definition, output_definition, version, active` + `coverage_note`.

| Template | Sumber (blok Excel nyata) | Cakupan | Kekhususan |
|---|---|---|---|
| `T_A_AHS_STANDARD` | `JATENG` `C8:M37` — AHS + EVALUASI HARGA VENDOR | 454/485 blok AHS, 33 sheet | PPN masukan = `F008B`; total biaya = `F015A` |
| `T_B_VENDOR_EVAL_PROFAMIR` | `Eval Vendor TL` `G4:Q39` | 6 blok | Semua contoh PRD §14–§26 berasal dari sini; ALL IN = `F002B`; PPN masukan = `F008A` |
| `T_C_PROYEKSI_LABA_RUGI` | `IWIP ` `G3:Z42` | PROYEKSI LABA RUGI PT IWIP | Total biaya = `F015B` (baris terpilih), bukan sum range |
| `T_D_MARKET_CASH` | `AHAS Coretan` `O12:V27`, `Market Bu Ve` | blok fee + profit per liter | Memakai rujukan antar-blok; `coverage_note` menyatakan struktur belum sepenuhnya jadi satu formula tunggal |
| `T_E_AHS_PROFIT_SHARE` *(Phase 2.5)* | `TONASA` — layout AHS tanpa baris `PERSENTASE` | 19 blok AHS ber-layout ini | Dipakai bila `profit_percentage` tidak ada di blok, sehingga `CORE_LABELS` (8 label) tidak boleh menuntut `PERSENTASE` |

Relasi template → formula disimpan di tabel `template_formulas (template_id, step, formula_id)`
(*Phase 2.5:* **45 baris**; Phase 2: 35), digenerate dari JSON yang sama. Uji integritas memastikan **setiap formula yang
dirujuk template benar-benar terdaftar dan aktif** — kalau tidak, test gagal.

---

# E. AUTOMATED TESTS

*Phase 2.5:* `npm test` → **67 test lulus** (2 file).

| File | Jumlah | Isi |
|---|---:|---|
| `tests/excel-crosscheck.test.ts` | 39 | Cross-check terhadap workbook asli (Test 1–12) + preconditions + summary + audit census, varian, `#REF!`, dan unresolved |
| `tests/engine-behaviour.test.ts` | 28 | Expression evaluator, integritas registry, validation layer, determinisme, scenario engine, varian `F005*`/`F015C`/`F027*` dan formula nonaktif |

Fixture `tests/fixtures/excel-cases.json` diekstrak langsung dari workbook oleh
`npm run extract:excel` (Python/openpyxl), berisi *Phase 2.5:* **466 blok AHS** (Phase 2: 254)
**+ 1196 blok vendor** dengan rumus aslinya (SUM range, divisor, batas blok) — bukan angka buatan.

## E.1 Pemetaan ke Prioritas Test (Phase 2 §17)

| # | Test Prioritas | Test |
|---|---|---|
| 1 | Vendor PPN | Test 1 (F001) — 1107 blok, 2 rezim rate |
| 2 | Vendor ALL IN | Test 2 (F002A/F002B) — 1128 blok, termasuk varian label komponen ke-7 |
| 3 | Revenue | Test 4 (F006) |
| 4 | Cost Items | Test 5 (F007) — 4569 baris biaya |
| 5 | Total Cost | Test 6 (F015A/F016) |
| 6 | Gross Profit | Test 7 (F017) |
| 7 | PPN Difference | Test 8 (F018, ketiga varian PPN masukan) |
| 8 | Net Profit | Test 9 (F019A) |
| 9 | Net Profit/Liter | Test 10 (F020) |
| 10 | Profit % | Test 11 (F021A) + test pembuktian bahwa pembaginya Total Biaya, bukan Revenue |
| 11 | Scenario recalculation | "recalculating a stored scenario reproduces its snapshot exactly" |
| 12 | Scenario comparison | "compareScenario reports every required metric with systematic differences" |

Tambahan: Test 3 (base dari include `=X/divisor`), Test 12 (divisor `1.185`), dan uji
formula provenance + determinisme.

## E.2 Scenario engine (Phase 2 §13–§14)

- `createScenario()` menyimpan snapshot input **dan** hasil perhitungan.
- `cloneScenario()` membuat V2 **tanpa menimpa V1**; diuji rantai V1 → V2 → V3 imutabel.
- Mutasi scenario yang sudah final ditolak.
- `compareScenario()` melaporkan 10 metrik wajib dengan selisih sistematis
  (`difference` dan `difference_pct`): vendor price, customer price, volume, revenue,
  total cost, gross profit, PPN difference, net profit, net profit/liter, profit %.
  `metricValue` mengambil harga vendor dari input dan sisanya dari hasil.

---

# F. EXCEL CROSS-CHECK REPORT

Deliverable F ada di **`docs/PHASE2_CROSSCHECK.md`** (digenerate oleh `npm run crosscheck:report`).
*Phase 2.5:* taxonomy diganti dari `VALID`/`WARNING`/`ERROR` menjadi diagnosis yang lebih
spesifik — `VALID` / `PRECISION_VARIANCE` / `FORMULA_MISMATCH` / `UNRESOLVED` / `SKIPPED` —
sehingga selisih presisi cache tidak lagi menyamar sebagai kesalahan formula, dan sebaliknya
formula yang memang berbeda **tidak** disembunyikan oleh toleransi.

Ringkasan dari `npm run crosscheck:report` (semua metrik):

| Status | Jumlah |
|---|---:|
| **VALID** | **5738** |
| PRECISION_VARIANCE | 1025 |
| **FORMULA_MISMATCH** | **0** |
| SKIPPED | 132 |
| Total pembandingan | 6895 |

Ringkasan di dalam test suite (`rows` = baris dari fixture, setelah dedup/rekap):
`rows 3728`, `compared 3596`, `VALID 2776`, `PRECISION_VARIANCE 820`, `FORMULA_MISMATCH 0`,
`SKIPPED 132`, deviasi relatif maksimum **5.824e-8**.

Deviasi maksimum itu jauh di bawah ambang noise dan ~1000× lebih ketat daripada cacat nyata
terkecil yang harus ditangkap (bug label blok tercampur → 0,98; baris biaya salah → 0,66).

Format tiap pembandingan mengikuti permintaan §16: source sheet, source cell, scenario/blok,
input, expected Excel, system result, difference, status.

Ambang (`lib/calculations/cross-check.ts`):

| Konstanta | Nilai | Alasan |
|---|---:|---|
| `ABS_TOLERANCE` | 0.01 | 1 sen — di bawah ini cache Excel tidak bermakna |
| `FLOAT_NOISE_RELATIVE` | 1e-12 | arithmetic noise IEEE-754 |
| `PRECISION_WINDOW_RELATIVE` | 1e-4 | di atas noise tapi di bawah jendela ini → `PRECISION_VARIANCE` (cache Excel ditulis dengan presisi terbatas), **bukan** mismatch |
| `RATIO_COMPARE.absTolerance` | 1e-12 | metrik persentase butuh toleransi sendiri |

Di atas `PRECISION_WINDOW_RELATIVE` hasilnya `FORMULA_MISMATCH` — sebuah kegagalan, bukan
peringatan. Tidak ada toleransi yang dipakai untuk menutupi perbedaan formula.

**Batas yang jujur (Phase 2.5):** dari 485 blok AHS, **466 diuji penuh** (96,1%).
Sisanya **tidak diuji dan tidak diklaim berhasil**, masing-masing dengan alasan eksplisit:
8 `PPN_INPUT_VARIANT`, 5 `INCOMPLETE`, 2 `CUSTOM_FORMULA_BLOCK`, 2 `ANNOTATION_TITLE`,
1 `NO_LABEL_COL`, 1 `SALE_FORMULA_VARIANT` — daftarnya ada di `docs/EXCEL_COVERAGE_REPORT.md` §3
dan §G di bawah. Formula `UNRESOLVED` yang aktif: **0**.

Cara reproduksi:

```bash
npm install
npm run extract:excel      # workbook -> tests/fixtures/excel-cases.json
npm test                   # 67 test, termasuk seluruh cross-check
npm run crosscheck:report  # docs/PHASE2_CROSSCHECK.md
npm run coverage:report    # docs/EXCEL_COVERAGE_REPORT.md + docs/FORMULA_VARIANTS.md
bash scripts/validate_supabase.sh   # migrasi + seed + RLS matrix (PostgreSQL lokal)
```

---

# G. IMPLEMENTATION NOTES

## G.1 Sudah tervalidasi

1. *Phase 2.5:* **5738 pembandingan VALID + 1025 PRECISION_VARIANCE, 0 FORMULA_MISMATCH, 132 SKIPPED**
   (Phase 2 mencampur keduanya menjadi "4775 VALID"). Semua metrik AHS, cost line, vendor PPN,
   dan vendor ALL IN direproduksi dari workbook asli dengan deviasi ≤ 5.824e-8.
2. **Semua varian resmi terdaftar terpisah** dan masing-masing cocok dengan Excel.
   Phase 2: `F002A`/`F002B`, `F008A`/`F008B`/`F008C`, `F015A`/`F015B`, `F019A`, `F021A`.
   *Phase 2.5 menambah:* `F005B`, `F005C`, `F015C` (nonaktif), `F019B`, `F021B`, `F021C`,
   `F027A`/`F027B` — total **25 varian terdaftar & dipakai**, dan divisor kini dibaca sebagai
   input (`1.11`, `1.16`, `1.185` pada sisi penjualan; sembilan nilai pada sisi vendor),
   bukan konstanta `1.11`.
3. **Variabel komponen ke-7 dibaca posisional**, bukan berdasarkan nama label
   (`BPH`/`SIB`/`ALL IN`/`Izin bunker`/`PPH Migas`/`PPN OAT` — aritmetika identik).
4. **Deterministik** (diuji 3 cara), **tidak pernah** `NaN`/`Infinity`/`undefined`.
5. **Proteksi DB terbukti dengan eksekusi**: calculated field terkunci, scenario lama read-only,
   history append-only, audit perubahan input otomatis.
   *Phase 2.5:* dibuktikan ulang lewat **role matrix 47/47 PASS, 0 FAIL** (`docs/SUPABASE_VALIDATION.md`)
   — dan audit itu menemukan **satu bug produksi nyata** (cast `history_action` membuat setiap
   penulisan `scenario_inputs` gagal) yang sekarang sudah diperbaiki dan diverifikasi.
6. *(Phase 2.5)* **Seluruh 485 blok AHS terklasifikasi** — 466 diuji, 19 tidak diuji dengan alasan
   eksplisit per blok; tidak ada blok yang diam-diam dianggap valid (`docs/EXCEL_COVERAGE_REPORT.md`).
7. *(Phase 2.5)* **Formula variant ditemukan lewat audit otomatis**, bukan asumsi: census bentuk
   formula tiap keluaran + census divisor tersedia di `docs/FORMULA_VARIANTS.md` §2–§3.
8. **`F021A` memakai Total Biaya sebagai pembagi** (PRD §26), dibuktikan dengan test khusus — bukan definisi margin standar.
9. **`F008C`** memang varian nyata di workbook, terbukti lewat cross-check yang menangkap 9,09% deviasi.
10. **Registry DB = registry engine** (satu file JSON), sehingga tidak ada drift.

## G.2 Masih ambiguous / perlu keputusan (tidak ditebak)

| # | Item | Jumlah | Dampak |
|---|---|---:|---|
| 1 | ~~`F019B` laba bersih 3 suku — arti suku ke-3~~ | 68 sel | ✅ **RESOLVED Phase 2.5** — suku ke-3 = `SELISIH PBBKB`; formula aktif kembali |
| 2 | ~~`F021B` `=DK79/DK82*100%` — basis pembagi~~ | 10 sel | ✅ **RESOLVED Phase 2.5** — pembagi = `Modal Investor`; sisanya `Harga Include` → `F021C`. Sisa keputusan **bisnis**: apakah metrik ini ikut dilaporkan? |
| 3 | Blok yang tetap tidak diuji | 19 (8 PPN_INPUT_VARIANT + 5 INCOMPLETE + 2 CUSTOM_FORMULA_BLOCK + 2 ANNOTATION_TITLE + 1 NO_LABEL_COL + 1 SALE_FORMULA_VARIANT) | *Phase 2.5:* turun dari 231 tanpa klasifikasi → 19 dengan alasan per blok. Tetap belum diuji dan tidak diklaim berhasil |
| 4 | Divisor yang belum dijelaskan tarif mana pun: `1.213` (8 sel), `1.188` (21 sel), `1.163` (7 sel), `1.21` (5 sel) | 41 sel | Dipakai apa adanya sebagai input (tidak ditebak); `1.185` = PPN 11% + PBBKB 7,5% dan `1.16` = PPN 11% + PBBKB 5% sudah konsisten dengan blok yang tarif PBBKB-nya aktif |
| 5 | Rate PBBKB `7,5%`/`5%`/`10%`/`0` | lintas sheet | Apakah `×0` di Template A memang sengaja menonaktifkan PBBKB? |
| 6 | Bagi hasil tidak konsisten (label 40% tapi rate 30%, dll) | sejumlah baris | `F025` memakai `share_percent` dari input — mana yang benar, label atau rate? |
| 7 | Granularitas `projects` | — | Satu sheet memuat banyak customer × lokasi (mis. TONASA) |
| 8 | Kolom placeholder vendor (`Perhitungan INU!J12` dsb nilainya 0) | — | Perlakukan sebagai "tidak berlaku" (NULL) atau nol? |
| 9 | Sheet working/scrap (`AHAS Coretan`, `Market Bu *`, `KROSCEK AHAS`) | 3+ sheet | Mana yang data produksi, mana yang tidak perlu migrasi? |
| 10 | `#REF!` pada 18 sel (12 sel lain bergantung padanya) | 18 sel | *Phase 2.5:* diaudit per sel dengan klasifikasi dampak CRITICAL/HIGH/MEDIUM/LOW (`docs/EXCEL_COVERAGE_REPORT.md` §4). **Tidak satu pun** di-resolve jadi 0, dan tidak ada blok TESTED yang memakai sel rusak itu sebagai input. Perlu nilai asli dari user |
| 11 | Harga jual literal (bukan formula) | 15 sel | Apakah override manual diizinkan dan dicatat sebagai `scenario_reason`? |
| 12 | Baris biaya `K` (qty) tidak selalu = volume (mis. `AHAS Prioritas!K107 = F120*3%*7/30`) | 1+ sel | Risiko bila mengasumsikan `Total = Rate × Volume` |

Referensi lengkap: `docs/EXCEL_MAPPING.md` §G1–§G12.

## G.3 Berbeda dari Excel — dan mengapa

Ini **temuan terhadap workbook**, bukan bug sistem. Sistem sengaja **tidak menulis ulang** Excel.

1. **17 dari 1128 blok** memiliki cache `ALL IN` yang bertentangan dengan formula SUM-nya sendiri
   (mis. `KALTIM!CJ147`: formula → 0, cache → 42,13 karena BPH punya nilai tapi tidak ikut dijumlah).
   Engine mengikuti **formula** (source of truth); nilai cache lama tetap dilaporkan di
   `docs/PHASE2_CROSSCHECK.md` §4.1 agar tidak hilang.
2. **42 sel PPN vendor** diketik sebagai literal, bukan formula; **19 di antaranya tidak konsisten**
   dengan Harga Dasar-nya sendiri (mis. `KALTIM` dasar 21.000 tapi PPN 2.365 → menyiratkan 21.500).
   Ini **DATA**, disimpan apa adanya dengan `vendor_prices.ppn_is_formula = false` — tidak diturunkan
   ulang oleh engine.
3. **18 sel `#REF!`** tidak ditebak dan tidak dijadikan 0.
4. **`F009` PBBKB** di Template A berbentuk `=J10*7.5%*0` → secara efektif nol. Engine meniru
   bentuk itu (`pbbkb_rate = 0` pada template A), bukan "memperbaiki" Excel.

## G.4 Yang belum dibuat (sesuai instruksi)

- **Tidak ada UI/dashboard** (Phase 2 §"ATURAN TERAKHIR") — termasuk di Phase 2.5.
- Tidak ada dummy/mock calculation: seluruh angka di test dan cross-check berasal dari workbook.
- Belum ada eksekusi terhadap instance Supabase nyata (tanpa credentials) — lihat §A.6 dan
  `docs/SUPABASE_VALIDATION.md` §3–§4 (prosedur siap; status **NOT YET TESTED**).

## G.5 Definisi "selesai" Phase 2

```
SUPABASE (migrasi + RLS + seed terpasang)         ✅ terverifikasi lokal
   ↓
FORMULA REGISTRY (32 formula, varian terpisah)    ✅
   ↓
CALCULATION ENGINE (14 modul, pipeline §6)        ✅
   ↓
AUTOMATED TEST (51 lulus)                         ✅
   ↓
EXCEL RESULT = SYSTEM RESULT (4775 VALID, 0 ERROR) ✅
```

> Diagram di atas menggambarkan kriteria Phase 2. Angka finalnya sudah bukan ini lagi — lihat §H.

Item §G.2 adalah **keputusan bisnis**, bukan pekerjaan teknis yang tersisa. Sampai
keputusan itu ada, sistem tetap aman: formula `UNRESOLVED` tidak aktif, blok yang belum
terpetakan tidak diuji dan tidak diklaim berhasil.

---

# H. PHASE 2.5 — EXCEL COVERAGE, FORMULA HARDENING, FINAL VALIDATION

## H.1 Ringkasan akhir

| Item | Phase 2 | **Phase 2.5** |
|---|---:|---:|
| Total blok AHS di workbook | 485 | **485** |
| Blok diuji (TESTED) | 254 | **466** |
| Blok tidak diuji | 231 (tanpa klasifikasi rinci) | **19** (alasan eksplisit per blok) |
| Coverage | 52,4% | **96,1%** |
| Formula terdaftar | 32 | **36** (35 aktif) |
| Formula `UNRESOLVED` | 2 | **0** |
| Formula variant terdaftar & dipakai | — | **25** |
| Sel `#REF!` (tidak dijadikan 0) | 18 | **18** (diaudit + klasifikasi dampak) |
| `CUSTOM_FORMULA_BLOCK` | — | **2** (literal murni) |
| Test lulus | 51 | **67** |
| Cross-check | 4775 VALID / 0 ERROR | **5738 VALID / 1025 PRECISION_VARIANCE / 0 FORMULA_MISMATCH / 132 SKIPPED** |
| Blok dengan `FORMULA_MISMATCH` | — | **0** |
| RLS role matrix | sebagian, manual | **47/47 PASS, 0 FAIL** (PostgreSQL lokal) |
| Supabase nyata | tidak diuji | **tidak diuji — NOT YET TESTED** |

## H.2 Deliverable

| # | Deliverable | File |
|---|---|---|
| 1 | Coverage report | `docs/EXCEL_COVERAGE_REPORT.md` |
| 2 | Formula variants audit | `docs/FORMULA_VARIANTS.md` |
| 3 | Supabase validation | `docs/SUPABASE_VALIDATION.md` |
| 4 | Formula registry (updated) | `lib/formulas/formula-registry.json` → `supabase/seed/0001_formula_registry.sql` |
| 5 | Calculation templates (updated) | `lib/formulas/calculation-templates.json` → `supabase/seed/0002_*.sql`, `0003_*.sql` |
| 6 | Excel extractor (updated) | `scripts/extract_excel_cases.py` |
| 7 | Cross-check report (updated) | `docs/PHASE2_CROSSCHECK.md` |
| 8 | Tests (updated) | `tests/excel-crosscheck.test.ts`, `tests/engine-behaviour.test.ts`, `tests/helpers/fixture.ts` |
| 9 | Validasi database | `scripts/validate_supabase.sh` + `supabase/tests/*.sql` |

## H.3 Yang berubah secara prinsip (bukan sekadar angka)

1. **Extractor menjadi formula-driven.** Sebelumnya range blok ditebak dari posisi visual;
   sekarang range diambil dari **formula asli** (`=SUM(CY15:CY33)` → `CY15:CY33`), termasuk
   mengikuti rantai referensi sel antar-sheet. Akibatnya blok yang tadinya "tidak lengkap"
   ternyata hanya belum terbaca.
2. **Label dinormalkan** (akhiran dalam tanda kurung dibuang: `LABA KOTOR (RP)` = `LABA KOTOR`),
   sehingga ~89 blok yang sebelumnya terlempar kembali terbaca.
3. **Setiap formula yang belum jelas diklasifikasikan, bukan dilewati.** Tidak ada lagi
   "skipped tanpa alasan".
4. **Divisor dan tarif menjadi INPUT**, bukan konstanta: terbukti workbook memakai 1.11, 1.16,
   1.185 (penjualan) dan sembilan nilai berbeda (vendor), serta tarif PPN penjualan `0`
   pada skema "Non-PPN".
5. **Taxonomy cross-check diperdalam** menjadi VALID / PRECISION_VARIANCE / FORMULA_MISMATCH /
   UNRESOLVED / SKIPPED. Toleransi hanya memisahkan **presisi cache** dari **perbedaan formula**;
   di atas ambang presisi hasilnya tetap kegagalan (`FORMULA_MISMATCH`).
6. **Bug produksi ditemukan lewat validasi database**, bukan lewat pembacaan kode
   (`history_action` cast, lihat `docs/SUPABASE_VALIDATION.md` §2.5).

## H.4 Yang tetap perlu keputusan

Lihat §G.2 (item yang masih berlaku) dan `docs/EXCEL_COVERAGE_REPORT.md` §6:
8 blok `PPN_INPUT_VARIANT` (basis PPN masukan via referensi silang), 2 blok
`CUSTOM_FORMULA_BLOCK`, dan nilai asli 18 sel `#REF!`.
Semuanya eksplisit **tidak diuji** — tidak ada yang ditebak dan tidak ada yang dianggap 0.
