import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { c as createTar } from "tar";
import { gzipSync } from "node:zlib";
import {
  RelayHostArtifactPolicyError,
  attributeSbom,
  compareBuildIdentity,
  compareBuildSemantics,
  evaluateOciPolicy,
  evaluateVulnerabilities,
  inspectOciArchive,
  validateArtifactInputs,
} from "./lib/relay-host-artifact-policy.mjs";
import { ensureTrivy } from "./lib/relay-host-tools.mjs";

const policy = JSON.parse(readFileSync(new URL("../config/relay-host-artifact-policy.json", import.meta.url)));
const fixturePolicy = { ...policy, requiredPaths: [] };

test("every direct Docker build input is tracked in a clean checkout", () => {
  const root = new URL("..", import.meta.url);
  const dockerfile = readFileSync(new URL("../Dockerfile.relay-host", import.meta.url), "utf8");
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n");
  const directCopies = dockerfile
    .split("\n")
    .filter((line) => line.startsWith("COPY ") && !line.startsWith("COPY --from="))
    .flatMap((line) => line.slice("COPY ".length).trim().split(/\s+/u).slice(0, -1));

  for (const source of directCopies) {
    assert.ok(
      tracked.some((path) => path === source || path.startsWith(`${source}/`)),
      `Docker build input must be tracked for clean CI checkouts: ${source}`,
    );
  }
});

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function writeBlob(layout, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  const valueDigest = digest(bytes);
  const path = join(layout, "blobs", "sha256", valueDigest.slice(7));
  writeFileSync(path, bytes);
  return { digest: valueDigest, size: bytes.length, path };
}

async function fixture(files, { includeEmptyLayer = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "relay-host-policy-test-"));
  const layerRoot = join(root, "layer");
  const layout = join(root, "layout");
  mkdirSync(layerRoot, { recursive: true });
  mkdirSync(join(layout, "blobs", "sha256"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const target = join(layerRoot, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
  }
  const layerPath = join(root, "layer.tar.gz");
  await createTar({ cwd: layerRoot, file: layerPath, gzip: true, portable: true }, ["."]);
  const layer = writeBlob(layout, readFileSync(layerPath));
  const emptyLayer = includeEmptyLayer ? writeBlob(layout, gzipSync(Buffer.alloc(1024))) : null;
  const config = writeBlob(layout, { architecture: "arm64", os: "linux", config: {} });
  const manifest = writeBlob(layout, {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: config.digest, size: config.size },
    layers: [
      ...(emptyLayer ? [{ mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: emptyLayer.digest, size: emptyLayer.size }] : []),
      { mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: layer.digest, size: layer.size },
    ],
  });
  writeFileSync(join(layout, "oci-layout"), `${JSON.stringify({ imageLayoutVersion: "1.0.0" })}\n`);
  writeFileSync(join(layout, "index.json"), `${JSON.stringify({
    schemaVersion: 2,
    manifests: [{ mediaType: "application/vnd.oci.image.manifest.v1+json", digest: manifest.digest, size: manifest.size }],
  })}\n`);
  const archive = join(root, "fixture.oci.tar");
  await createTar({ cwd: layout, file: archive, portable: true }, ["."]);
  return { root, archive };
}

