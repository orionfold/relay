import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalJson } from "./relay-host-manifest.mjs";

export const RELEASE_PREFLIGHT_SCHEMA_VERSION = 1;
export const RELEASE_PREFLIGHT_KIND = "orionfold.release-preflight";
export const RELEASE_PREFLIGHT_EXPIRY_HOURS = 24;
export const RELEASE_PREFLIGHT_SCOPES = ["cell", "host"];
export const RELEASE_PREFLIGHT_LANES = [
  { id: "macos-node22-npm11", os: "macos", node: "22.23.1", npm: "11.6.0" },
  { id: "macos-node24-npm12", os: "macos", node: "24.15.0", npm: "12.0.1" },
  { id: "windows-node22-npm11", os: "windows", node: "22.23.1", npm: "11.6.0" },
  { id: "windows-node24-npm12", os: "windows", node: "24.15.0", npm: "12.0.1" },
];

export const RELEASE_PREFLIGHT_POLICY_PATHS = [
  ".github/workflows/release-candidate.yml",
  ".github/workflows/fresh-clone-dev.yml",
  ".github/workflows/quality-gate.yml",
  ".github/workflows/publish-relay-cell.yml",
  ".github/workflows/publish.yml",
  "config/relay-cell-publication-policy.json",
  "package-lock.json",
  "scripts/lib/release-preflight.mjs",
  "scripts/release-preflight.mjs",
];

const COMMON_CHECKS = [
  "releaseQuality",
  "productionDependencies",
  "packageVersion",
  "lockfileVersion",
  "changelog",
  "knowledge",
  "publicBoundary",
  "npmPack",
  "packTaxonomy",
  "packTarball",
  "cellPublicationPolicy",
];

const SCOPE_CHECKS = {
  cell: [...COMMON_CHECKS, "cellCandidateAuthority"],
  host: [...COMMON_CHECKS, "hostCellAuthority"],
};

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;

export class ReleasePreflightError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ReleasePreflightError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ReleasePreflightError(code, message, details);
}

function assert(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function exactKeys(value, expected) {
  return value &&
    Object.keys(value).length === expected.length &&
    [...Object.keys(value)].sort().every((key, index) => key === [...expected].sort()[index]);
}

export function requiredChecks(scope) {
  assert(RELEASE_PREFLIGHT_SCOPES.includes(scope), "RELEASE_PREFLIGHT_SCOPE_INVALID", `unknown release scope: ${scope}`);
  return SCOPE_CHECKS[scope];
}

export function computeReleasePolicyDigest(root) {
  const material = RELEASE_PREFLIGHT_POLICY_PATHS.map((path) => {
    const bytes = readFileSync(resolve(root, path));
    return `${path}\0${sha256(bytes)}\n`;
  }).join("");
  return sha256(material);
}

export function computeSourceTreeDigest(root, revision = "HEAD") {
  let listing;
  try {
    listing = execFileSync("git", ["ls-tree", "-r", "--full-tree", revision], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    fail("RELEASE_PREFLIGHT_SOURCE_UNRESOLVED", `could not resolve source tree for ${revision}`, error?.stderr?.toString().trim());
  }
  return sha256(listing);
}

export function inspectSource(root) {
  let revision;
  let status;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).trim();
  } catch (error) {
    fail("RELEASE_PREFLIGHT_SOURCE_UNRESOLVED", "could not inspect the git source", error?.stderr?.toString().trim());
  }
  assert(SHA_PATTERN.test(revision), "RELEASE_PREFLIGHT_SOURCE_UNRESOLVED", "source revision is not a full git SHA");
  assert(status.length === 0, "RELEASE_PREFLIGHT_SOURCE_DIRTY", "release preflight requires a clean source tree", status.split("\n"));
  return {
    revision,
    treeDigest: computeSourceTreeDigest(root, revision),
  };
}

