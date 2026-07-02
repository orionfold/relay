// PLG-S staging driver — one command for a customer-identical Relay first-run
// (spec: strategy _SPECS/relay-staging-harness.md, S1).
//
// Unlike scripts/npx-prod-smoke.mjs (ephemeral mkdtemp, assert-then-exit), this
// is a PERSISTENT, operator-drivable environment: setup packs + installs into a
// fixed scratch dir, launch holds the server open (detached) for the operator +
// skills to poke, teardown wipes everything and asserts the default ~/.relay was
// never touched. It shares launchCli / waitForHttpOk / stopChild etc. with the
// smoke via scripts/lib/harness.mjs so the two harnesses can never drift.
//
// Verbs:
//   setup    — npm run build:cli + npm pack → install the .tgz into the
//              persistent scratch dir (simulates the npx fetch).
//   launch   — start the installed bin against ~/.relay-staging on :3199 with
//              RELAY_STAGING=true + a file:// artifact mirror; poll HTTP 200;
//              assert the fresh-customer fidelity checklist; HOLD OPEN (detached)
//              and print how to reach + tear down the instance.
//   status   — report whether a staging instance is currently up (PID + port).
//   teardown — stop the held-open instance, wipe ~/.relay-staging + scratch +
//              .tgz, and assert ~/.relay/relay.db mtime is unchanged (R4).
//
// Fresh-install fidelity is inherited from harness.launchCli, which zeroes
// RELAY_DEV_MODE + RELAY_INSTANCE_MODE; the empty non-git scratch cwd trips the
// no_git gate (src/lib/instance/detect.ts) so bootstrap never runs — real
// customer behavior for free (spec D1).
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assert, PACKAGE_NAME, run, sleep, waitForHttpOk } from "./lib/harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf-8"));

// ---- Fixed environment locations (spec §4.1) ----
const HOME = os.homedir();
const STAGING_HOME = path.join(HOME, "relay-staging"); // scratch root + state
const SCRATCH_DIR = path.join(STAGING_HOME, "run"); // empty non-git install cwd
const STATE_FILE = path.join(STAGING_HOME, "state.json"); // cross-invocation state
const DATA_DIR = path.join(HOME, ".relay-staging"); // isolated data dir
const DEFAULT_DB = path.join(HOME, ".relay", "relay.db"); // the dir we must NOT touch
const PORT = 3199;
const READY_TIMEOUT_MS = 180_000; // prod first-run may extract the artifact

// The customer never has the repo's .git; the installed CLI must never see
// dev-mode. launchCli already zeroes these — assert the invariant loudly too.
const CUSTOMER_ENV = { RELAY_DEV_MODE: "", RELAY_INSTANCE_MODE: "" };

function log(msg) {
  console.log(`[staging] ${msg}`);
}

function tarballPath() {
  return path.join(repoRoot, `${PACKAGE_NAME}-${pkg.version}.tgz`);
}

function artifactPath() {
  return path.join(repoRoot, "dist-artifacts", `relay-next-build-${pkg.version}.tgz`);
}

function readState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  mkdirSync(STAGING_HOME, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function clearState() {
  rmSync(STATE_FILE, { force: true });
}

/** True if a PID is a live process we can signal. */
function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists but not ours to signal
  }
}

/**
 * R4 isolation fingerprint: a sha256 of the DEFAULT ~/.relay/relay.db content.
 *
 * We hash CONTENT, not mtime. The installed CLI's module-load legacy migration
 * (migrateLegacyData → opens ~/.relay/relay.db) and — far more commonly — the
 * operator's own concurrent dev server against ~/.relay can bump the default
 * DB's mtime without staging writing a single app row. The invariant we
 * actually protect is "no staging app-data leaks into ~/.relay", and content
 * hashing catches exactly that while ignoring benign mtime touches. Returns null
 * if the DB doesn't exist (a machine that never ran Relay in the default dir).
 */
function fingerprintDefaultDb() {
  if (!existsSync(DEFAULT_DB)) return null;
  return createHash("sha256").update(readFileSync(DEFAULT_DB)).digest("hex");
}

