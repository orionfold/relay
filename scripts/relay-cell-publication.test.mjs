import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  RelayCellPublicationError,
  createReleaseIndexPlan,
  validateDocumentation,
  validateIndexManifest,
  validatePlatformEvidence,
  validatePromotionInput,
  validatePromotionWorkflow,
  validatePublicationPolicy,
  validatePublicationWorkflow,
  validateReleaseIndexEvidence,
  validateReleaseInput,
} from "./lib/relay-cell-publication.mjs";
import { measureDirectoryClosure } from "./lib/npm-closure.mjs";

const root = new URL("..", import.meta.url);
const policy = JSON.parse(readFileSync(new URL("config/relay-cell-publication-policy.json", root), "utf8"));
const productionWorkflow = readFileSync(new URL(".github/workflows/publish-relay-cell.yml", root), "utf8");
const npmWorkflow = readFileSync(new URL(".github/workflows/publish.yml", root), "utf8");
const promotionWorkflow = readFileSync(new URL(".github/workflows/promote-relay-cell.yml", root), "utf8");
const digest = (character) => `sha256:${character.repeat(64)}`;
const revision = "a".repeat(40);
const identity = "https://github.com/orionfold/relay/.github/workflows/publish-relay-cell.yml@refs/tags/cell-v1.2.3";

function expectCode(action, code) {
  assert.throws(action, (error) => error instanceof RelayCellPublicationError && error.code === code);
}

function platformReceipt(platform, character) {
  const imageDigest = digest(character);
  const attestation = { verified: true, identity, issuer: policy.identity.oidcIssuer, url: "https://github.com/orionfold/relay/attestations/1" };
  return {
    contractVersion: 1,
    platform,
    relayVersion: "1.2.3",
    sourceRevision: revision,
    sourceTreeDigest: digest("f"),
    imageDigest,
    registryDigest: imageDigest,
    imageReference: `${policy.images.production}@${imageDigest}`,
    schema: { min: 1, max: 1 },
    runtime: { uid: 10001, dataMount: "/var/lib/relay", readOnlyRoot: true },
    checks: { content: "pass", components: "pass", vulnerabilities: "pass", reproducibility: "pass", npmBoundary: "pass", manifest: "pass", conformance: "pass" },
    measurements: { imageBytes: 500_000_000, ociArchiveBytes: 300_000_000, ociArchiveDigest: digest(character === "1" ? "3" : "4") },
    npm: { name: "orionfold-relay-1.2.3.tgz", digest: digest("5"), compressedBytes: 8_000_000, unpackedBytes: 24_000_000, fileCount: 400 },
    signature: { verified: true, identity, issuer: policy.identity.oidcIssuer },
    attestations: { provenance: { ...attestation }, sbom: { ...attestation } },
  };
}

test("approved publication policy is exact and dependency-free", () => {
  assert.equal(validatePublicationPolicy(policy), policy);
  for (const mutation of [
    (copy) => { copy.registry = "docker.io"; },
    (copy) => { copy.mirrors = ["docker.io/orionfold/relay-cell"]; },
    (copy) => { copy.paidDependencies = ["paid-runner"]; },
    (copy) => { copy.release.forbiddenTags = []; },
  ]) {
    const copy = structuredClone(policy);
    mutation(copy);
    expectCode(() => validatePublicationPolicy(copy), "CELL_PUBLICATION_POLICY_INVALID");
  }
});

test("publication documentation requires the accepted public proof and rejects stale status", () => {
  const documentation = readFileSync(new URL("docs/relay-cell-oci-release.md", root), "utf8");
  assert.equal(validateDocumentation(documentation, policy), true);
  expectCode(
    () => validateDocumentation(`${documentation}\nNo Relay Cell image has been published`, policy),
    "CELL_PUBLICATION_POLICY_INVALID",
  );
});

