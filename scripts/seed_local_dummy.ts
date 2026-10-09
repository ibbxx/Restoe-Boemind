/**
 * SEED DATA DUMMY LENGKAP — 1 dataset end-to-end untuk LOCAL_DEMO_MODE.
 *
 * Tujuan: sekali jalan, satu project punya SELURUH rantai data yang dipakai UI
 * (dashboard -> project -> vendor -> harga -> AHS -> cost item -> scenario +
 * calculation result -> history -> tabel dinamis), sehingga setiap halaman bisa
 * dibuka tanpa mengisi form manual.
 *
 * ATURAN YANG DIPEGANG SKRIP INI:
 *   - Semua tulisan lewat SERVICE LAYER yang sama dengan UI
 *     (lib/services/*), bukan INSERT JSON manual. Jadi validasi, audit history
 *     dan Calculation Engine ikut berjalan seperti pemakaian normal.
 *   - Tidak ada angka hasil hitung yang ditulis tangan: revenue / total_cost /
 *     net_profit dst. adalah keluaran `calculateAhs()` yang disimpan service.
 *   - Nama cost item memakai label Excel aslinya ("Harga Dasar", "OAT",
 *     "PBBKB", "PPN 11%", ...) karena registry F008B mencocokkan rate per
 *     deskripsi baris.
 *
 * Pemakaian:
 *   npm run seed:local                   # tambah 1 project contoh (idempotent)
 *   npm run seed:local -- --replace      # hapus lalu isi ulang project contoh
 *   npm run seed:local -- --fresh        # reset store lokal ke fixture lalu seed
 *   npm run seed:local -- --code=X-01    # pakai kode project lain
 */

import type { Actor } from "../lib/auth/session";
import { getLocalDatabase, LOCAL_UUIDS, resetLocalDatabase } from "../lib/data/local-db";
import type { Database } from "../lib/data/db";
import { eq } from "../lib/data/db";
import { addCostItem, getAhsBundle, saveAhsInputs } from "../lib/services/ahs";
import { loadCommercialView } from "../lib/services/commercial";
import { loadDashboard } from "../lib/services/dashboard";
import { listProjectHistory } from "../lib/services/history";
import { createProject } from "../lib/services/projects";
import { buildCommercialReport } from "../lib/services/reports";
import type { ActionResult } from "../lib/services/result";
import { commitScenario, listScenarios } from "../lib/services/scenarios";
import { loadProjectWorkspace } from "../lib/services/workspace";
import {
  addSheet,
  addSheetColumn,
  addSheetRow,
  loadProjectSheets,
  removeSheetColumn,
  setSheetCell,
  setSheetRowLabel,
  type ProjectSheetsView,
} from "../lib/services/sheets";
import {
  addVendorToProject,
  createVendor,
  saveVendorPrice,
  setSelectedVendor,
} from "../lib/services/vendors";
import { formatNumber, formatRp } from "../lib/format";

/**
 * Aktor demo — sama dengan DEMO_ACTOR (LOCAL_DEMO_MODE selalu memakai actor ini
 * di lib/data/context.ts). Di-import sebagai TYPE saja supaya skrip tidak
 * menarik next/navigation ke luar runtime Next.
 */
const ACTOR: Actor = {
  id: LOCAL_UUIDS.procurement,
  email: "procurement@demo.local",
  full_name: "Procurement Lead (Demo Mode)",
  role: "ADMIN",
  profileMissing: false,
  isActive: true,
};

const PROJECT_CODE = readFlag("code") ?? "P3-OKT-26";
const FRESH = process.argv.includes("--fresh");
const REPLACE = process.argv.includes("--replace");

const VOLUME = 150_000;
const HARGA_JUAL_INCLUDE = 21_500;
const INCLUDE_DIVISOR = 1.11;
const PPN_RATE = 0.11;