// ------------------------------------------------------------------ setup ----
async function setup() {
  assert(
    existsSync(artifactPath()),
    `prebuilt artifact missing at ${artifactPath()}\n` +
      `  → build it once for this version:\n` +
      `      npm run build && node scripts/build-prebuilt-artifact.mjs\n` +
      `  (the file:// mirror is per-version; ${pkg.version} has none yet)`,
  );
  assert(
    existsSync(`${artifactPath()}.sha256`),
    `checksum sidecar missing at ${artifactPath()}.sha256 — rebuild the artifact`,
  );

  // Refuse to clobber a live instance's install out from under it.
  const state = readState();
  if (state && isAlive(state.pid)) {
    throw new Error(
      `a staging instance is already running (pid ${state.pid}, port ${state.port}).\n` +
        `  → run 'node scripts/staging.mjs teardown' first.`,
    );
  }

  // Pack the npm tarball exactly as publish would.
  log("Packing the working tree (npm run build:cli + npm pack)...");
  await run("npm", ["run", "build:cli"], { cwd: repoRoot });
  await run("npm", ["pack"], { cwd: repoRoot });
  assert(existsSync(tarballPath()), `npm pack did not produce ${tarballPath()}`);

  // Fresh, empty, NON-git scratch dir (trips the no_git fresh-customer gate).
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
  mkdirSync(SCRATCH_DIR, { recursive: true });
  writeFileSync(
    path.join(SCRATCH_DIR, "package.json"),
    JSON.stringify({ name: "relay-staging-install", private: true }, null, 2),
  );

  log(`Installing the tarball into ${SCRATCH_DIR} (this mirrors npx; takes a few minutes)...`);
  await run("npm", ["install", "--no-audit", "--no-fund", tarballPath()], { cwd: SCRATCH_DIR });

  writeState({
    version: pkg.version,
    scratchDir: SCRATCH_DIR,
    dataDir: DATA_DIR,
    tarball: tarballPath(),
    artifact: artifactPath(),
    installedAt: new Date().toISOString(),
    pid: null,
    port: null,
  });
  log(`Setup complete. Version ${pkg.version} installed. Next: node scripts/staging.mjs launch`);
}