test("inspects an OCI archive deterministically and explains allowed surfaces", async () => {
  const { root, archive } = await fixture({ "app/server.js": "ok", "usr/bin/node": "node" });
  try {
    const first = await inspectOciArchive(archive);
    const second = await inspectOciArchive(archive);
    assert.deepEqual(first, second);
    assert.equal(first.platform, "linux/arm64");
    assert.match(first.pathInventoryDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.match(first.semanticRootfsDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.deepEqual(first.paths, ["app/server.js", "usr/bin/node"]);
    const result = evaluateOciPolicy(first, fixturePolicy);
    assert.equal(result.status, "pass");
    assert.equal(result.imageBytes, first.layers.reduce((total, layer) => total + layer.compressedBytes, 0));
    assert.equal(result.imageBytesBasis, "sum-compressed-oci-layers");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a valid empty gzip layer without weakening malformed-layer checks", async () => {
  const { root, archive } = await fixture({ "app/server.js": "ok" }, { includeEmptyLayer: true });
  try {
    const inventory = await inspectOciArchive(archive);
    assert.equal(inventory.layers[0].entryCount, 0);
    assert.equal(inventory.layers[0].unpackedBytes, 0);
    assert.deepEqual(inventory.paths, ["app/server.js"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails closed on a forbidden final-image path", async () => {
  const { root, archive } = await fixture({ "app/server.js": "ok", "app/.claude/session.json": "secret" });
  try {
    const result = evaluateOciPolicy(await inspectOciArchive(archive), fixturePolicy);
    assert.equal(result.status, "fail");
    assert.ok(result.violations.some((violation) => violation.code === "OCI_CONTENT_POLICY_FAILED"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("names compressed transport size and reduction failures", async () => {
  const { root, archive } = await fixture({ "app/server.js": "ok" });
  try {
    const result = evaluateOciPolicy(await inspectOciArchive(archive), {
      ...fixturePolicy,
      baselineImageBytes: 1,
      budgets: { ...fixturePolicy.budgets, maxImageBytes: 1 },
    });
    assert.ok(result.violations.some((violation) => violation.code === "OCI_SIZE_BUDGET_EXCEEDED"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores Docker storage-driver size observations when enforcing OCI budgets", async () => {
  const { root, archive } = await fixture({ "app/server.js": "ok" });
  try {
    const inventory = await inspectOciArchive(archive);
    const result = evaluateOciPolicy(inventory, fixturePolicy, { imageBytes: 800_000_000 });
    assert.equal(result.status, "pass");
    assert.equal(result.imageBytes, inventory.layers.reduce((total, layer) => total + layer.compressedBytes, 0));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails closed when a required traced runtime path is absent", async () => {
  const { root, archive } = await fixture({ "app/server.js": "ok" });
  try {
    const result = evaluateOciPolicy(await inspectOciArchive(archive), {
      ...fixturePolicy,
      requiredPaths: ["app/server.js", "app/node_modules/next/dist/build/output/log.js"],
    });
    assert.ok(result.violations.some((violation) => violation.code === "OCI_REQUIRED_PATH_MISSING"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("throws a named failure for a missing OCI archive", async () => {
  await assert.rejects(
    inspectOciArchive("/tmp/relay-host-missing-archive.tar"),
    (error) => error instanceof RelayHostArtifactPolicyError && error.code === "OCI_ARCHIVE_MISSING",
  );
});

test("attributes Relay, locked, runtime-base and Next-bundled SBOM components and rejects unknowns", () => {
  const lockfile = { packages: {
    "node_modules/known": { version: "1.2.3" },
    "node_modules/@scope/scoped": { version: "2.0.0" },
  } };
  const sbom = {
    components: [
      { name: "orionfold-relay", version: "0.43.0", purl: "pkg:npm/orionfold-relay@0.43.0" },
      { name: "known", version: "1.2.3", purl: "pkg:npm/known@1.2.3" },
      {
        name: "scoped",
        version: "2.0.0",
        purl: "pkg:npm/%40scope/scoped@2.0.0",
        properties: [{ name: "aquasecurity:trivy:FilePath", value: "app/node_modules/@scope/scoped/package.json" }],
      },
      { name: "libc6", version: "2", purl: "pkg:deb/debian/libc6@2" },
      { name: "debian", version: "12", type: "operating-system" },
      {
        name: "compiled",
        version: "UNKNOWN",
        purl: "pkg:npm/compiled@UNKNOWN",
        properties: [{ name: "aquasecurity:trivy:FilePath", value: "app/node_modules/next/dist/compiled/compiled/package.json" }],
      },
      {
        name: "npm-base",
        version: "1",
        purl: "pkg:npm/npm-base@1",
        properties: [{ name: "aquasecurity:trivy:FilePath", value: "usr/local/lib/node_modules/npm/node_modules/npm-base/package.json" }],
      },
      {
        name: "yarn",
        version: "1.22.22",
        purl: "pkg:npm/yarn@1.22.22",
        properties: [{ name: "aquasecurity:trivy:FilePath", value: "opt/yarn-v1.22.22/package.json" }],
      },
    ],
  };
  assert.equal(attributeSbom(sbom, lockfile, policy).status, "pass");
  sbom.components.push({ name: "mystery", version: "9", purl: "pkg:generic/mystery@9" });
  const failed = attributeSbom(sbom, lockfile, policy);
  assert.equal(failed.status, "fail");
  assert.ok(failed.violations.some((violation) => violation.code === "SBOM_COMPONENT_UNATTRIBUTED"));
});

test("names unapproved high and critical vulnerabilities", () => {
  const report = {
    SchemaVersion: 2,
    Results: [{ Target: "app", Vulnerabilities: [
      { VulnerabilityID: "CVE-HIGH", Severity: "HIGH", PkgName: "a", InstalledVersion: "1", FixedVersion: "2" },
      { VulnerabilityID: "CVE-MEDIUM", Severity: "MEDIUM", PkgName: "b", InstalledVersion: "1" },
    ] }],
  };
  const result = evaluateVulnerabilities(report, policy);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.findings.map((finding) => finding.id), ["CVE-HIGH"]);
  assert.equal(result.violations[0].code, "VULNERABILITY_POLICY_FAILED");
  assert.equal(evaluateVulnerabilities({}, policy).violations[0].code, "VULNERABILITY_REPORT_INVALID");
});

test("requires vulnerability exceptions to be attributable and time-bounded", () => {
  const report = {
    SchemaVersion: 2,
    Results: [{ Target: "app", Vulnerabilities: [
      { VulnerabilityID: "CVE-WAIVED", Severity: "HIGH", PkgName: "runtime", InstalledVersion: "1" },
    ] }],
  };
  const invalid = evaluateVulnerabilities(report, { ...policy, vulnerabilityExceptions: ["CVE-WAIVED"] });
  assert.equal(invalid.status, "fail");
  assert.ok(invalid.violations.some((violation) => violation.code === "VULNERABILITY_EXCEPTION_INVALID"));
  const approved = evaluateVulnerabilities(report, {
    ...policy,
    vulnerabilityExceptions: [{
      id: "CVE-WAIVED",
      package: "runtime",
      reason: "fixture",
      approvedBy: "test",
      expiresAt: "2999-01-01T00:00:00.000Z",
    }],
  });
  assert.equal(approved.status, "pass");
});

test("fails closed on an empty or application-free SBOM", () => {
  const empty = attributeSbom({ components: [] }, { packages: {} }, policy);
  assert.equal(empty.status, "fail");
  assert.ok(empty.violations.some((violation) => violation.code === "SBOM_REPORT_INVALID"));
});

test("validates version, pinned base, dirty publication and cache identity with named failures", () => {
  const nodeImage = `node:22@sha256:${"a".repeat(64)}`;
  const runtimeImage = `gcr.io/distroless/nodejs22-debian13:nonroot@sha256:${"b".repeat(64)}`;
  assert.equal(validateArtifactInputs({ packageVersion: "1.0.0", expectedVersion: "1.0.0", nodeImage, runtimeImage, sourceState: "dirty-local" }).sourceState, "dirty-local");
  assert.throws(
    () => validateArtifactInputs({ packageVersion: "1.0.0", expectedVersion: "2.0.0", nodeImage, runtimeImage, sourceState: "clean" }),
    (error) => error.code === "ARTIFACT_INPUT_VERSION_MISMATCH",
  );
  assert.throws(
    () => validateArtifactInputs({ packageVersion: "1.0.0", nodeImage: "node:22", runtimeImage, sourceState: "clean" }),
    (error) => error.code === "ARTIFACT_INPUT_BASE_DIGEST_MISSING",
  );
  assert.throws(
    () => validateArtifactInputs({ packageVersion: "1.0.0", nodeImage, runtimeImage: "gcr.io/distroless/nodejs22-debian13:nonroot", sourceState: "clean" }),
    (error) => error.code === "ARTIFACT_INPUT_RUNTIME_DIGEST_MISSING",
  );
  assert.throws(
    () => validateArtifactInputs({ packageVersion: "1.0.0", nodeImage, runtimeImage, sourceState: "dirty-local", publicationProfile: true }),
    (error) => error.code === "ARTIFACT_INPUT_DIRTY",
  );
  assert.equal(compareBuildIdentity({ imageDigest: "a", configDigest: "b" }, { imageDigest: "a", configDigest: "b" }).status, "pass");
  assert.throws(
    () => compareBuildIdentity({ imageDigest: "a", configDigest: "b" }, { imageDigest: "c", configDigest: "b" }),
    (error) => error.code === "BUILD_CACHE_IDENTITY_MISMATCH",
  );
});

test("compares exact runtime filesystem semantics independently of OCI metadata", () => {
  const primary = {
    platform: "linux/arm64",
    fileCount: 2,
    pathInventoryDigest: `sha256:${"b".repeat(64)}`,
    semanticRootfsDigest: `sha256:${"a".repeat(64)}`,
  };
  assert.equal(compareBuildSemantics(primary, { ...primary }).status, "pass");
  assert.throws(
    () => compareBuildSemantics(primary, { ...primary, fileCount: 3 }),
    (error) => error.code === "BUILD_SEMANTIC_MISMATCH",
  );
  assert.equal(
    compareBuildSemantics(primary, {
      ...primary,
      semanticRootfsDigest: `sha256:${"c".repeat(64)}`,
    }).contentDigestObservation.status,
    "different-compiled-content",
  );
});

test("rehydrates the scanner binary from the checksum-pinned cached archive", async () => {
  const root = mkdtempSync(join(tmpdir(), "relay-host-tool-test-"));
  const source = join(root, "source");
  const cache = join(root, "cache");
  mkdirSync(source);
  const script = join(source, "trivy");
  writeFileSync(script, "#!/bin/sh\necho 'Version: 0.70.0'\n");
  chmodSync(script, 0o700);
  const file = "trivy-test.tar.gz";
  const archive = join(root, file);
  await createTar({ cwd: source, file: archive, gzip: true, portable: true }, ["trivy"]);
  const key = `${process.platform === "darwin" ? "darwin" : process.platform}-${process.arch === "x64" ? "x64" : process.arch}`;
  const toolDir = join(cache, `trivy-0.70.0-${key}`);
  mkdirSync(toolDir, { recursive: true });
  writeFileSync(join(toolDir, file), readFileSync(archive));
  const toolPolicy = {
    scanner: {
      version: "0.70.0",
      releaseBaseUrl: "https://invalid.example.test",
      artifacts: { [key]: { file, sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") } },
    },
  };
  try {
    const binary = await ensureTrivy(toolPolicy, cache);
    writeFileSync(binary, "#!/bin/sh\necho 'Version: 0.70.0 tampered'\n");
    chmodSync(binary, 0o700);
    await ensureTrivy(toolPolicy, cache);
    assert.doesNotMatch(readFileSync(binary, "utf8"), /tampered/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