export function releaseTag(scope, version) {
  assert(RELEASE_PREFLIGHT_SCOPES.includes(scope), "RELEASE_PREFLIGHT_SCOPE_INVALID", `unknown release scope: ${scope}`);
  assert(VERSION_PATTERN.test(version ?? ""), "RELEASE_PREFLIGHT_VERSION_INVALID", "release version must be semantic X.Y.Z");
  return scope === "cell" ? `cell-v${version}` : `v${version}`;
}

export function assertTagAvailable(root, scope, version) {
  const tag = releaseTag(scope, version);
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    return tag;
  }
  fail("RELEASE_PREFLIGHT_TAG_EXISTS", `immutable tag ${tag} already exists`);
}

export function createLaneReceipt({ id, status }) {
  const expected = RELEASE_PREFLIGHT_LANES.find((lane) => lane.id === id);
  assert(expected, "RELEASE_PREFLIGHT_LANE_UNKNOWN", `unknown supported lane: ${id}`);
  assert(["pass", "fail", "cancelled", "skipped"].includes(status), "RELEASE_PREFLIGHT_LANE_STATUS_INVALID", `invalid lane status: ${status}`);
  return { ...expected, status };
}

export function createChecks(scope, status = "pass", overrides = {}) {
  return Object.fromEntries(requiredChecks(scope).map((check) => [
    check,
    overrides[check] ?? status,
  ]));
}

function receiptPayload(receipt) {
  const { receiptDigest: _ignored, ...payload } = receipt;
  return payload;
}

export function computeReceiptDigest(receipt) {
  return sha256(canonicalJson(receiptPayload(receipt)));
}

export function createProductionDependencyEvidence(report, { reportDigest } = {}) {
  const vulnerabilities = report?.metadata?.vulnerabilities;
  assert(vulnerabilities && ["info", "low", "moderate", "high", "critical", "total"].every((key) => Number.isInteger(vulnerabilities[key]) && vulnerabilities[key] >= 0), "RELEASE_PREFLIGHT_VULNERABILITY_EVIDENCE_INVALID", "npm audit vulnerability counts are incomplete");
  assert(DIGEST_PATTERN.test(reportDigest ?? ""), "RELEASE_PREFLIGHT_VULNERABILITY_EVIDENCE_INVALID", "npm audit report digest is invalid");
  return {
    auditLevel: "high",
    omitted: ["dev"],
    vulnerabilities: { ...vulnerabilities },
    reportDigest,
  };
}

export function createReleaseReceipt({
  mode = "candidate",
  scope,
  repository = "orionfold/relay",
  version,
  sourceRevision,
  sourceTreeDigest,
  policyDigest,
  workflowRunId,
  workflowRunAttempt = 1,
  lanes,
  checks,
  evidence,
  createdAt = new Date().toISOString(),
  expiryHours = RELEASE_PREFLIGHT_EXPIRY_HOURS,
}) {
  assert(["candidate", "dry-run"].includes(mode), "RELEASE_PREFLIGHT_MODE_INVALID", `unknown receipt mode: ${mode}`);
  assert(RELEASE_PREFLIGHT_SCOPES.includes(scope), "RELEASE_PREFLIGHT_SCOPE_INVALID", `unknown release scope: ${scope}`);
  assert(VERSION_PATTERN.test(version ?? ""), "RELEASE_PREFLIGHT_VERSION_INVALID", "release version must be semantic X.Y.Z");
  assert(SHA_PATTERN.test(sourceRevision ?? ""), "RELEASE_PREFLIGHT_SOURCE_MISMATCH", "source revision must be a full git SHA");
  assert(DIGEST_PATTERN.test(sourceTreeDigest ?? ""), "RELEASE_PREFLIGHT_TREE_MISMATCH", "source tree digest must be sha256");
  assert(DIGEST_PATTERN.test(policyDigest ?? ""), "RELEASE_PREFLIGHT_POLICY_MISMATCH", "policy digest must be sha256");
  const created = new Date(createdAt);
  assert(!Number.isNaN(created.valueOf()), "RELEASE_PREFLIGHT_TIME_INVALID", "receipt createdAt is invalid");
  const receipt = {
    schemaVersion: RELEASE_PREFLIGHT_SCHEMA_VERSION,
    kind: RELEASE_PREFLIGHT_KIND,
    mode,
    scope,
    repository,
    version,
    source: {
      revision: sourceRevision,
      treeDigest: sourceTreeDigest,
    },
    policy: {
      digest: policyDigest,
      expiryHours,
    },
    workflow: {
      runId: String(workflowRunId),
      runAttempt: Number(workflowRunAttempt),
    },
    createdAt: created.toISOString(),
    expiresAt: new Date(created.valueOf() + expiryHours * 60 * 60 * 1000).toISOString(),
    lanes: [...lanes].sort((left, right) => left.id.localeCompare(right.id)),
    checks,
    evidence,
  };
  return { ...receipt, receiptDigest: computeReceiptDigest(receipt) };
}

