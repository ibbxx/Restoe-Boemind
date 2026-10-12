/** Read-only rehearsal against the original store. All output goes to a temporary directory. */
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createSqliteDatabase } from "../lib/data/sqlite-db";
import { buildFixtureSeed } from "../lib/data/local-db";
const source = resolve(".data/local-store.json");
const original = await readFile(source);
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const directory = await mkdtemp(join(tmpdir(), "procurement-migration-check-"));
const path = join(directory, "procurement.sqlite");
const db = createSqliteDatabase({ path, legacyPath: source, seed: buildFixtureSeed() });
try { await db.select("projects"); } finally { await db.close!(); }
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const sqlite = new DatabaseSync(path, { readOnly: true });
try {
  const raw = sqlite.prepare("SELECT value FROM local_meta WHERE key='migration'").get() as { value: string };
  const report = JSON.parse(raw.value) as { imported: Record<string, number>; archived: Record<string, number> };
  const changed = digest(original) !== digest(await readFile(source));
  if (changed || sqlite.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Migration verification failed");
  console.info(JSON.stringify({ sourceUnchanged: !changed, imported: report.imported, archived: report.archived, integrity: sqlite.prepare("PRAGMA integrity_check").get(), output: directory }, null, 2));
} finally { sqlite.close(); }
