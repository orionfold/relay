#!/usr/bin/env node

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  RelayHostArtifactPolicyError,
  attributeSbom,
  compareBuildSemantics,
  evaluateOciPolicy,
  evaluateVulnerabilities,
  inspectOciArchive,
  validateArtifactInputs,
} from "./lib/relay-host-artifact-policy.mjs";
import { ensureTrivy } from "./lib/relay-host-tools.mjs";
import { sha256, sha256File } from "./lib/relay-host-manifest.mjs";
import { extractAndMeasureNpmClosure } from "./lib/npm-closure.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);

function parseArgs() {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new RelayHostArtifactPolicyError("ARGUMENT_INVALID", `invalid argument near ${key ?? "end"}`);
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    maxBuffer: 200 * 1024 * 1024,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new RelayHostArtifactPolicyError(
      options.code ?? "COMMAND_FAILED",
      `${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`,
      { command, args, status: result.status },
    );
  }
  return options.capture === false ? "" : result.stdout.trim();
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function timed(timings, name, action) {
  const started = Date.now();
  try {
    return await action();
  } finally {
    timings[name] = Date.now() - started;
  }
}

function git(command) {
  return run("git", command, { code: "ARTIFACT_INPUT_GIT_FAILED" });
}

function sourceIdentity() {
  const revision = git(["rev-parse", "HEAD"]);
  const diff = git(["diff", "--binary", "HEAD", "--", "."]);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "."])
    .split("\n")
    .filter(Boolean)
    .sort();
  const treeDigest = sha256(
    Buffer.concat([
      Buffer.from(`revision\0${revision}\0diff\0${diff}\0`),
      ...untracked.flatMap((path) => [
        Buffer.from(`path\0${path}\0`),
        readFileSync(resolve(root, path)),
        Buffer.from("\0"),
      ]),
    ]),
  );
  return {
    revision,
    treeDigest,
    state: diff || untracked.length > 0 ? "dirty-local" : "clean",
    epoch: git(["show", "-s", "--format=%ct", "HEAD"]),
    untracked,
  };
}

function dockerfileImage(name) {
  const source = readFileSync(resolve(root, "Dockerfile.relay-host"), "utf8");
  const match = source.match(new RegExp(`^ARG ${name}=(\\S+)$`, "mu"));
  return match?.[1];
}

function buildInputDigest(policyPath) {
  const paths = [
    "package-lock.json",
    "Dockerfile.relay-host",
    ".dockerignore",
    "next.config.mjs",
    "scripts/build-relay-host-artifact.mjs",
    "scripts/create-relay-host-manifest.mjs",
    "scripts/relay-host-artifact.mjs",
    "scripts/relay-host-smoke.mjs",
    "scripts/verify-relay-host-artifact-bundle.mjs",
    "scripts/verify-relay-host-manifest.mjs",
    "scripts/lib/relay-host-artifact-policy.mjs",
    "scripts/lib/relay-host-manifest.mjs",
    "scripts/lib/relay-host-tools.mjs",
    "scripts/lib/npm-closure.mjs",
    "scripts/check-public-boundary.mjs",
    policyPath,
  ];
  return sha256(
    Buffer.concat(
      paths.flatMap((path) => [Buffer.from(`path\0${path}\0`), readFileSync(resolve(root, path)), Buffer.from("\0")]),
    ),
  );
}

function metadataIdentity(metadata) {
  return {
    imageDigest: metadata["containerimage.digest"],
    configDigest: metadata["containerimage.config.digest"],
  };
}

function ensureIdentity(identity, label) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(identity.imageDigest ?? "") ||
      !/^sha256:[a-f0-9]{64}$/u.test(identity.configDigest ?? "")) {
    throw new RelayHostArtifactPolicyError(
      "BUILD_IDENTITY_MISSING",
      `${label} exporter did not report image and config digests`,
      identity,
    );
  }
  return identity;
}

function checkPolicies(...reports) {
  const violation = reports.flatMap((report) => report.violations ?? [])[0];
  if (violation) {
    throw new RelayHostArtifactPolicyError(violation.code, violation.message, violation.details ?? violation);
  }
}

