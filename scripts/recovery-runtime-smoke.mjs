import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import Database from "better-sqlite3";

const root = mkdtempSync(join(tmpdir(), "relay-recovery-smoke-"));
const dataDir = join(root, "cell-data");
const destination = join(root, "off-host-bundles");
const keyFile = join(root, "customer-keys", "smoke-cell.key");
const restored = join(root, "restored-cell");
const port = await availablePort();
let server;

try {
  server = spawn("npm", ["run", "dev", "--", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    env: { ...process.env, RELAY_DATA_DIR: dataDir, RELAY_CELL_ID: "smoke-cell", RELAY_DEV_MODE: "true" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let serverTail = "";
  for (const stream of [server.stdout, server.stderr]) stream?.on("data", (chunk) => { serverTail = `${serverTail}${chunk}`.slice(-6000); });
  await waitFor(`http://127.0.0.1:${port}/api/health/ready`);
  stopServer(server);
  await waitForExit(server);
  server = undefined;

  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  writeFileSync(join(dataDir, "uploads", "host-loss.txt"), "survived host loss");
  writeFileSync(join(dataDir, ".keyfile"), randomBytes(32), { mode: 0o600 });
  run(["recovery", "key", "create", "--out", keyFile]);
  run(["auth", "bootstrap", "--data-dir", dataDir]);
  const created = run([
    "recovery", "create", "--destination", destination, "--key-file", keyFile,
    "--cell-id", "smoke-cell", "--data-dir", dataDir,
  ]);
  const bundlePath = created.match(/^Published: (.+)$/m)?.[1];
  if (!bundlePath || !existsSync(bundlePath)) throw new Error("recovery create did not publish a bundle");
  run(["recovery", "verify", "--bundle", bundlePath, "--key-file", keyFile, "--cell-id", "smoke-cell", "--data-dir", dataDir]);

  rmSync(dataDir, { recursive: true, force: true });
  run([
    "recovery", "restore", "--bundle", bundlePath, "--key-file", keyFile,
    "--target-data-dir", restored, "--cell-id", "smoke-cell", "--data-dir", dataDir,
  ]);
  if (readFileSync(join(restored, "uploads", "host-loss.txt"), "utf8") !== "survived host loss") {
    throw new Error("restored file content did not match");
  }
  if (!existsSync(join(restored, ".keyfile")) || !existsSync(join(restored, "relay-auth.db"))) {
    throw new Error("restored Cell is missing secret or auth state");
  }
  const db = new Database(join(restored, "relay.db"), { readonly: true, fileMustExist: true });
  try {
    if (db.pragma("quick_check", { simple: true }) !== "ok") throw new Error("restored database failed quick_check");
  } finally { db.close(); }
  console.log(JSON.stringify({
    ok: true,
    cellId: "smoke-cell",
    checks: ["live SQLite bootstrap", "encrypted create", "verify", "destroy source", "empty-root restore", "DB/file/auth/secret integrity"],
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (server) stopServer(server);
  rmSync(root, { recursive: true, force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, ["dist/cli.js", ...args], {
    cwd: process.cwd(), encoding: "utf8", env: { ...process.env, RELAY_DEV_MODE: "true", RELAY_CELL_ID: "smoke-cell" },
  });
  if (result.status !== 0) throw new Error(`relay ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function stopServer(child) {
  if (child.exitCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch { child.kill("SIGTERM"); }
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { stopServer(child); resolve(); }, 5000);
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.on("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("port allocation failed")));
    });
  });
}

async function waitFor(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready: ${url}`);
}
