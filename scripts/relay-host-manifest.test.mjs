import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  RelayHostManifestError,
  canonicalJson,
  signManifest,
  verifyManifestEnvelope,
} from "./lib/relay-host-manifest.mjs";

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
