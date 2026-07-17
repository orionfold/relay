#!/usr/bin/env node

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256, sha256File } from "./lib/relay-host-manifest.mjs";

function parseArgs() {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`ARGUMENT_INVALID near ${key ?? "end"}`);
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: resolve(new URL("..", import.meta.url).pathname),
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ""}${result.stderr ?? ""}` : "";
    throw new Error(`COMMAND_FAILED ${command} ${args.join(" ")} ${detail}`);
  }
  return options.capture ? result.stdout.trim() : "";
}

const options = parseArgs();
for (const required of ["rollback-digest", "private-key", "public-key"]) {
  if (!options[required]) throw new Error(`ARGUMENT_REQUIRED --${required}`);
}

const root = resolve(new URL("..", import.meta.url).pathname);
const outputDir = resolve(options.out ?? "output/relay-host");
const tag = options.tag ?? "relay-host:g080-local";
mkdirSync(outputDir, { recursive: true });

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const sourceRevision = run("git", ["rev-parse", "HEAD"], { capture: true });
const sourceDiff = run("git", ["diff", "--binary", "HEAD", "--", "."], {
  capture: true,
});
const untrackedPaths = run(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", "."],
  { capture: true },
)
  .split("\n")
  .filter(Boolean)
  .sort();
const sourceTreeDigest = sha256(
  Buffer.concat([
    Buffer.from(`revision\0${sourceRevision}\0diff\0${sourceDiff}\0`),
    ...untrackedPaths.flatMap((path) => [
      Buffer.from(`path\0${path}\0`),
      readFileSync(resolve(root, path)),
      Buffer.from("\0"),
    ]),
  ]),
);
const sourceState = sourceDiff || untrackedPaths.length > 0 ? "dirty-local" : "clean";
const sourceEpoch = run("git", ["show", "-s", "--format=%ct", "HEAD"], {
  capture: true,
});
const createdAt = new Date(Number(sourceEpoch) * 1000).toISOString();
const loadedMetadataPath = resolve(outputDir, "build-loaded-metadata.json");
const ociMetadataPath = resolve(outputDir, "build-oci-metadata.json");
const ociArchivePath = resolve(outputDir, "relay-host.oci.tar");
const commonBuildArgs = [
  "--file",
  "Dockerfile.relay-host",
  "--provenance=false",
  "--build-arg",
  `RELAY_VERSION=${pkg.version}`,
  "--build-arg",
  `RELAY_SOURCE_REVISION=${sourceRevision}`,
  "--build-arg",
  `SOURCE_DATE_EPOCH=${sourceEpoch}`,
  ".",
];

run("docker", [
  "buildx",
  "build",
  "--load",
  "--tag",
  tag,
  "--metadata-file",
  loadedMetadataPath,
  ...commonBuildArgs,
]);
run("docker", [
  "buildx",
  "build",
  "--output",
  `type=oci,dest=${ociArchivePath}`,
  "--metadata-file",
  ociMetadataPath,
  ...commonBuildArgs,
]);

const loadedMetadata = JSON.parse(readFileSync(loadedMetadataPath, "utf8"));
const ociMetadata = JSON.parse(readFileSync(ociMetadataPath, "utf8"));
const loadedConfigDigest = loadedMetadata["containerimage.config.digest"];
const ociConfigDigest = ociMetadata["containerimage.config.digest"];
const imageDigest = ociMetadata["containerimage.digest"];
if (!imageDigest || !loadedConfigDigest || loadedConfigDigest !== ociConfigDigest) {
  throw new Error(
    `BUILD_NOT_REPRODUCIBLE loadedConfig=${loadedConfigDigest ?? "missing"} ociConfig=${ociConfigDigest ?? "missing"}`,
  );
}

const sbomPath = resolve(outputDir, "relay-host.sbom.cdx.json");
run("docker", [
  "scout",
  "sbom",
  "--format",
  "cyclonedx",
  "--output",
  sbomPath,
  `local://${tag}`,
]);

const manifestPath = resolve(outputDir, "relay-host.manifest.json");
run("node", [
  "scripts/create-relay-host-manifest.mjs",
  "--image-digest",
  imageDigest,
  "--image-name",
  options["image-name"] ?? "local/orionfold-relay-host",
  "--rollback-digest",
  options["rollback-digest"],
  "--oci-archive",
  ociArchivePath,
  "--sbom",
  sbomPath,
  "--source-revision",
  sourceRevision,
  "--source-tree-digest",
  sourceTreeDigest,
  "--source-state",
  sourceState,
  "--private-key",
  resolve(options["private-key"]),
  "--out",
  manifestPath,
  "--created-at",
  createdAt,
]);
run("node", [
  "scripts/verify-relay-host-manifest.mjs",
  manifestPath,
  resolve(options["public-key"]),
  imageDigest,
]);

const loadedImageId = run(
  "docker",
  ["image", "inspect", "--format", "{{.Id}}", tag],
  { capture: true },
);
const imageBytes = Number(
  run("docker", ["image", "inspect", "--format", "{{.Size}}", tag], {
    capture: true,
  }),
);
const measurements = {
  contractVersion: 1,
  tag,
  relayVersion: pkg.version,
  sourceRevision,
  sourceTreeDigest,
  sourceState,
  imageDigest,
  loadedExporterDigest: loadedMetadata["containerimage.digest"],
  loadedImageId,
  imageConfigDigest: loadedConfigDigest,
  imageBytes,
  ociArchiveBytes: statSync(ociArchivePath).size,
  ociArchiveDigest: sha256File(ociArchivePath),
  sbomBytes: statSync(sbomPath).size,
  sbomDigest: sha256File(sbomPath),
  densityClaim: "provisional-not-for-public-support",
};
writeFileSync(
  resolve(outputDir, "measurements.json"),
  `${JSON.stringify(measurements, null, 2)}\n`,
);
console.log(JSON.stringify(measurements, null, 2));
