import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { bindingPosition, bindings } from "./bindings";
import type { ProjectSheetsDoc } from "../types/sheets";

let worker: Worker | undefined;
let counter = 0;
const pending = new Map<number, { resolve(value: NonNullable<ProjectSheetsDoc["businessProjection"]>): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(resolve(process.cwd(), "lib/workbook/calculation-worker.mjs"));
  worker.on("message", (message) => {
    const task = pending.get(message.id); if (!task) return;
    pending.delete(message.id); clearTimeout(task.timer);
    if (message.error) task.reject(new Error(message.error));
    else task.resolve({ values: message.values, errors: message.errors, calculatedAt: new Date().toISOString() });
    if (!pending.size) worker?.unref();
  });
  worker.on("error", (error) => { for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); } pending.clear(); worker = undefined; });
  const current = worker;
  current.on("exit", () => {
    if (worker !== current) return;
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Perhitungan terhenti. Coba simpan lagi.")); }
    pending.clear(); worker = undefined;
  });
  worker.unref();
  return worker;
}
export async function calculateWorkbook(snapshot: Record<string, unknown>): Promise<NonNullable<ProjectSheetsDoc["businessProjection"]>> {
  const positions = Object.fromEntries(Object.values(bindings(snapshot)).filter((entry) => entry.comment).map((entry) => [entry.comment!, bindingPosition(snapshot, entry.comment!)]));
  if (!Object.keys(positions).length) return { values: {}, errors: ["unmapped"], calculatedAt: new Date().toISOString() };
  const target = getWorker(); target.ref();
  return new Promise((res, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => {
      const error = new Error("Perhitungan belum selesai. Coba simpan lagi.");
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); }
      pending.clear(); const stalled = worker; worker = undefined; void stalled?.terminate();
    }, 10_000);
    pending.set(id, { resolve: res, reject, timer });
    target.postMessage({ id, snapshot, positions });
  });
}
