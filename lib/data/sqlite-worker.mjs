import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync, backup } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync, linkSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { schema, unique, relations, jsonColumns, booleanColumns } from "./sqlite-schema.mjs";
import { stripAhsFromDocument } from "../workbook/strip-ahs.mjs";

const quote = (name) => `"${name}"`;
let db;
let initError;
const statements = new Map();
const initPause = new Int32Array(new SharedArrayBuffer(4));
const prepare = (sql) => {
  if (!statements.has(sql)) statements.set(sql, db.prepare(sql));
  return statements.get(sql);
};
function checkTable(table) {
  if (!Object.hasOwn(schema, table)) throw new Error("Unknown table");
}
function column(table, key) {
  if (!Object.hasOwn(schema[table], key)) throw new Error(`Unknown column ${table}.${key}`);
  return quote(key);
}
const encode = (key, value) => value == null ? null : jsonColumns.has(key) ? JSON.stringify(value) : typeof value === "boolean" ? Number(value) : value;
function decode(row) {
  const result = JSON.parse(row._extra || "{}");
  for (const [key, value] of Object.entries(row)) {
    if (key === "_extra") continue;
    result[key] = jsonColumns.has(key) && value != null ? JSON.parse(value) : booleanColumns.has(key) && value != null ? Boolean(value) : value;
  }
  return result;
}
function insert(table, values) {
  checkTable(table);
  const now = new Date().toISOString();
  const row = { id: values.id ?? (table === "calculation_templates" ? values.template_id : table === "formula_registry" ? values.formula_id : undefined) ?? randomUUID(), created_at: now, updated_at: now, ...values };
  const keys = Object.keys(row).filter((key) => Object.hasOwn(schema[table], key));
  const extra = Object.fromEntries(Object.entries(row).filter(([key]) => !Object.hasOwn(schema[table], key)));
  prepare(`INSERT INTO ${quote(table)} (${keys.map(quote).join(",")},_extra) VALUES (${keys.map(() => "?").join(",")},?)`).run(...keys.map((key) => encode(key, row[key])), JSON.stringify(extra));
  return decode(prepare(`SELECT * FROM ${quote(table)} WHERE id=?`).get(row.id));
}
function createSchema() {
  const metadataExists = db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='local_meta'").get();
  if (metadataExists) {
    const stored = db.prepare("SELECT value FROM local_meta WHERE key='schema_version'").get();
    if (stored && stored.value !== "1") throw new Error("Versi penyimpanan ini belum didukung. Gunakan versi aplikasi yang sesuai.");
  }
  for (const [table, columns] of Object.entries(schema)) {
    const fields = Object.entries(columns).map(([key, type]) => `${quote(key)} ${type}${key === "id" ? " PRIMARY KEY" : ""}${table === "project_sheets" && key === "revision" ? " NOT NULL DEFAULT 0" : ""}`);
    fields.push("_extra TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(_extra))");
    for (const [key, target] of Object.entries(relations[table] || {})) {
      fields.push(`FOREIGN KEY (${quote(key)}) REFERENCES ${quote(target)}(id)${["project_id", "ahs_id"].includes(key) ? " ON DELETE CASCADE" : ""}`);
    }
    for (const keys of unique[table] || []) fields.push(`UNIQUE (${keys.map(quote).join(",")})`);
    db.exec(`CREATE TABLE IF NOT EXISTS ${quote(table)} (${fields.join(",")}) STRICT`);
    for (const key of ["project_id", "ahs_id", "name", "updated_at"]) {
      if (columns[key]) db.exec(`CREATE INDEX IF NOT EXISTS ${table}_${key}_idx ON ${quote(table)} (${quote(key)})`);
    }
  }
  db.exec("CREATE TABLE IF NOT EXISTS local_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS migration_archive (id TEXT PRIMARY KEY, source_table TEXT NOT NULL, reason TEXT NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json))); ");
  db.prepare("INSERT OR IGNORE INTO local_meta VALUES ('schema_version','1')").run();
  if (!db.prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name='volume'").get()) db.exec("ALTER TABLE projects ADD COLUMN volume REAL");
}
function migrate(seed) {
  if (db.prepare("SELECT value FROM local_meta WHERE key='migration'").get()) return;
  const source = workerData.legacyPath;
  let data = seed;
  let checksum = null;
  if (source && existsSync(source)) {
    const raw = readFileSync(source, "utf8");
    data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.projects)) throw new Error("Berkas data lama tidak lengkap. Pemulihan diperlukan.");
    for (const rows of Object.values(data)) if (!Array.isArray(rows)) throw new Error("Berkas data lama tidak valid.");
    checksum = createHash("sha256").update(raw).digest("hex");
    const target = join(workerData.backupDir, `legacy-${checksum}.json`);
    if (!existsSync(target)) {
      const temporary = join(workerData.backupDir, `legacy-pending-${randomUUID()}.json`);
      writeFileSync(temporary, raw, { flag: "wx", mode: 0o600 });
      try {
        try { linkSync(temporary, target); }
        catch (error) { if (error.code !== "EEXIST") throw error; }
      } finally { unlinkSync(temporary); }
    }
    if (createHash("sha256").update(readFileSync(target)).digest("hex") !== checksum) throw new Error("Cadangan data tidak dapat diverifikasi.");
    const active = new Map((data.projects || []).map((project) => [project.id, project.active_ahs_id]));
    const volumeByProject = new Map();
    for (const row of data.ahs || []) {
      if (row.volume == null || active.get(row.project_id) && active.get(row.project_id) !== row.id) continue;
      if (!volumeByProject.has(row.project_id)) volumeByProject.set(row.project_id, row.volume);
    }
    data.projects = data.projects.map((project) => ({ ...project, volume: project.volume ?? volumeByProject.get(project.id) ?? null }));
  }
  const report = { checksum, imported: {}, archived: {}, createdAt: new Date().toISOString() };
  if (db.prepare("SELECT value FROM local_meta WHERE key='migration'").get()) return;
  {
    const order = ["profiles", "markets", "vendors", "products", "customers", "calculation_templates", "formula_registry", "projects", "project_members", "project_vendors", "ahs", "ahs_cost_items", "vendor_prices", "project_sheets"];
    for (const table of [...order, ...Object.keys(data).filter((key) => !order.includes(key))]) {
      report.imported[table] = 0; report.archived[table] = 0;
      for (const row of data[table] || []) {
        try {
          if (!schema[table]) throw new Error("Tabel lama disimpan sebagai arsip");
          if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Baris tidak valid");
          insert(table, row);
          report.imported[table]++;
        } catch (error) {
          db.prepare("INSERT INTO migration_archive VALUES (?,?,?,?)").run(randomUUID(), table, String(error.message), JSON.stringify(row));
          report.archived[table]++;
        }
      }
      if ((data[table] || []).length !== report.imported[table] + report.archived[table]) throw new Error("Jumlah baris migrasi berbeda");
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Relasi data tidak valid");
    db.prepare("INSERT INTO local_meta VALUES ('migration',?)").run(JSON.stringify(report));
  }
}
function migrateAhs() {
  if (db.prepare("SELECT value FROM local_meta WHERE key='ahs_removed'").get()) return;
  const hasAhs = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ahs'").get();
  if (hasAhs) {
    for (const project of db.prepare("SELECT id,volume,active_ahs_id FROM projects").all()) {
      if (project.volume != null) continue;
      const rows = db.prepare("SELECT id,volume FROM ahs WHERE project_id=? ORDER BY created_at DESC,id DESC").all(project.id);
      const chosen = rows.find((row) => row.id === project.active_ahs_id) ?? rows[0];
      if (chosen?.volume != null) db.prepare("UPDATE projects SET volume=? WHERE id=?").run(chosen.volume, project.id);
    }
  }
  for (const row of db.prepare("SELECT project_sheets.id,doc,projects.volume FROM project_sheets JOIN projects ON projects.id=project_sheets.project_id").all()) {
    const doc = JSON.parse(row.doc);
    db.prepare("UPDATE project_sheets SET doc=? WHERE id=?").run(JSON.stringify(stripAhsFromDocument(doc, row.volume)), row.id);
  }
  db.exec("DROP TRIGGER IF EXISTS active_ahs_update; DROP TRIGGER IF EXISTS active_ahs_delete; DROP TABLE IF EXISTS ahs_cost_items; DROP TABLE IF EXISTS ahs;");
  if (db.prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name='active_ahs_id'").get()) db.exec("ALTER TABLE projects DROP COLUMN active_ahs_id");
  db.prepare("INSERT INTO local_meta VALUES ('ahs_removed',?)").run(new Date().toISOString());
}
async function makeBackup(reason = "manual") {
  const path = join(workerData.backupDir, `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}-${reason.replace(/[^a-z0-9-]/gi, "")}.sqlite`);
  await backup(db, path);
  chmodSync(path, 0o600);
  return path;
}
let initStage = "folders";
try {
  mkdirSync(dirname(workerData.path), { recursive: true, mode: 0o700 });
  mkdirSync(workerData.backupDir, { recursive: true, mode: 0o700 });
  initStage = "open";
  db = new DatabaseSync(workerData.path, { timeout: 5000 });
  chmodSync(workerData.path, 0o600);
  initStage = "pragmas";
  db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  for (let attempt = 0; attempt < 8; attempt++) {
    try { db.exec("PRAGMA journal_mode=WAL;"); break; }
    catch (error) {
      if (!/locked|busy/i.test(error.message) || attempt === 7) throw error;
      Atomics.wait(initPause, 0, 0, 10 * (attempt + 1));
    }
  }
  db.exec("PRAGMA synchronous=FULL;");
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ahs'").get()) {
    const safetyPath = await makeBackup("before-ahs-removal");
    const safety = new DatabaseSync(safetyPath, { readOnly: true });
    try {
      if (safety.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Cadangan SQLite tidak valid");
      for (const table of ["projects", "ahs", "ahs_cost_items", "project_sheets", "project_vendors", "vendor_prices"]) {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
        const sourceCount = db.prepare(`SELECT COUNT(*) AS count FROM ${quote(table)}`).get().count;
        const backupCount = safety.prepare(`SELECT COUNT(*) AS count FROM ${quote(table)}`).get().count;
        if (sourceCount !== backupCount) throw new Error(`Cadangan ${table} tidak lengkap`);
      }
    } finally { safety.close(); }
  }
  initStage = "begin";
  db.exec("BEGIN IMMEDIATE");
  try {
    initStage = "schema";
    createSchema();
    initStage = "migration";
    migrate(workerData.seed);
    migrateAhs();
    initStage = "commit";
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  initStage = "daily backup";
  const day = new Date().toISOString().slice(0, 10);
  const last = db.prepare("SELECT value FROM local_meta WHERE key='backup_day'").get();
  if (last?.value !== day) {
    await makeBackup("daily");
    db.prepare("INSERT OR REPLACE INTO local_meta VALUES ('backup_day',?)").run(day);
  }
} catch (error) { initError = new Error(`${initStage}: ${error.message}`); }

function whereSql(table, options, values) {
  function filter(f) {
    const key = column(table, f.column);
    if (f.op === "in") {
      if (!Array.isArray(f.value)) throw new Error("Invalid list");
      if (!f.value.length) return "0";
      values.push(...f.value.map((v) => encode(f.column, v)));
      return `${key} IN (${f.value.map(() => "?").join(",")})`;
    }
    if (f.op === "is" && f.value === null) return `${key} IS NULL`;
    const ops = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", is: "IS", ilike: "LIKE" };
    if (!ops[f.op]) throw new Error("Unknown operator");
    values.push(encode(f.column, f.value));
    return f.op === "ilike" ? `LOWER(${key}) LIKE LOWER(?)` : `${key} ${ops[f.op]} ?`;
  }
  const parts = (options.where || []).map(filter);
  if (options.or?.length) parts.push(`(${options.or.map(filter).join(" OR ")})`);
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}
async function dispatch({ op, table, options = {}, values, id, patch, reason }) {
  if (op === "close") { db?.close(); return; }
  if (initError) throw initError;
  if (!db.isTransaction && ["begin", "insert", "update", "remove"].includes(op)) {
    const day = new Date().toISOString().slice(0, 10);
    if (db.prepare("SELECT value FROM local_meta WHERE key='backup_day'").get()?.value !== day) {
      await makeBackup("daily");
      db.prepare("INSERT OR REPLACE INTO local_meta VALUES ('backup_day',?)").run(day);
    }
  }
  if (op === "begin") { db.exec("BEGIN IMMEDIATE"); return; }
  if (op === "commit") { db.exec("COMMIT"); return; }
  if (op === "rollback") { if (db.isTransaction) db.exec("ROLLBACK"); return; }
  if (op === "backup") return makeBackup(reason);
  checkTable(table);
  if (op === "insert") return insert(table, values);
  if (op === "select") {
    const params = [];
    const where = whereSql(table, options, params);
    const count = prepare(`SELECT COUNT(*) AS count FROM ${quote(table)}${where}`).get(...params).count;
    const order = options.order?.length ? ` ORDER BY ${options.order.map((o) => `${column(table, o.column)} ${o.ascending === false ? "DESC" : "ASC"}`).join(",")}` : "";
    let range = "";
    if (options.range) { range = " LIMIT ? OFFSET ?"; params.push(options.range.to - options.range.from + 1, options.range.from); }
    else if (options.limit !== undefined) { range = " LIMIT ?"; params.push(options.limit); }
    return { rows: prepare(`SELECT * FROM ${quote(table)}${where}${order}${range}`).all(...params).map(decode), count };
  }
  if (op === "update") {
    const raw = prepare(`SELECT * FROM ${quote(table)} WHERE id=?`).get(id);
    if (!raw) throw new Error("Data tidak ditemukan");
    const row = { ...decode(raw), ...patch, id, updated_at: new Date().toISOString() };
    const keys = Object.keys(patch).filter((key) => Object.hasOwn(schema[table], key) && key !== "id");
    if (!keys.includes("updated_at")) keys.push("updated_at");
    const extra = Object.fromEntries(Object.entries(row).filter(([key]) => !Object.hasOwn(schema[table], key)));
    prepare(`UPDATE ${quote(table)} SET ${keys.map((key) => `${quote(key)}=?`).join(",")},_extra=? WHERE id=?`).run(...keys.map((key) => encode(key, row[key])), JSON.stringify(extra), id);
    return decode(prepare(`SELECT * FROM ${quote(table)} WHERE id=?`).get(id));
  }
  if (op === "remove") { prepare(`DELETE FROM ${quote(table)} WHERE id=?`).run(id); return; }
  throw new Error("Unknown operation");
}
let queue = Promise.resolve();
parentPort.on("message", (message) => {
  queue = queue.then(async () => {
    try { parentPort.postMessage({ requestId: message.requestId, result: await dispatch(message) }); }
    catch (error) { parentPort.postMessage({ requestId: message.requestId, error: error.message, code: error.code }); }
  });
});
