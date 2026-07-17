#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sha256File,
  verifyManifestEnvelope,
} from "./lib/relay-host-manifest.mjs";
import { RelayHostArtifactPolicyError } from "./lib/relay-host-artifact-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requiredChecks = [
  "content",
  "components",
  "vulnerabilities",
  "reproducibility",
  "npmBoundary",
  "manifest",
  "conformance",
];

function fail(code, message, details) {
  throw new RelayHostArtifactPolicyError(code, message, details);
}

export function verifyChecksums(directory) {
  const checksumPath = resolve(directory, "SHA256SUMS");
  const lines = readFileSync(checksumPath, "utf8").trim().split("\n").filter(Boolean);
  const expected = new Map();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
    if (!match || basename(match[2]) !== match[2] || match[2] === "SHA256SUMS") {
      fail("ARTIFACT_CHECKSUM_FORMAT_INVALID", `invalid SHA256SUMS entry: ${line}`);
    }
    if (expected.has(match[2])) {
      fail("ARTIFACT_CHECKSUM_DUPLICATE", `duplicate SHA256SUMS entry: ${match[2]}`);
    }
    expected.set(match[2], `sha256:${match[1]}`);
  }

  const actualNames = readdirSync(directory)
    .filter((name) => name !== "SHA256SUMS" && statSync(resolve(directory, name)).isFile())
    .sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail("ARTIFACT_CHECKSUM_COVERAGE_MISMATCH", "SHA256SUMS must cover every regular bundle file exactly once", {
      actualNames,
      expectedNames,
    });
  }
  for (const name of actualNames) {
    const actual = sha256File(resolve(directory, name));
    if (actual !== expected.get(name)) {
      fail("ARTIFACT_CHECKSUM_MISMATCH", `${name} differs from SHA256SUMS`, {
        actual,
        expected: expected.get(name),
      });
    }
  }
  return actualNames;
}

export function verifyArtifactBundle(directory, trustedPublicKeyPath) {
  const checkedFiles = verifyChecksums(directory);
  const summary = JSON.parse(readFileSync(resolve(directory, "summary.json"), "utf8"));
  const embeddedPublicKeyPath = resolve(directory, "relay-host-signing-public.pem");
  if (summary.signingAuthority !== "ephemeral-local-test-key" && !trustedPublicKeyPath) {
    fail(
      "ARTIFACT_TRUST_ROOT_REQUIRED",
      "non-local bundles require an external trusted public key",
    );
  }
  const publicKeyPath = resolve(trustedPublicKeyPath ?? embeddedPublicKeyPath);
  const manifest = verifyManifestEnvelope(
    JSON.parse(readFileSync(resolve(directory, "relay-host.manifest.json"), "utf8")),
    readFileSync(publicKeyPath, "utf8"),
    { imageDigest: summary.immutableImageDigest },
  );

  const archivePath = resolve(directory, "relay-host.oci.tar");
  const sbomPath = resolve(directory, "relay-host.sbom.cdx.json");
  const observations = {
    archiveDigest: sha256File(archivePath),
    archiveBytes: statSync(archivePath).size,
    sbomDigest: sha256File(sbomPath),
  };
  if (
    observations.archiveDigest !== manifest.artifact.ociArchiveDigest ||
    observations.archiveBytes !== manifest.artifact.ociArchiveBytes
  ) {
    fail("OCI_ARCHIVE_IDENTITY_MISMATCH", "OCI archive differs from the signed manifest", observations);
  }
  if (observations.sbomDigest !== manifest.sbom.digest) {
    fail("SBOM_DIGEST_MISMATCH", "SBOM differs from the signed manifest", observations);
  }

  const mismatches = [
    ["relayVersion", summary.relayVersion, manifest.artifact.relayVersion],
    ["policyDigest", summary.policyDigest, manifest.build.policyDigest],
    ["buildInputsDigest", summary.buildInputsDigest, manifest.build.buildInputsDigest],
    ["sourceTreeDigest", summary.measurements?.sourceTreeDigest, manifest.build.sourceTreeDigest],
    ["ociArchiveDigest", summary.measurements?.ociArchiveDigest, observations.archiveDigest],
    ["ociArchiveBytes", summary.measurements?.ociArchiveBytes, observations.archiveBytes],
  ].filter(([, actual, expected]) => actual !== expected);
  if (mismatches.length > 0) {
    fail("ARTIFACT_SUMMARY_MISMATCH", "summary evidence differs from the signed or measured artifact", { mismatches });
  }
  const failedChecks = requiredChecks.filter((name) => summary.checks?.[name] !== "pass");
  if (summary.status !== "verified" || failedChecks.length > 0) {
    fail("ARTIFACT_EVIDENCE_INCOMPLETE", "artifact evidence does not show every required gate passing", {
      status: summary.status,
      failedChecks,
    });
  }

  return { manifest, summary, checkedFiles };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const versionDirectory = resolve(root, "output", "relay-host", pkg.version);
  const candidates = process.argv[2] ? [] : readdirSync(versionDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^linux-(?:arm64|amd64)$/u.test(entry.name))
    .map((entry) => resolve(versionDirectory, entry.name));
  if (!process.argv[2] && candidates.length !== 1) {
    fail("ARTIFACT_DIRECTORY_AMBIGUOUS", "pass an artifact directory when zero or multiple platform bundles exist", { candidates });
  }
  const directory = resolve(process.argv[2] ?? candidates[0]);
  const result = verifyArtifactBundle(directory, process.argv[3]);
  console.log(
    `relay-host artifact bundle verified version=${result.manifest.artifact.relayVersion} digest=${result.manifest.artifact.imageDigest} files=${result.checkedFiles.length}`,
  );
}
