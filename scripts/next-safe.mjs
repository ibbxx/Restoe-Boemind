#!/usr/bin/env node

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { open, rm } from "node:fs/promises";
import net from "node:net";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const command = process.argv[2] ?? "dev";
const nextArgs = process.argv.slice(3);
if (command === "dev" || command === "start") {
  const host = nextArgs.findIndex((arg) => arg === "--hostname" || arg === "-H");
  if (host >= 0 && !["127.0.0.1", "localhost", "::1"].includes(nextArgs[host + 1])) {
    throw new Error("Aplikasi lokal hanya dapat dibuka dari komputer ini.");
  }
  if (nextArgs.some((arg) => arg.startsWith("--hostname="))) throw new Error("Gunakan --hostname localhost.");
  if (host < 0) nextArgs.push("--hostname", "127.0.0.1");
}
const defaultPort = Number(process.env.PORT ?? 3000);
const lockPath = resolve(root, ".next-safe.lock");

function readPort(args) {
  const portIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
  const inlinePort = args.find((arg) => arg.startsWith("--port="));
  const value = inlinePort?.split("=", 2)[1] ?? (portIndex >= 0 ? args[portIndex + 1] : undefined);
  return value ? Number(value) : defaultPort;
}

function isPortFree(port) {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.once("error", (error) => resolvePort(error.code === "EADDRNOTAVAIL"));
    server.listen({ port, host: "::", exclusive: true }, () => {
      server.close(() => resolvePort(true));
    });
  });
}

async function assertPortFree(port) {
  if (await isPortFree(port)) return;
  console.error(`\nPort ${port} sedang dipakai proses lain.`);
  console.error("Hentikan server lama sebelum menjalankan Next.js lagi:");
  console.error(`  lsof -nP -iTCP:${port} -sTCP:LISTEN`);
  console.error("Lalu jalankan ulang command ini. Cache .next tidak akan dihapus selama server lama aktif.\n");
  try {
    unlinkSync(lockPath);
  } catch {
    // Nothing to clean when the lock was removed by a previous run.
  }
  process.exit(1);
}

async function acquireLock() {
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, command, port: readPort(nextArgs) }));
    await handle.close();
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  let existingPid = null;
  try {
    existingPid = Number(JSON.parse(readFileSync(lockPath, "utf8")).pid);
    process.kill(existingPid, 0);
  } catch {
    if (existingPid === process.pid) throw new Error("Could not acquire Next.js process lock.");
    unlinkSync(lockPath);
    return acquireLock();
  }

  console.error(`\nNext.js guard mendeteksi proses project lain (PID ${existingPid}).`);
  console.error("Hentikan proses tersebut sebelum menjalankan dev/build/start lain.\n");
  process.exit(1);
}

async function cleanGeneratedCache() {
  const nextDir = resolve(root, ".next");
  if (existsSync(nextDir)) {
    await rm(nextDir, { recursive: true, force: true });
    console.log("Cleared generated .next cache.");
  }
}

if (!["dev", "build", "start"].includes(command)) {
  console.error(`Unknown Next command: ${command}`);
  process.exit(1);
}

const port = readPort(nextArgs);
await acquireLock();
// Every command in this repository writes to the same `.next` directory.
// Always check the conventional dev port as well as an explicitly requested
// port, otherwise `npm run dev -- --port 3100` could delete chunks underneath
// a still-running server on port 3000.
for (const checkedPort of [...new Set([3000, port])]) {
  await assertPortFree(checkedPort);
}

// A clean cache is safe only after the port check proves there is no active
// Next process writing this project's generated artifacts.
if (command === "dev" || command === "build") await cleanGeneratedCache();

const nextBin = resolve(root, "node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, command, ...nextArgs], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

const releaseLock = () => {
  try {
    unlinkSync(lockPath);
  } catch {
    // Lock may already have been cleaned up by a previous signal.
  }
};
process.on("exit", releaseLock);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  releaseLock();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
