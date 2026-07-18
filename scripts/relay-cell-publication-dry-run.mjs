#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createReleaseIndexPlan,
  validatePromotionInput,
  validatePublicationPolicy,
  validateReleaseInput,
} from "./lib/relay-cell-publication.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const out = resolve(root, "output/relay-cell-publication/dry-run.json");
const policy = validatePublicationPolicy(JSON.parse(readFileSync(resolve(root, "config/relay-cell-publication-policy.json"), "utf8")));
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

function sha(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`CELL_PUBLICATION_DRY_RUN_GIT_FAILED git ${args.join(" ")}`);
  return result.stdout.trim();
}

const sourceRevision = git(["rev-parse", "HEAD"]);
const dirty = git(["status", "--porcelain", "--untracked-files=all"]).length > 0;
const simulatedTreeDigest = sha(`clean-tag-tree:${sourceRevision}`);
const tag = `v${pkg.version}`;
const release = validateReleaseInput({ tag, packageVersion: pkg.version, sourceState: "clean", sourceRevision, sourceTreeDigest: simulatedTreeDigest }, policy);
const identity = `https://github.com/orionfold/relay/.github/workflows/publish-relay-cell.yml@refs/tags/${tag}`;

function receipt(platform) {
  const imageDigest = sha(`${tag}:${platform}:audited-oci-layout`);
  const attestation = { verified: true, identity, issuer: policy.identity.oidcIssuer, url: `https://github.com/orionfold/relay/attestations/dry-run-${platform.replace("/", "-")}` };
  return {
    contractVersion: 1,
    platform,
    relayVersion: pkg.version,
    sourceRevision,
    sourceTreeDigest: simulatedTreeDigest,
    imageDigest,
    registryDigest: imageDigest,
    imageReference: `${policy.images.production}@${imageDigest}`,
    schema: { min: 1, max: 1 },
    runtime: { uid: 10001, dataMount: "/var/lib/relay", readOnlyRoot: true },
    checks: { content: "pass", components: "pass", vulnerabilities: "pass", reproducibility: "pass", npmBoundary: "pass", manifest: "pass", conformance: "pass" },
    measurements: { imageBytes: 500_000_000, ociArchiveBytes: 300_000_000, ociArchiveDigest: sha(`${tag}:${platform}:archive`) },
    npm: { name: `orionfold-relay-${pkg.version}.tgz`, digest: sha(`${tag}:npm-tarball`), compressedBytes: 8_000_000, unpackedBytes: 24_000_000, fileCount: 400 },
    signature: { verified: true, identity, issuer: policy.identity.oidcIssuer },
    attestations: { provenance: { ...attestation }, sbom: { ...attestation } },
  };
}

const indexPlan = createReleaseIndexPlan(policy.platforms.map(receipt), policy);
const promotion = validatePromotionInput({ digest: sha(`${tag}:multi-platform-index`), version: pkg.version, tag: "stable", operation: "promote", packageVersion: pkg.version }, policy);
const receiptDocument = {
  contractVersion: 1,
  status: "dry-run-complete",
  simulated: true,
  publication: "none",
  externalWrites: 0,
  credentialsRead: 0,
  sourceObservation: {
    revision: sourceRevision,
    workingTree: dirty ? "dirty-local" : "clean",
    currentCheckoutPromotionEligible: !dirty && git(["tag", "--points-at", "HEAD"]).split("\n").includes(tag),
  },
  simulatedReleaseInput: { tag, version: release.version, sourceTreeDigest: simulatedTreeDigest },
  indexPlan,
  promotion,
  intendedCommands: [
    "oras cp --from-oci-layout <audited-archive>@<audited-digest> ghcr.io/orionfold/relay-cell:<exact-platform-tag>",
    "oras resolve ghcr.io/orionfold/relay-cell:<exact-platform-tag>",
    "cosign sign --yes ghcr.io/orionfold/relay-cell@<digest>",
    "cosign verify ghcr.io/orionfold/relay-cell@<digest> --certificate-oidc-issuer <issuer> --certificate-identity <exact-workflow-identity>",
    "docker buildx imagetools create --tag ghcr.io/orionfold/relay-cell:<exact-version> <two-digest-pinned-platform-subjects>",
    "oras tag ghcr.io/orionfold/relay-cell@<displaced-stable-digest> stable-previous",
    "oras tag ghcr.io/orionfold/relay-cell@<verified-index-digest> stable",
  ],
  note: "This receipt is synthetic policy evidence. No registry, signing, attestation, tag, push, release, visibility, or publication operation ran.",
};

mkdirSync(resolve(out, ".."), { recursive: true });
writeFileSync(out, `${JSON.stringify(receiptDocument, null, 2)}\n`, { mode: 0o644 });
console.log(JSON.stringify({ ...receiptDocument, output: out }, null, 2));
