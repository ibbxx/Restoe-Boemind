import type { SaveState } from "@/lib/workbook/autosave";

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Tersimpan",
  saving: "Sedang menyimpan",
  error: "Belum tersimpan",
  conflict: "Ada perubahan di tab lain",
};

export function WorkbookSaveBar({
  state,
  message,
  canWrite,
  mapping,
  isFullscreen = false,
  onRetry,
  onDownloadDraft,
  onLoadLatest,
  onToggleMapping,
  onToggleFullscreen,
}: {
  state: SaveState;
  message?: string;
  canWrite: boolean;
  mapping: boolean;
  isFullscreen?: boolean;
  onRetry: () => void;
  onDownloadDraft: () => void;
  onLoadLatest: () => void;
  onToggleMapping: () => void;
  onToggleFullscreen?: () => void;
}) {
  return <div className="univer-save-bar">
    <div className={`univer-save-state is-${state}`} role="status" aria-live="polite">
      <span>{SAVE_LABELS[state]}</span>
      {message ? <span className="univer-save-message">{message}</span> : null}
    </div>
    <div className="univer-save-actions" aria-label="Aksi lembar kerja">
      {state === "error" ? <button type="button" className="btn-secondary" onClick={onRetry}>Coba simpan lagi</button> : null}
      {state === "conflict" ? <>
        <button type="button" className="btn-secondary" onClick={onDownloadDraft}>Unduh draf</button>
        <button type="button" className="btn-secondary" onClick={onLoadLatest}>Muat versi terbaru</button>
      </> : null}
      {canWrite ? <button type="button" className="btn-secondary" aria-expanded={mapping} onClick={onToggleMapping}>Hubungkan isian</button> : null}
      {onToggleFullscreen ? (
        <button
          type="button"
          className="btn-secondary"
          aria-label={isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
          title={isFullscreen ? "Keluar layar penuh (Esc)" : "Layar penuh"}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
        </button>
      ) : null}
    </div>
  </div>;
}
