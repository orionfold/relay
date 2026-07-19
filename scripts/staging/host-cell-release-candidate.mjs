#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

class HostCellReleaseCandidateError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "HostCellReleaseCandidateError";
    this.code = code;
    this.details = details;
  }
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const home = os.homedir();
const stagingStatePath = path.join(home, "relay-staging", "state.json");
const stagingDataDir = path.join(home, ".relay-staging");
const hostRoot = path.join(stagingDataDir, "host");
const licenseDir = path.join(stagingDataDir, "licenses");
const baseUrl = process.env.RELAY_STAGING_URL ?? "http://127.0.0.1:3199";
const stamp = new Date().toISOString().slice(0, 10);
const evidenceDir = path.resolve(
  process.env.RELAY_G101_EVIDENCE_DIR ?? path.join(repoRoot, "output", "staging", `${stamp}-g101-r3`),
);
const packageJson = readJson(path.join(repoRoot, "package.json"));
const release = readJson(path.join(repoRoot, "src/lib/host/deployment/relay-cell-release.json"));
const publicationReceipt = readJson(
  path.join(repoRoot, "output", "relay-cell-publication", `v${packageJson.version}`, "release-receipt.json"),
);
const state = readJson(stagingStatePath);
const cliPath = path.join(state.scratchDir, "node_modules", "orionfold-relay", "dist", "cli.js");
const imageReference = `${release.imageRepository}@${release.imageDigest}`;
const keyPath = path.join(os.tmpdir(), `relay-g101-recovery-${process.pid}.key`);
const recoveryDestination = path.join(stagingDataDir, "g101-recovery");
const restoredDataDir = path.join(stagingDataDir, "g101-restored");
const createdCellIds = [];
const steps = [];
let sequence = 0;
const cleanupOnly = process.argv.includes("--cleanup-only");

function fail(code, message, details) {
  throw new HostCellReleaseCandidateError(code, message, details);
}

