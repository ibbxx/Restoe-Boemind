# Hardcode Audit — Phase 3.5

## Removed from UI

`components/excel/excel-workbook-view.tsx` sebelumnya memuat preset project, customer, vendor, harga, volume, cost item, golden result, dan kalkulasi turunan pada React. Seluruh preset tersebut telah dihapus.

Workbook sekarang adalah read model: menerima data dari repository/service dan hasil `AhsResult` dari Calculation Engine. Ia tidak memanggil formula vendor/AHS, tidak menghitung subtotal komersial, dan tidak memiliki fallback business data.

## Permitted data sources

- `lib/formulas/*.json`: Formula Registry dan template calculation.
- `tests/fixtures/excel-cases.json`: fixture Excel asli untuk cross-check.
- `lib/data/local-db.ts`: seed dataset lokal yang memiliki provenance workbook, terisolasi dari React UI.
- Input user melalui actions/services dan local repository.

## Phase 4 (workspace) additions

- `components/excel/vendor-evaluation-sheet.tsx` and `components/excel/ahs-sheet.tsx` contain no business data: vendor columns come from the repository, result rows and category subtotals come from `AhsResult`, and the only literals are Excel row labels/order (workbook configuration).
- `lib/services/workspace.ts` performs no arithmetic; it assembles service output.

## Audit result

- Business-data preset di React workbook: 1 block removed.
- Formula bisnis di React workbook: 1 calculation path removed.
- Vendor columns: dinamis dari array repository, tidak ada jumlah vendor tetap.
- Result screen: `AhsResult` engine output saja.
- Format persen dipindahkan ke formatter presentation, bukan formula komersial UI.

## Not treated as hardcode business data

Label UI, enum kategori, formula identifier, status cross-check, colour semantic Excel, dan constants Formula Registry tetap dipertahankan karena merupakan konfigurasi atau business rule yang terversi.
