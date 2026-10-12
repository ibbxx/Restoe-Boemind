import { afterEach, describe, expect, it, vi } from "vitest";
import { AutosaveQueue, type SaveReply } from "../lib/workbook/autosave";
import type { WorkbookDraft } from "../lib/workbook/drafts";

afterEach(() => vi.useRealTimers());
function setup(send: (draft: WorkbookDraft) => Promise<SaveReply>) {
  let value = 1;
  const draft = vi.fn(async (_draft: WorkbookDraft) => {});
  const clearDraft = vi.fn(async () => {});
  const state = vi.fn();
  const queue = new AutosaveQueue({ projectId: "project", revision: 0, snapshot: () => ({ value }), send, draft, clearDraft, state });
  return { queue, draft, clearDraft, state, change: () => { value++; queue.changed(); } };
}
describe("workbook autosave", () => {
  it("does not save untouched documents and batches edits after 700ms", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => ({ ok: true, data: { revision: 1, calculationErrors: [] } }));
    const test = setup(send);
    await vi.advanceTimersByTimeAsync(1500); expect(send).not.toHaveBeenCalled();
    test.change(); await vi.advanceTimersByTimeAsync(300); test.change();
    await vi.advanceTimersByTimeAsync(699); expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(send).toHaveBeenCalledTimes(1);
    expect(test.queue.dirty).toBe(false); expect(test.clearDraft).toHaveBeenCalledTimes(1);
    test.queue.stop();
  });
  it("serializes edits made during a save and advances the base revision", async () => {
    let finish!: (reply: SaveReply) => void;
    const send = vi.fn<(draft: WorkbookDraft) => Promise<SaveReply>>()
      .mockImplementationOnce(() => new Promise((res) => { finish = res; }))
      .mockResolvedValue({ ok: true, data: { revision: 2, calculationErrors: [] } });
    const test = setup(send); test.change(); const first = test.queue.flush();
    await Promise.resolve(); await Promise.resolve(); test.change();
    finish({ ok: true, data: { revision: 1, calculationErrors: [] } });
    await first; await test.queue.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0].baseRevision).toBe(1);
    expect(send.mock.calls[1]![0].snapshot).toEqual({ value: 3 });
    test.queue.stop();
  });
  it("keeps mutation identity across retries and stops after a conflict", async () => {
    const send = vi.fn<(draft: WorkbookDraft) => Promise<SaveReply>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: false, errorCode: "CONFLICT", error: "Changed elsewhere" });
    const test = setup(send); test.change(); await test.queue.flush(); await test.queue.flush();
    expect(send.mock.calls[0]![0].mutationId).toBe(send.mock.calls[1]![0].mutationId);
    test.change(); expect(await test.queue.flush()).toBe(false);
    expect(send).toHaveBeenCalledTimes(2); expect(test.queue.dirty).toBe(true);
    expect(test.state).toHaveBeenCalledWith("conflict", "Changed elsewhere");
    test.queue.stop();
  });
});
