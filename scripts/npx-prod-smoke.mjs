// End-to-end smoke for the npx production-build path
// (feat-ship-production-build-for-npx, #10). Modeled on the Tauri-era
// desktop-sidecar-smoke.mjs (172fedb1).
//
// Simulates a customer install in a clean temp dir:
//   npm pack → npm install <tarball> → node dist/cli.js
// with RELAY_BUILD_ARTIFACT_URL pointing at a local artifact (file://), so no
// network or GitHub Release is needed.
//
// Cases:
//   A. First run downloads + verifies + extracts the artifact, launches
//      `next start` (Mode: production), serves /, /chat, /tasks, /workflows,
//      serves a /_next/static asset, and never prints the dev-only
//      "Can't resolve" transport warning (#8) or spins up HMR (#7).
//   B. Second run (LAN bind --hostname 0.0.0.0): no re-download, still
//      production, and /_next/* serves to a cross-origin client — the
//      #13/#5/#6/#11/#12 class check (`next start` has no dev-origin gate).
//   L. License lifecycle (feat-license-lifecycle, PLG-1 Mode C buy-simulation):
//      `relay license add` with the REAL prod-signed fixture → activation
//      ceremony; `license status` valid; a premium pack installs with NO
//      --license-url (store consult); the launch banner reads "Licensed to";
//      seed/clear 404 without RELAY_STAGING; rm the license store → banner
//      reverts to Community Edition, the pack STAYS installed (D4), and
//      RELAY_STAGING=true opens seed/clear on the prod build (PLG-S).
//   C. Broken artifact URL: loud "Could not set up the production build"
//      warning and a working dev-mode fallback (the status-quo floor).
//
// Prereqs: `npm run build && node scripts/build-prebuilt-artifact.mjs`
// (CI runs both). The script runs `npm run build:cli` + `npm pack` itself.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf-8"));

const PROD_START_TIMEOUT_MS = 120_000;
const DEV_FALLBACK_TIMEOUT_MS = 300_000; // next dev compiles on demand — generous

const artifactArgIndex = process.argv.indexOf("--artifact");
const artifactPath =
  artifactArgIndex !== -1
    ? path.resolve(process.argv[artifactArgIndex + 1])
    : path.join(repoRoot, "dist-artifacts", `relay-next-build-${pkg.version}.tgz`);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      server.close((err) => (err ? reject(err) : resolve(address.port)));
    });
  });
}