export function validateReleaseReceipt(receipt, expected, { now = new Date(), allowDryRun = false } = {}) {
  assert(receipt?.schemaVersion === RELEASE_PREFLIGHT_SCHEMA_VERSION && receipt?.kind === RELEASE_PREFLIGHT_KIND, "RELEASE_PREFLIGHT_SCHEMA_INVALID", "release receipt schema or kind is invalid");
  assert(receipt?.mode === "candidate" || (allowDryRun && receipt?.mode === "dry-run"), "RELEASE_PREFLIGHT_MODE_INVALID", "only a candidate receipt is publication-eligible");
  assert(receipt?.repository === "orionfold/relay", "RELEASE_PREFLIGHT_REPOSITORY_MISMATCH", "receipt repository differs from Relay");
  assert(RELEASE_PREFLIGHT_SCOPES.includes(receipt?.scope), "RELEASE_PREFLIGHT_SCOPE_INVALID", "receipt scope is invalid");
  assert(receipt.scope === expected.scope, "RELEASE_PREFLIGHT_SCOPE_MISMATCH", `expected ${expected.scope} receipt, received ${receipt.scope}`);
  assert(VERSION_PATTERN.test(receipt?.version ?? "") && receipt.version === expected.version, "RELEASE_PREFLIGHT_VERSION_MISMATCH", `receipt version ${receipt?.version ?? "missing"} differs from ${expected.version}`);
  assert(SHA_PATTERN.test(receipt?.source?.revision ?? "") && receipt.source.revision === expected.sourceRevision, "RELEASE_PREFLIGHT_SOURCE_MISMATCH", "receipt source revision differs from the tagged checkout");
  assert(DIGEST_PATTERN.test(receipt?.source?.treeDigest ?? "") && receipt.source.treeDigest === expected.sourceTreeDigest, "RELEASE_PREFLIGHT_TREE_MISMATCH", "receipt source tree differs from the tagged checkout");
  assert(DIGEST_PATTERN.test(receipt?.policy?.digest ?? "") && receipt.policy.digest === expected.policyDigest, "RELEASE_PREFLIGHT_POLICY_MISMATCH", "receipt policy differs from the tagged checkout");
  assert(receipt?.policy?.expiryHours === RELEASE_PREFLIGHT_EXPIRY_HOURS, "RELEASE_PREFLIGHT_POLICY_MISMATCH", "receipt expiry policy differs from the current policy");
  assert(String(receipt?.workflow?.runId ?? "").length > 0 && Number.isInteger(receipt?.workflow?.runAttempt) && receipt.workflow.runAttempt > 0, "RELEASE_PREFLIGHT_WORKFLOW_INVALID", "workflow identity is incomplete");
  if (expected.workflowRunId !== undefined) {
    assert(receipt.workflow.runId === String(expected.workflowRunId), "RELEASE_PREFLIGHT_WORKFLOW_MISMATCH", "receipt run ID differs from the workflow that supplied the artifact");
  }
  const createdAt = new Date(receipt?.createdAt);
  const expiresAt = new Date(receipt?.expiresAt);
  assert(!Number.isNaN(createdAt.valueOf()) && !Number.isNaN(expiresAt.valueOf()), "RELEASE_PREFLIGHT_TIME_INVALID", "receipt timestamps are invalid");
  assert(expiresAt.valueOf() - createdAt.valueOf() === RELEASE_PREFLIGHT_EXPIRY_HOURS * 60 * 60 * 1000, "RELEASE_PREFLIGHT_POLICY_MISMATCH", "receipt expiry window differs from policy");
  assert(now.valueOf() >= createdAt.valueOf() - 5 * 60 * 1000, "RELEASE_PREFLIGHT_TIME_INVALID", "receipt was created too far in the future");
  assert(now.valueOf() < expiresAt.valueOf(), "RELEASE_PREFLIGHT_RECEIPT_EXPIRED", `receipt expired at ${receipt.expiresAt}`);

  assert(Array.isArray(receipt?.lanes), "RELEASE_PREFLIGHT_LANE_MISSING", "receipt has no supported-lane evidence");
  assert(receipt.lanes.length === RELEASE_PREFLIGHT_LANES.length, "RELEASE_PREFLIGHT_LANE_MISSING", "receipt does not contain exactly four supported lanes");
  for (const expectedLane of RELEASE_PREFLIGHT_LANES) {
    const lanes = receipt.lanes.filter((lane) => lane?.id === expectedLane.id);
    assert(lanes.length === 1, "RELEASE_PREFLIGHT_LANE_MISSING", `missing or duplicate lane ${expectedLane.id}`);
    const lane = lanes[0];
    assert(lane.os === expectedLane.os && lane.node === expectedLane.node && lane.npm === expectedLane.npm, "RELEASE_PREFLIGHT_LANE_MISMATCH", `lane ${expectedLane.id} runtime identity drifted`);
    assert(lane.status !== "skipped", "RELEASE_PREFLIGHT_LANE_SKIPPED", `lane ${expectedLane.id} was skipped`);
    assert(lane.status === "pass", "RELEASE_PREFLIGHT_LANE_RED", `lane ${expectedLane.id} is ${lane.status}`);
  }

  const expectedChecks = requiredChecks(receipt.scope);
  assert(exactKeys(receipt?.checks, expectedChecks), "RELEASE_PREFLIGHT_CHECK_MISSING", "receipt check inventory is incomplete or contains unknown checks");
  for (const check of expectedChecks) {
    const code = check === "productionDependencies"
      ? "RELEASE_PREFLIGHT_VULNERABILITY_BLOCKED"
      : "RELEASE_PREFLIGHT_CHECK_FAILED";
    assert(receipt.checks[check] === "pass", code, `${check} did not pass`, { check, status: receipt.checks[check] });
  }

  const dependencyEvidence = receipt?.evidence?.productionDependencies;
  assert(dependencyEvidence?.auditLevel === "high" && Array.isArray(dependencyEvidence?.omitted) && dependencyEvidence.omitted.length === 1 && dependencyEvidence.omitted[0] === "dev", "RELEASE_PREFLIGHT_VULNERABILITY_EVIDENCE_INVALID", "production dependency audit policy is missing");
  assert(DIGEST_PATTERN.test(dependencyEvidence?.reportDigest ?? ""), "RELEASE_PREFLIGHT_VULNERABILITY_EVIDENCE_INVALID", "production dependency report digest is missing");
  const vulnerabilityCounts = dependencyEvidence?.vulnerabilities;
  assert(vulnerabilityCounts && ["info", "low", "moderate", "high", "critical", "total"].every((key) => Number.isInteger(vulnerabilityCounts[key]) && vulnerabilityCounts[key] >= 0), "RELEASE_PREFLIGHT_VULNERABILITY_EVIDENCE_INVALID", "production dependency counts are incomplete");
  assert(vulnerabilityCounts.high === 0 && vulnerabilityCounts.critical === 0, "RELEASE_PREFLIGHT_VULNERABILITY_BLOCKED", "high or critical production dependency findings remain", vulnerabilityCounts);

  assert(DIGEST_PATTERN.test(receipt?.receiptDigest ?? "") && receipt.receiptDigest === computeReceiptDigest(receipt), "RELEASE_PREFLIGHT_DIGEST_MISMATCH", "receipt content digest does not match its payload");
  return receipt;
}
