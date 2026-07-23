#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const envFile = join(root, ".env.local");
const sentinel = join(root, ".git", "relay-dev-mode");
const dataDir = resolve(root, ".relay-dev-data");
const isolatedHome = join(dataDir, "home");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");

assert(existsSync(join(root, ".git")), "fresh-clone smoke must run from a Git checkout");
assert(existsSync(envFile), "README replay must create .env.local before first boot");
assert(existsSync(sentinel), "README replay must create .git/relay-dev-mode before first boot");
assert(existsSync(nextBin), "run npm install/npm ci before the fresh-clone smoke");

const envText = readFileSync(envFile, "utf8").replace(/\r\n/g, "\n");
assert.match(envText, /^RELAY_DEV_MODE=true$/m);
assert.match(envText, /^RELAY_DATA_DIR=\.\/\.relay-dev-data$/m);

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

assert.notEqual(git(["show-ref", "--verify", "--quiet", "refs/heads/local"]).status, 0);
assert(!existsSync(join(root, ".git", "hooks", "pre-push")));

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(isolatedHome, { recursive: true });

const serverLogs = [];
let child;
let ollamaStub;

function reserveServer(handler) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer(handler);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolvePromise) => server.close(() => resolvePromise()));
}

async function waitForReady(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error(`Next dev exited early with ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Compilation/startup still in progress.
    }
    await delay(500);
  }
  throw new Error(`Next dev did not become ready within ${timeoutMs}ms`);
}

try {
  const portHolder = await reserveServer((_req, res) => res.end());
  const port = portHolder.address().port;
  await closeServer(portHolder);

  const cleanEnv = { ...process.env };
  for (const key of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "RELAY_INSTANCE_MODE",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CODEX_HOME",
  ]) {
    delete cleanEnv[key];
  }
  Object.assign(cleanEnv, {
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    RELAY_DATA_DIR: dataDir,
    RELAY_DEV_MODE: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    PATH: dirname(process.execPath),
    PORT: String(port),
  });

  child = spawn(process.execPath, [nextBin, "dev", "--turbopack", "-p", String(port)], {
    cwd: root,
    env: cleanEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => serverLogs.push(String(chunk)));
  child.stderr.on("data", (chunk) => serverLogs.push(String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  const home = await waitForReady(`${baseUrl}/`);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Orionfold Relay/);
  assert.match(homeHtml, /Community Edition/);

  const providersResponse = await fetch(`${baseUrl}/api/settings/providers`);
  assert.equal(providersResponse.status, 200);
  const providers = await providersResponse.json();
  assert.equal(providers.configuredProviderCount, 0);
  assert.equal(providers.providers.anthropic.configured, false);
  assert.equal(providers.providers.openai.configured, false);

  ollamaStub = await reserveServer((req, res) => {
    if (req.url === "/api/tags") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ models: [{ name: "relay-smoke", size: 1024, modified_at: "now" }] }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const ollamaPort = ollamaStub.address().port;
  const saveResponse = await fetch(`${baseUrl}/api/settings/ollama`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseUrl: `http://127.0.0.1:${ollamaPort}` }),
  });
  assert.equal(saveResponse.status, 200);

  const availableResponse = await fetch(`${baseUrl}/api/runtimes/ollama`);
  assert.equal(availableResponse.status, 200);
  const available = await availableResponse.json();
  assert.deepEqual(available.models.map((model) => model.name), ["relay-smoke"]);

  await closeServer(ollamaStub);
  ollamaStub = null;
  const unavailableResponse = await fetch(`${baseUrl}/api/runtimes/ollama`);
  assert.equal(unavailableResponse.status, 502);

  assert.notEqual(git(["show-ref", "--verify", "--quiet", "refs/heads/local"]).status, 0);
  assert(!existsSync(join(root, ".git", "hooks", "pre-push")));
  assert(!existsSync(join(root, ".git", ".relay-upgrade-check.lock")));
  const pushConfig = git(["config", "--get-regexp", "^branch\\..*\\.pushRemote$"]);
  assert.equal(pushConfig.stdout.trim(), "");

  const Database = (await import("better-sqlite3")).default;
  const database = new Database(join(dataDir, "relay.db"), { readonly: true });
  try {
    const instanceRows = database
      .prepare("SELECT key FROM settings WHERE key IN ('instance', 'instance.guardrails')")
      .all();
    assert.deepEqual(instanceRows, []);
  } finally {
    database.close();
  }

  process.stdout.write(
    `fresh-clone dev smoke passed (${process.platform}, Node ${process.version}, port ${port})\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.stderr.write("--- Next dev output ---\n");
  process.stderr.write(serverLogs.join(""));
  process.exitCode = 1;
} finally {
  await closeServer(ollamaStub);
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolvePromise) => child.once("exit", resolvePromise)),
      delay(5_000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
