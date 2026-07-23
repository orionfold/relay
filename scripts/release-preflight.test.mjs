import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RELEASE_PREFLIGHT_EXPIRY_HOURS,
  RELEASE_PREFLIGHT_LANES,
  RELEASE_PREFLIGHT_POLICY_PATHS,
  ReleasePreflightError,
  computeReceiptDigest,
  createChecks,
  createLaneReceipt,
  createReleaseReceipt,
  validateReleaseReceipt,
} from "./lib/release-preflight.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const revision = "a".repeat(40);
const createdAt = "2026-07-23T12:00:00.000Z";
const now = new Date("2026-07-23T13:00:00.000Z");

function expected(scope = "cell") {
  return {
    scope,
    version: "1.2.3",
    sourceRevision: revision,
    sourceTreeDigest: digest("b"),
    policyDigest: digest("c"),
  };
}

function receipt(scope = "cell", overrides = {}) {
  return createReleaseReceipt({
    ...expected(scope),
    workflowRunId: "12345",
    workflowRunAttempt: 1,
    lanes: RELEASE_PREFLIGHT_LANES.map((lane) => createLaneReceipt({ id: lane.id, status: "pass" })),
    checks: createChecks(scope),
    evidence: {
      productionDependencies: {
        auditLevel: "high",
        omitted: ["dev"],
        vulnerabilities: { info: 0, low: 1, moderate: 2, high: 0, critical: 0, total: 3 },
        reportDigest: digest("d"),
      },
    },
    createdAt,
    ...overrides,
  });
}

function expectCode(action, code) {
  assert.throws(action, (error) => error instanceof ReleasePreflightError && error.code === code);
}

test("candidate receipt is content-addressed and exact-source eligible", () => {
  const candidate = receipt();
  assert.equal(validateReleaseReceipt(candidate, expected(), { now }), candidate);
  assert.equal(candidate.receiptDigest, computeReceiptDigest(candidate));
  assert.equal(new Date(candidate.expiresAt).valueOf() - new Date(candidate.createdAt).valueOf(), RELEASE_PREFLIGHT_EXPIRY_HOURS * 60 * 60 * 1000);
});

test("publication refuses missing, stale, mismatched, and dry-run evidence", () => {
  const candidate = receipt();
  expectCode(() => validateReleaseReceipt(candidate, { ...expected(), sourceRevision: "d".repeat(40) }, { now }), "RELEASE_PREFLIGHT_SOURCE_MISMATCH");
  expectCode(() => validateReleaseReceipt(candidate, { ...expected(), sourceTreeDigest: digest("d") }, { now }), "RELEASE_PREFLIGHT_TREE_MISMATCH");
  expectCode(() => validateReleaseReceipt(candidate, { ...expected(), version: "1.2.4" }, { now }), "RELEASE_PREFLIGHT_VERSION_MISMATCH");
  expectCode(() => validateReleaseReceipt(candidate, { ...expected(), policyDigest: digest("d") }, { now }), "RELEASE_PREFLIGHT_POLICY_MISMATCH");
  expectCode(() => validateReleaseReceipt(candidate, { ...expected(), workflowRunId: "999" }, { now }), "RELEASE_PREFLIGHT_WORKFLOW_MISMATCH");
  expectCode(() => validateReleaseReceipt(candidate, expected(), { now: new Date("2026-07-24T12:00:00.001Z") }), "RELEASE_PREFLIGHT_RECEIPT_EXPIRED");
  const dryRun = receipt("cell", { mode: "dry-run" });
  expectCode(() => validateReleaseReceipt(dryRun, expected(), { now }), "RELEASE_PREFLIGHT_MODE_INVALID");
  assert.equal(validateReleaseReceipt(dryRun, expected(), { now, allowDryRun: true }), dryRun);
});

test("all four macOS/Windows Node/npm lanes are exact and terminal green", () => {
  assert.deepEqual(RELEASE_PREFLIGHT_LANES.map((lane) => lane.id), [
    "macos-node22-npm11",
    "macos-node24-npm12",
    "windows-node22-npm11",
    "windows-node24-npm12",
  ]);
  const missing = receipt();
  missing.lanes.pop();
  missing.receiptDigest = computeReceiptDigest(missing);
  expectCode(() => validateReleaseReceipt(missing, expected(), { now }), "RELEASE_PREFLIGHT_LANE_MISSING");

  for (const [status, code] of [["fail", "RELEASE_PREFLIGHT_LANE_RED"], ["cancelled", "RELEASE_PREFLIGHT_LANE_RED"], ["skipped", "RELEASE_PREFLIGHT_LANE_SKIPPED"]]) {
    const red = receipt();
    red.lanes = red.lanes.map((lane) => lane.id === "windows-node24-npm12" ? { ...lane, status } : lane);
    red.receiptDigest = computeReceiptDigest(red);
    expectCode(() => validateReleaseReceipt(red, expected(), { now }), code);
  }
});

