export interface WorkbookDraft { projectId: string; snapshot: Record<string, unknown>; baseRevision: number; mutationId: string; savedAt: string }
function database(): Promise<IDBDatabase> {
  return new Promise((res, reject) => {
    const request = indexedDB.open("procurement-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "projectId" });
    request.onsuccess = () => res(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await database();
  return new Promise((res, reject) => {
    const tx = db.transaction("drafts", mode);
    const request = operation(tx.objectStore("drafts"));
    tx.oncomplete = () => { db.close(); res(request.result as T); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
function key(projectId: string): string {
  let session = sessionStorage.getItem("procurement-draft-session");
  if (!session) { session = crypto.randomUUID(); sessionStorage.setItem("procurement-draft-session", session); }
  return `${projectId}:${session}`;
}
export const readDraft = async (projectId: string) => {
  const draft = await run<WorkbookDraft | undefined>("readonly", (store) => store.get(key(projectId)));
  return draft ? { ...draft, projectId } : undefined;
};
export const writeDraft = (draft: WorkbookDraft) => run<void>("readwrite", (store) => store.put({ ...draft, projectId: key(draft.projectId) }));
export const deleteDraft = (projectId: string) => run<void>("readwrite", (store) => store.delete(key(projectId)));