// ----------------------------------------------------------------- launch ----
async function launch() {
  const state = readState();
  assert(state?.scratchDir, `no staging install found — run 'node scripts/staging.mjs setup' first`);
  const cliPath = path.join(state.scratchDir, "node_modules", PACKAGE_NAME, "dist", "cli.js");
  assert(existsSync(cliPath), `installed CLI missing at ${cliPath} — re-run setup`);

  if (isAlive(state.pid)) {
    throw new Error(
      `a staging instance is already up (pid ${state.pid}, port ${state.port}).\n` +
        `  → 'node scripts/staging.mjs teardown' to stop it, or reach it at ` +
        `http://127.0.0.1:${state.port}/`,
    );
  }

  // R4 baseline: fingerprint the default-dir DB CONTENT before launch so
  // teardown can prove no staging app-data leaked into ~/.relay (see
  // fingerprintDefaultDb for why content, not mtime).
  const dbFingerprintBefore = fingerprintDefaultDb();

  mkdirSync(DATA_DIR, { recursive: true });
  const artifactUrl = pathToFileURL(state.artifact).href;

  log(`Launching the installed CLI on :${PORT} (data dir ${DATA_DIR})...`);
  // Detached + unref'd so the server outlives THIS process (hold-open). We
  // redirect the child's stdout/stderr straight into a log-file fd rather than
  // piping through this (soon-to-exit) parent: no pipe backpressure once we
  // unref, and the operator/skills can tail the log after this process returns.
  const logFile = path.join(STAGING_HOME, "server.log");
  writeFileSync(logFile, ""); // truncate previous run
  const logFd = openSync(logFile, "a");
  const child = spawn(
    process.execPath,
    [cliPath, "--no-open", "--port", String(PORT), "--data-dir", DATA_DIR],
    {
      cwd: state.scratchDir,
      env: {
        ...process.env,
        RELAY_DATA_DIR: DATA_DIR,
        RELAY_BUILD_ARTIFACT_URL: artifactUrl,
        RELAY_STAGING: "true",
        ...CUSTOMER_ENV,
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );
  closeSync(logFd); // the child holds its own dup'd fd now

  // Persist the PID immediately so a crash mid-readiness is still tearable.
  writeState({ ...state, pid: child.pid, port: PORT, dbFingerprintBefore, launchedAt: new Date().toISOString() });

  try {
    await waitForHttpOk(`http://127.0.0.1:${PORT}/`, READY_TIMEOUT_MS);
  } catch (err) {
    // Surface the server log so a readiness failure is never silent.
    const tail = existsSync(logFile) ? readFileSync(logFile, "utf-8").slice(-4000) : "(no log)";
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    clearState();
    throw new Error(`staging instance never became ready:\n${err.message}\n\n--- server log tail ---\n${tail}`);
  }

  // Fresh-customer fidelity checklist (spec §4.1) — assert against the banner.
  const serverLog = readFileSync(logFile, "utf-8");
  assertFidelity(serverLog);

  // Detach: let the server run without keeping this CLI process alive.
  child.unref();

  log(`Ready. Staging instance is UP:`);
  log(`  URL:       http://127.0.0.1:${PORT}/`);
  log(`  data dir:  ${DATA_DIR}`);
  log(`  server log: ${path.join(STAGING_HOME, "server.log")}`);
  log(`  RELAY_STAGING=true (seed/clear open); default ~/.relay untouched.`);
  log(`Stop it with: node scripts/staging.mjs teardown`);
}

/** Assert the banner reads as a real fresh customer, not the dev repo. */
function assertFidelity(serverLog) {
  // The banner must state a Mode; production is expected off the file:// mirror,
  // but we don't hard-fail on a dev fallback here (that's the smoke's Case C) —
  // we DO hard-fail if the dev-repo gate leaked in.
  assert(
    !/dev-mode|RELAY_DEV_MODE|relay-dev-mode/i.test(serverLog),
    "fidelity breach: dev-mode markers present — the customer env leaked the repo's dev gate",
  );
}

// ----------------------------------------------------------------- status ----
async function status() {
  const state = readState();
  if (!state) {
    log("No staging environment. Run 'node scripts/staging.mjs setup'.");
    return;
  }
  if (isAlive(state.pid)) {
    log(`UP — pid ${state.pid}, http://127.0.0.1:${state.port}/ (version ${state.version})`);
  } else if (state.scratchDir && existsSync(state.scratchDir)) {
    log(`INSTALLED but not running (version ${state.version}). Launch: node scripts/staging.mjs launch`);
  } else {
    log("State file present but no install. Run setup.");
  }
}

// --------------------------------------------------------------- teardown ----
async function teardown() {
  const state = readState();
  const dbFingerprintBefore = state?.dbFingerprintBefore ?? null;

  // 1. Stop the held-open server (by PID from state — we can't reach the child
  //    object across process boundaries).
  if (state && isAlive(state.pid)) {
    log(`Stopping staging instance (pid ${state.pid})...`);
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    // Give it up to 5s to exit, then SIGKILL.
    const deadline = Date.now() + 5_000;
    while (isAlive(state.pid) && Date.now() < deadline) await sleep(200);
    if (isAlive(state.pid)) {
      try {
        process.kill(state.pid, "SIGKILL");
      } catch {
        /* raced */
      }
    }
  } else {
    log("No running instance to stop.");
  }

  // 2. Wipe the isolated data dir, scratch install, and the packed tarball.
  log("Wiping ~/.relay-staging, scratch install, and the packed tarball...");
  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
  if (state?.tarball) rmSync(state.tarball, { force: true });
  else rmSync(tarballPath(), { force: true });
  clearState();

  // 3. R4 isolation invariant: the default ~/.relay DB CONTENT must be
  //    unchanged across the run — no staging app-data may leak into it. We
  //    compare content hashes, not mtime: the installed CLI's module-load
  //    legacy migration and the operator's own concurrent dev server can bump
  //    ~/.relay's mtime without staging writing a single row, and those are not
  //    isolation breaches (see fingerprintDefaultDb).
  if (dbFingerprintBefore !== null) {
    const dbFingerprintAfter = fingerprintDefaultDb();
    assert(
      dbFingerprintAfter === dbFingerprintBefore,
      `ISOLATION BREACH (R4): ~/.relay/relay.db CONTENT changed during the staging run\n` +
        `  before sha256: ${dbFingerprintBefore}\n  after  sha256: ${dbFingerprintAfter}\n` +
        `  the staging instance wrote data into the DEFAULT data dir — investigate before\n` +
        `  trusting this run (staging must only ever write ~/.relay-staging).`,
    );
    log(`Isolation invariant holds (R4): ~/.relay/relay.db content unchanged.`);
  } else {
    log("No pre-launch DB fingerprint recorded (setup-only teardown); isolation check skipped.");
  }

  log("Teardown complete. Environment wiped clean.");
}

// -------------------------------------------------------------------- main ---
const VERBS = { setup, launch, status, teardown };

async function main() {
  const verb = process.argv[2];
  const fn = VERBS[verb];
  if (!fn) {
    console.error(`Usage: node scripts/staging.mjs <setup|launch|status|teardown>`);
    process.exit(2);
  }
  await fn();
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