test("vulnerability policy and every named release check fail closed", () => {
  const vulnerable = receipt();
  vulnerable.checks.productionDependencies = "fail";
  vulnerable.receiptDigest = computeReceiptDigest(vulnerable);
  expectCode(() => validateReleaseReceipt(vulnerable, expected(), { now }), "RELEASE_PREFLIGHT_VULNERABILITY_BLOCKED");

  const highEvidence = receipt();
  highEvidence.evidence.productionDependencies.vulnerabilities.high = 1;
  highEvidence.evidence.productionDependencies.vulnerabilities.total = 4;
  highEvidence.receiptDigest = computeReceiptDigest(highEvidence);
  expectCode(() => validateReleaseReceipt(highEvidence, expected(), { now }), "RELEASE_PREFLIGHT_VULNERABILITY_BLOCKED");

  const skipped = receipt();
  skipped.checks.knowledge = "skipped";
  skipped.receiptDigest = computeReceiptDigest(skipped);
  expectCode(() => validateReleaseReceipt(skipped, expected(), { now }), "RELEASE_PREFLIGHT_CHECK_FAILED");

  const incomplete = receipt();
  delete incomplete.checks.npmPack;
  incomplete.receiptDigest = computeReceiptDigest(incomplete);
  expectCode(() => validateReleaseReceipt(incomplete, expected(), { now }), "RELEASE_PREFLIGHT_CHECK_MISSING");
});

test("scope-specific Host/Cell authority cannot be substituted", () => {
  const cell = receipt("cell");
  expectCode(() => validateReleaseReceipt(cell, expected("host"), { now }), "RELEASE_PREFLIGHT_SCOPE_MISMATCH");
  const host = receipt("host");
  assert.equal(validateReleaseReceipt(host, expected("host"), { now }), host);
  assert.equal(host.checks.hostCellAuthority, "pass");
  assert.equal(Object.hasOwn(host.checks, "cellCandidateAuthority"), false);
});

test("digest substitution and interrupted/resumed evidence are visible", () => {
  const substituted = receipt();
  substituted.source.treeDigest = digest("d");
  expectCode(() => validateReleaseReceipt(substituted, { ...expected(), sourceTreeDigest: digest("d") }, { now }), "RELEASE_PREFLIGHT_DIGEST_MISMATCH");

  const interrupted = receipt();
  interrupted.checks.releaseQuality = "missing";
  interrupted.receiptDigest = computeReceiptDigest(interrupted);
  expectCode(() => validateReleaseReceipt(interrupted, expected(), { now }), "RELEASE_PREFLIGHT_CHECK_FAILED");

  const resumed = receipt("cell", { workflowRunAttempt: 2 });
  assert.equal(validateReleaseReceipt(resumed, expected(), { now }).workflow.runAttempt, 2);
});

test("receipt policy binds every producer and consumer surface", () => {
  const required = [
    ".github/workflows/release-candidate.yml",
    ".github/workflows/fresh-clone-dev.yml",
    ".github/workflows/publish-relay-cell.yml",
    ".github/workflows/publish.yml",
    "package-lock.json",
    "scripts/lib/release-preflight.mjs",
  ];
  for (const path of required) assert.equal(RELEASE_PREFLIGHT_POLICY_PATHS.includes(path), true, path);
});

test("candidate and publication workflows retain exact-SHA and pre-write guards", () => {
  const candidate = readFileSync(new URL("../.github/workflows/release-candidate.yml", import.meta.url), "utf8");
  const cell = readFileSync(new URL("../.github/workflows/publish-relay-cell.yml", import.meta.url), "utf8");
  const npm = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
  const freshClone = readFileSync(new URL("../.github/workflows/fresh-clone-dev.yml", import.meta.url), "utf8");

  assert.match(candidate, /github\.event\.inputs\.source_sha.*github\.sha|SOURCE_SHA.*GITHUB_SHA/su);
  assert.match(candidate, /npm audit --omit=dev --audit-level=high/u);
  assert.match(candidate, /uses: \.\/\.github\/workflows\/quality-gate\.yml/u);
  assert.match(candidate, /uses: \.\/\.github\/workflows\/fresh-clone-dev\.yml/u);
  for (const command of [
    "knowledge:verify",
    "test:public-boundary",
    "check:public-boundary",
    "check:pack-taxonomy",
    "check:pack-tarball",
    "check:relay-cell-publication",
    "check:host-cell-release-authority",
    "npm pack --pack-destination",
  ]) assert.equal(candidate.includes(command), true, command);
  assert.match(freshClone, /workflow_call:/u);
  for (const id of RELEASE_PREFLIGHT_LANES.map((lane) => lane.id)) assert.match(freshClone, new RegExp(id, "u"));

  const cellPreflight = cell.indexOf("name: Verify exact-SHA Cell candidate receipt");
  const firstCellWrite = cell.indexOf("environment: oci-staging");
  assert.ok(cellPreflight > 0 && firstCellWrite > cellPreflight);
  const npmPreflight = npm.indexOf("name: Verify exact-SHA Host candidate receipt");
  const npmWrite = npm.indexOf("run: npm publish");
  assert.ok(npmPreflight > 0 && npmWrite > npmPreflight);
  assert.doesNotMatch(npm, /uses: [^\n]+@v[0-9]/u);
});
