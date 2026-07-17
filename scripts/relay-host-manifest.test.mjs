import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  RelayHostManifestError,
  canonicalJson,
  sha256,
  signManifest,
  verifyManifestEnvelope,
} from "./lib/relay-host-manifest.mjs";
import { verifyChecksums } from "./verify-relay-host-artifact-bundle.mjs";

const digest = (char) => `sha256:${char.repeat(64)}`;
const manifest = {
  contractVersion: 1,
  createdAt: "2026-07-16T00:00:00.000Z",
  artifact: {
    kind: "relay-host-cell",
    imageDigest: digest("a"),
    imageReference: `relay-host@${digest("a")}`,
    ociArchiveDigest: digest("e"),
    ociArchiveBytes: 42,
    relayVersion: "0.43.0",
  },
  npm: { name: "orionfold-relay", version: "0.43.0" },
  build: {
    sourceRevision: "e3824936",
    sourceTreeDigest: digest("f"),
    sourceState: "clean",
    nodeImage: `node:22@${digest("1")}`,
    runtimeImage: `gcr.io/distroless/nodejs22-debian13:nonroot@${digest("6")}`,
    lockfileDigest: digest("2"),
    policyDigest: digest("3"),
    buildInputsDigest: digest("4"),
    releaseInputDigest: digest("b"),
  },
  schema: { min: 1, max: 1 },
  runtime: { uid: 10001, dataMount: "/var/lib/relay" },
  sbom: { digest: digest("c") },
  rollback: { imageDigest: digest("d"), exportContractVersion: 1 },
};

test("canonical JSON is independent of object insertion order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

test("signed envelope binds digest, version, inputs and SBOM", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const envelope = signManifest(
    manifest,
    privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  assert.equal(
    verifyManifestEnvelope(
      envelope,
      publicKey.export({ type: "spki", format: "pem" }),
      {
        imageDigest: digest("a"),
        relayVersion: "0.43.0",
        releaseInputDigest: digest("b"),
        sbomDigest: digest("c"),
        sourceTreeDigest: digest("f"),
      },
    ),
    manifest,
  );
});

test("tampering and mutable references fail closed", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const envelope = signManifest(
    manifest,
    privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  envelope.manifest.npm.version = "9.9.9";
  assert.throws(
    () =>
      verifyManifestEnvelope(
        envelope,
        publicKey.export({ type: "spki", format: "pem" }),
      ),
    (error) =>
      error instanceof RelayHostManifestError && error.code === "VERSION_MISMATCH",
  );
});

test("artifact bundle checksums cover every file and detect tampering", () => {
  const directory = mkdtempSync(join(tmpdir(), "relay-host-bundle-test-"));
  try {
    writeFileSync(join(directory, "a.txt"), "original");
    writeFileSync(join(directory, "SHA256SUMS"), `${sha256("original").slice(7)}  a.txt\n`);
    assert.deepEqual(verifyChecksums(directory), ["a.txt"]);
    writeFileSync(join(directory, "a.txt"), "tampered");
    assert.throws(
      () => verifyChecksums(directory),
      (error) => error.code === "ARTIFACT_CHECKSUM_MISMATCH",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
