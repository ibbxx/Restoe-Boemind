# SUPABASE VALIDATION — Phase 2.5 §11

Dokumen ini memisahkan secara tegas tiga hal yang sering dicampur:

| Kategori | Arti |
|---|---|
| **LOCAL DATABASE TEST** | Sudah dijalankan terhadap PostgreSQL nyata; hasilnya dapat direproduksi dari repo. |
| **SUPABASE TEST** | Hanya bisa dijalankan pada project Supabase nyata. Prosedurnya sudah disiapkan. |
| **NOT YET TESTED** | Belum pernah dijalankan. Tidak ada klaim apa pun. |

> **Klaim yang TIDAK dibuat di dokumen ini:** "RLS sudah fully validated".
> Yang sudah terbukti adalah **migration + seed + RLS policy + protection trigger
> bekerja pada PostgreSQL nyata dengan role nyata**. Perilaku spesifik Supabase
> (JWT → `auth.uid()`, PostgREST) **belum diuji** karena belum ada project Supabase.

---

## 1. Environment

| Item | Nilai |
|---|---|
| Database | PostgreSQL 14.19 (Homebrew `postgresql@14`), lokal |
| Database uji | `ahs_phase25_validation` (throw-away, dibuat ulang setiap run) |
| Auth | **Stub lokal** — Supabase `auth.users` + `auth.uid()` di-shim |
| Migrations | `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_protection.sql` |
| Seed | `supabase/seed/0001_formula_registry.sql`, `0002_calculation_templates.sql`, `0003_template_formulas.sql` |
| Harness | `supabase/tests/0000_local_auth_stub.sql`, `0001_local_grants.sql`, `rls_role_matrix.sql` |
| Runner | `scripts/validate_supabase.sh` |
| Raw output | `docs/_supabase_validation_output.txt` (regenerated setiap run) |

Perintah reproduksi:

```bash
pg_isready                                              # PostgreSQL harus hidup
npm run seed:sql                                        # regenerate seed dari registry JSON
bash scripts/validate_supabase.sh                       # drop → create → migrate → seed → matrix
```

---

## 2. LOCAL DATABASE TEST — ✅ SUDAH DIJALANKAN

### 2.1 Objek yang terbentuk

| Objek | Hasil |
|---|---:|
| Migrations applied | 3/3 tanpa error |
| Seed applied | 3/3 tanpa error |
| Tabel dengan RLS aktif | 21/21 |
| Policies terpasang | 54 (tersebar di 21 tabel) |
| Trigger non-internal | 18 |

### 2.2 Integritas seed

| Pemeriksaan | Hasil | Ekspektasi |
|---|---:|---|
| `formula_registry` | 36 | 36 formula |
| `calculation_templates` | 5 | 5 template |
| `template_formulas` | 45 | 45 relasi |
| Formula `active` | 35 | 36 − 1 (F015C sengaja inactive) |
| Formula `UNRESOLVED` yang masih aktif | **0** | harus 0 |
| `template_formulas` yatim (FK ke formula tak ada) | **0** | harus 0 |

Seed berasal dari `lib/formulas/formula-registry.json` +
`lib/formulas/calculation-templates.json` lewat `npm run seed:sql`, sehingga
registry dan database tidak dapat berbeda diam-diam.

Angka di atas **dijumlahkan sebelum role matrix berjalan**. Ini penting: matrix
membuat fixture (project, vendor, scenario, `ahs`). Versi awal harness ikut
menyisipkan satu baris template sintetis (`T_RLS_PROBE`), yang membuat
`count(*)` membaca **6** dan tampak seperti data seed. Harness kini memakai
template seed nyata (`T_A_AHS_STANDARD`) dan **gagal keras** bila seed belum
dijalankan, sehingga tidak ada lagi baris buatan yang menyamar sebagai seed.

### 2.3 Role matrix — 47/47 PASS, 0 FAIL

Empat user nyata di `auth.users`/`profiles` (`ADMIN`, `PROCUREMENT`, `PIC`,
`VIEWER`) + role `authenticated`. Setiap baris adalah **hasil statement SQL
sungguhan**, bukan klaim.