function readFlag(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function unwrap<T>(result: ActionResult<T>, what: string): T {
  if (!result.ok) {
    console.error(`\n✗ Gagal ${what}: ${result.error}${result.errorCode ? ` (${result.errorCode})` : ""}`);
    if (result.fieldErrors) console.error("  fieldErrors:", result.fieldErrors);
    process.exit(1);
  }
  return result.data;
}

function step(label: string): void {
  console.log(`  · ${label}`);
}

function heading(title: string): void {
  console.log(`\n${title}`);
}

function sheet(view: ProjectSheetsView, key: string) {
  const found = view.sheets.find((s) => s.key === key);
  if (!found) {
    console.error(`✗ Sheet "${key}" tidak ditemukan setelah dibuat.`);
    process.exit(1);
  }
  return found;
}

/** Baris terakhir sebuah sheet (addSheetRow selalu menaruh baris baru di akhir). */
function lastRow(view: ProjectSheetsView, key: string) {
  const s = sheet(view, key);
  const row = s.rows[s.rows.length - 1];
  if (!row) {
    console.error(`✗ Sheet "${key}" tidak punya baris.`);
    process.exit(1);
  }
  return row;
}

async function currentProjectId(db: Database): Promise<string | null> {
  const { rows } = await db.select<{ id: string }>("projects", {
    where: [eq("code", PROJECT_CODE)],
    limit: 1,
  });
  return rows[0]?.id ?? null;
}

async function findVendorByName(db: Database, name: string): Promise<{ id: string } | null> {
  const { rows } = await db.select<{ id: string }>("vendors", {
    where: [eq("name", name)],
    limit: 1,
  });
  return rows[0] ?? null;
}

/**
 * Hapus seluruh baris milik SATU project contoh (anak → induk).
 *
 * Dipakai oleh --replace supaya "isi ulang dari nol" tidak menumpuk data ganda.
 * `project_history` TIDAK dihapus: history itu append-only (tidak ada policy
 * UPDATE/DELETE) dan barisnya tidak pernah tampil lagi setelah project hilang,
 * jadi jejak auditnya justru benar untuk dipertahankan.
 */
async function removeProjectRows(db: Database, projectId: string): Promise<void> {
  const scenarios = await db.select<{ id: string }>("price_scenarios", {
    where: [eq("project_id", projectId)],
  });
  for (const scenario of scenarios.rows) {
    for (const input of (
      await db.select<{ id: string }>("scenario_inputs", { where: [eq("scenario_id", scenario.id)] })
    ).rows) {
      await db.remove("scenario_inputs", input.id);
    }
    for (const result of (
      await db.select<{ id: string }>("calculation_results", { where: [eq("scenario_id", scenario.id)] })
    ).rows) {
      await db.remove("calculation_results", result.id);
    }
    await db.remove("price_scenarios", scenario.id);
  }

  for (const ahs of (await db.select<{ id: string }>("ahs", { where: [eq("project_id", projectId)] })).rows) {
    for (const item of (
      await db.select<{ id: string }>("ahs_cost_items", { where: [eq("ahs_id", ahs.id)] })
    ).rows) {
      await db.remove("ahs_cost_items", item.id);
    }
    await db.remove("ahs", ahs.id);
  }

  for (const table of ["project_vendors", "vendor_prices", "project_members", "project_sheets"] as const) {
    for (const row of (await db.select<{ id: string }>(table, { where: [eq("project_id", projectId)] })).rows) {
      await db.remove(table, row.id);
    }
  }

  await db.remove("projects", projectId);
}

async function main(): Promise<void> {
  console.log("SEED DATA DUMMY LENGKAP — Analisis Harga Satuan (LOCAL_DEMO_MODE)");
  console.log(
    `Project Code : ${PROJECT_CODE}${FRESH ? "  (--fresh: store lokal di-reset dulu)" : ""}${
      REPLACE ? "  (--replace: project contoh lama dihapus dulu)" : ""
    }`,
  );

  if (FRESH && REPLACE) {
    console.error("✗ Pilih salah satu: --fresh (reset seluruh store) atau --replace (isi ulang project ini saja).");
    process.exit(1);
  }

  if (FRESH) {
    resetLocalDatabase();
    step("Store lokal direset ke fixture Excel");
  }

  const db = getLocalDatabase();
  const existingProjectId = await currentProjectId(db);

  if (existingProjectId && !REPLACE) {
    console.log(`\n= Project "${PROJECT_CODE}" sudah ada — tidak ada data yang ditambahkan.`);
    console.log("  Pakai --code=KODE-LAIN, --fresh (reset store lokal), atau --replace (hapus lalu isi ulang).\n");
    await verify(db, existingProjectId);
    return;
  }

  if (existingProjectId) {
    heading("0. REPLACE — hapus project contoh yang lama");
    await removeProjectRows(db, existingProjectId);
    step(`Baris project ${PROJECT_CODE} dihapus (scenario → AHS → vendor → sheet → project)`);
    step("History audit dipertahankan (append-only, tidak lagi tampil setelah project hilang)");
  }

  // ---------------------------------------------------------------- 1. project
  heading("1. PROJECT");
  const project = unwrap(
    await createProject(db, ACTOR, {
      code: PROJECT_CODE,
      name: "Pengadaan Biosolar B35 — PT Semen Padang (Contoh Lengkap)",
      customer_id: LOCAL_UUIDS.customerSemenPadang,
      product_id: LOCAL_UUIDS.productB35,
      market_id: "mkt-1",
      location: "Padang",
      period_label: "P3 OKT-26",
      pic_id: LOCAL_UUIDS.pic,
      status: "ACTIVE",
      notes:
        "Data contoh end-to-end: 3 vendor, harga all-in, AHS 9 komponen biaya, 2 versi scenario (V1 vs V2), tabel dinamis. Semua angka dihitung Calculation Engine.",
      volume: VOLUME,
    }),
    "membuat project",
  );
  step(`${project.code} — ${project.id}`);
  step(`PIC ditugaskan + baris project_members dibuat (akses PIC nyata)`);

  const projectId = project.id;

  // ---------------------------------------------------------------- 2. vendor
  heading("2. VENDOR & HARGA (3 kandidat, 1 terpilih)");

  const vendorSeeds = [
    {
      name: "PT Nusantara Solar Prima",
      contact: "Rina Wijaya",
      armada: "10 unit tangki",
      stock: "1.800 KL",
      permit: "Lengkap & aktif",
      address: "Pelabuhan Teluk Bayur, Padang",
      notes: "Vendor utama — penawaran terendah",
      basePrice: 15_400,
      selected: true,
    },
    {
      name: "PT Andalan Bunker Energi",
      contact: "Yusuf Rahman",
      armada: "8 unit tangki",
      stock: "1.200 KL",
      permit: "Lengkap",
      address: "Kawasan Industri Cilacap",
      notes: "Vendor pembanding (stock lebih kecil)",
      basePrice: 16_300,
      selected: false,
    },
    {
      name: "PT Sinar Diesel Nusantara",
      contact: "Maya Sari",
      armada: "6 unit tangki",
      stock: "800 KL",
      permit: "Perpanjangan berjalan",
      address: "Kawasan Industri Surabaya",
      notes: "Vendor pembanding — izin belum final",
      basePrice: 15_900,
      selected: false,
    },
  ];

  let selectedAllIn = 0;
  for (const seed of vendorSeeds) {
    const existingVendor = await findVendorByName(db, seed.name);
    const vendor = existingVendor
      ? existingVendor
      : unwrap(
          await createVendor(db, ACTOR, {
            name: seed.name,
            contact: seed.contact,
            armada: seed.armada,
            stock: seed.stock,
            permit: seed.permit,
            address: seed.address,
            notes: seed.notes,
            status: "ACTIVE",
          }),
          `membuat vendor ${seed.name}`,
        );

    const link = unwrap(
      await addVendorToProject(db, ACTOR, projectId, vendor.id, seed.notes),
      `menautkan vendor ${seed.name} ke project`,
    );

    const price = unwrap(
      await saveVendorPrice(db, ACTOR, projectId, vendor.id, {
        base_price: seed.basePrice,
        ppn_rate: PPN_RATE,
        ppn_is_formula: true,
        pbbkb_amount: 0,
        pph_amount: 0,
        oat_amount: 0,
        ppn_oat_amount: 0,
        bph_amount: 0,
        all_in_variant: "F002B",
        note: `Penawaran ${seed.name} untuk ${PROJECT_CODE}`,
      }),
      `menyimpan harga ${seed.name}`,
    );

    if (seed.selected) {
      unwrap(
        await setSelectedVendor(db, ACTOR, projectId, link.id, true),
        `menandai vendor terpilih ${seed.name}`,
      );
      selectedAllIn = price.all_in_amount ?? 0;
    }

    step(
      `${seed.name}: base ${formatRp(seed.basePrice)} + PPN ${formatRp(price.ppn_amount ?? 0)} = all-in ${formatRp(
        price.all_in_amount ?? 0,
      )}${seed.selected ? "  ← TERPILIH" : ""}`,
    );
  }

  // --------------------------------------------------------------- 3. AHS input
  heading("3. AHS — INPUT");
  unwrap(
    await saveAhsInputs(db, ACTOR, projectId, {
      volume: VOLUME,
      harga_jual_include: HARGA_JUAL_INCLUDE,
      include_divisor: INCLUDE_DIVISOR,
      ppn_rate: PPN_RATE,
      // Template A menghitung PBBKB penjualan `= DPP * 7.5% * 0` = 0 (F009),
      // jadi sel PBBKB pada sisi jual memang nol — kalau diisi 5% maka
      // revenue (F027A = DPP + PBBKB + PPN) tidak lagi sama dengan harga jual
      // include yang diisi user. PBBKB sisi biaya tetap ada sebagai cost item.
      pbbkb_rate: 0,
      pph_inu_rate: 0.003,
      bph_migas_rate: 0.0025,
      marketing: "Rian",
      payment_term: "45 Hari",
      document_scheme: "Fulldoc",
      analysis_date: "09/10/2026",
      notes: `Contoh lengkap ${PROJECT_CODE}: harga jual include ${formatRp(HARGA_JUAL_INCLUDE)}/liter, volume ${formatNumber(VOLUME)} liter.`,
      reason: "Input AHS data contoh",
    }),
    "menyimpan input AHS",
  );
  step(`Volume ${formatNumber(VOLUME)} liter · harga jual include ${formatRp(HARGA_JUAL_INCLUDE)} · divisor ${INCLUDE_DIVISOR}`);

  // ------------------------------------------------------------ 4. cost items
  heading("4. AHS — 9 KOMPONEN BIAYA (label Excel asli)");

  const hppBase = 15_400; // = harga dasar vendor terpilih (mapping: HPP 'Harga Dasar')
  const costLines: Array<{ category: string; description: string; rate: number; qty: number }> = [
    { category: "HPP", description: "Harga Dasar", rate: hppBase, qty: VOLUME },
    { category: "HPP", description: "OAT", rate: 250, qty: VOLUME },
    { category: "HPP", description: "PBBKB", rate: Math.round(hppBase * 0.05 * 100) / 100, qty: VOLUME },
    { category: "HPP", description: "PPH INU 0,3%", rate: Math.round(hppBase * 0.003 * 100) / 100, qty: VOLUME },
    { category: "HPP", description: "BPH Migas 0,25%", rate: Math.round(hppBase * 0.0025 * 100) / 100, qty: VOLUME },
    { category: "PAJAK", description: "PPN 11%", rate: Math.round(hppBase * 1.11 * 100) / 100 - hppBase, qty: VOLUME },
    { category: "COST OF FUND", description: "Bunga Bank", rate: 120, qty: VOLUME },
    { category: "OPERASIONAL", description: "Biaya Operasional", rate: 350, qty: VOLUME },
    { category: "RELATION", description: "Biaya Proyek", rate: 200, qty: VOLUME },
  ];

  for (const line of costLines) {
    unwrap(
      await addCostItem(db, ACTOR, projectId, {
        category: line.category,
        description: line.description,
        rate: line.rate,
        qty: line.qty,
        reason: `Cost item contoh ${PROJECT_CODE}`,
      }),
      `menambah cost item ${line.description}`,
    );
    step(`${line.category.padEnd(14)} ${line.description.padEnd(18)} ${formatRp(line.rate)} × ${formatNumber(line.qty)}`);
  }

  const bundle = unwrap(await getAhsBundle(db, ACTOR, projectId), "membaca AHS bundle");
  if (!bundle.preview) {
    console.error("✗ AHS preview kosong — engine tidak menghasilkan hasil untuk input ini.");
    if (bundle.previewError) console.error("  ", bundle.previewError.message);
    process.exit(1);
  }
  step(
    `Preview engine: revenue ${formatRp(bundle.preview.revenue)} · total cost ${formatRp(
      bundle.preview.total_cost,
    )} · net profit ${formatRp(bundle.preview.net_profit)}`,
  );

  // -------------------------------------------------------------- 5. scenarios
  heading("5. SCENARIO — V1 (baseline) + V2 (revisi harga vendor +7%)");

  const v1 = unwrap(
    await commitScenario(db, ACTOR, projectId, {
      name: "V1 — Penawaran awal PT Nusantara Solar Prima",
      scenario_type: "STANDARD",
      reason: "Baseline: harga dasar vendor terpilih, biaya operasional normal.",
      input: {},
    }),
    "membuat scenario V1",
  );
  step(
    `V1 "${v1.name}" · net profit ${formatRp(v1.result.net_profit)} · per liter ${formatRp(
      v1.result.net_profit_per_liter,
    )} · margin ${formatNumber(v1.result.profit_percentage * 100)}%`,
  );

  const hppRevision = Math.round(hppBase * 1.07 * 100) / 100;
  const v2 = unwrap(
    await commitScenario(db, ACTOR, projectId, {
      name: "V2 — Vendor naik 7% (Rp16.478/liter)",
      scenario_type: "CASH",
      reason: "Vendor merevisi harga dasar +7%; V1 otomatis terkunci sebagai pembanding.",
      input: { base_price: hppRevision },
      cost_rate_overrides: [{ description: "Harga Dasar", rate: hppRevision }],
    }),
    "membuat scenario V2",
  );
  step(
    `V2 "${v2.name}" · net profit ${formatRp(v2.result.net_profit)} · per liter ${formatRp(
      v2.result.net_profit_per_liter,
    )} · margin ${formatNumber(v2.result.profit_percentage * 100)}%`,
  );
  step(`Selisih V2−V1: net profit ${formatRp(v2.result.net_profit - v1.result.net_profit)}`);

  // ----------------------------------------------------------- 6. tabel dinamis
  heading("6. TABEL DINAMIS (spreadsheet user)");
  let sheetsView = unwrap(await addSheet(db, ACTOR, projectId, "Simulasi Pengadaan"), "menambah sheet");
  sheetsView = unwrap(
    await addSheetColumn(db, ACTOR, projectId, { sheet_key: "simulasi_pengadaan", label: "Nilai" }),
    "menambah kolom Nilai",
  );
  // Kolom bawaan (Kolom 1 / Kolom 2) dibuang supaya tabel contoh berisi kolom
  // yang benar-benar dipakai, bukan sisa template.
  for (const key of ["uraian_1", "uraian_2"]) {
    sheetsView = unwrap(
      await removeSheetColumn(db, ACTOR, projectId, { sheet_key: "simulasi_pengadaan", column_key: key }),
      `menghapus kolom bawaan ${key}`,
    );
  }
  sheetsView = unwrap(
    await setSheetRowLabel(db, ACTOR, projectId, {
      sheet_key: "simulasi_pengadaan",
      row_id: lastRow(sheetsView, "simulasi_pengadaan").id,
      label: "Harga Jual per Liter",
    }),
    "mengganti label baris pertama",
  );
  sheetsView = unwrap(
    await setSheetCell(db, ACTOR, projectId, {
      sheet_key: "simulasi_pengadaan",
      row_id: lastRow(sheetsView, "simulasi_pengadaan").id,
      column_key: "nilai",
      raw: "harga_jual_include",
    }),
    "mengisi sel harga jual",
  );

  const sheetRows: Array<{ label: string; expr: string }> = [
    { label: "Volume (liter)", expr: "volume" },
    { label: "Total Pendapatan", expr: "revenue" },
    { label: "Total Biaya", expr: "total_cost" },
    { label: "Laba Bersih", expr: "net_profit" },
    { label: "Laba Bersih per Liter", expr: "net_profit_per_liter" },
    { label: "Margin (%)", expr: "profit_percentage * 100" },
  ];
  for (const row of sheetRows) {
    sheetsView = unwrap(
      await addSheetRow(db, ACTOR, projectId, { sheet_key: "simulasi_pengadaan", label: row.label }),
      `menambah baris ${row.label}`,
    );
    sheetsView = unwrap(
      await setSheetCell(db, ACTOR, projectId, {
        sheet_key: "simulasi_pengadaan",
        row_id: lastRow(sheetsView, "simulasi_pengadaan").id,
        column_key: "nilai",
        raw: row.expr,
      }),
      `mengisi sel ${row.label}`,
    );
    step(`${row.label.padEnd(22)} = ${row.expr}`);
  }

  // ----------------------------------------------------------- 7. verifikasi
  await verify(db, projectId);

  console.log(`\n✓ Selesai. Ringkas: volume ${formatNumber(VOLUME)} L, harga jual ${formatRp(HARGA_JUAL_INCLUDE)}/L,`);
  console.log(`  vendor terpilih all-in ${formatRp(selectedAllIn)}, 2 scenario tersimpan.`);
  console.log("  Buka /dashboard lalu project di atas untuk melihat seluruh halaman terisi.\n");
  console.log(
    "  CATATAN: adapter lokal menyimpan datanya di memori proses. Jalankan seed saat dev\n" +
      "  server berhenti, atau restart dev server sesudahnya — server yang masih jalan\n" +
      "  memakai snapshot lama dan bisa menimpa file store pada penulisan berikutnya.\n",
  );
}

/**
 * Membaca ulang lewat service yang dipakai halaman, supaya "sudah lengkap"
 * dibuktikan dari sisi UI — bukan dari isi file JSON.
 */
async function verify(db: Database, projectId: string): Promise<void> {
  heading("VERIFIKASI (lewat service yang dipakai halaman)");

  const workspace = unwrap(await loadProjectWorkspace(db, ACTOR, projectId), "memuat project workspace");
  step(
    `Workspace: ${workspace.project.project.code} · ${workspace.vendors.length} kolom vendor · ` +
      `${workspace.costGroups.length} kategori biaya · ${workspace.sheets.length} sheet dinamis`,
  );
  const priced = workspace.comparison ? workspace.comparison.priced_indexes.length : 0;
  step(`Perbandingan vendor: ${priced} dari ${workspace.vendors.length} vendor sudah punya ALL IN`);
  if (priced < 2) {
    console.error("✗ Perbandingan vendor butuh minimal 2 vendor berharga.");
    process.exit(1);
  }

  const scenarios = unwrap(await listScenarios(db, ACTOR, projectId), "memuat daftar scenario");
  step(
    `Scenario: ${scenarios.length} tersimpan · ` +
      scenarios.map((s) => `${s.scenario.name}${s.has_result ? "" : " (tanpa hasil)"}`).join(" | "),
  );
  if (scenarios.some((s) => !s.has_result)) {
    console.error("✗ Ada scenario tanpa calculation result.");
    process.exit(1);
  }

  const history = unwrap(await listProjectHistory(db, ACTOR, projectId), "memuat history project");
  step(`History audit: ${history.total} baris`);

  const dashboard = unwrap(await loadDashboard(db, ACTOR), "memuat dashboard");
  step(
    `Dashboard: ${dashboard.kpis.total_projects} project · ${dashboard.kpis.projects_with_result} punya hasil · ` +
      `net profit ${formatRp(dashboard.kpis.total_profit ?? 0)}`,
  );

  const commercial = unwrap(await loadCommercialView(db, ACTOR, projectId), "memuat commercial view");
  if (!commercial.scenario || !commercial.result) {
    console.error("✗ Commercial view tidak menemukan scenario/result.");
    process.exit(1);
  }
  step(
    `Commercial terbaru: ${commercial.scenario.name} · revenue ${formatRp(commercial.result.revenue)} · ` +
      `net profit ${formatRp(commercial.result.net_profit)}`,
  );

  const sheets = unwrap(await loadProjectSheets(db, ACTOR, projectId), "memuat tabel dinamis");
  const broken: string[] = [];
  let filled = 0;
  for (const s of sheets.sheets) {
    for (const row of s.rows) {
      for (const cell of row.cells) {
        if (cell.value !== null || cell.expr !== null) filled += 1;
        if (cell.error) broken.push(`${s.title} · ${row.label} · ${cell.key}: ${cell.error}`);
      }
    }
  }
  step(`Tabel dinamis: ${sheets.sheets.length} sheet · ${filled} sel terisi`);
  if (broken.length > 0) {
    console.error("✗ Ada sel yang gagal dievaluasi:");
    for (const line of broken) console.error(`   - ${line}`);
    process.exit(1);
  }

  const report = unwrap(
    await buildCommercialReport(db, ACTOR, { only_with_result: true }),
    "membangun report komersial",
  );
  const reportRow = report.rows.find((row) => row.project_id === projectId);
  if (!reportRow) {
    console.error("✗ Project contoh tidak muncul di report komersial.");
    process.exit(1);
  }
  step(
    `Report komersial: ${report.rows.length} project siap diexport (CSV/print) · ` +
      `contoh ini tercatat net profit ${formatRp(reportRow.net_profit)}`,
  );
}

main().catch((e) => {
  console.error("\n✗ Seed gagal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
