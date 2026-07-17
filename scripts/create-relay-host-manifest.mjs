#!/usr/bin/env node

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256, sha256File, signManifest } from "./lib/relay-host-manifest.mjs";

function args() {
  const values = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`ARGUMENT_INVALID near ${key ?? "end"}`);
    }
    values[key.slice(2)] = value;
  }
  return values;
}

const options = args();
for (const required of [
  "image-digest",
  "image-name",
  "rollback-digest",
  "oci-archive",
  "sbom",
  "source-revision",
  "source-tree-digest",
  "source-state",
  "base-image",
  "runtime-base-image",
  "policy-digest",
  "build-inputs-digest",
  "private-key",
  "out",
  "created-at",
]) {
  if (!options[required]) throw new Error(`ARGUMENT_REQUIRED --${required}`);
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const releaseInputs = Buffer.concat([
  readFileSync(new URL("../package-lock.json", import.meta.url)),
  readFileSync(new URL("../Dockerfile.relay-host", import.meta.url)),
  Buffer.from(options["source-revision"]),
  Buffer.from(options["source-tree-digest"]),
  Buffer.from(options["base-image"]),
  Buffer.from(options["runtime-base-image"]),
  Buffer.from(options["policy-digest"]),
  Buffer.from(options["build-inputs-digest"]),
]);
const manifest = {
  contractVersion: 1,
  createdAt: new Date(options["created-at"]).toISOString(),
  artifact: {
    kind: "relay-host-cell",
    imageDigest: options["image-digest"],
    imageReference: `${options["image-name"]}@${options["image-digest"]}`,
    ociArchiveDigest: sha256File(resolve(options["oci-archive"])),
    ociArchiveBytes: statSync(resolve(options["oci-archive"])).size,
    relayVersion: pkg.version,
  },
  npm: { name: pkg.name, version: pkg.version },
  build: {
    sourceRevision: options["source-revision"],
    sourceTreeDigest: options["source-tree-digest"],
    sourceState: options["source-state"],
    nodeImage: options["base-image"],
    runtimeImage: options["runtime-base-image"],
    lockfileDigest: sha256File(new URL("../package-lock.json", import.meta.url)),
    policyDigest: options["policy-digest"],
    buildInputsDigest: options["build-inputs-digest"],
    releaseInputDigest: sha256(releaseInputs),
  },
  schema: { min: 1, max: 1 },
  runtime: {
    uid: 10001,
    gid: 10001,
    dataMount: "/var/lib/relay",
    tempMount: "/tmp",
    port: 3000,
    livenessPath: "/api/health/live",
    readinessPath: "/api/health/ready",
    readOnlyRoot: true,
    requiredCapabilities: [],
  },
  resources: {
    memoryBytes: 1_073_741_824,
    cpuUnits: 1024,
    pids: 256,
    densityClaim: "provisional-not-for-public-support",
  },
  sbom: {
    format: "cyclonedx-json",
    digest: sha256File(resolve(options.sbom)),
  },
  rollback: {
    imageDigest: options["rollback-digest"],
    exportContractVersion: 1,
  },
};
const envelope = signManifest(
  manifest,
  readFileSync(resolve(options["private-key"]), "utf8"),
);
writeFileSync(resolve(options.out), `${JSON.stringify(envelope, null, 2)}\n`, {
  mode: 0o644,
});
console.log(`relay-host manifest written key=${envelope.signature.keyId}`);
