# Penyimpanan lokal dan kesiapan integrasi

## Pemakaian sekarang

Aplikasi tetap berjalan di komputer ini. Gunakan Node.js 22.16 atau lebih baru, `LOCAL_DEMO_MODE=true`, lalu `npm run dev`. Server baru dibatasi ke `127.0.0.1`; server yang sudah berjalan sebelumnya perlu dimulai ulang agar menggunakan aturan ini. Tidak ada koneksi atau migrasi ke Supabase dalam perubahan ini.

Form proyek berisi nama, pelanggan, produk, lokasi/pasar, volume, periode, penanggung jawab opsional, dan status. Kode `PRJ-YYYYMM-###` dibuat saat disimpan, berdasarkan bulan Asia/Jakarta. Catatan lama tetap disimpan, tetapi tidak ditampilkan pada form awal. Volume dan penanggung jawab boleh kosong.

## Lapisan aplikasi

Tampilan memanggil server action, lalu layanan aplikasi, lalu port `Database`. Adapter lokal menggunakan SQLite pada worker terpisah. Adapter Supabase tetap terpisah; kesiapan lokal tidak berarti adapter tersebut sudah mendukung transaksi dan konflik versi yang sama.

SQLite disimpan pada `.data/procurement.sqlite` dengan WAL, transaksi, foreign key, indeks, kode unik, dan versi schema. ID lama dipertahankan; ID baru memakai UUID. Input tidak digabungkan menjadi SQL. Kolom lama yang belum dikenal disimpan dalam `_extra`, bukan dibuang. Hak akses diperiksa di layanan aplikasi; SQLite lokal tidak menjalankan RLS PostgreSQL dan mode lokal menggunakan akun tim bersama, bukan autentikasi multi-pengguna.

## Data lama dan cadangan

Saat pertama dibuka, `.data/local-store.json` disalin ke cadangan bernama checksum dan diimpor sekali. Berkas asli tidak ditulis ulang. JSON rusak menghentikan pembukaan data, bukan menggantinya dengan contoh. Baris yang tidak bisa masuk karena relasi atau duplikasi, serta tabel workflow lama, disimpan utuh dalam `migration_archive` beserta alasannya. Arsip tidak otomatis muncul sebagai data aktif dan tidak dihapus.

Cadangan SQLite konsisten dibuat per hari ketika aplikasi dibuka atau melakukan penulisan pertama hari itu, serta sebelum penghapusan proyek. Tidak ada pemangkasan cadangan otomatis. Untuk pemulihan, hentikan seluruh server, simpan salinan database saat ini beserta WAL/SHM bila ada, lalu pulihkan cadangan yang sudah diverifikasi. Jangan menyalin database yang sedang ditulis atau memakai reset seed untuk memulihkan data.

Penyimpanan `.data/procurement.sqlite` saat ini sudah ada. Pemeriksaan baca-saja menunjukkan 87 baris aktif berhasil diimpor, 563 baris masuk arsip, `integrity_check` menyatakan baik, dan checksum `.data/local-store.json` cocok dengan catatan migrasi. Uji ulang di direktori sementara memberi jumlah yang sama tanpa mengubah berkas asli. Banyak baris lama merujuk proyek yang sudah tidak ada; status arsip perlu ditinjau sebelum dianggap sebagai data aktif.

Ulangi pemeriksaan tanpa mengubah sumber: `npx vite-node scripts/check-local-migration.ts`.

## Lembar kerja

Snapshot Univer mempertahankan sel, rumus, format, merge, dan ukuran minimal 200 × 50. Acuan isian memakai named range absolut supaya penyisipan baris/kolom tidak bergantung posisi awal. Hasil perhitungan dibaca sebagai nilai mentah dari Univer pada worker server, bukan dihitung ulang oleh React. Workbook lama tanpa pemetaan harus ditinjau dan dihubungkan; aplikasi tidak menebak acuan dari bentuknya.

Penyimpanan otomatis dijadwalkan 700 ms setelah perubahan, dikirim berurutan dengan revisi dasar dan ID perubahan. Konflik tab tidak menimpa versi baru. Draf browser memakai IndexedDB dan identitas sesi tab; tab yang diduplikasi browser dapat mewarisi sessionStorage, sehingga pemulihan draf lintas tab duplikat masih perlu pengujian browser. Ukuran simpan maksimal 5 MB UTF-8, batas transport 6 MB. Draf tidak menggantikan cadangan database.

Form AHS, biaya, dan pemasok menulis sel yang terhubung. Rumus yang sudah diubah pengguna tidak diganti otomatis oleh form. Memilih varian harga pada workbook yang sudah memiliki rumus khusus masih memerlukan peninjauan rumus tersebut. Penghapusan acuan menyebabkan hasil tidak tersedia, bukan penggunaan angka lama sebagai hasil resmi.

## Pemeriksaan

Tes mencakup form, penomoran, transaksi/rollback, migrasi dan pemulihan cadangan, hak akses layanan, angka desimal, autosave, idempotensi, konflik revisi, dan sinkronisasi pemasok. Cross-check sumber Excel tetap 3.596 perbandingan, tanpa formula mismatch; 820 selisih presisi kecil tidak disamakan paksa.

Benchmark otomatis dengan 1.001 proyek: editor memakai 2 pembacaan data; p95 simpan hangat pada workbook uji kecil berkisar 35–151 ms pada beberapa run, di luar debounce 700 ms. Perhitungan pertama membutuhkan pemuatan worker dan lebih lambat. Ini bukan benchmark render browser, seluruh header/layout, atau workbook besar.

Build produksi dan typecheck diperiksa terpisah dari server pengguna. Pengujian browser belum selesai karena lingkungan eksekusi menolak listener server dan proses PinchTab. Menu penyisipan, Undo/Redo, pemulihan draf, serta navigasi dua tab tetap perlu smoke test interaktif sebelum menyatakan seluruh alur siap dipakai tim.

## Saat beralih ke Supabase

Jangan hanya mematikan flag lokal. Sebelum aktivasi diperlukan:

1. Migrasi PostgreSQL untuk revisi dokumen, ID perubahan, acuan AHS aktif, serta metadata pemetaan yang kini berada di `_extra` lokal.
2. RPC transaksi atomik untuk proyek/master/worksheet/AHS/PIC dan simpan workbook dengan compare-and-swap. PostgREST biasa tidak menggantikan transaksi SQLite.
3. RLS dan pengujian per role, akun nonaktif, kepemilikan baris, dan dua request bersamaan pada PostgreSQL.
4. Ekspor/import yang mempertahankan ID, formula registry, snapshot, arsip lama, dan jumlah baris; pemeriksaan cadangan serta rencana rollback.
5. Pengukuran ulang latency jaringan, ukuran payload, formula worker, browser, serta backup dan restore di lingkungan tujuan.

Perubahan UI tidak memerlukan akses langsung ke Supabase; kontrak transaksi dan migrasinya tetap pekerjaan khusus ketika integrasi dimulai.
