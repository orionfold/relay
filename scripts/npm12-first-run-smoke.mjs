// Customer-identical npm 12 native-binding recovery smoke (G-011).
//
// Run under a Node/npm pair supported by npm 12 (CI uses Node 24.15 and npm
// 12.0.1). This packs Relay, installs it into an isolated project whose root
// does NOT approve dependency scripts, proves the SQLite binding is absent,
// then invokes the real bundled CLI and verifies its scoped repair.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "orionfold-relay";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    timeout: 600_000,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const npmVersionResult = run(npmCommand, ["--version"]);
assert(npmVersionResult.status === 0, `npm --version failed: ${npmVersionResult.stderr}`);
const npmVersion = npmVersionResult.stdout.trim();
assert(
  npmVersion.startsWith("12."),
  `this fixture must run under npm 12 (received ${npmVersion || "no version"})`,
);

const workDir = mkdtempSync(path.join(tmpdir(), "relay-npm12-first-run-"));
try {
  console.log(`[npm12-smoke] npm ${npmVersion}; fixture ${workDir}`);

  const build = run(npmCommand, ["run", "build:cli"], { stdio: "inherit" });
  assert(build.status === 0, `CLI build failed with status ${String(build.status)}`);

  const pack = run(npmCommand, ["pack", "--pack-destination", workDir]);
  assert(pack.status === 0, `npm pack failed:\n${pack.stdout}\n${pack.stderr}`);
  const tarballName = pack.stdout.trim().split(/\r?\n/).at(-1);
  const tarballPath = path.join(workDir, tarballName ?? "");
  assert(tarballName && existsSync(tarballPath), `npm pack produced no tarball: ${pack.stdout}`);

  // This root intentionally has no allowScripts field. Under npm 12 the
  // dependency install hook is skipped, matching a one-off npx/npm exec cache.
  writeFileSync(
    path.join(workDir, "package.json"),
    JSON.stringify({ name: "relay-npm12-first-run-fixture", private: true }, null, 2),
  );
  const install = run(
    npmCommand,
    ["install", "--no-audit", "--no-fund", tarballPath],
    { cwd: workDir },
  );
  assert(
    install.status === 0,
    `npm 12 fixture install failed:\n${install.stdout}\n${install.stderr}`,
  );

  const installedModules = path.join(workDir, "node_modules");
  const bindingPath = path.join(
    installedModules,
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );
  assert(
    !existsSync(bindingPath),
    "fixture did not reproduce npm 12's blocked install-script state; better-sqlite3 binding already exists",
  );

  const cliPath = path.join(installedModules, packageName, "dist", "cli.js");
  assert(existsSync(cliPath), `packed CLI missing at ${cliPath}`);
  const launch = run(
    process.execPath,
    [cliPath, "--no-open", "--port", "0"],
    {
      cwd: workDir,
      env: {
        ...process.env,
        RELAY_DATA_DIR: path.join(workDir, "data"),
        RELAY_DEV_MODE: "",
        RELAY_INSTANCE_MODE: "",
      },
    },
  );
  const output = `${launch.stdout}\n${launch.stderr}`;

  // Port 0 is deliberately rejected immediately after the native preflight;
  // it keeps this fixture bounded without launching a Next.js child.
  assert(launch.status !== 0, "port-0 sentinel should stop the CLI after preflight");
  assert(
    /detected that the better-sqlite3 native binding is unavailable/i.test(output),
    `CLI did not name the blocked binding:\n${output}`,
  );
  assert(
    /repaired the better-sqlite3 native binding\. Continuing startup\./i.test(output),
    `CLI did not report verified repair:\n${output}`,
  );
  assert(/Invalid port: 0/.test(output), `CLI did not reach normal validation after repair:\n${output}`);
  assert(existsSync(bindingPath), "scoped repair returned without materializing the native binding");
  assert(
    !/Could not locate the bindings file[\s\S]*Try:/i.test(output),
    `raw bindings search stack leaked to the customer:\n${output}`,
  );

  const installedPackage = JSON.parse(
    readFileSync(path.join(installedModules, packageName, "package.json"), "utf8"),
  );
  console.log(
    `[npm12-smoke] passed: ${packageName}@${installedPackage.version} detected and repaired the blocked binding`,
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