| Role | Pass | Fail |
|---|---:|---:|
| ADMIN | 8 | 0 |
| PROCUREMENT | 17 | 0 |
| PIC | 7 | 0 |
| VIEWER | 7 | 0 |
| TRIGGER (as table owner, RLS tidak menutupi) | 5 | 0 |
| SCHEMA (constraint, bebas role) | 3 | 0 |
| **Total** | **47** | **0** |

Poin-poin yang dibuktikan:

- **ADMIN** — penuh: SELECT/INSERT/UPDATE/DELETE project, INSERT vendor,
  INSERT + DELETE `formula_registry`, INSERT `project_history`.
- **PROCUREMENT** — boleh INSERT project / `vendor_prices` / `price_scenarios` /
  `ahs` / `scenario_inputs`, UPDATE kolom non-calculated `ahs`, tetapi
  **DENIED** untuk INSERT `formula_registry`, DELETE project, DELETE scenario,
  dan UPDATE kolom calculated `ahs`.
- **PIC** — hanya project tempat ia anggota: SELECT + UPDATE `PRJ-OWN` ALLOWED;
  SELECT/UPDATE `PRJ-OTH`, INSERT project, INSERT `vendor_prices` ke project
  lain, dan DELETE project semuanya DENIED.
- **VIEWER** — read-only: baca master data ALLOWED, tetapi project orang lain,
  INSERT/UPDATE/DELETE vendor/project/formula semuanya DENIED.
- **TRIGGER** — `project_history` append-only; calculated field `ahs` tidak bisa
  ditulis manual; scenario terkunci tidak bisa diubah; input ke scenario
  terkunci ditolak.
- **SCHEMA** — formula `UNRESOLVED` **tidak bisa** disimpan dalam keadaan aktif
  (check constraint), tapi boleh disimpan nonaktif; duplikat `(project, name)`
  pada `price_scenarios` ditolak.

### 2.4 Jalur calculation engine (GUC)

Engine harus tetap dapat menulis calculated field tanpa membuka celah bagi user:

| Uji | Hasil |
|---|---|
| UPDATE `ahs.revenue` tanpa GUC engine | DENIED (`23514`, pesan eksplisit) |
| UPDATE `ahs.notes` (non-calculated) | ALLOWED |
| UPDATE `ahs.revenue` dengan `app.calculation_engine = 'on'` | ALLOWED (1 row terpengaruh) |
| Nilai hasil engine benar-benar tersimpan (`revenue = 1000000`) | ALLOWED |

### 2.5 Bug produksi yang ditemukan dan diperbaiki

`supabase/migrations/0003_protection.sql` → `log_scenario_price_change()`:

```
ERROR:  42804: column "action" is of type history_action but expression is of type text
```

`history_action` adalah ENUM, sedangkan `CASE ... THEN 'INSERT' ELSE 'UPDATE' END`
bertipe `text`. PostgreSQL tidak melakukan cast implisit, sehingga **setiap
INSERT/UPDATE pada `scenario_inputs` gagal** — audit trail scenario mustahil
ditulis. Migrasi tetap "sukses" saat diterapkan; kegagalan hanya muncul saat
trigger dieksekusi, yang sebelumnya tidak pernah diuji.

Perbaikan: `(...)::history_action`.

Bukti: sebelum perbaikan `PROCUREMENT | INSERT scenario_inputs` → `DENIED`
([42804]); sesudah perbaikan → `ALLOWED` PASS.

### 2.6 Bug harness yang ditemukan dan diperbaiki

Dua artefak pengukuran (bukan bug produk) yang membuat hasil terlihat gagal:

1. **`GET DIAGNOSTICS ROW_COUNT` membaca statement terakhir.** Probe
   `UPDATE ahs AS ENGINE` dibungkus satu string
   `set local …='on'; update …; set local …='off'`, sehingga `ROW_COUNT`
   membaca `SET`, bukan `UPDATE` → terbaca "0 rows" padahal `UPDATE 1`.
   Sekarang GUC engine dipasang oleh harness (`p_engine` parameter) sebelum
   statement diuji, sehingga **UPDATE adalah statement terakhir**.
2. **`DENIED` vs `DENIED (0 rows)`.** Kebijakan RLS yang menolak UPDATE/DELETE
   tidak melempar exception — ia menyaring baris secara diam-diam (0 rows),
   sedangkan penolakan lain melempar `42501`/`23514`. Keduanya adalah penolakan;
   verdict kini membandingkan maknanya, bukan ejaan string. Ini **tidak**
   menyamakan `DENIED` dengan `ALLOWED` — `ALLOWED` tetap menuntut ≥1 baris
   benar-benar terpengaruh.

