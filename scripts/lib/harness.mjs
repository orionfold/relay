// Shared launch/CLI helpers for the customer-fidelity harnesses.
//
// Extracted verbatim from scripts/npx-prod-smoke.mjs (PLG-S / S1) so the CI
// smoke and the operator-facing staging driver (scripts/staging.mjs) drive the
// installed CLI through ONE code path and can never drift. Both import from
// here; neither redefines these.
//
// Everything below is customer-fidelity by construction: launchCli /
// runCliCommand zero out RELAY_DEV_MODE + RELAY_INSTANCE_MODE so a run against
// the packed tarball behaves like a real `npx orionfold-relay` first-run, never
// the dev repo.
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

/** The package name the tarball installs under; the installed bin lives at
 *  <installDir>/node_modules/<PACKAGE_NAME>/dist/cli.js. */
export const PACKAGE_NAME = "orionfold-relay";

/** Spawn a command inheriting stdio; resolve on exit 0, reject otherwise. */
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reserve a free loopback port by binding :0 and releasing it. */
export function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      server.close((err) => (err ? reject(err) : resolve(address.port)));
    });
  });
}

/** Poll a URL until it returns HTTP 200 (resolves the body) or the deadline. */
export async function waitForHttpOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response yet";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.status === 200) return await response.text();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url} to return HTTP 200 (last: ${lastError})`);
}

/** Poll a getOutput() accumulator until `pattern` matches or the deadline. */
export async function waitForOutput(getOutput, pattern, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(getOutput())) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label} (${pattern}) in CLI output.`);
}

/** SIGTERM a child, escalating to SIGKILL after 5s if it hasn't exited. */
export async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

/**
 * Launch the installed CLI as a long-lived server (customer-fidelity env).
 * Returns { child, getOutput } where getOutput() is the accumulated
 * stdout+stderr. Callers own the child's lifetime (stopChild).
 */
export function launchCli({ installDir, dataDir, port, artifactUrl, hostname, extraEnv }) {
  const cliPath = path.join(installDir, "node_modules", PACKAGE_NAME, "dist", "cli.js");
  const args = [cliPath, "--no-open", "--port", String(port)];
  if (hostname) args.push("--hostname", hostname);
  const child = spawn(process.execPath, args, {
    cwd: installDir,
    env: {
      ...process.env,
      RELAY_DATA_DIR: dataDir,
      RELAY_BUILD_ARTIFACT_URL: artifactUrl,
      // Never inherit the repo's dev-mode gate; this simulates a customer.
      RELAY_DEV_MODE: "",
      RELAY_INSTANCE_MODE: "",
      ...(extraEnv ?? {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { child, getOutput: () => output };
}

/** Run an installed-CLI subcommand (license/pack verbs) and capture output. */
export function runCliCommand({ installDir, dataDir, args, extraEnv }) {
  const cliPath = path.join(installDir, "node_modules", PACKAGE_NAME, "dist", "cli.js");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: installDir,
      env: {
        ...process.env,
        RELAY_DATA_DIR: dataDir,
        RELAY_DEV_MODE: "",
        RELAY_INSTANCE_MODE: "",
        ...(extraEnv ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("exit", (code) => resolve({ code, output }));
  });
}

/** Throw a labeled assertion error unless `condition` holds. */
export function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}
