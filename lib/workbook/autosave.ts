import type { WorkbookDraft } from "./drafts";
export type SaveState = "saved" | "saving" | "error" | "conflict";
export interface SaveReply { ok: boolean; data?: { revision: number; calculationErrors: string[] }; error?: string; errorCode?: string }
export class AutosaveQueue {
  private generation = 0;
  private committed = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private draftTimer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<boolean>;
  private retry = 0;
  private stopped = false;
  private blocked = false;
  private pending?: { generation: number; draft: WorkbookDraft };
  constructor(private options: {
    projectId: string; revision: number; snapshot(): Record<string, unknown>;
    send(draft: WorkbookDraft): Promise<SaveReply>;
    draft(draft: WorkbookDraft): Promise<void>; clearDraft(): Promise<void>;
    state(state: SaveState, message?: string): void;
  }) {}
  get dirty(): boolean { return this.generation !== this.committed; }
  changed(): void {
    if (this.stopped) return;
    this.generation++; this.retry = 0;
    if (!this.blocked) this.options.state("saving");
    clearTimeout(this.timer); clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => { void this.keepDraft(); }, 250);
    if (!this.blocked) this.timer = setTimeout(() => { void this.flush(); }, 700);
  }
  private capture(): { generation: number; draft: WorkbookDraft } {
    if (this.pending?.generation === this.generation) return this.pending;
    return this.pending = { generation: this.generation, draft: {
      projectId: this.options.projectId, snapshot: this.options.snapshot(), baseRevision: this.options.revision,
      mutationId: crypto.randomUUID(), savedAt: new Date().toISOString(),
    } };
  }
  private async keepDraft(): Promise<void> {
    if (!this.dirty) return;
    try { await this.options.draft(this.capture().draft); }
    catch { if (!this.stopped) this.options.state("error", "Draf belum tersimpan di browser. Tetap buka halaman sampai perubahan tersimpan."); }
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.stopped || this.blocked) return false;
    if (this.inFlight) { await this.inFlight; return this.dirty && !this.blocked ? this.flush() : !this.dirty; }
    if (!this.dirty) return true;
    const captured = this.capture();
    this.inFlight = (async () => {
      await this.keepDraft();
      try {
        const result = await this.options.send(captured.draft);
        if (!result.ok || !result.data) {
          this.blocked = result.errorCode === "CONFLICT";
          if (!this.stopped) this.options.state(this.blocked ? "conflict" : "error", result.error ?? "Perubahan belum tersimpan. Coba lagi.");
          return false;
        }
        this.options.revision = result.data.revision;
        this.committed = captured.generation;
        this.pending = undefined;
        this.retry = 0;
        if (!this.dirty) {
          await this.options.clearDraft();
          if (!this.stopped && !this.dirty) this.options.state("saved", result.data.calculationErrors.length ? "Tersimpan. Beberapa hasil belum tersedia; periksa isian dan rumus." : undefined);
        } else await this.keepDraft();
        return true;
      } catch {
        if (!this.stopped) this.options.state("error", "Perubahan belum tersimpan. Coba lagi.");
        return false;
      }
    })();
    const success = await this.inFlight;
    this.inFlight = undefined;
    if (this.dirty && !this.stopped && !this.blocked) {
      if (success) this.timer = setTimeout(() => { void this.flush(); }, 0);
      else if (this.retry < 2) this.timer = setTimeout(() => { this.retry++; void this.flush(); }, 1000 * (this.retry + 1));
    }
    return success && !this.dirty;
  }
  stop(): void {
    void this.keepDraft(); this.stopped = true;
    clearTimeout(this.timer); clearTimeout(this.draftTimer);
  }
}