async function waitForHttpOk(url, timeoutMs) {
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

async function waitForOutput(getOutput, pattern, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(getOutput())) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label} (${pattern}) in CLI output.`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

function launchCli({ installDir, dataDir, port, artifactUrl, hostname, extraEnv }) {
  const cliPath = path.join(installDir, "node_modules", "orionfold-relay", "dist", "cli.js");
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

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

/** Run an installed-CLI subcommand (license/pack verbs) and capture output. */
function runCliCommand({ installDir, dataDir, args }) {
  const cliPath = path.join(installDir, "node_modules", "orionfold-relay", "dist", "cli.js");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: installDir,
      env: {
        ...process.env,
        RELAY_DATA_DIR: dataDir,
        RELAY_DEV_MODE: "",
        RELAY_INSTANCE_MODE: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("exit", (code) => resolve({ code, output }));
  });
}

async function main() {
  assert(existsSync(artifactPath), `artifact missing at ${artifactPath} — run npm run build && node scripts/build-prebuilt-artifact.mjs`);
  assert(existsSync(`${artifactPath}.sha256`), `checksum sidecar missing at ${artifactPath}.sha256`);

  // Pack the npm tarball exactly as publish would.
  await run("npm", ["run", "build:cli"], { cwd: repoRoot });
  await run("npm", ["pack"], { cwd: repoRoot });
  const tarballPath = path.join(repoRoot, `orionfold-relay-${pkg.version}.tgz`);
  assert(existsSync(tarballPath), `npm pack did not produce ${tarballPath}`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "relay-npx-smoke-"));
  const installDir = path.join(workDir, "install");
  mkdirSync(installDir, { recursive: true });
  writeFileSync(
    path.join(installDir, "package.json"),
    JSON.stringify({ name: "relay-smoke-install", private: true }, null, 2),
  );

  console.log(`\n[smoke] Installing tarball into ${installDir} (this mirrors npx; takes a few minutes)...`);
  await run("npm", ["install", "--no-audit", "--no-fund", tarballPath], { cwd: installDir });

  const artifactUrl = pathToFileURL(artifactPath).href;

  // ---- Case A: first run — download, verify, extract, next start ----
  console.log("\n[smoke] Case A: first run → production mode");
  {
    const dataDir = path.join(workDir, "data-a");
    const port = await reserveLoopbackPort();
    const { child, getOutput } = launchCli({ installDir, dataDir, port, artifactUrl });
    try {
      await waitForOutput(getOutput, /Mode: production/, PROD_START_TIMEOUT_MS, "production banner");
      assert(/Downloading production build/.test(getOutput()), "first run should announce the download");

      const html = await waitForHttpOk(`http://127.0.0.1:${port}/`, PROD_START_TIMEOUT_MS);
      for (const route of ["/chat", "/tasks", "/workflows"]) {
        await waitForHttpOk(`http://127.0.0.1:${port}${route}`, 30_000);
      }

      // #7: production serves static assets, no HMR websocket endpoint.
      const assetMatch = html.match(/\/_next\/static\/[^"']+\.(?:js|css)/);
      assert(assetMatch, "homepage HTML should reference /_next/static assets");
      const asset = await fetch(`http://127.0.0.1:${port}${assetMatch[0]}`);
      assert(asset.status === 200, `/_next/static asset should serve (got ${asset.status})`);
      assert(!html.includes("webpack-hmr"), "production HTML must not wire up the HMR socket (#7)");

      // #8: the dev-only dynamic-import compile warning must be gone.
      assert(!getOutput().includes("Can't resolve"), "no <dynamic> resolve warning in production (#8)");
      assert(!getOutput().includes("Could not set up the production build"), "no fallback warning on the happy path");
    } finally {
      await stopChild(child);
    }
  }

  // ---- Case B: second run + LAN bind — cached, still production, no origin gate ----
  console.log("\n[smoke] Case B: second run, --hostname 0.0.0.0 → cross-origin /_next/*");
  {
    const dataDir = path.join(workDir, "data-a"); // same data dir: exercise the cache/no-op path
    const port = await reserveLoopbackPort();
    const { child, getOutput } = launchCli({
      installDir,
      dataDir,
      port,
      artifactUrl,
      hostname: "0.0.0.0",
    });
    try {
      await waitForOutput(getOutput, /Mode: production/, PROD_START_TIMEOUT_MS, "production banner");
      assert(!/Downloading production build/.test(getOutput()), "second run must not re-download");

      const html = await waitForHttpOk(`http://127.0.0.1:${port}/`, PROD_START_TIMEOUT_MS);
      const assetMatch = html.match(/\/_next\/static\/[^"']+\.(?:js|css)/);
      assert(assetMatch, "homepage HTML should reference /_next/static assets");
      // Simulate the Windows-browser→Alpine-VM LAN client: a cross-origin
      // request for a dev asset. In dev mode Next's origin gate blocks this
      // class (#13 et al.); `next start` must serve it.
      const crossOrigin = await fetch(`http://127.0.0.1:${port}${assetMatch[0]}`, {
        headers: {
          Origin: "http://192.168.99.99:3000",
          Referer: "http://192.168.99.99:3000/",
        },
      });
      assert(
        crossOrigin.status === 200,
        `cross-origin /_next/* must serve in production (got ${crossOrigin.status})`,
      );
    } finally {
      await stopChild(child);
    }
  }

  // ---- Case L: license lifecycle — the Mode C buy-simulation (PLG-1) ----
  console.log("\n[smoke] Case L: license lifecycle (redeem → ceremony → no-flag premium install → licensed banner → D4)");
  {
    const dataDir = path.join(workDir, "data-l");
    mkdirSync(dataDir, { recursive: true });

    // The "fulfilment email attachment": the real prod-signed fixture.
    const licenseSrc = path.join(
      repoRoot,
      "src/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json",
    );
    const licensePath = path.join(workDir, "my.license.json");
    writeFileSync(licensePath, readFileSync(licenseSrc));

    // 0. Unlicensed refusal: the REAL premium pack (relay-agency-pro, bundled
    //    in the tarball) must refuse by name with the license-required path
    //    BEFORE any license exists — the 402 soft-gate's CLI face.
    const refused = await runCliCommand({ installDir, dataDir, args: ["pack", "add", "relay-agency-pro"] });
    assert(refused.code !== 0, `unlicensed premium install must refuse (exit ${refused.code}):\n${refused.output}`);
    assert(
      /license/i.test(refused.output),
      `refusal must name the license path, not fail generically:\n${refused.output}`,
    );

    // 1. Redeem: verify + persist + activation ceremony.
    const add = await runCliCommand({ installDir, dataDir, args: ["license", "add", licensePath] });
    assert(add.code === 0, `license add should succeed (exit ${add.code}):\n${add.output}`);
    assert(/License verified/.test(add.output), "ceremony should confirm offline verification");
    assert(/OF-RELAY-VERIFY-20260701/.test(add.output), "ceremony should show the license ID");
    assert(/Your packs are yours forever\./.test(add.output), "ceremony should state the D4 promise");
    assert(
      existsSync(path.join(dataDir, "licenses", "OF-RELAY-VERIFY-20260701.license.json")),
      "license should persist under <data-dir>/licenses/",
    );

    // 2. Status re-verifies at read time.
    const status = await runCliCommand({ installDir, dataDir, args: ["license", "status"] });
    assert(status.code === 0 && /valid/.test(status.output), `license status should be valid:\n${status.output}`);

    // 3. The REAL premium pack installs by bare name with NO --license-url
    //    (store consult), materializing every primitive class it declares —
    //    including the month-end schedule row (engine fix 0b).
    const packAdd = await runCliCommand({ installDir, dataDir, args: ["pack", "add", "relay-agency-pro"] });
    assert(
      packAdd.code === 0 && /Installed relay-agency-pro@/.test(packAdd.output),
      `premium pack should install with no --license-url (exit ${packAdd.code}):\n${packAdd.output}`,
    );
    assert(/2 table\(s\)/.test(packAdd.output), `install should create both tables:\n${packAdd.output}`);
    assert(/7 profile\(s\)/.test(packAdd.output), `install should drop all 7 profiles:\n${packAdd.output}`);
    assert(/5 blueprint\(s\)/.test(packAdd.output), `install should drop all 5 blueprints:\n${packAdd.output}`);
    assert(/1 schedule\(s\)/.test(packAdd.output), `install should register the month-end schedule:\n${packAdd.output}`);
    const packList = await runCliCommand({ installDir, dataDir, args: ["pack", "list"] });
    assert(/relay-agency-pro.*\[premium\]/.test(packList.output), `pack list should mark [premium]:\n${packList.output}`);

    // 4. Launch: licensed banner (D3) + seed/clear 404 without RELAY_STAGING.
    {
      const port = await reserveLoopbackPort();
      const { child, getOutput } = launchCli({ installDir, dataDir, port, artifactUrl });
      try {
        await waitForOutput(getOutput, /Licensed to manav@orionfold\.com/, PROD_START_TIMEOUT_MS, "licensed banner");
        assert(!/Community Edition/.test(getOutput()), "a licensee is never greeted as Community Edition");
        await waitForHttpOk(`http://127.0.0.1:${port}/`, PROD_START_TIMEOUT_MS);
        const seed = await fetch(`http://127.0.0.1:${port}/api/data/seed`, { method: "POST" });
        assert(seed.status === 404, `seed must 404 in a customer-shaped prod run (got ${seed.status})`);
      } finally {
        await stopChild(child);
      }
    }

    // 5. D4 proof: rm the license store → banner reverts, pack STAYS installed.
    //    Same relaunch opts into RELAY_STAGING=true → seed/clear open (PLG-S).
    rmSync(path.join(dataDir, "licenses"), { recursive: true, force: true });
    {
      const port = await reserveLoopbackPort();
      const { child, getOutput } = launchCli({
        installDir,
        dataDir,
        port,
        artifactUrl,
        extraEnv: { RELAY_STAGING: "true" },
      });
      try {
        await waitForOutput(getOutput, /Community Edition/, PROD_START_TIMEOUT_MS, "community banner after store removal");
        await waitForHttpOk(`http://127.0.0.1:${port}/`, PROD_START_TIMEOUT_MS);
        const seed = await fetch(`http://127.0.0.1:${port}/api/data/seed`, { method: "POST" });
        assert(seed.status === 200, `seed must open in staging prod mode (got ${seed.status})`);
        const clear = await fetch(`http://127.0.0.1:${port}/api/data/clear`, { method: "POST" });
        assert(clear.status === 200, `clear must open in staging prod mode (got ${clear.status})`);
      } finally {
        await stopChild(child);
      }
    }
    assert(
      existsSync(path.join(dataDir, "apps", "relay-agency-pro", "manifest.yaml")),
      "installed premium pack must SURVIVE license removal (D4)",
    );
    const listAfter = await runCliCommand({ installDir, dataDir, args: ["pack", "list"] });
    assert(/relay-agency-pro/.test(listAfter.output), "pack list still shows the pack after license removal (D4)");
  }

  // ---- Case C: broken artifact URL — loud warning, dev-mode fallback boots ----
  console.log("\n[smoke] Case C: broken artifact URL → loud dev-mode fallback");
  {
    rmSync(path.join(installDir, ".next"), { recursive: true, force: true });
    const dataDir = path.join(workDir, "data-c");
    const port = await reserveLoopbackPort();
    const { child, getOutput } = launchCli({
      installDir,
      dataDir,
      port,
      artifactUrl: pathToFileURL(path.join(workDir, "no-such-artifact.tgz")).href,
    });
    try {
      await waitForOutput(
        getOutput,
        /Could not set up the production build/,
        PROD_START_TIMEOUT_MS,
        "loud fallback warning",
      );
      await waitForOutput(getOutput, /Mode: development/, PROD_START_TIMEOUT_MS, "dev-mode banner");
      await waitForHttpOk(`http://127.0.0.1:${port}/`, DEV_FALLBACK_TIMEOUT_MS);
    } finally {
      await stopChild(child);
    }
  }

  await fs.rm(workDir, { recursive: true, force: true });
  rmSync(tarballPath, { force: true });
  console.log(
    "\n[smoke] npx production smoke passed: A (prod first run), B (cached + LAN), L (license lifecycle + staging gate), C (loud fallback).",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
