#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  RelayHostManifestError,
  sha256File,
  verifyManifestEnvelope,
} from "./lib/relay-host-manifest.mjs";

const [envelopePath, publicKeyPath, expectedDigest] = process.argv.slice(2);
if (!envelopePath || !publicKeyPath) {
  throw new Error("USAGE: verify-relay-host-manifest <envelope.json> <public.pem> [sha256:digest]");
}
const manifest = verifyManifestEnvelope(
  JSON.parse(readFileSync(resolve(envelopePath), "utf8")),
  readFileSync(resolve(publicKeyPath), "utf8"),
  expectedDigest ? { imageDigest: expectedDigest } : {},
);
const artifactDir = dirname(resolve(envelopePath));
const archiveDigest = sha256File(resolve(artifactDir, "relay-host.oci.tar"));
if (archiveDigest !== manifest.artifact.ociArchiveDigest) {
  throw new RelayHostManifestError(
    "OCI_ARCHIVE_DIGEST_MISMATCH",
    "local OCI archive differs from the signed manifest",
  );
}
const sbomDigest = sha256File(resolve(artifactDir, "relay-host.sbom.cdx.json"));
if (sbomDigest !== manifest.sbom.digest) {
  throw new RelayHostManifestError(
    "SBOM_DIGEST_MISMATCH",
    "local SBOM differs from the signed manifest",
  );
}
console.log(
  `relay-host manifest verified version=${manifest.artifact.relayVersion} digest=${manifest.artifact.imageDigest}`,
);