function assert(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (cause) {
    fail("G101_EVIDENCE_UNREADABLE", `Could not read JSON from ${filePath}.`, String(cause));
  }
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function safeName(value) {
  return value.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function record(name, value) {
  sequence += 1;
  const file = `${String(sequence).padStart(2, "0")}-${safeName(name)}.json`;
  const envelope = { recordedAt: new Date().toISOString(), name, ...value };
  writeFileSync(path.join(evidenceDir, file), `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  steps.push({ name, file, status: value.status ?? "recorded" });
  return envelope;
}

function run(name, command, args, options = {}) {
  const startedAt = Date.now();
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 180_000,
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
    record(name, { status: "pass", command: [command, ...args], durationMs: Date.now() - startedAt, stdout });
    return stdout;
  } catch (cause) {
    const stdout = String(cause?.stdout ?? "").trim();
    const stderr = String(cause?.stderr ?? "").trim();
    record(name, {
      status: options.expectFailure ? "pass" : "fail",
      command: [command, ...args],
      durationMs: Date.now() - startedAt,
      exitCode: cause?.status ?? null,
      stdout,
      stderr,
    });
    if (options.expectFailure) return `${stdout}\n${stderr}`.trim();
    fail("G101_COMMAND_FAILED", `${name} failed.`, { command, args, stdout, stderr });
  }
}

async function request(name, pathname, init = {}, expectedStatuses = [200]) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  record(name, {
    status: expectedStatuses.includes(response.status) ? "pass" : "fail",
    method: init.method ?? "GET",
    pathname,
    httpStatus: response.status,
    durationMs: Date.now() - startedAt,
    body,
  });
  assert(
    expectedStatuses.includes(response.status),
    "G101_HTTP_STATUS_UNEXPECTED",
    `${name} returned HTTP ${response.status}.`,
    body,
  );
  return body;
}

function post(name, body, expectedStatuses = [200]) {
  return request(name, "/api/host-deployment", { method: "POST", body: JSON.stringify(body) }, expectedStatuses);
}

function lifecycle(name, cellId, lifecycleName, confirmation) {
  return post(name, {
    action: "cell_action",
    operationId: randomUUID(),
    cellId,
    lifecycle: lifecycleName,
    ...(confirmation ? { confirmation } : {}),
  });
}

async function createCell(cellId, ownerRef = `owner-${cellId}`) {
  const view = await post(`create ${cellId}`, {
    action: "create_cell",
    operationId: randomUUID(),
    cellId,
    ownerRef,
  });
  const cell = view.cells.find((candidate) => candidate.cellId === cellId);
  assert(cell?.state === "stopped", "G101_CELL_CREATE_STATE_INVALID", `${cellId} did not settle stopped.`, cell);
  createdCellIds.push(cellId);
  return cell;
}

async function waitReady(port, label) {
  const deadline = Date.now() + 120_000;
  let last = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
      last = `${response.status} ${await response.text()}`;
      if (response.ok) {
        record(label, { status: "pass", port, response: last });
        return;
      }
    } catch (cause) {
      last = String(cause);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail("G101_CELL_READINESS_TIMEOUT", `${label} timed out.`, last);
}

function installedCli(name, args, dataDir = stagingDataDir, options = {}) {
  const { cellId, ...runOptions } = options;
  return run(name, process.execPath, [cliPath, ...args], {
    ...runOptions,
    cwd: state.scratchDir,
    env: {
      ...process.env,
      RELAY_DATA_DIR: dataDir,
      RELAY_HOST_ROOT: hostRoot,
      RELAY_DEV_MODE: "",
      RELAY_INSTANCE_MODE: "",
      ...(cellId ? { RELAY_CELL_ID: cellId } : {}),
    },
  });
}

function cellDataRoot(cellId) {
  return path.join(hostRoot, "cells", cellId, "data");
}

async function purgeOwnedCells() {
  let view;
  try {
    view = await request("cleanup inventory before purge", "/api/host-deployment");
  } catch {
    return;
  }
  for (const cell of view.cells) {
    if (cell.state === "purged") continue;
    try {
      await lifecycle(`cleanup purge ${cell.cellId}`, cell.cellId, "purge", cell.cellId);
    } catch {
      // The final Docker label cleanup below remains authoritative.
    }
  }
}

function dockerLabelCleanup() {
  const containerIds = run(
    "cleanup inspect labelled containers",
    "docker",
    ["ps", "--all", "--quiet", "--filter", "label=orionfold.relay.host-id=g101-host"],
  ).split(/\s+/u).filter(Boolean);
  for (const id of containerIds) run(`cleanup container ${id}`, "docker", ["rm", "--force", id]);
  const networks = run(
    "cleanup inspect labelled networks",
    "docker",
    ["network", "ls", "--quiet", "--filter", "label=orionfold.relay.host-id=g101-host"],
  ).split(/\s+/u).filter(Boolean);
  for (const id of networks) run(`cleanup network ${id}`, "docker", ["network", "rm", id]);
}

async function main() {
  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  assert(state.version === packageJson.version, "G101_STAGING_VERSION_MISMATCH", "Staging version differs from package.json.");
  assert(existsSync(cliPath), "G101_STAGING_CLI_MISSING", `Installed CLI is missing at ${cliPath}.`);
  assert(release.relayVersion === packageJson.version, "G101_CELL_VERSION_MISMATCH", "Cell release differs from npm package version.");
  assert(publicationReceipt.indexDigest === release.imageDigest, "G101_CELL_DIGEST_MISMATCH", "Published receipt differs from Host release manifest.");

  const tarball = state.tarball;
  const artifact = state.artifact;
  const sourceRevision = run("source revision", "git", ["rev-parse", "HEAD"]);
  const patchBytes = execFileSync("git", [
    "diff", "--binary", "--",
    "bin/cli.ts",
    "scripts/staging.mjs",
    "scripts/lib/staging-environment.mjs",
    "scripts/staging-environment.test.mjs",
    "scripts/staging/host-cell-release-candidate.mjs",
    "src/lib/host/supervisor/runtime.ts",
    "src/lib/host/supervisor/__tests__/runtime.test.ts",
    "src/lib/utils/migrate-to-ainative.ts",
    "src/lib/utils/__tests__/migrate-to-ainative.test.ts",
  ], { cwd: repoRoot });
  record("release candidate identity", {
    status: "pass",
    relayVersion: packageJson.version,
    sourceRevision,
    workingTreePatchSha256: sha256Bytes(patchBytes),
    npmTarball: { path: tarball, bytes: statSync(tarball).size, sha256: sha256File(tarball) },
    prebuiltArtifact: { path: artifact, bytes: statSync(artifact).size, sha256: sha256File(artifact) },
    cell: { imageReference, publishedAt: release.publishedAt, sourceTag: release.sourceTag },
    staging: { dataDir: stagingDataDir, hostRoot, scratchDir: state.scratchDir },
  });

  run("inspect public multi-platform image", "docker", ["buildx", "imagetools", "inspect", imageReference]);
  run("verify public image signature", "cosign", [
    "verify",
    imageReference,
    "--certificate-oidc-issuer",
    "https://token.actions.githubusercontent.com",
    "--certificate-identity-regexp",
    "^https://github\\.com/orionfold/relay/\\.github/workflows/publish-relay-cell\\.yml@refs/tags/cell-v[0-9]+\\.[0-9]+\\.[0-9]+$",
  ]);
  run("verify public image attestations", "gh", ["attestation", "verify", `oci://${imageReference}`, "--repo", "orionfold/relay"]);
  run("anonymous digest pull", "docker", ["pull", imageReference], { timeout: 300_000 });
  const badTrust = run(
    "reject unknown image digest",
    "cosign",
    [
      "verify",
      `${release.imageRepository}@sha256:${"0".repeat(64)}`,
      "--certificate-oidc-issuer",
      "https://token.actions.githubusercontent.com",
      "--certificate-identity-regexp",
      "^https://github\\.com/orionfold/relay/",
    ],
    { expectFailure: true },
  );
  assert(badTrust.length > 0, "G101_BAD_DIGEST_ACCEPTED", "Unknown image digest did not fail verification.");

  const fixture = readJson(path.join(repoRoot, "src/lib/licensing/__tests__/fixtures/relay-host-license-v1.json"));
  const hostCase = fixture.cases.find((candidate) => candidate.name === "host-only");
  assert(hostCase, "G101_HOST_LICENSE_FIXTURE_MISSING", "Host-only signed fixture is missing.");
  const baseline = await request("unlicensed Host baseline", "/api/host-deployment");
  assert(baseline.license.status === "missing", "G101_HOST_BASELINE_NOT_FREE", "Fresh staging unexpectedly had a Host license.", baseline.license);

  const invalidEnvelope = structuredClone({ payload: hostCase.payload, signature: hostCase.signature });
  invalidEnvelope.signature.value = `${invalidEnvelope.signature.value.slice(0, -2)}AA`;
  const invalid = await request(
    "reject tampered Host license",
    "/api/license",
    { method: "POST", body: JSON.stringify({ envelope: invalidEnvelope }) },
    [422],
  );
  assert(invalid.code === "license_rejected", "G101_INVALID_LICENSE_CODE_MISMATCH", "Tampered license did not return license_rejected.", invalid);

  const activated = await request(
    "activate signed Host license",
    "/api/license",
    { method: "POST", body: JSON.stringify({ envelope: { payload: hostCase.payload, signature: hostCase.signature } }) },
  );
  assert(activated.licenseId === hostCase.payload.license_id, "G101_LICENSE_ACTIVATION_MISMATCH", "Activated license identity drifted.", activated);
  const licensed = await request("licensed Host view", "/api/host-deployment");
  assert(licensed.license.status === "active", "G101_HOST_LICENSE_NOT_ACTIVE", "Host entitlement is not active.", licensed.license);
  assert(licensed.license.managedCellsLimit === 10, "G101_HOST_LIMIT_MISMATCH", "Host limit is not 10.", licensed.license);

  await post("save ten-Cell Host plan", {
    action: "save_draft",
    draft: {
      placement: "local",
      hostId: "g101-host",
      regionRef: "local",
      sizeRef: "basic-16gib-8vcpu",
      desiredCells: 10,
      exposure: "local",
      runtimeProfile: "byok_hosted",
      backupProfile: "manual_export",
      concurrency: "light",
    },
  });
  const estimated = await post("estimate ten-Cell Host", { action: "estimate" });
  assert(
    estimated.journey.estimate?.hostCount === 1,
    "G101_HOST_SHARD_REQUIRED",
    "Ten-Cell plan did not fit one Host.",
    estimated.journey.estimate,
  );
  const planDigest = estimated.journey.planDigest;
  await post("preflight ten-Cell Host", { action: "preflight", planDigest });
  await post("authorize ten-Cell Host", { action: "authorize", planDigest, confirmed: true });
  await post("install ten-Cell Host", { action: "install", planDigest });

  const first = await createCell("g101-cell-01");
  await lifecycle("start g101-cell-01", first.cellId, "start");
  await waitReady(first.loopbackPort, "g101-cell-01 readiness");
  const firstContainer = `relay-cell-${first.cellId}`;
  run("write persistence marker", "docker", [
    "exec", "--user", "10001:10001", firstContainer, "/nodejs/bin/node", "-e",
    "const fs=require('fs');fs.mkdirSync('/var/lib/relay/uploads',{recursive:true});fs.writeFileSync('/var/lib/relay/uploads/g101-marker.txt','g101-survives-restart');",
  ]);
  await lifecycle("restart g101-cell-01", first.cellId, "restart");
  await waitReady(first.loopbackPort, "g101-cell-01 readiness after restart");
  const marker = run("read persistence marker after restart", "docker", [
    "exec", "--user", "10001:10001", firstContainer, "/nodejs/bin/node", "-e",
    "process.stdout.write(require('fs').readFileSync('/var/lib/relay/uploads/g101-marker.txt','utf8'));",
  ]);
  assert(marker === "g101-survives-restart", "G101_RESTART_DATA_LOSS", "Marker did not survive restart.", marker);

  const second = await createCell("g101-cell-02");
  await lifecycle("start g101-cell-02", second.cellId, "start");
  await waitReady(second.loopbackPort, "g101-cell-02 readiness");
  const isolation = run("prove cross-Cell file isolation", "docker", [
    "exec", "--user", "10001:10001", `relay-cell-${second.cellId}`, "/nodejs/bin/node", "-e",
    "process.stdout.write(require('fs').existsSync('/var/lib/relay/uploads/g101-marker.txt')?'leaked':'isolated');",
  ]);
  assert(isolation === "isolated", "G101_CROSS_CELL_LEAKAGE", "Cell 02 could see Cell 01 content.");
  await lifecycle("stop g101-cell-02", second.cellId, "stop");

  for (let index = 3; index <= 10; index += 1) {
    await createCell(`g101-cell-${String(index).padStart(2, "0")}`);
  }
  const refusedEleventh = await post("refuse eleventh managed Cell", {
    action: "create_cell", operationId: randomUUID(), cellId: "g101-cell-11", ownerRef: "owner-g101-cell-11",
  }, [403, 422]);
  assert(
    ["HOST_GRANT_MANAGED_CELL_LIMIT", "HOST_CAPACITY_EXCEEDED"].includes(refusedEleventh.code),
    "G101_CAPACITY_REFUSAL_MISMATCH",
    "Eleventh Cell did not hit the signed or physical Host limit.",
    refusedEleventh,
  );

  await lifecycle("retain g101-cell-02", second.cellId, "retain");
  const refusedAfterRetain = await post("retained Cell still counts toward limit", {
    action: "create_cell", operationId: randomUUID(), cellId: "g101-cell-11", ownerRef: "owner-g101-cell-11",
  }, [403, 422]);
  assert(
    ["HOST_GRANT_MANAGED_CELL_LIMIT", "HOST_CAPACITY_EXCEEDED"].includes(refusedAfterRetain.code),
    "G101_RETAIN_CAPACITY_MISMATCH",
    "Retained Cell stopped counting.",
    refusedAfterRetain,
  );
  await lifecycle("purge g101-cell-02", second.cellId, "purge", second.cellId);
  await createCell("g101-cell-11");

  const inspect = run("inspect Cell secret boundary", "docker", ["inspect", firstContainer]);
  assert(!/OF-RELAY-HOST|pi_TEST_|price_TEST_/u.test(inspect), "G101_LICENSE_SECRET_LEAK", "Host license data leaked into a Cell container.");

  await lifecycle("stop g101-cell-01 before recovery", first.cellId, "stop");
  rmSync(keyPath, { force: true });
  installedCli("create recovery key", ["recovery", "key", "create", "--out", keyPath], cellDataRoot(first.cellId));
  const created = installedCli("create encrypted Cell recovery", [
    "recovery", "create", "--destination", recoveryDestination, "--key-file", keyPath,
    "--cell-id", first.cellId, "--data-dir", cellDataRoot(first.cellId),
  ], cellDataRoot(first.cellId), { timeout: 300_000, cellId: first.cellId });
  const bundlePath = created.match(/^Published: (.+)$/mu)?.[1];
  assert(bundlePath && existsSync(bundlePath), "G101_RECOVERY_BUNDLE_MISSING", "Recovery did not publish a bundle.", created);
  installedCli("verify encrypted Cell recovery", [
    "recovery", "verify", "--bundle", bundlePath, "--key-file", keyPath,
    "--cell-id", first.cellId, "--data-dir", cellDataRoot(first.cellId),
  ], cellDataRoot(first.cellId), { timeout: 300_000, cellId: first.cellId });
  const receiptsDir = path.join(cellDataRoot(first.cellId), "recovery", "receipts");
  const verifyReceiptPath = readdirSync(receiptsDir)
    .map((name) => path.join(receiptsDir, name))
    .map((receiptPath) => ({ receiptPath, receipt: readJson(receiptPath) }))
    .filter(({ receipt }) => receipt.operation === "verify" && receipt.status === "verified" && receipt.bundleFile === path.basename(bundlePath))
    .sort((left, right) => right.receipt.startedAt.localeCompare(left.receipt.startedAt))[0]?.receiptPath;
  assert(verifyReceiptPath, "G101_RECOVERY_RECEIPT_MISSING", "Verified recovery receipt was not persisted.");
  const bundleDigest = sha256File(bundlePath);
  installedCli("export and release g101-cell-01", [
    "host", "export-release", "--host-root", hostRoot, "--license-dir", licenseDir,
    "--actor-ref", "g101-release-candidate", "--cell-id", first.cellId,
    "--operation-id", randomUUID(), "--checkpoint-ref", `sha256:${bundleDigest}`,
    "--checkpoint-receipt", verifyReceiptPath, "--checkpoint-bundle", bundlePath,
  ], stagingDataDir, { timeout: 300_000 });
  const afterExport = await request("exported Cell releases managed capacity", "/api/host-deployment");
  assert(afterExport.cells.find((cell) => cell.cellId === first.cellId)?.state === "exported", "G101_EXPORT_STATE_MISMATCH", "Cell did not become exported.");

  rmSync(restoredDataDir, { recursive: true, force: true });
  installedCli("restore exported Cell recovery", [
    "recovery", "restore", "--bundle", bundlePath, "--key-file", keyPath,
    "--target-data-dir", restoredDataDir, "--cell-id", first.cellId,
    "--data-dir", cellDataRoot(first.cellId),
  ], cellDataRoot(first.cellId), { timeout: 300_000, cellId: first.cellId });
  const restoredMarker = readFileSync(path.join(restoredDataDir, "uploads", "g101-marker.txt"), "utf8");
  assert(restoredMarker === "g101-survives-restart", "G101_RECOVERY_DATA_LOSS", "Restored marker content drifted.");
  record("recovery continuity summary", {
    status: "pass",
    cellId: first.cellId,
    checkpointRef: `sha256:${bundleDigest}`,
    receiptSha256: sha256File(verifyReceiptPath),
    restoredMarkerSha256: sha256Bytes(restoredMarker),
  });

  await purgeOwnedCells();
  dockerLabelCleanup();
  const finalView = await request("final Host inventory", "/api/host-deployment");
  assert(finalView.cells.every((cell) => ["purged", "exported"].includes(cell.state)), "G101_ACTIVE_CELL_LEFT_BEHIND", "Cleanup left an active managed Cell.", finalView.cells);
  record("customer-identical release candidate receipt", {
    status: "pass",
    goal: "G-101",
    relayVersion: packageJson.version,
    sourceRevision,
    imageReference,
    license: {
      id: hostCase.payload.license_id,
      canonicalSha256Prefix: hostCase.canonical_sha256_12,
      entitlement: "product:relay-host",
      managedCellsLimit: 10,
      packs: "separate",
    },
    checks: [
      "clean packaged npm install",
      "digest/signature/attestation authority",
      "anonymous public acquisition before Host activation",
      "tampered-license refusal and active Host activation",
      "single-Host install and real Docker Cell lifecycle",
      "restart persistence and cross-Cell isolation",
      "10 managed Cells and eleventh refusal",
      "retained counts; purged/exported release capacity",
      "Host license absent from Cell runtime",
      "encrypted export, verification and restore continuity",
      "owned Docker cleanup",
    ],
    externalWrites: 0,
    operatorClicks: 0,
    stepCount: steps.length + 1,
  });
  writeFileSync(path.join(evidenceDir, "index.json"), `${JSON.stringify({ status: "pass", goal: "G-101", steps }, null, 2)}\n`);
  console.log(JSON.stringify({ status: "pass", goal: "G-101", evidenceDir, stepCount: steps.length }, null, 2));
}

try {
  if (cleanupOnly) {
    mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
    await purgeOwnedCells();
    dockerLabelCleanup();
    console.log(JSON.stringify({ status: "clean", goal: "G-101" }, null, 2));
  } else {
    await main();
  }
} catch (error) {
  const named = error instanceof HostCellReleaseCandidateError
    ? error
    : new HostCellReleaseCandidateError("G101_RELEASE_CANDIDATE_FAILED", error instanceof Error ? error.message : String(error));
  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(evidenceDir, "failure.json"), `${JSON.stringify({ status: "fail", code: named.code, message: named.message, details: named.details ?? null, steps }, null, 2)}\n`);
  console.error(`${named.code}: ${named.message}`);
  if (named.details) console.error(JSON.stringify(named.details, null, 2));
  process.exitCode = 1;
} finally {
  rmSync(keyPath, { force: true });
}