test("npm closure measurement counts regular files without following symlinks", () => {
  const rootDirectory = mkdtempSync(join(tmpdir(), "relay-npm-closure-test-"));
  const outside = join(rootDirectory, "outside.bin");
  const packageDirectory = join(rootDirectory, "package");
  try {
    mkdirSync(packageDirectory);
    writeFileSync(outside, Buffer.alloc(10_000));
    writeFileSync(join(packageDirectory, "one.txt"), "relay");
    symlinkSync(outside, join(packageDirectory, "outside-link"));
    assert.deepEqual(measureDirectoryClosure(packageDirectory), { fileCount: 1, unpackedBytes: 5 });
  } finally {
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test("release input requires exact matching tag and clean full-SHA source", () => {
  const input = { tag: "cell-v1.2.3", packageVersion: "1.2.3", sourceState: "clean", sourceRevision: revision, sourceTreeDigest: digest("e") };
  assert.deepEqual(validateReleaseInput(input, policy), { version: "1.2.3", major: 1, minor: 2, patch: 3, immutableTag: "v1.2.3", minorTag: "v1.2" });
  expectCode(() => validateReleaseInput({ ...input, tag: "main" }, policy), "CELL_PUBLICATION_TAG_INVALID");
  expectCode(() => validateReleaseInput({ ...input, packageVersion: "1.2.4" }, policy), "CELL_PUBLICATION_VERSION_MISMATCH");
  expectCode(() => validateReleaseInput({ ...input, sourceState: "dirty-local" }, policy), "CELL_PUBLICATION_SOURCE_DIRTY");
});

test("platform evidence fails closed on set, drift, digest, signer, and attestations", () => {
  const receipts = [platformReceipt("linux/amd64", "1"), platformReceipt("linux/arm64", "2")];
  assert.equal(validatePlatformEvidence(receipts, policy), receipts);
  expectCode(() => validatePlatformEvidence(receipts.slice(0, 1), policy), "CELL_PUBLICATION_PLATFORM_SET_INVALID");
  const drift = structuredClone(receipts); drift[1].sourceTreeDigest = digest("d");
  expectCode(() => validatePlatformEvidence(drift, policy), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID");
  const registry = structuredClone(receipts); registry[0].registryDigest = digest("3");
  expectCode(() => validatePlatformEvidence(registry, policy), "CELL_PUBLICATION_DIGEST_MISMATCH");
  const signer = structuredClone(receipts); signer[0].signature.identity = "https://github.com/attacker/workflow";
  expectCode(() => validatePlatformEvidence(signer, policy), "CELL_PUBLICATION_SIGNER_INVALID");
  const wrongTag = structuredClone(receipts); wrongTag[0].signature.identity = wrongTag[0].signature.identity.replace("v1.2.3", "v9.9.9");
  expectCode(() => validatePlatformEvidence(wrongTag, policy), "CELL_PUBLICATION_SIGNER_INVALID");
  const attestation = structuredClone(receipts); attestation[0].attestations.sbom.verified = false;
  expectCode(() => validatePlatformEvidence(attestation, policy), "CELL_PUBLICATION_ATTESTATION_MISSING");
  const npmDrift = structuredClone(receipts); npmDrift[1].npm.unpackedBytes += 1;
  expectCode(() => validatePlatformEvidence(npmDrift, policy), "CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID");
});

test("index plan keeps npm and OCI closures separate and digest authoritative", () => {
  const plan = createReleaseIndexPlan([platformReceipt("linux/amd64", "1"), platformReceipt("linux/arm64", "2")], policy);
  assert.equal(plan.authority, "digest");
  assert.deepEqual(plan.discoveryTags, ["v1.2"]);
  assert.equal(plan.npmClosure.unpackedBytes, 24_000_000);
  assert.equal(plan.ociClosure.length, 2);
  assert.match(plan.npmClosure.explanation, /destination Node runtime/u);
  const manifest = {
    schemaVersion: 2,
    manifests: plan.platforms.map((item) => {
      const [os, architecture] = item.platform.split("/");
      return { digest: item.imageDigest, platform: { os, architecture } };
    }),
  };
  assert.equal(validateIndexManifest(plan, manifest, digest("8"), policy).platforms.length, 2);
  const missing = structuredClone(manifest); missing.manifests.pop();
  expectCode(() => validateIndexManifest(plan, missing, digest("8"), policy), "CELL_PUBLICATION_PLATFORM_SET_INVALID");
  assert.equal(validateReleaseIndexEvidence(plan, digest("8"), identity, "https://github.com/orionfold/relay/attestations/123", policy).digest, digest("8"));
  expectCode(() => validateReleaseIndexEvidence(plan, digest("8"), identity.replace("v1.2.3", "v1.2.4"), "https://github.com/orionfold/relay/attestations/123", policy), "CELL_PUBLICATION_SIGNER_INVALID");
});

test("promotion accepts stable by digest and refuses mutable or forbidden authority", () => {
  const input = { digest: digest("9"), version: "1.2.3", tag: "stable", operation: "promote", packageVersion: "1.2.3" };
  assert.equal(validatePromotionInput(input, policy).target, `${policy.images.production}:stable`);
  assert.equal(validatePromotionInput(input, policy).previousTarget, `${policy.images.production}:stable-previous`);
  expectCode(() => validatePromotionInput({ ...input, digest: "v1.2.3" }, policy), "CELL_PUBLICATION_TAG_REFUSED");
  expectCode(() => validatePromotionInput({ ...input, tag: "latest" }, policy), "CELL_PUBLICATION_TAG_REFUSED");
  expectCode(() => validatePromotionInput({ ...input, packageVersion: "1.2.4" }, policy), "CELL_PUBLICATION_VERSION_MISMATCH");
  assert.equal(validatePromotionInput({ ...input, operation: "rollback", packageVersion: "2.0.0" }, policy).operation, "rollback");
});

test("production workflow is tag-only, protected, native, pinned, and complete", () => {
  assert.ok(validatePublicationWorkflow(productionWorkflow, policy));
  expectCode(() => validatePublicationWorkflow(productionWorkflow.replace('tags:\n      - "cell-v*"', 'branches:\n      - "main"'), policy), "CELL_PUBLICATION_WORKFLOW_INVALID");
  expectCode(() => validatePublicationWorkflow(productionWorkflow.replace('tags:\n      - "cell-v*"', 'tags:\n      - "v*"'), policy), "CELL_PUBLICATION_WORKFLOW_INVALID");
  expectCode(() => validatePublicationWorkflow(productionWorkflow.replace("actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd", "actions/checkout@v5"), policy), "CELL_PUBLICATION_WORKFLOW_INVALID");
  expectCode(() => validatePublicationWorkflow(productionWorkflow.replace("packages: write", "packages: read"), policy), "CELL_PUBLICATION_PERMISSION_EXCESSIVE");
  expectCode(() => validatePublicationWorkflow(productionWorkflow.replace("environment: oci-production", "environment: arbitrary"), policy), "CELL_PUBLICATION_WORKFLOW_INVALID");
  expectCode(() => validatePublicationWorkflow(productionWorkflow.replace("oras cp --from-oci-layout", "oras cp"), policy), "CELL_PUBLICATION_WORKFLOW_INVALID");
});

test("OCI and npm publication use disjoint source tag namespaces", () => {
  assert.match(productionWorkflow, /tags:\n\s+- "cell-v\*"/u);
  assert.doesNotMatch(productionWorkflow, /tags:\n\s+- "v\*"/u);
  assert.match(npmWorkflow, /tags:\n\s+- "v\*"/u);
  assert.doesNotMatch(npmWorkflow, /tags:\n\s+- "cell-v\*"/u);
  assert.equal(new RegExp(policy.release.triggerTagPattern, "u").test("cell-v1.2.3"), true);
  assert.equal(new RegExp(policy.release.triggerTagPattern, "u").test("v1.2.3"), false);
});

test("promotion workflow is manual, protected, digest-verifying, pinned, and non-deleting", () => {
  assert.ok(validatePromotionWorkflow(promotionWorkflow, policy));
  expectCode(() => validatePromotionWorkflow(promotionWorkflow.replace("actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd", "actions/checkout@v5"), policy), "CELL_PUBLICATION_WORKFLOW_INVALID");
  expectCode(() => validatePromotionWorkflow(promotionWorkflow.replace("packages: write", "packages: read"), policy), "CELL_PUBLICATION_PERMISSION_EXCESSIVE");
  expectCode(() => validatePromotionWorkflow(`${promotionWorkflow}\n# oras manifest delete`, policy), "CELL_PUBLICATION_TAG_REFUSED");
});