async function npmTarballReceipt(policy) {
  const directory = mkdtempSync(join(tmpdir(), "relay-host-npm-pack-"));
  try {
    run("npm", ["pack", "--pack-destination", directory], { code: "NPM_TARBALL_BUILD_FAILED" });
    const name = readdirSync(directory).find((entry) => entry.endsWith(".tgz"));
    if (!name) throw new RelayHostArtifactPolicyError("NPM_TARBALL_MISSING", "npm pack produced no tarball");
    const path = join(directory, name);
    const bytes = statSync(path).size;
    if (bytes > policy.budgets.maxNpmTarballBytes) {
      throw new RelayHostArtifactPolicyError(
        "NPM_TARBALL_SIZE_BUDGET_EXCEEDED",
        `npm tarball is ${bytes} bytes`,
      );
    }
    run("node", ["scripts/check-public-boundary.mjs", "npm", path], { code: "NPM_TARBALL_CONTENT_POLICY_FAILED" });
    const unpackedDirectory = join(directory, "unpacked");
    mkdirSync(unpackedDirectory);
    const unpacked = await extractAndMeasureNpmClosure(path, unpackedDirectory);
    return {
      name,
      bytes,
      ...unpacked,
      digest: sha256File(path),
      maxBytes: policy.budgets.maxNpmTarballBytes,
      status: "pass",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeChecksums(outputDir) {
  const names = readdirSync(outputDir)
    .filter((name) => name !== "SHA256SUMS" && statSync(join(outputDir, name)).isFile())
    .sort();
  const lines = names.map((name) => `${sha256File(join(outputDir, name)).slice(7)}  ${name}`);
  writeFileSync(join(outputDir, "SHA256SUMS"), `${lines.join("\n")}\n`);
  return names;
}

const options = parseArgs();
for (const required of ["rollback-digest", "private-key", "public-key"]) {
  if (!options[required]) throw new RelayHostArtifactPolicyError("ARGUMENT_REQUIRED", `--${required} is required`);
}

const outputDir = resolve(options.out ?? "output/relay-host");
const tag = options.tag ?? "relay-host:g093-local";
const policyPath = options.policy ?? "config/relay-host-artifact-policy.json";
const policy = JSON.parse(readFileSync(resolve(root, policyPath), "utf8"));
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lockfile = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const source = sourceIdentity();
const nodeImage = dockerfileImage("NODE_IMAGE");
const runtimeImage = dockerfileImage("RUNTIME_IMAGE");
const publicationProfile = options.profile === "publication";
validateArtifactInputs({
  packageVersion: pkg.version,
  expectedVersion: options["expected-version"],
  nodeImage,
  runtimeImage,
  sourceState: source.state,
  publicationProfile,
});

mkdirSync(outputDir, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), "relay-host-control-"));
const timings = {};
const loadedMetadataPath = resolve(outputDir, "build-loaded-metadata.json");
const ociMetadataPath = resolve(outputDir, "build-oci-metadata.json");
const controlMetadataPath = resolve(temporary, "build-control-metadata.json");
const ociArchivePath = resolve(outputDir, "relay-host.oci.tar");
const controlArchivePath = resolve(temporary, "relay-host-control.oci.tar");
const commonBuildArgs = [
  "--file", "Dockerfile.relay-host",
  "--provenance=false",
  "--build-arg", `RELAY_VERSION=${pkg.version}`,
  "--build-arg", `RELAY_SOURCE_REVISION=${source.revision}`,
  "--build-arg", `RELAY_SOURCE_TREE_DIGEST=${source.treeDigest}`,
  "--build-arg", `SOURCE_DATE_EPOCH=${source.epoch}`,
  ".",
];

try {
  await timed(timings, "cachedLoadedBuildMs", async () => run("docker", [
    "buildx", "build", "--load", "--tag", tag, "--metadata-file", loadedMetadataPath, ...commonBuildArgs,
  ], { capture: false, code: "ARTIFACT_BUILD_FAILED" }));
  await timed(timings, "cachedOciBuildMs", async () => run("docker", [
    "buildx", "build", "--output", `type=oci,dest=${ociArchivePath},compression=gzip,compression-level=6,force-compression=true,rewrite-timestamp=true`, "--metadata-file", ociMetadataPath, ...commonBuildArgs,
  ], { capture: false, code: "ARTIFACT_OCI_EXPORT_FAILED" }));
  await timed(timings, "cleanNoCacheBuildMs", async () => run("docker", [
    "buildx", "build", "--no-cache", "--output", `type=oci,dest=${controlArchivePath},compression=gzip,compression-level=6,force-compression=true,rewrite-timestamp=true`, "--metadata-file", controlMetadataPath, ...commonBuildArgs,
  ], { capture: false, code: "ARTIFACT_NO_CACHE_BUILD_FAILED" }));

  const loaded = ensureIdentity(metadataIdentity(JSON.parse(readFileSync(loadedMetadataPath, "utf8"))), "loaded");
  ensureIdentity(metadataIdentity(JSON.parse(readFileSync(ociMetadataPath, "utf8"))), "OCI");
  ensureIdentity(metadataIdentity(JSON.parse(readFileSync(controlMetadataPath, "utf8"))), "no-cache OCI");
  const inventory = await timed(timings, "contentInventoryMs", () => inspectOciArchive(ociArchivePath));
  const controlInventory = await timed(timings, "controlInventoryMs", () => inspectOciArchive(controlArchivePath));
  const oci = { imageDigest: inventory.imageDigest, configDigest: inventory.configDigest };
  const control = { imageDigest: controlInventory.imageDigest, configDigest: controlInventory.configDigest };
  const cachedVsControl = compareBuildSemantics(inventory, controlInventory);
  const metadataDigestObservation = {
    status: oci.imageDigest === control.imageDigest && oci.configDigest === control.configDigest
      ? "identical"
      : "different-nonsemantic-metadata",
    cached: oci,
    noCache: control,
  };
  const reproducibility = {
    contractVersion: 1,
    status: "pass",
    loadedRuntimeCarrier: {
      status: "not-digest-comparable",
      reason: "Docker --load does not apply the OCI exporter's timestamp rewrite",
      configDigest: loaded.configDigest,
    },
    metadataDigestObservation,
    cachedVsControl,
  };
  writeJson(resolve(outputDir, "reproducibility.json"), reproducibility);

  const loadedImageBytes = Number(run("docker", ["image", "inspect", "--format", "{{.Size}}", tag], { code: "ARTIFACT_IMAGE_INSPECT_FAILED" }));
  const loadedImageId = run("docker", ["image", "inspect", "--format", "{{.Id}}", tag], { code: "ARTIFACT_IMAGE_INSPECT_FAILED" });
  const contentPolicy = evaluateOciPolicy(inventory, policy);
  writeJson(resolve(outputDir, "content-inventory.json"), inventory);
  writeJson(resolve(outputDir, "content-policy.json"), contentPolicy);

  const trivy = await timed(timings, "scannerBootstrapMs", () =>
    ensureTrivy(policy, resolve(options["tool-cache"] ?? "output/relay-host/.tools")));
  const scannerVersion = run(trivy, ["--version"], { code: "ARTIFACT_TOOL_UNAVAILABLE" }).split("\n")[0];
  const scannerCache = resolve(options["scanner-cache"] ?? "output/relay-host/.trivy-cache");
  mkdirSync(scannerCache, { recursive: true });
  const sbomPath = resolve(outputDir, "relay-host.sbom.cdx.json");
  await timed(timings, "sbomMs", async () => run(trivy, [
    "image", "--quiet", "--cache-dir", scannerCache, "--format", "cyclonedx", "--output", sbomPath, tag,
  ], { capture: false, code: "SBOM_GENERATION_FAILED" }));
  const componentInventory = attributeSbom(JSON.parse(readFileSync(sbomPath, "utf8")), lockfile, policy);
  writeJson(resolve(outputDir, "component-inventory.json"), componentInventory);

  const vulnerabilityRawPath = resolve(outputDir, "vulnerabilities.trivy.json");
  await timed(timings, "vulnerabilityScanMs", async () => run(trivy, [
    "image", "--quiet", "--cache-dir", scannerCache, "--scanners", "vuln", "--format", "json", "--output", vulnerabilityRawPath, tag,
  ], { capture: false, code: "VULNERABILITY_SCAN_FAILED" }));
  const vulnerabilityPolicy = evaluateVulnerabilities(JSON.parse(readFileSync(vulnerabilityRawPath, "utf8")), policy);
  writeJson(resolve(outputDir, "vulnerability-policy.json"), vulnerabilityPolicy);

  const npmReceipt = await timed(timings, "npmBoundaryMs", () => npmTarballReceipt(policy));
  writeJson(resolve(outputDir, "npm-boundary.json"), npmReceipt);
  checkPolicies(contentPolicy, componentInventory, vulnerabilityPolicy);

  const policyDigest = sha256File(resolve(root, policyPath));
  const buildInputsDigest = buildInputDigest(policyPath);
  const createdAt = new Date(Number(source.epoch) * 1000).toISOString();
  const manifestPath = resolve(outputDir, "relay-host.manifest.json");
  run("node", [
    "scripts/create-relay-host-manifest.mjs",
    "--image-digest", oci.imageDigest,
    "--image-name", options["image-name"] ?? "local/orionfold-relay-host",
    "--rollback-digest", options["rollback-digest"],
    "--oci-archive", ociArchivePath,
    "--sbom", sbomPath,
    "--source-revision", source.revision,
    "--source-tree-digest", source.treeDigest,
    "--source-state", source.state,
    "--base-image", nodeImage,
    "--runtime-base-image", runtimeImage,
    "--policy-digest", policyDigest,
    "--build-inputs-digest", buildInputsDigest,
    "--private-key", resolve(options["private-key"]),
    "--out", manifestPath,
    "--created-at", createdAt,
  ], { code: "MANIFEST_CREATION_FAILED" });
  run("node", [
    "scripts/verify-relay-host-manifest.mjs", manifestPath, resolve(options["public-key"]), oci.imageDigest,
  ], { code: "MANIFEST_VERIFICATION_FAILED" });

  const measurements = {
    contractVersion: 3,
    tag,
    relayVersion: pkg.version,
    platform: inventory.platform,
    sourceRevision: source.revision,
    sourceTreeDigest: source.treeDigest,
    sourceState: source.state,
    imageDigest: oci.imageDigest,
    imageConfigDigest: oci.configDigest,
    loadedImageId,
    imageBytes: contentPolicy.imageBytes,
    imageBytesBasis: contentPolicy.imageBytesBasis,
    loadedImageBytes,
    loadedImageBytesBasis: "docker-storage-driver-observation",
    ociArchiveBytes: inventory.archiveBytes,
    ociArchiveDigest: inventory.archiveDigest,
    unpackedFileBytes: inventory.unpackedFileBytes,
    fileCount: inventory.fileCount,
    layerCount: inventory.layers.length,
    componentCount: componentInventory.componentCount,
    reductionFraction: contentPolicy.reductionFraction,
    scanner: scannerVersion,
    densityClaim: "measured-local-alpha",
  };
  writeJson(resolve(outputDir, "measurements.json"), measurements);
  writeJson(resolve(outputDir, "timings.json"), { contractVersion: 1, ...timings });
  const summary = {
    contractVersion: 1,
    status: "verified",
    publication: "none",
    publishable: false,
    promotionEligible: source.state === "clean",
    signingAuthority: "ephemeral-local-test-key",
    immutableImageDigest: oci.imageDigest,
    relayVersion: pkg.version,
    platform: inventory.platform,
    sourceState: source.state,
    policyDigest,
    buildInputsDigest,
    checks: {
      content: contentPolicy.status,
      components: componentInventory.status,
      vulnerabilities: vulnerabilityPolicy.status,
      reproducibility: reproducibility.status,
      npmBoundary: npmReceipt.status,
      manifest: "pass",
    },
    measurements,
  };
  writeJson(resolve(outputDir, "summary.json"), summary);
  const checksumFiles = writeChecksums(outputDir);
  console.log(JSON.stringify({ ...summary, checksumFiles }, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
