#!/usr/bin/env node

import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createKnowledgeArtifact,
  KnowledgeSourceStaleError,
  reconcileKnowledgeBundle,
  verifyKnowledgeBundle,
} from "./lib/knowledge-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(repoRoot, "_ASSETS");
const expectedAssetsRoot = path.resolve(repoRoot, "../strategy/relay/_ASSETS");
const packageJsonPath = path.join(repoRoot, "package.json");
const outDir = path.join(repoRoot, "knowledge");

export class KnowledgeSourceProvenanceError extends Error {
  constructor(message) {
    super(message);
    this.name = "KnowledgeSourceProvenanceError";
  }
}

export class KnowledgeSourceVerificationError extends Error {
  constructor(label, detail) {
    super(`${label} failed${detail ? `: ${detail}` : ""}`);
    this.name = "KnowledgeSourceVerificationError";
    this.label = label;
  }
}

function verifySourceProvenance() {
  let stat;
  try {
    stat = lstatSync(assetsRoot);
  } catch (error) {
    throw new KnowledgeSourceProvenanceError(
      `_ASSETS is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!stat.isSymbolicLink()) {
    throw new KnowledgeSourceProvenanceError("_ASSETS must be the strategy-owned symlink");
  }
  const actual = realpathSync(assetsRoot);
  const expected = realpathSync(expectedAssetsRoot);
  if (actual !== expected) {
    throw new KnowledgeSourceProvenanceError(`_ASSETS resolves to ${actual}; expected ${expected}`);
  }
  return actual;
}

function runJsonGate(label, args) {
  const result = spawnSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000,
  });
  if (result.error) throw new KnowledgeSourceVerificationError(label, result.error.message);
  if (result.status !== 0) {
    throw new KnowledgeSourceVerificationError(
      label,
      (result.stderr || result.stdout || `exit ${result.status}`).trim().split("\n").slice(-12).join("\n"),
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new KnowledgeSourceVerificationError(
      label,
      `did not return JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertCleanSourceReports({ guideSync, apiSync, guideVerify, apiVerify }) {
  const details = [];
  for (const key of ["dirtyChapters", "uncoveredFeatures", "staleFeatures", "unknownChapterFeatures"]) {
    for (const value of guideSync[key] ?? []) details.push(`guide.${key}:${value}`);
  }
  for (const key of ["added", "changed", "removed", "dirtyGroups", "unassignedEndpoints"]) {
    for (const value of apiSync[key] ?? []) details.push(`api.${key}:${value}`);
  }
  for (const failure of guideVerify.failures ?? []) details.push(`guide.verify:${failure}`);
  for (const warning of guideVerify.warnings ?? []) details.push(`guide.warning:${warning}`);
  for (const failure of apiVerify.failures ?? []) details.push(`api.verify:${failure}`);
  for (const warning of apiVerify.warnings ?? []) details.push(`api.warning:${warning}`);
  for (const endpoint of apiSync.unreviewedEndpoints ?? []) details.push(`api.unreviewed:${endpoint}`);
  if (!guideSync.ok || !apiSync.ok || !guideVerify.ok || !apiVerify.ok || details.length > 0) {
    throw new KnowledgeSourceStaleError("Knowledge source corpus is not release-ready", details);
  }
}

function main() {
  const provenance = verifySourceProvenance();
  const reports = {
    guideSync: runJsonGate("guide sync", ["_ASSETS/docs/scripts/sync-guide-tracker.mjs"]),
    apiSync: runJsonGate("API sync", [
      "_ASSETS/api/scripts/sync-api-tracker.mjs",
      "--repo-root",
      repoRoot,
    ]),
    guideVerify: runJsonGate("guide verification", [
      "_ASSETS/docs/scripts/verify-user-guides.mjs",
      "--require-files",
    ]),
    apiVerify: runJsonGate("API verification", [
      "_ASSETS/api/scripts/verify-api-docs.mjs",
      "--repo-root",
      repoRoot,
      "--require-files",
    ]),
  };
  assertCleanSourceReports(reports);

  const artifact = createKnowledgeArtifact({ assetsRoot, packageJsonPath });
  const reconciliation = reconcileKnowledgeBundle({
    files: artifact.files,
    outDir,
    packageJsonPath,
  });
  const verification = verifyKnowledgeBundle({ bundleDir: outDir, packageJsonPath });
  console.log(
    JSON.stringify(
      {
        ok: true,
        provenance,
        reconciliation,
        verification,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  const detail = error instanceof KnowledgeSourceStaleError && error.details.length
    ? `\n${error.details.map((item) => `  - ${item}`).join("\n")}`
    : "";
  console.error(error instanceof Error ? `${error.name}: ${error.message}${detail}` : String(error));
  process.exit(1);
}
