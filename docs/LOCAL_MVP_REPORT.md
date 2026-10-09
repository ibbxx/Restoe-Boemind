# Local MVP Report — Phase 3.5

## Status

Local MVP berjalan tanpa Supabase secara default ketika environment Supabase tidak tersedia. `requestContext()` memilih persistent local database, actor lokal, repository port yang sama, service layer, Formula Registry, dan Calculation Engine yang digunakan aplikasi.

## Flow yang tersedia

1. Buat project melalui `/projects/new`.
2. Tambah, ubah, pilih, atau hapus vendor dan harga vendor melalui `/projects/[id]/vendors`.
3. Isi parameter AHS serta cost item dinamis melalui `/projects/[id]/ahs`.
4. Preview dan simpan perhitungan melalui Calculation Engine.
5. Buat snapshot scenario V1/V2/V3 melalui `/projects/[id]/scenarios`.
6. Bandingkan Revenue, Total Cost, Gross Profit, PPN Difference, Net Profit, Net Profit/Liter, dan Profit %.
7. Lihat audit history pada `/projects/[id]/history`.

## Persistence

`lib/data/local-db.ts` menyimpan local store ke `.data/local-store.json`; refresh page dan restart server tidak menghapus data. UI hanya bergantung pada repository/service, sehingga adapter Supabase dapat dipasang kemudian tanpa mengubah komponen.

Generator id `memory-db` memakai counter proses; adapter lokal kini menggeser counter itu melewati id yang sudah tersimpan (`advanceIdsPastStoredRows`) agar insert setelah restart tidak memakai ulang id baris lain.

## Data dummy lengkap

`npm run seed:local` mengisi SATU project contoh end-to-end lewat service layer yang sama dengan UI (bukan INSERT JSON manual): project + member, 3 vendor beserta harga all-in, AHS dengan 9 cost item berlabel Excel, 2 scenario (V1 + V2 revisi harga vendor, V1 terkunci), calculation result tersimpan, audit history, dan tabel dinamis. Skrip menutup dengan verifikasi lewat service yang dipakai halaman (dashboard, workspace, commercial, report) dan gagal (exit 1) bila ada yang kosong atau ada sel tabel dinamis yang error.

```
npm run seed:local                # tambah project contoh (idempotent bila kode sudah ada)
npm run seed:local -- --replace   # hapus lalu isi ulang project contoh
npm run seed:local -- --fresh     # reset store lokal ke fixture Excel lalu seed
```

Jalankan seed saat dev server berhenti (atau restart dev server sesudahnya): adapter lokal memegang datanya di memori proses, sehingga server yang masih berjalan memakai snapshot lama dan dapat menimpa file store pada penulisan berikutnya.

## Verification

- `npm run typecheck`: PASS
- `npm test`: PASS — 263 tests / 16 files
- `npm run build`: PASS
- Excel cross-check: 3,596 metric dibandingkan; 2,776 VALID, 820 PRECISION_VARIANCE, 0 FORMULA_MISMATCH.

## Phase 4 — Excel workspace (final MVP scope)

`/projects/[id]` no longer shows a card/dashboard overview. Opening a project renders the two workbook blocks side by side:

- Left: EVALUASI HARGA VENDOR — dynamic vendor columns, Uraian rows (Harga Dasar, PPN, PBBKB, PPH, OAT, PPN OAT, BPH, TOTAL), `+ Add Vendor`, per-vendor price/select/remove.
- Right: ANALISIS HARGA SATUAN (AHS) — Excel header cells (Tgl Analisis, Marketing, Pembayaran, Harga Keekonomian, Sumber, Lokasi, Dokumen, Diskon, Harga Include) and the calculation rows, with category rows grouped from the engine's own cost lines.

Data assembly lives in `lib/services/workspace.ts`; every calculated cell is Calculation Engine output. `diskon` (F004) is now an engine output of `AhsResult` instead of being derived in the UI. Responsive: desktop shows both blocks, tablet scrolls each block horizontally, mobile stacks Project Info → Vendor → AHS.

## Limitation

Persistence saat ini bersifat local server/workspace (`.data/local-store.json`), bukan sinkronisasi multi-user atau browser-device storage. Itu disengaja untuk MVP lokal dan tidak menghubungkan Supabase.