Sebelum perbaikan: 10 FAIL (1 di antaranya bug produk nyata).
Sesudah: **0 FAIL**.

### 2.7 Apa yang HARUS tetap ditolak

Harness sengaja **SECURITY INVOKER** (bukan DEFINER) pada `_rls_try`, agar
dynamic SQL benar-benar dieksekusi dengan role yang diuji. Bila memakai
DEFINER, RLS akan dilewati oleh table owner dan setiap uji akan lulus
**karena alasan yang salah**. Hal serupa berlaku untuk grant lokal: tanpa
`supabase/tests/0001_local_grants.sql`, test akan gagal "permission denied"
sebelum policy dievaluasi — yang juga tidak membuktikan apa pun.

Stub dan grant lokal diberi penanda tegas di header file:
**"NEVER apply to a real Supabase project."**

---

## 3. SUPABASE TEST — ⏸ PROSEDUR SIAP, BELUM DIJALANKAN

Tidak ada project Supabase / kredensial pada environment ini, sehingga langkah
ini **tidak dijalankan**. Yang sudah siap: seluruh artefak yang dibutuhkan.

Checklist eksekusi begitu project tersedia:

```bash
# 1. link & push schema + seed ke project
supabase link --project-ref <ref>
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed/0001_formula_registry.sql
psql "$SUPABASE_DB_URL" -f supabase/seed/0002_calculation_templates.sql
psql "$SUPABASE_DB_URL" -f supabase/seed/0003_template_formulas.sql

# 2. JANGAN jalankan supabase/tests/0000_local_auth_stub.sql
#    atau 0001_local_grants.sql — keduanya khusus lokal.

# 3. buat 4 user nyata (ADMIN/PROCUREMENT/PIC/VIEWER) via Supabase Auth,
#    beri baris `profiles` dengan role masing-masing,
#    lalu jalankan skenario matrix memakai JWT user tersebut (bukan GUC).
```

Yang wajib diverifikasi ulang di Supabase (belum bisa diklaim sekarang):

1. `auth.uid()` mengembalikan id dari **JWT**, bukan GUC — seluruh policy
   bergantung padanya.
2. Grant bawaan Supabase ke role `authenticated` membuat policy benar-benar
   dievaluasi (tanpa `permission denied`).
3. Trigger `protect_calculated_fields` tetap dapat menulis lewat jalur engine
   pada koneksi pooled/PostgREST, karena GUC `app.calculation_engine`
   bersifat per-sesi — pada PgBouncer hal ini perlu diperiksa khusus.
4. `project_history` append-only & penolakan `42501` tetap konsisten saat
   dipanggil lewat PostgREST (kode error diterjemahkan berbeda di HTTP).

---

## 4. NOT YET TESTED — eksplisit

| Item | Alasan | Status |
|---|---|---|
| `auth.users` / `auth.uid()` nyata (JWT) | Tidak ada project Supabase | **NOT YET TESTED** |
| Grant bawaan Supabase → `authenticated` | Idem | **NOT YET TESTED** |
| Perilaku PostgREST / supabase-js terhadap policy | Tidak ada client di project ini | **NOT YET TESTED** |
| Connection pooling vs GUC `app.calculation_engine` | Tidak ada pooler di lokal | **NOT YET TESTED** |
| RLS pada `anon` (tanpa login) | Belum dirancang untuk fase ini | **NOT YET TESTED** |
| Backup / PITR / migration rollback | Di luar Phase 2.5 | **NOT YET TESTED** |
| Beban/performance policy pada data volume produksi | Di luar Phase 2.5 | **NOT YET TESTED** |

---

## 5. Ringkasan

| Kategori | Status |
|---|---|
| Migration berhasil (lokal) | ✅ 3/3 |
| Seed berhasil (lokal) | ✅ 3/3, integritas 0 anomali |
| RLS policy siap | ✅ 54 policy, 21 tabel, 47/47 uji PASS |
| Protection rule siap | ✅ trigger + constraint terbukti menolak |
| Bug produksi ditemukan | ✅ 1 (`history_action` cast) — diperbaiki & diverifikasi |
| Supabase nyata | ⏸ **NOT YET TESTED** |
