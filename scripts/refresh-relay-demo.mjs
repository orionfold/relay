#!/usr/bin/env node

import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsLink = path.join(repoRoot, "_ASSETS");
const expectedAssetsRoot = path.resolve(repoRoot, "../strategy/relay/_ASSETS");

class AssetSourceProvenanceError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssetSourceProvenanceError";
  }
}

class DemoRefreshStepError extends Error {
  constructor(step, status) {
    super(`Demo refresh step failed: ${step} (exit ${status ?? "unknown"})`);
    this.name = "DemoRefreshStepError";
  }
}

function verifyAssetSource() {
  let stat;
  try {
    stat = lstatSync(assetsLink);
  } catch (error) {
    throw new AssetSourceProvenanceError(
      `_ASSETS is unavailable at ${assetsLink}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!stat.isSymbolicLink()) {
    throw new AssetSourceProvenanceError(
      `_ASSETS must be the strategy-owned symlink, not a repo-local directory: ${assetsLink}`,
    );
  }

  const actual = realpathSync(assetsLink);
  const expected = realpathSync(expectedAssetsRoot);
  if (actual !== expected) {
    throw new AssetSourceProvenanceError(
      `_ASSETS resolves to ${actual}; expected the Relay strategy source ${expected}`,
    );
  }

  return actual;
}

function runStep(label, args) {
  console.log(`\n[demo:refresh] ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new DemoRefreshStepError(label, result.status);
}

function main() {
  const assetsRoot = verifyAssetSource();
  const preserve = ["--preserve-symlinks", "--preserve-symlinks-main"];

  runStep("verify seed structural fingerprint and fixture projections", [
    ...preserve,
    "--test",
    "_ASSETS/demo/scripts/derive-fixtures.test.mjs",
  ]);
  runStep("derive network fixtures from the approved seed structure", [
    ...preserve,
    "_ASSETS/demo/scripts/derive-fixtures.mjs",
  ]);
  runStep("build the static demo from captured Relay structure", [
    ...preserve,
    "_ASSETS/demo/scripts/build-relay-demo.mjs",
    "--base-path",
    "/relay/demo/",
  ]);
  runStep("run static and behavioral demo verification", [
    ...preserve,
    "_ASSETS/demo/scripts/verify-relay-demo.mjs",
    "--base-path",
    "/relay/demo/",
    "--dist",
    "_ASSETS/demo/dist",
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        assetsRoot,
        provenance: "strategy/relay/_ASSETS",
        structuralFingerprint: "verified",
        demo: "derived-built-behaviorally-verified",
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
}
