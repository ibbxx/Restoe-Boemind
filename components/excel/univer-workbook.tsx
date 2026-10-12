"use client";

import { useEffect, useRef, useState } from "react";
import type { IWorkbookData } from "@univerjs/core";
import { LocaleType, mergeLocales } from "@univerjs/core";
import { createUniver } from "@univerjs/presets";
import { SetDefinedNameCommand } from "@univerjs/sheets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import Indonesian from "@univerjs/preset-sheets-core/locales/id-ID";
import "@univerjs/preset-sheets-core/lib/index.css";
import { saveUniverWorkbookAction } from "@/lib/actions/sheets";
import { AutosaveQueue, type SaveState } from "@/lib/workbook/autosave";
import { readDraft, writeDraft, deleteDraft } from "@/lib/workbook/drafts";
import { bindingId, FIELD_CELLS } from "@/lib/workbook/bindings";
import { isPersistedWorkbookCommand } from "@/lib/workbook/univer-commands";
import { WorkbookSaveBar } from "@/components/excel/workbook-save-bar";

const FIELD_LABELS: Record<string, string> = {
  "project.name": "Nama proyek", "project.customer": "Pelanggan", "project.location": "Lokasi / Pasar",
  "project.product": "Produk", "project.period_label": "Periode", "project.pic": "Penanggung jawab", "project.status": "Status",
  "project.volume": "Volume (L)",
};

export default function UniverWorkbook({ projectId, snapshot, canWrite, revision = 0, needsMapping = false }: {
  projectId: string; snapshot: Record<string, unknown>; canWrite: boolean; revision?: number; needsMapping?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const initial = useRef(snapshot);
  const queueRef = useRef<AutosaveQueue | null>(null);
  const bindRef = useRef<((field: string) => Promise<void>) | null>(null);
  const [state, setState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [mapping, setMapping] = useState(needsMapping);
  const [field, setField] = useState("project.volume");

  useEffect(() => {
    if (!hostRef.current) return;
    const container = document.createElement("div"); container.className = "univer-workbook-canvas"; hostRef.current.append(container);
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.ID_ID, locales: { [LocaleType.ID_ID]: mergeLocales(Indonesian) },
      presets: [UniverSheetsCorePreset({ container, contextMenu: true, toolbar: true, ribbonType: "classic" })],
    });
    const workbook = univerAPI.createWorkbook(structuredClone(initial.current) as unknown as IWorkbookData);
    workbook.setEditable(canWrite);
    let disposed = false;
    const queue = new AutosaveQueue({
      projectId, revision,
      snapshot: () => univerAPI.getActiveWorkbook()!.save() as unknown as Record<string, unknown>,
      send: (value) => saveUniverWorkbookAction(projectId, JSON.stringify(value.snapshot), { baseRevision: value.baseRevision, mutationId: value.mutationId }),
      draft: writeDraft, clearDraft: () => deleteDraft(projectId),
      state: (value, detail) => { if (!disposed) { setState(value); setMessage(detail ?? ""); } },
    });
    queueRef.current = queue;
    bindRef.current = async (key) => {
      const active = univerAPI.getActiveWorkbook(); const range = active?.getActiveRange();
      if (!active || !range) return;
      const address = range.getA1Notation().split(":")[0]!.replace(/\$?([A-Z]+)\$?(\d+)/gi, (_match, col: string, row: string) => `$${col}$${row}`);
      const id = bindingId(key);
      await univerAPI.executeCommand(SetDefinedNameCommand.id, { unitId: active.getId(), id, name: id, comment: key, formulaOrRefString: "'" + range.getSheetName().replaceAll("'", "''") + "'!" + address });
      queue.changed(); setMessage("Sel sudah dihubungkan. Perubahan sedang disimpan.");
    };
    const listener = univerAPI.addEvent(univerAPI.Event.CommandExecuted, ({ id }) => {
      if (canWrite && !disposed && isPersistedWorkbookCommand(id)) queue.changed();
    });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (queue.dirty) { event.preventDefault(); event.returnValue = ""; } };
    const navigation = (event: MouseEvent) => {
      if (!queue.dirty || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.origin !== location.origin || anchor.href === location.href) return;
      event.preventDefault(); event.stopPropagation();
      void queue.flush().then((saved) => { if (saved) location.assign(anchor.href); });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigation, true);
    return () => {
      queue.stop(); disposed = true; queueRef.current = null; bindRef.current = null;
      window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", navigation, true);
      listener.dispose();
      queueMicrotask(() => { univer.dispose(); container.remove(); });
    };
  }, [projectId, canWrite, revision]);

  const downloadDraft = () => {
    void readDraft(projectId).then((value) => {
      if (!value) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "draf-" + projectId + ".json"; a.click(); URL.revokeObjectURL(url);
    });
  };
  return <section className="univer-workbook-shell" data-testid="workbook-physical-grid">
    <WorkbookSaveBar
      state={state}
      message={message}
      canWrite={canWrite}
      mapping={mapping}
      onRetry={() => { void queueRef.current?.flush(); }}
      onDownloadDraft={downloadDraft}
      onLoadLatest={() => location.reload()}
      onToggleMapping={() => setMapping((visible) => !visible)}
    />
    {mapping && canWrite ? <div className="flex flex-wrap items-center gap-2 p-3">
      <select id="business-field" aria-label="Isian yang akan dihubungkan" className="input max-w-xs" value={field} onChange={(event) => setField(event.target.value)}>
        {[...new Set([...Object.keys(FIELD_CELLS), ...Object.keys(FIELD_LABELS)])].map((key) => <option key={key} value={key}>{FIELD_LABELS[key]}</option>)}
      </select>
      <button className="btn-secondary" onClick={() => { void bindRef.current?.(field).catch(() => setMessage("Sel belum dapat dihubungkan. Pilih satu sel lalu coba lagi.")); }}>Gunakan sel terpilih</button>
    </div> : null}
    <div ref={hostRef} className="univer-workbook-host" />
  </section>;
}
