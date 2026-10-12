import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import type { Database } from "./db";
import { DatabaseError } from "./db";

export function createSqliteDatabase(options: {
  path: string; legacyPath?: string; backupDir?: string; seed?: Record<string, unknown[]>;
}): Database {
  const worker = new Worker(resolve(process.cwd(), "lib/data/sqlite-worker.mjs"), {
    workerData: { ...options, backupDir: options.backupDir ?? resolve(options.path, "..", "backups"), seed: options.seed ?? {} },
  });
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let next = 0;
  let fatal: Error | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  worker.on("message", (message) => {
    const request = pending.get(message.requestId);
    pending.delete(message.requestId);
    if (message.error) request?.reject(new DatabaseError("projects", message.code ?? "SQLITE", message.error));
    else request?.resolve(message.result);
    if (!pending.size) worker.unref();
  });
  const fail = (error: Error) => {
    fatal = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.on("error", fail);
  worker.on("exit", (code) => { if (code !== 0) fail(new Error("Penyimpanan lokal berhenti. Buka kembali aplikasi.")); });
  worker.unref();
  function rpc<T>(message: Record<string, unknown>): Promise<T> {
    if (fatal) return Promise.reject(fatal);
    worker.ref();
    return new Promise((res, reject) => {
      const requestId = ++next;
      pending.set(requestId, { resolve: res as (value: unknown) => void, reject });
      worker.postMessage({ requestId, ...message });
    });
  }
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => undefined);
    return result;
  }
  function adapter(inTransaction: boolean): Database {
    const run = <T>(message: Record<string, unknown>) => inTransaction ? rpc<T>(message) : serial(() => rpc<T>(message));
    return {
      live: false, local: true,
      select: (table, options) => run({ op: "select", table, options }),
      insert: (table, values) => run({ op: "insert", table, values }),
      update: (table, id, patch) => run({ op: "update", table, id, patch }),
      remove: (table, id) => run({ op: "remove", table, id }),
      backup: (reason) => run({ op: "backup", reason }),
      transaction: inTransaction ? async (work) => work(adapter(true)) : (work) => serial(async () => {
        await rpc({ op: "begin" });
        try { const result = await work(adapter(true)); await rpc({ op: "commit" }); return result; }
        catch (error) { await rpc({ op: "rollback" }); throw error; }
      }),
      close: () => serial(async () => { await rpc({ op: "close" }); await worker.terminate(); }),
    };
  }
  return adapter(false);
}
