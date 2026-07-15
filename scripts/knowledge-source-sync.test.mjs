import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function write(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function writeJson(file, value) {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runJson(script, args) {
  const result = spawnSync(
    process.execPath,
    ["--preserve-symlinks", "--preserve-symlinks-main", script, ...args],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

test("one feature catalog change dirties only chapters mapped to that feature", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-guide-sync-"));
  const tracker = path.join(root, "guide-tracker.json");
  const catalog = path.join(root, "features.md");
  const matrix = path.join(root, "matrix.md");
  const targets = path.join(root, "targets.json");
  const manifest = path.join(root, "manifest.json");
  const report = path.join(root, "report.json");
  const originalAlpha = "Alpha body.";
  const originalBeta = "Beta body.";
  write(catalog, `## Live\n### Alpha\n${originalAlpha}\n### Beta\n${originalBeta}\n`);
  write(matrix, "| Feature | Primary | Secondary | Notes |\n|---|---|---|---|\n| Alpha | SMB | - | - |\n| Beta | SMB | - | - |\n");
  writeJson(targets, { targets: [] });
  writeJson(manifest, { entries: [] });
  writeJson(tracker, {
    featureInventory: [
      { name: "Alpha", hash: sha1(`Alpha\n${originalAlpha}`) },
      { name: "Beta", hash: sha1(`Beta\n${originalBeta}`) },
    ],
    chapters: [
      { id: "alpha-chapter", features: ["Alpha"], dirty: false },
      { id: "beta-chapter", features: ["Beta"], dirty: false },
    ],
  });
  write(catalog, `## Live\n### Alpha\nAlpha changed.\n### Beta\n${originalBeta}\n`);

  const result = runJson("_ASSETS/docs/scripts/sync-guide-tracker.mjs", [
    "--tracker", tracker,
    "--feature-catalog", catalog,
    "--journey-matrix", matrix,
    "--screenshot-targets", targets,
    "--screenshot-manifest", manifest,
    "--report", report,
  ]);
  assert.deepEqual(result.dirtyChapters, ["alpha-chapter"]);
  assert.deepEqual(result.uncoveredFeatures, []);
  assert.deepEqual(result.unknownChapterFeatures, []);
});

test("one API route change dirties only its owning group and stable routes keep review metadata", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-api-sync-"));
  const apiRoot = path.join(root, "src/app/api");
  const trackerPath = path.join(root, "api-tracker.json");
  const metadataPath = path.join(root, "reviewed-api-tracker.json");
  const reportPath = path.join(root, "report.json");
  const referenceDir = path.join(root, "reference");
  write(path.join(apiRoot, "tasks/route.ts"), "export async function GET() {}\n");
  write(path.join(apiRoot, "settings/route.ts"), "export async function GET() {}\n");
  write(path.join(referenceDir, "tasks.md"), "### GET /api/tasks\n\nRead tasks.\n\n### POST /api/tasks\n\nCreate a task.\n");
  write(path.join(referenceDir, "settings.md"), "### GET /api/settings\n\nRead settings.\n");
  writeJson(trackerPath, {
    source: { apiRoot: "src/app/api" },
    groups: [
      { id: "tasks", families: ["tasks"], stability: "app-internal", dirty: false },
      { id: "settings", families: ["settings"], stability: "admin-local", dirty: false },
    ],
    endpoints: [],
  });
  runJson("_ASSETS/api/scripts/sync-api-tracker.mjs", [
    "--tracker", trackerPath,
    "--repo-root", root,
    "--api-root", apiRoot,
    "--report", reportPath,
    "--write",
  ]);
  const tracker = JSON.parse(readFileSync(trackerPath, "utf8"));
  for (const group of tracker.groups) group.dirty = false;
  for (const endpoint of tracker.endpoints) {
    endpoint.reviewed = true;
    endpoint.summary = `${endpoint.path} reviewed`;
    endpoint.request = "none";
    endpoint.response = "current";
    endpoint.errors = "named";
  }
  writeJson(trackerPath, tracker);
  writeJson(metadataPath, tracker);

  write(path.join(apiRoot, "tasks/route.ts"), "export async function GET() {}\nexport async function POST() {}\n");
  const result = runJson("_ASSETS/api/scripts/sync-api-tracker.mjs", [
    "--tracker", trackerPath,
    "--repo-root", root,
    "--api-root", apiRoot,
    "--report", reportPath,
    "--write",
  ]);
  assert.deepEqual(result.changed, ["/api/tasks"]);
  assert.deepEqual(result.dirtyGroups, ["tasks"]);
  const updated = JSON.parse(readFileSync(trackerPath, "utf8"));
  const task = updated.endpoints.find(({ path: endpointPath }) => endpointPath === "/api/tasks");
  const settings = updated.endpoints.find(({ path: endpointPath }) => endpointPath === "/api/settings");
  assert.equal(task.reviewed, false);
  assert.equal(task.summary, "TBD from source review");
  assert.equal(settings.reviewed, true);
  assert.equal(settings.summary, "/api/settings reviewed");

  for (const endpoint of updated.endpoints) {
    endpoint.reviewed = false;
    endpoint.summary = "TBD from source review";
    endpoint.request = "TBD from source review";
    endpoint.response = "TBD from source review";
    endpoint.errors = "TBD from source review";
  }
  for (const group of updated.groups) group.dirty = false;
  writeJson(trackerPath, updated);
  runJson("_ASSETS/api/scripts/sync-api-tracker.mjs", [
    "--tracker", trackerPath,
    "--metadata-from", metadataPath,
    "--repo-root", root,
    "--api-root", apiRoot,
    "--report", reportPath,
    "--write",
  ]);
  const recovered = JSON.parse(readFileSync(trackerPath, "utf8"));
  const recoveredTask = recovered.endpoints.find(({ path: endpointPath }) => endpointPath === "/api/tasks");
  const recoveredSettings = recovered.endpoints.find(({ path: endpointPath }) => endpointPath === "/api/settings");
  assert.equal(recoveredTask.reviewed, false, "changed source never inherits stale review metadata");
  assert.equal(recoveredSettings.reviewed, true, "exact source match recovers authored metadata");
  assert.equal(recoveredSettings.summary, "/api/settings reviewed");

  const acknowledged = runJson("_ASSETS/api/scripts/sync-api-tracker.mjs", [
    "--tracker", trackerPath,
    "--repo-root", root,
    "--api-root", apiRoot,
    "--reference-dir", referenceDir,
    "--report", reportPath,
    "--acknowledge-reviewed",
    "--write",
  ]);
  assert.deepEqual(acknowledged.acknowledged, ["/api/tasks"]);
  const completed = JSON.parse(readFileSync(trackerPath, "utf8"));
  assert.equal(completed.endpoints.every((endpoint) => endpoint.reviewed), true);
  assert.match(
    completed.endpoints.find(({ path: endpointPath }) => endpointPath === "/api/tasks").summary,
    /see tasks\.md/,
  );
});
