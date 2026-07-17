import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { closeSync, openSync, readFileSync, readSync } from "node:fs";

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REVISION_PATTERN = /^[a-f0-9]{7,64}$/;

export class RelayHostManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RelayHostManifestError";
    this.code = code;
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(data) {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

export function sha256File(path) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = openSync(path, "r");
  try {
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return `sha256:${hash.digest("hex")}`;
}

function assert(condition, code, message) {
  if (!condition) throw new RelayHostManifestError(code, message);
}

export function validateManifest(manifest) {
  assert(manifest?.contractVersion === 1, "CONTRACT_VERSION_INVALID", "contractVersion must be 1");
  assert(manifest?.artifact?.kind === "relay-host-cell", "ARTIFACT_KIND_INVALID", "artifact.kind must be relay-host-cell");
  assert(DIGEST_PATTERN.test(manifest?.artifact?.imageDigest ?? ""), "IMAGE_DIGEST_INVALID", "artifact.imageDigest must be sha256");
  assert(DIGEST_PATTERN.test(manifest?.artifact?.ociArchiveDigest ?? ""), "OCI_ARCHIVE_DIGEST_INVALID", "artifact.ociArchiveDigest must be sha256");
  assert(Number.isInteger(manifest?.artifact?.ociArchiveBytes) && manifest.artifact.ociArchiveBytes > 0, "OCI_ARCHIVE_SIZE_INVALID", "artifact.ociArchiveBytes must be positive");
  assert(
    typeof manifest?.artifact?.imageReference === "string" &&
      manifest.artifact.imageReference.endsWith(`@${manifest.artifact.imageDigest}`),
    "IMAGE_REFERENCE_MUTABLE",
    "artifact.imageReference must end with the verified digest",
  );
  assert(manifest?.npm?.name === "orionfold-relay", "NPM_PACKAGE_INVALID", "npm.name must be orionfold-relay");
  assert(typeof manifest?.npm?.version === "string" && manifest.npm.version.length > 0, "NPM_VERSION_INVALID", "npm.version is required");
  assert(manifest?.artifact?.relayVersion === manifest.npm.version, "VERSION_MISMATCH", "OCI and npm versions differ");
  assert(REVISION_PATTERN.test(manifest?.build?.sourceRevision ?? ""), "SOURCE_REVISION_INVALID", "build.sourceRevision must be a git object ID");
  assert(DIGEST_PATTERN.test(manifest?.build?.sourceTreeDigest ?? ""), "SOURCE_TREE_DIGEST_INVALID", "build.sourceTreeDigest must be sha256");
  assert(["clean", "dirty-local"].includes(manifest?.build?.sourceState), "SOURCE_STATE_INVALID", "build.sourceState must name clean or dirty-local inputs");
  assert(DIGEST_PATTERN.test(manifest?.build?.releaseInputDigest ?? ""), "RELEASE_INPUT_INVALID", "build.releaseInputDigest must be sha256");
  assert(DIGEST_PATTERN.test(manifest?.sbom?.digest ?? ""), "SBOM_DIGEST_INVALID", "sbom.digest must be sha256");
  assert(manifest?.schema?.min === 1 && manifest?.schema?.max === 1, "SCHEMA_RANGE_INVALID", "schema range must match cell contract v1");
  assert(manifest?.runtime?.uid === 10001 && manifest?.runtime?.dataMount === "/var/lib/relay", "RUNTIME_CONTRACT_INVALID", "runtime identity or data mount differs from v1");
  assert(DIGEST_PATTERN.test(manifest?.rollback?.imageDigest ?? ""), "ROLLBACK_DIGEST_INVALID", "rollback.imageDigest must be sha256");
  assert(manifest.rollback.imageDigest !== manifest.artifact.imageDigest, "ROLLBACK_DIGEST_NOT_PRIOR", "rollback digest must differ from current image digest");
  assert(manifest?.rollback?.exportContractVersion === 1, "EXPORT_CONTRACT_INVALID", "rollback export contract must be v1");
  assert(!Number.isNaN(Date.parse(manifest?.createdAt ?? "")), "CREATED_AT_INVALID", "createdAt must be ISO-8601");
  return manifest;
}

export function signManifest(manifest, privateKeyPem) {
  validateManifest(manifest);
  const privateKey = createPrivateKey(privateKeyPem);
  assert(privateKey.asymmetricKeyType === "ed25519", "SIGNING_KEY_INVALID", "signing key must be Ed25519");
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const keyId = sha256(publicDer);
  const signature = sign(null, Buffer.from(canonicalJson(manifest)), privateKey);
  return {
    manifest,
    signature: {
      algorithm: "ed25519",
      keyId,
      value: signature.toString("base64"),
    },
  };
}

export function verifyManifestEnvelope(envelope, publicKeyPem, expected = {}) {
  const manifest = validateManifest(envelope?.manifest);
  assert(envelope?.signature?.algorithm === "ed25519", "SIGNATURE_ALGORITHM_INVALID", "signature algorithm must be Ed25519");
  const publicKey = createPublicKey(publicKeyPem);
  assert(publicKey.asymmetricKeyType === "ed25519", "VERIFY_KEY_INVALID", "verification key must be Ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  assert(envelope.signature.keyId === sha256(publicDer), "SIGNING_KEY_MISMATCH", "signature key ID differs from trusted public key");
  assert(
    verify(
      null,
      Buffer.from(canonicalJson(manifest)),
      publicKey,
      Buffer.from(envelope.signature.value ?? "", "base64"),
    ),
    "SIGNATURE_INVALID",
    "manifest signature verification failed",
  );

  const checks = [
    ["imageDigest", manifest.artifact.imageDigest, "IMAGE_DIGEST_MISMATCH"],
    ["relayVersion", manifest.artifact.relayVersion, "RELAY_VERSION_MISMATCH"],
    ["sbomDigest", manifest.sbom.digest, "SBOM_DIGEST_MISMATCH"],
    ["releaseInputDigest", manifest.build.releaseInputDigest, "RELEASE_INPUT_MISMATCH"],
    ["sourceTreeDigest", manifest.build.sourceTreeDigest, "SOURCE_TREE_DIGEST_MISMATCH"],
  ];
  for (const [key, actual, code] of checks) {
    if (expected[key] !== undefined) {
      assert(expected[key] === actual, code, `${key} differs from the expected value`);
    }
  }
  return manifest;
}
