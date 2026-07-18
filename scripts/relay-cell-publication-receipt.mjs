#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  RelayCellPublicationError,
  createReleaseIndexPlan,
  validateIndexManifest,
  validatePlatformReceipt,
  validatePromotionInput,
  validatePublicationPolicy,
  validateReleaseIndexEvidence,
} from "./lib/relay-cell-publication.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);

function parseArgs() {
  const command = process.argv[2];
  const options = {};
  for (let index = 3; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new RelayCellPublicationError("CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `invalid argument near ${key ?? "end"}`);
    }
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function required(options, name) {
  if (!options[name]) throw new RelayCellPublicationError("CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `--${name} is required`);
  return options[name];
}

function readJson(path) {
  const resolved = resolve(path);
  try {
    return JSON.parse(readFileSync(resolved, "utf8"));
  } catch (cause) {
    throw new RelayCellPublicationError("CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `cannot read valid JSON evidence from ${resolved}`, { cause: cause instanceof Error ? cause.message : String(cause) });
  }
}

function writeJson(path, value) {
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
}

function findNamedFiles(directory, name, found = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new RelayCellPublicationError("CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `symbolic link is forbidden in receipt evidence: ${path}`);
    if (stat.isDirectory()) findNamedFiles(path, name, found);
    else if (stat.isFile() && basename(path) === name) found.push(path);
  }
  return found;
}

const { command, options } = parseArgs();
const policy = validatePublicationPolicy(readJson(resolve(root, "config/relay-cell-publication-policy.json")));

if (command === "platform") {
  const artifactDirectory = resolve(required(options, "artifact-dir"));
  const summary = readJson(join(artifactDirectory, "summary.json"));
  const npm = readJson(join(artifactDirectory, "npm-boundary.json"));
  const envelope = readJson(join(artifactDirectory, "relay-host.manifest.json"));
  const manifest = envelope.manifest;
  const registryDigest = required(options, "registry-digest");
  const identity = required(options, "identity");
  const issuer = policy.identity.oidcIssuer;

  if (summary.status !== "verified" || summary.publication !== "none" || summary.sourceState !== "clean") {
    throw new RelayCellPublicationError("CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", "G-093 summary is not clean, verified, and non-publishing");
  }
  if (registryDigest !== summary.immutableImageDigest) {
    throw new RelayCellPublicationError("CELL_PUBLICATION_DIGEST_MISMATCH", "registry digest differs from the audited G-093 digest");
  }

  const receipt = {
    contractVersion: 1,
    platform: summary.platform,
    relayVersion: summary.relayVersion,
    sourceRevision: manifest.build.sourceRevision,
    sourceTreeDigest: manifest.build.sourceTreeDigest,
    imageDigest: summary.immutableImageDigest,
    registryDigest,
    imageReference: `${policy.images.production}@${registryDigest}`,
    schema: manifest.schema,
    runtime: manifest.runtime,
    checks: { ...summary.checks },
    measurements: {
      imageBytes: summary.measurements.imageBytes,
      ociArchiveBytes: summary.measurements.ociArchiveBytes,
      ociArchiveDigest: summary.measurements.ociArchiveDigest,
    },
    npm: {
      name: npm.name,
      digest: npm.digest,
      compressedBytes: npm.bytes,
      unpackedBytes: npm.unpackedBytes,
      fileCount: npm.fileCount,
    },
    signature: { verified: true, identity, issuer },
    attestations: {
      provenance: { verified: true, identity, issuer, url: required(options, "provenance-url") },
      sbom: { verified: true, identity, issuer, url: required(options, "sbom-url") },
    },
  };
  validatePlatformReceipt(receipt, policy);
  writeJson(required(options, "out"), receipt);
  console.log(JSON.stringify({ status: "verified", platform: receipt.platform, imageDigest: receipt.imageDigest, out: resolve(options.out) }, null, 2));
} else if (command === "index-plan") {
  const directory = resolve(required(options, "receipts-dir"));
  const paths = findNamedFiles(directory, "platform-receipt.json").sort();
  const receipts = paths.map(readJson);
  const plan = createReleaseIndexPlan(receipts, policy);
  writeJson(required(options, "out"), plan);
  console.log(JSON.stringify({ status: "verified", receiptCount: receipts.length, out: resolve(options.out) }, null, 2));
} else if (command === "index-finalize") {
  const plan = readJson(required(options, "plan"));
  const digest = required(options, "digest");
  const identity = required(options, "identity");
  const attestationUrl = required(options, "attestation-url");
  validateReleaseIndexEvidence(plan, digest, identity, attestationUrl, policy);
  const receipt = {
    ...plan,
    indexDigest: digest,
    imageReference: `${policy.images.production}@${digest}`,
    signature: { verified: true, identity, issuer: policy.identity.oidcIssuer },
    attestation: {
      verified: true,
      identity,
      issuer: policy.identity.oidcIssuer,
      url: attestationUrl,
    },
    status: "verified",
  };
  writeJson(required(options, "out"), receipt);
  console.log(JSON.stringify({ status: "verified", indexDigest: digest, out: resolve(options.out) }, null, 2));
} else if (command === "validate-index") {
  const result = validateIndexManifest(
    readJson(required(options, "plan")),
    readJson(required(options, "manifest")),
    required(options, "digest"),
    policy,
  );
  console.log(JSON.stringify({ status: "verified", ...result }, null, 2));
} else if (command === "validate-promotion") {
  const result = validatePromotionInput({
    digest: required(options, "digest"),
    version: required(options, "version"),
    tag: required(options, "tag"),
    operation: required(options, "operation"),
    packageVersion: required(options, "package-version"),
  }, policy);
  console.log(JSON.stringify({ status: "verified", ...result }, null, 2));
} else {
  throw new RelayCellPublicationError("CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID", `unsupported command: ${command ?? "missing"}`);
}
