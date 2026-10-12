/** Remove the former AHS projection while retaining supplier cells and user sheets. Idempotent. */
export function stripAhsFromDocument(input, volume = null) {
  const doc = structuredClone(input);
  const snapshot = doc.univerWorkbook;
  if (snapshot?.sheets && typeof snapshot.sheets === "object") {
    const former = snapshot.sheets.ahs;
    if (former) {
      former.id = "vendor_evaluation";
      former.name = "Evaluasi pemasok";
      for (const [rowKey, row] of Object.entries(former.cellData ?? {})) {
        if (!row || typeof row !== "object") continue;
        for (const columnKey of Object.keys(row)) {
          const column = Number(columnKey);
          const index = Number(rowKey);
          // The former AHS projection occupied E:P, rows 1:40. Vendor data is A:D.
          if (index < 40 && column >= 4 && column <= 15) delete row[columnKey];
        }
        if (!Object.keys(row).length) delete former.cellData[rowKey];
      }
      former.mergeData = (former.mergeData ?? []).filter((range) => range.startColumn < 4 || range.startRow >= 40);
      snapshot.sheets.vendor_evaluation = former;
      delete snapshot.sheets.ahs;
      snapshot.sheetOrder = (snapshot.sheetOrder ?? []).map((id) => id === "ahs" ? "vendor_evaluation" : id);
    }
    const resources = snapshot.resources;
    if (Array.isArray(resources)) for (const resource of resources) {
      if (resource.name !== "SHEET_DEFINED_NAME_PLUGIN") continue;
      try {
        const map = JSON.parse(resource.data);
        for (const [id, entry] of Object.entries(map)) {
          const key = entry?.comment ?? "";
          if (/^(ahs|cost|result)\./.test(key)) delete map[id];
          else if (former && typeof entry?.formulaOrRefString === "string") entry.formulaOrRefString = entry.formulaOrRefString.replaceAll("'AHS'!", "'Evaluasi pemasok'!");
        }
        const volumeId = "proc_project_volume";
        map[volumeId] = { id: volumeId, name: volumeId, formulaOrRefString: "'Data proyek'!$B$8", comment: "project.volume" };
        resource.data = JSON.stringify(map);
      } catch { /* Keep malformed metadata for recovery from backup. */ }
    }
    const inputs = snapshot.sheets.procurement_inputs;
    if (inputs?.cellData) {
      inputs.cellData[7] ??= {};
      inputs.cellData[7][0] = { v: "Volume (L)" };
      inputs.cellData[7][1] = { v: volume };
      for (const row of Object.values(inputs.cellData)) {
        if (!row || typeof row !== "object") continue;
        const label = row[0]?.v;
        if (typeof label === "string" && /^(Pembagi harga|Tarif PPN|Tarif PBBKB|Tarif PPh|Tarif BPH Migas|Persentase laba|Catatan)$/.test(label)) {
          delete row[0]; delete row[1];
        }
      }
    }
  }
  doc.sheets = (doc.sheets ?? []).filter((sheet) => !["harga_jual", "konversi", "poin_perhitungan"].includes(sheet.key));
  if (!doc.sheets.length) doc.sheets = [{ key: "lembar_kerja", title: "Lembar kerja", columns: [{ key: "nilai", label: "Nilai" }], rows: [], merges: [], styles: {} }];
  doc.workbookFormulas = Object.fromEntries(Object.entries(doc.workbookFormulas ?? {}).filter(([key]) => !/^(ahs:|cost:)/.test(key)));
  delete doc.businessProjection;
  return doc;
}
