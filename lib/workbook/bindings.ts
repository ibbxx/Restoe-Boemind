export const BINDING_RESOURCE = "SHEET_DEFINED_NAME_PLUGIN";
export const FIELD_CELLS: Record<string, string> = {
  "project.name": "B1", "project.customer": "B2", "project.product": "B3",
  "project.location": "B4", "project.period_label": "B5", "project.pic": "B6",
  "project.status": "B7", "project.volume": "B8",
};
export interface NamedBinding { id: string; name: string; formulaOrRefString: string; comment?: string; hidden?: boolean }
export function bindingId(key: string): string { return `proc_${key.replaceAll(/[^a-zA-Z0-9_]/g, "_")}`; }
export function bindings(snapshot: Record<string, unknown>): Record<string, NamedBinding> {
  const resources = snapshot.resources as Array<{ name: string; data: string }> | undefined;
  const raw = resources?.find((r) => r.name === BINDING_RESOURCE)?.data;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
export function setBindings(snapshot: Record<string, unknown>, map: Record<string, NamedBinding>): void {
  const resources = (snapshot.resources as Array<{ name: string; data: string }> | undefined) ?? [];
  snapshot.resources = [...resources.filter((r) => r.name !== BINDING_RESOURCE), { name: BINDING_RESOURCE, data: JSON.stringify(map) }];
}
export function bindField(snapshot: Record<string, unknown>, key: string, sheetName: string, address: string): void {
  const map = bindings(snapshot);
  const id = bindingId(key);
  const absolute = address.replace(/\$?([A-Z]+)\$?(\d+)/gi, (_match, col: string, row: string) => `$${col}$${row}`);
  map[id] = { id, name: id, formulaOrRefString: `'${sheetName.replaceAll("'", "''")}'!${absolute}`, comment: key };
  setBindings(snapshot, map);
}
export function initializeBindings(snapshot: Record<string, unknown>): void {
  const fields: Array<[string, string, unknown]> = [
    ["project.name", "Nama proyek", null],
    ["project.customer", "Pelanggan", null],
    ["project.product", "Produk", null],
    ["project.location", "Lokasi", null],
    ["project.period_label", "Periode", null],
    ["project.pic", "Penanggung jawab", null],
    ["project.status", "Status", "ACTIVE"],
    ["project.volume", "Volume (L)", null],
  ];
  const cellData: Record<number, Record<number, Record<string, unknown>>> = {};
  fields.forEach(([key, label, value], index) => {
    cellData[index] = { 0: { v: label }, 1: { v: value } };
    bindField(snapshot, key, "Data proyek", `B${index + 1}`);
  });
  const sheets = snapshot.sheets as Record<string, unknown>;
  sheets.procurement_inputs = { id: "procurement_inputs", name: "Data proyek", rowCount: 200, columnCount: 50, cellData, columnData: { 0: { w: 260 }, 1: { w: 200 } } };
  const sheetOrder = (snapshot.sheetOrder as string[] | undefined) ?? [];
  if (!sheetOrder.includes("procurement_inputs")) {
    sheetOrder.push("procurement_inputs");
    snapshot.sheetOrder = sheetOrder;
  }

  // Auto-bind AHS fields if the AHS sheet exists
  if (sheets.ahs) {
    // Project metadata fields on AHS sheet
    bindField(snapshot, "project.name", "AHS", "B3");
    bindField(snapshot, "project.customer", "AHS", "B4");
    bindField(snapshot, "project.location", "AHS", "B5");

    // EVALUASI HARGA VENDOR header fields
    bindField(snapshot, "ahs.pekerjaan", "AHS", "B3");
    bindField(snapshot, "ahs.customer", "AHS", "B4");
    bindField(snapshot, "ahs.lokasi", "AHS", "B5");

    // PROYEKSI LABA RUGI header fields
    bindField(snapshot, "ahs.tgl_analisis", "AHS", "I3");
    bindField(snapshot, "ahs.analysis_date", "AHS", "I3");
    bindField(snapshot, "ahs.sumber", "AHS", "N3");
    bindField(snapshot, "ahs.marketing", "AHS", "I4");
    bindField(snapshot, "ahs.lokasi_ahs", "AHS", "N4");
    bindField(snapshot, "ahs.pembayaran", "AHS", "I5");
    bindField(snapshot, "ahs.payment_term", "AHS", "I5");
    bindField(snapshot, "ahs.dokumen", "AHS", "N5");
    bindField(snapshot, "ahs.document_scheme", "AHS", "N5");
    bindField(snapshot, "ahs.harga_keekonomian", "AHS", "I6");
    bindField(snapshot, "ahs.diskon", "AHS", "N6");
    bindField(snapshot, "ahs.harga_include", "AHS", "P7");
    bindField(snapshot, "ahs.harga_jual_include", "AHS", "P7");
    bindField(snapshot, "ahs.volume", "AHS", "N10");

    // Vendor comparison table (EVALUASI HARGA VENDOR) slots 0-3
    const vendorCols = ["B", "C", "D", "E"] as const;
    vendorCols.forEach((col, i) => {
      const slot = `vendor.slot${i}`;
      bindField(snapshot, `${slot}.name`, "AHS", `${col}7`);
      bindField(snapshot, `${slot}.base_price`, "AHS", `${col}8`);
      bindField(snapshot, `${slot}.ppn_amount`, "AHS", `${col}9`);
      bindField(snapshot, `${slot}.pbbkb_amount`, "AHS", `${col}10`);
      bindField(snapshot, `${slot}.pph_amount`, "AHS", `${col}11`);
      bindField(snapshot, `${slot}.ppn_oat_amount`, "AHS", `${col}12`);
      bindField(snapshot, `${slot}.bph_amount`, "AHS", `${col}13`);
      bindField(snapshot, `${slot}.all_in_amount`, "AHS", `${col}14`);
    });

    // Cost items slots 0-16 (rows 15-31)
    for (let slot = 0; slot <= 16; slot++) {
      const row = 15 + slot;
      bindField(snapshot, `cost.slot${slot}.description`, "AHS", `I${row}`);
      bindField(snapshot, `cost.slot${slot}.rate`, "AHS", `K${row}`);
      bindField(snapshot, `cost.slot${slot}.qty`, "AHS", `L${row}`);
      bindField(snapshot, `cost.slot${slot}.total`, "AHS", `N${row}`);
    }

    // Result output cells
    bindField(snapshot, "result.revenue", "AHS", "P8");
    bindField(snapshot, "result.total_pendapatan", "AHS", "P8");
    bindField(snapshot, "result.harga_jual_setelah_pajak", "AHS", "P9");
    bindField(snapshot, "result.harga_jual_dpp", "AHS", "L10");
    bindField(snapshot, "result.pbbkb_output", "AHS", "P11");
    bindField(snapshot, "result.ppn_output", "AHS", "P12");
    bindField(snapshot, "result.total_biaya", "AHS", "P13");
    bindField(snapshot, "result.total_cost", "AHS", "P13");
    bindField(snapshot, "result.biaya_perliter", "AHS", "P14");
    bindField(snapshot, "result.cost_per_liter", "AHS", "P14");
    bindField(snapshot, "result.pbbkb_input", "AHS", "N17");
    bindField(snapshot, "result.ppn_input", "AHS", "N20");
    bindField(snapshot, "result.laba_kotor", "AHS", "P32");
    bindField(snapshot, "result.gross_profit", "AHS", "P32");
    bindField(snapshot, "result.selisih_ppn", "AHS", "P33");
    bindField(snapshot, "result.ppn_difference", "AHS", "P33");
    bindField(snapshot, "result.selisih_pbbkb", "AHS", "P34");
    bindField(snapshot, "result.pbbkb_difference", "AHS", "P34");
    bindField(snapshot, "result.laba_bersih", "AHS", "P35");
    bindField(snapshot, "result.net_profit", "AHS", "P35");
    bindField(snapshot, "result.laba_bersih_perliter", "AHS", "P36");
    bindField(snapshot, "result.net_profit_per_liter", "AHS", "P36");
    bindField(snapshot, "result.laba_bersih_rbi", "AHS", "P37");
    bindField(snapshot, "result.laba_bersih_partner", "AHS", "P38");
    bindField(snapshot, "result.diskon", "AHS", "N6");
  }
}
export function bindingPosition(snapshot: Record<string, unknown>, key: string): { sheetId: string; row: number; col: number } | null {
  const entry = bindings(snapshot)[bindingId(key)];
  if (!entry) return null;
  const match = /^=?'((?:[^']|'')+)'!\$?([A-Z]+)\$?(\d+)$/i.exec(entry.formulaOrRefString) ?? /^=?([^!]+)!\$?([A-Z]+)\$?(\d+)$/i.exec(entry.formulaOrRefString);
  if (!match) return null;
  const sheets = snapshot.sheets as Record<string, { name: string }>;
  const sheetId = Object.keys(sheets).find((id) => sheets[id]?.name === match[1]!.replaceAll("''", "'"));
  if (!sheetId) return null;
  let col = 0; for (const char of match[2]!.toUpperCase()) col = col * 26 + char.charCodeAt(0) - 64;
  return { sheetId, row: Number(match[3]) - 1, col: col - 1 };
}
export function writeBoundValue(snapshot: Record<string, unknown>, key: string, value: unknown): boolean {
  const position = bindingPosition(snapshot, key);
  if (!position) return false;
  const sheets = snapshot.sheets as Record<string, { cellData: Record<string, Record<string, Record<string, unknown>>> }>;
  const cells = sheets[position.sheetId]!.cellData ??= {};
  const row = cells[position.row] ??= {};
  const previous = row[position.col] ?? {};
  const { f: _f, si: _si, ...format } = previous;
  row[position.col] = { ...format, v: value ?? null };
  return true;
}
