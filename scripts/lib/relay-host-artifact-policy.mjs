import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { t as listTar, x as extractTar } from "tar";
import { sha256File } from "./relay-host-manifest.mjs";

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export class RelayHostArtifactPolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RelayHostArtifactPolicyError";
    this.code = code;
    this.details = details;
  }
}

function fail(condition, code, message, details) {
  if (!condition) throw new RelayHostArtifactPolicyError(code, message, details);
}

function canonicalPath(input) {
  const raw = input.replaceAll("\\", "/").replace(/^\.\//, "");
  fail(!raw.startsWith("/"), "OCI_LAYER_PATH_INVALID", `absolute layer path: ${input}`);
  const parts = raw.split("/").filter((part) => part && part !== ".");
  fail(!parts.includes(".."), "OCI_LAYER_PATH_INVALID", `parent traversal in layer path: ${input}`);
  return parts.join("/");
}

function blobPath(layoutDir, digest) {
  fail(DIGEST.test(digest ?? ""), "OCI_DESCRIPTOR_DIGEST_INVALID", `invalid OCI digest: ${digest ?? "missing"}`);
  return join(layoutDir, "blobs", "sha256", digest.slice("sha256:".length));
}

function readJson(path, code) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new RelayHostArtifactPolicyError(code, `cannot parse ${basename(path)}`, {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

async function readLayer(path, descriptor, index) {
  const entries = [];
  let unpackedBytes = 0;
  try {
    await listTar({
      file: path,
      strict: true,
      onentry(entry) {
        const name = canonicalPath(entry.path);
        const size = Number(entry.size ?? 0);
        unpackedBytes += size;
        const record = {
          path: name,
          size,
          type: entry.type,
          linkpath: entry.linkpath?.replaceAll("\\", "/"),
          mode: entry.mode,
          contentDigest: null,
        };
        const contentHash = createHash("sha256");
        entry.on("data", (chunk) => contentHash.update(chunk));
        entry.on("end", () => {
          record.contentDigest = `sha256:${contentHash.digest("hex")}`;
        });
        entries.push(record);
        entry.resume();
      },
    });
  } catch (cause) {
    const bytes = readFileSync(path);
    const isEmptyGzipLayer = descriptor.mediaType?.endsWith("+gzip")
      && (() => {
        try {
          const unpacked = gunzipSync(bytes);
          return unpacked.length >= 1024
            && unpacked.length % 512 === 0
            && unpacked.every((byte) => byte === 0);
        } catch {
          return false;
        }
      })();
    if (isEmptyGzipLayer) {
      return {
        index,
        digest: descriptor.digest,
        mediaType: descriptor.mediaType,
        compressedBytes: bytes.length,
        unpackedBytes: 0,
        entries: [],
      };
    }
    throw new RelayHostArtifactPolicyError("OCI_LAYER_INVALID", `cannot read OCI layer ${index}`, {
      digest: descriptor.digest,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
  return {
    index,
    digest: descriptor.digest,
    mediaType: descriptor.mediaType,
    compressedBytes: statSync(path).size,
    unpackedBytes,
    entries,
  };
}

function applyLayer(files, layer) {
  for (const entry of layer.entries) {
    if (!entry.path) continue;
    const name = basename(entry.path);
    const parent = dirname(entry.path) === "." ? "" : dirname(entry.path);
    if (name === ".wh..wh..opq") {
      const prefix = parent ? `${parent}/` : "";
      for (const path of files.keys()) if (path.startsWith(prefix)) files.delete(path);
      continue;
    }
    if (name.startsWith(".wh.")) {
      const target = join(parent, name.slice(4)).replaceAll("\\", "/");
      files.delete(target);
      for (const path of files.keys()) if (path.startsWith(`${target}/`)) files.delete(path);
      continue;
    }
    if (entry.type === "Directory") continue;
    files.set(entry.path, { ...entry, layer: layer.index });
  }
}

function summarizeFiles(files) {
  const rootSurfaces = {};
  const appSurfaces = {};
  let unpackedFileBytes = 0;
  for (const file of files.values()) {
    unpackedFileBytes += file.size;
    const parts = file.path.split("/");
    const root = parts[0];
    rootSurfaces[root] ??= { files: 0, bytes: 0 };
    rootSurfaces[root].files += 1;
    rootSurfaces[root].bytes += file.size;
    if (root === "app" && parts[1]) {
      const surface = parts[1];
      appSurfaces[surface] ??= { files: 0, bytes: 0 };
      appSurfaces[surface].files += 1;
      appSurfaces[surface].bytes += file.size;
    }
  }
  const sortedObject = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  const sortedFiles = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  const pathInventoryHash = createHash("sha256");
  const semanticHash = createHash("sha256");
  for (const file of sortedFiles) {
    const pathRecord = [
      file.path,
      file.type ?? "",
      String(file.mode ?? ""),
      file.linkpath ?? "",
    ].join("\0");
    pathInventoryHash.update(pathRecord);
    pathInventoryHash.update("\0");
    semanticHash.update([
      pathRecord,
      String(file.size),
      file.contentDigest ?? "",
    ].join("\0"));
    semanticHash.update("\0");
  }
  return {
    unpackedFileBytes,
    fileCount: files.size,
    pathInventoryDigest: `sha256:${pathInventoryHash.digest("hex")}`,
    semanticRootfsDigest: `sha256:${semanticHash.digest("hex")}`,
    rootSurfaces: sortedObject(rootSurfaces),
    appSurfaces: sortedObject(appSurfaces),
    largestFiles: sortedFiles
      .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
      .slice(0, 50),
  };
}

export async function inspectOciArchive(archivePath) {
  const absoluteArchive = resolve(archivePath);
  fail(existsSync(absoluteArchive) && statSync(absoluteArchive).isFile(), "OCI_ARCHIVE_MISSING", `OCI archive missing: ${absoluteArchive}`);
  const layoutDir = mkdtempSync(join(tmpdir(), "relay-host-oci-"));
  try {
    try {
      await extractTar({ file: absoluteArchive, cwd: layoutDir, strict: true, preservePaths: false });
    } catch (cause) {
      throw new RelayHostArtifactPolicyError("OCI_ARCHIVE_INVALID", "cannot extract OCI archive", {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const layout = readJson(join(layoutDir, "oci-layout"), "OCI_LAYOUT_INVALID");
    fail(layout.imageLayoutVersion === "1.0.0", "OCI_LAYOUT_VERSION_INVALID", "OCI layout must be version 1.0.0");
    const index = readJson(join(layoutDir, "index.json"), "OCI_INDEX_INVALID");
    fail(index.manifests?.length === 1, "OCI_MANIFEST_COUNT_INVALID", "OCI archive must contain exactly one manifest");
    const manifestDescriptor = index.manifests[0];
    const manifestPath = blobPath(layoutDir, manifestDescriptor.digest);
    fail(sha256File(manifestPath) === manifestDescriptor.digest, "OCI_MANIFEST_DIGEST_MISMATCH", "OCI manifest digest mismatch");
    const manifest = readJson(manifestPath, "OCI_MANIFEST_INVALID");
    fail(Array.isArray(manifest.layers) && manifest.layers.length > 0, "OCI_LAYERS_MISSING", "OCI manifest has no layers");
    const configPath = blobPath(layoutDir, manifest.config?.digest);
    fail(sha256File(configPath) === manifest.config.digest, "OCI_CONFIG_DIGEST_MISMATCH", "OCI config digest mismatch");
    const imageConfig = readJson(configPath, "OCI_CONFIG_INVALID");
    const layers = [];
    const files = new Map();
    for (const [layerIndex, descriptor] of manifest.layers.entries()) {
      const path = blobPath(layoutDir, descriptor.digest);
      fail(sha256File(path) === descriptor.digest, "OCI_LAYER_DIGEST_MISMATCH", `OCI layer ${layerIndex} digest mismatch`);
      const layer = await readLayer(path, descriptor, layerIndex);
      layers.push({ ...layer, entries: undefined, entryCount: layer.entries.length });
      applyLayer(files, layer);
    }
    const summary = summarizeFiles(files);
    return {
      contractVersion: 1,
      archiveBytes: statSync(absoluteArchive).size,
      archiveDigest: sha256File(absoluteArchive),
      imageDigest: manifestDescriptor.digest,
      configDigest: manifest.config.digest,
      platform: `${imageConfig.os}/${imageConfig.architecture}`,
      layers,
      ...summary,
      paths: [...files.keys()].sort(),
    };
  } finally {
    rmSync(layoutDir, { recursive: true, force: true });
  }
}

export function evaluateOciPolicy(inventory, policy) {
  const violations = [];
  const add = (code, message, details = {}) => violations.push({ code, message, details });
  const { budgets } = policy;
  // OCI compressed layer bytes are stable across Docker storage drivers and
  // match the payload a registry transports. Docker image inspect `.Size` is
  // driver-dependent and can report either compressed or unpacked bytes.
  const imageBytes = inventory.layers.reduce((total, layer) => total + layer.compressedBytes, 0);
  const reductionFraction = 1 - imageBytes / policy.baselineImageBytes;
  if (imageBytes > budgets.maxImageBytes || reductionFraction < budgets.minimumReductionFraction) {
    add("OCI_SIZE_BUDGET_EXCEEDED", "image exceeds size or reduction budget", { imageBytes, reductionFraction });
  }
  if (inventory.archiveBytes > budgets.maxOciArchiveBytes) {
    add("OCI_ARCHIVE_SIZE_BUDGET_EXCEEDED", "OCI archive exceeds byte budget", { archiveBytes: inventory.archiveBytes });
  }
  const largestLayer = [...inventory.layers].sort((a, b) => b.compressedBytes - a.compressedBytes)[0];
  if (largestLayer.compressedBytes > budgets.maxLargestCompressedLayerBytes) {
    add("OCI_LAYER_SIZE_BUDGET_EXCEEDED", "largest compressed layer exceeds budget", largestLayer);
  }
  if (inventory.unpackedFileBytes > budgets.maxUnpackedFileBytes) {
    add("OCI_UNPACKED_SIZE_BUDGET_EXCEEDED", "unpacked runtime exceeds budget", { unpackedFileBytes: inventory.unpackedFileBytes });
  }
  if ((inventory.largestFiles[0]?.size ?? 0) > budgets.maxLargestFileBytes) {
    add("OCI_LARGEST_FILE_BUDGET_EXCEEDED", "largest runtime file exceeds budget", inventory.largestFiles[0]);
  }
  const allowedPlatformRootSurfaces = policy.allowedPlatformRootSurfaces?.[inventory.platform] ?? {};
  for (const surface of Object.keys(inventory.rootSurfaces)) {
    if (!policy.allowedRootSurfaces[surface] && !allowedPlatformRootSurfaces[surface]) {
      add("OCI_ROOT_SURFACE_UNEXPLAINED", `unexplained root surface: /${surface}`);
    }
  }
  for (const surface of Object.keys(inventory.appSurfaces)) {
    if (!policy.allowedAppSurfaces[surface]) add("OCI_APP_SURFACE_UNEXPLAINED", `unexplained /app surface: ${surface}`);
  }
  const pathSet = new Set(inventory.paths);
  for (const path of policy.requiredPaths ?? []) {
    if (!pathSet.has(path)) add("OCI_REQUIRED_PATH_MISSING", `required runtime path is missing: /${path}`);
  }
  const patterns = policy.forbiddenPathPatterns.map((pattern) => new RegExp(pattern, "u"));
  for (const path of inventory.paths) {
    const pattern = patterns.find((candidate) => candidate.test(path));
    if (pattern) add("OCI_CONTENT_POLICY_FAILED", `forbidden path in final image: /${path}`, { pattern: pattern.source });
  }
  const nativeTokens = policy.nativePlatformTokens[inventory.platform] ?? [];
  for (const path of inventory.paths.filter((candidate) => candidate.endsWith(".node"))) {
    const token = nativeTokens.find((candidate) => path.toLowerCase().includes(candidate));
    if (token) add("OCI_NATIVE_PLATFORM_DUPLICATE", `foreign native binary in ${inventory.platform} image: /${path}`, { token });
  }
  return {
    contractVersion: 1,
    status: violations.length === 0 ? "pass" : "fail",
    imageBytes,
    imageBytesBasis: "sum-compressed-oci-layers",
    baselineImageBytes: policy.baselineImageBytes,
    reductionFraction,
    budgets,
    largestLayer,
    violations,
  };
}

function lockPackageSet(lockfile) {
  const packages = new Set();
  for (const [path, value] of Object.entries(lockfile.packages ?? {})) {
    if (!path.includes("node_modules/") || !value?.version) continue;
    const name = value.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    packages.add(`${name}@${value.version}`);
  }
  return packages;
}

function componentLocations(component) {
  const propertyLocations = (component.properties ?? [])
    .filter((property) => property?.name === "aquasecurity:trivy:FilePath")
    .map((property) => property.value);
  return [...new Set([
    ...propertyLocations,
    ...(component.components ?? []).map((child) => child.name),
  ].filter(Boolean).map((path) => `/${String(path).replace(/^\/+/, "")}`))].sort();
}

function npmPurlIdentity(component) {
  if (!component.purl?.startsWith("pkg:npm/")) return null;
  const unqualified = component.purl.slice("pkg:npm/".length).split(/[?#]/u, 1)[0];
  const separator = unqualified.lastIndexOf("@");
  if (separator <= 0) return null;
  return `${decodeURIComponent(unqualified.slice(0, separator))}@${decodeURIComponent(unqualified.slice(separator + 1))}`;
}

export function attributeSbom(sbom, lockfile, policy) {
  const locked = lockPackageSet(lockfile);
  const components = (sbom.components ?? []).map((component) => {
    const locations = componentLocations(component);
    const npmIdentity = npmPurlIdentity(component);
    let attribution;
    if (component.type === "operating-system" || component.purl?.startsWith("pkg:deb/")) attribution = "pinned-runtime-base";
    else if (locations.some((path) => path.startsWith("/usr/local/") || path.startsWith("/opt/yarn-"))) attribution = "pinned-runtime-base";
    else if (component.name === "orionfold-relay") attribution = "relay-application";
    else if (locations.some((path) => path.includes("/app/node_modules/next/dist/compiled/"))) attribution = "next-bundled-runtime";
    else if (locked.has(npmIdentity ?? `${component.name}@${component.version}`)) attribution = "package-lock";
    return {
      name: component.name,
      version: component.version,
      purl: component.purl,
      attribution: attribution ?? "unattributed",
      locations,
    };
  }).sort((a, b) => `${a.purl ?? a.name}`.localeCompare(`${b.purl ?? b.name}`));
  const unattributed = components.filter((component) => component.attribution === "unattributed");
  const violations = [];
  if (components.length === 0 || !components.some((component) => component.attribution === "relay-application")) {
    violations.push({ code: "SBOM_REPORT_INVALID", message: "SBOM must contain the Relay application and runtime components" });
  }
  if (components.length > policy.budgets.maxSbomComponents) {
    violations.push({ code: "SBOM_COMPONENT_BUDGET_EXCEEDED", message: `${components.length} components exceed ${policy.budgets.maxSbomComponents}` });
  }
  if (unattributed.length > 0) {
    violations.push({ code: "SBOM_COMPONENT_UNATTRIBUTED", message: `${unattributed.length} runtime components are unattributed`, components: unattributed });
  }
  const counts = {};
  for (const component of components) counts[component.attribution] = (counts[component.attribution] ?? 0) + 1;
  return { contractVersion: 1, status: violations.length === 0 ? "pass" : "fail", componentCount: components.length, counts, components, violations };
}

export function evaluateVulnerabilities(report, policy) {
  if (!Number.isInteger(report?.SchemaVersion) || !Array.isArray(report.Results) || report.Results.length === 0) {
    return {
      contractVersion: 1,
      status: "fail",
      scanner: "unknown",
      findings: [],
      violations: [{ code: "VULNERABILITY_REPORT_INVALID", message: "Trivy vulnerability report is missing a schema or result set" }],
    };
  }
  const exceptions = new Set();
  const exceptionViolations = [];
  for (const exception of policy.vulnerabilityExceptions ?? []) {
    const valid = exception
      && typeof exception.id === "string"
      && typeof exception.package === "string"
      && typeof exception.reason === "string"
      && typeof exception.approvedBy === "string"
      && !Number.isNaN(Date.parse(exception.expiresAt ?? ""));
    if (!valid || Date.parse(exception.expiresAt) <= Date.now()) {
      exceptionViolations.push({
        code: "VULNERABILITY_EXCEPTION_INVALID",
        message: `vulnerability exception must be attributable and unexpired: ${exception?.id ?? "unknown"}`,
        exception,
      });
      continue;
    }
    exceptions.add(`${exception.id}\0${exception.package}`);
  }
  const findings = [];
  for (const result of report.Results ?? []) {
    for (const vulnerability of result.Vulnerabilities ?? []) {
      if (!["HIGH", "CRITICAL"].includes(vulnerability.Severity)) continue;
      if (exceptions.has(`${vulnerability.VulnerabilityID}\0${vulnerability.PkgName}`)) continue;
      findings.push({
        id: vulnerability.VulnerabilityID,
        severity: vulnerability.Severity,
        package: vulnerability.PkgName,
        installedVersion: vulnerability.InstalledVersion,
        fixedVersion: vulnerability.FixedVersion || null,
        target: result.Target,
      });
    }
  }
  findings.sort((a, b) => `${a.severity}:${a.id}:${a.package}`.localeCompare(`${b.severity}:${b.id}:${b.package}`));
  const violations = [...exceptionViolations];
  if (findings.length > 0) {
    violations.push({ code: "VULNERABILITY_POLICY_FAILED", message: `${findings.length} unapproved critical/high vulnerabilities`, findings });
  }
  return {
    contractVersion: 1,
    status: violations.length === 0 ? "pass" : "fail",
    scanner: "trivy",
    findings,
    violations,
  };
}

export function validateArtifactInputs({
  packageVersion,
  expectedVersion,
  nodeImage,
  runtimeImage,
  sourceState,
  publicationProfile = false,
}) {
  if (expectedVersion && expectedVersion !== packageVersion) {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_INPUT_VERSION_MISMATCH",
      `expected Relay ${expectedVersion}, found ${packageVersion}`,
    );
  }
  if (!/^node:[^@]+@sha256:[a-f0-9]{64}$/u.test(nodeImage ?? "")) {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_INPUT_BASE_DIGEST_MISSING",
      "Relay Host base image must be pinned by sha256 digest",
    );
  }
  if (!/^gcr\.io\/distroless\/nodejs22-debian13:[^@]+@sha256:[a-f0-9]{64}$/u.test(runtimeImage ?? "")) {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_INPUT_RUNTIME_DIGEST_MISSING",
      "Relay Host distroless runtime image must be pinned by sha256 digest",
    );
  }
  if (!(["clean", "dirty-local"].includes(sourceState))) {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_INPUT_SOURCE_STATE_INVALID",
      `unsupported source state: ${sourceState ?? "missing"}`,
    );
  }
  if (publicationProfile && sourceState !== "clean") {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_INPUT_DIRTY",
      "publication-profile artifacts require a clean committed source tree",
    );
  }
  return { packageVersion, nodeImage, runtimeImage, sourceState, publicationProfile };
}

export function compareBuildIdentity(primary, control) {
  const fields = ["imageDigest", "configDigest"];
  const mismatches = fields
    .filter((field) => primary[field] !== control[field])
    .map((field) => ({ field, primary: primary[field], control: control[field] }));
  if (mismatches.length > 0) {
    throw new RelayHostArtifactPolicyError(
      "BUILD_CACHE_IDENTITY_MISMATCH",
      "cached and clean no-cache builds produced different artifact identity",
      { mismatches },
    );
  }
  return { contractVersion: 1, status: "pass", fields, primary, control };
}

export function compareBuildSemantics(primary, control) {
  const fields = ["platform", "fileCount", "pathInventoryDigest"];
  const mismatches = fields
    .filter((field) => primary[field] !== control[field])
    .map((field) => ({ field, primary: primary[field], control: control[field] }));
  if (mismatches.length > 0) {
    throw new RelayHostArtifactPolicyError(
      "BUILD_SEMANTIC_MISMATCH",
      "cached and clean no-cache builds produced different runtime filesystems",
      { mismatches },
    );
  }
  return {
    contractVersion: 1,
    status: "pass",
    fields,
    pathInventoryDigest: primary.pathInventoryDigest,
    contentDigestObservation: {
      status: primary.semanticRootfsDigest === control.semanticRootfsDigest
        ? "identical"
        : "different-compiled-content",
      cached: primary.semanticRootfsDigest,
      noCache: control.semanticRootfsDigest,
    },
  };
}
