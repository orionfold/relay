import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  statfsSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(MODULE_DIR, "../../..");
export const PORTABLE_ASSET_DIR = path.join(REPO_ROOT, "deploy/relay-host");
export const PORTABLE_MANIFEST_PATH = path.join(PORTABLE_ASSET_DIR, "portable-manifest.json");
export const PORTABLE_SCHEMA_PATH = path.join(PORTABLE_ASSET_DIR, "portable-manifest.schema.json");
export const PORTABLE_TEMPLATE_PATH = path.join(PORTABLE_ASSET_DIR, "cloud-init.yaml.tmpl");
export const PORTABLE_BOOTSTRAP_PATH = path.join(PORTABLE_ASSET_DIR, "bootstrap.sh");

const SEMVER = /^\d+\.\d+\.\d+$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const NODE_ARCHIVE_SHA256 = "9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578";
const COSIGN_SHA256 = "f7622ed3cf22e55e1ae6377c080979ff77a22da9981c11df222a2e444991e7cf";
const SSH_PUBLIC_KEY = /^ssh-(?:ed25519|rsa) [A-Za-z0-9+/=]+(?: [A-Za-z0-9._@+-]{1,80})?$/;
const HOST_LABEL = /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const FORBIDDEN_KEY = /(?:api.?key|authorization|credential|license|password|private.?key|recovery.?key|secret|token)/i;
const FORBIDDEN_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|rk|ghp|github_pat)_[A-Za-z0-9_-]{12,}|DIGITALOCEAN_TOKEN=|AWS_SECRET_ACCESS_KEY=)/i;

export class PortableHostError extends Error {
  constructor(code, message, details = undefined, options = undefined) {
    super(message, options);
    this.name = "PortableHostError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details, options) {
  throw new PortableHostError(code, message, details, options);
}

function assert(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertExactKeys(value, keys, code, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), code, `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), code, `${label} has missing or unknown fields.`, { actual, expected });
}

export function readPortableAssets(root = REPO_ROOT) {
  const assetDir = path.join(root, "deploy/relay-host");
  return {
    manifest: JSON.parse(readFileSync(path.join(assetDir, "portable-manifest.json"), "utf8")),
    schema: JSON.parse(readFileSync(path.join(assetDir, "portable-manifest.schema.json"), "utf8")),
    template: readFileSync(path.join(assetDir, "cloud-init.yaml.tmpl"), "utf8"),
    bootstrap: readFileSync(path.join(assetDir, "bootstrap.sh"), "utf8"),
    packageJson: JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")),
    cellRelease: JSON.parse(readFileSync(path.join(root, "src/lib/host/deployment/relay-cell-release.json"), "utf8")),
  };
}

export function validatePortableManifest({ manifest, schema, packageJson, cellRelease, bootstrap }) {
  assert(schema?.$id === "https://orionfold.com/contracts/relay-host-portable-manifest-v1.schema.json", "PORTABLE_SCHEMA_INVALID", "Portable manifest schema authority is invalid.");
  assertExactKeys(manifest, ["schema", "release", "cell", "substrate", "tools", "bootstrap", "paths"], "PORTABLE_MANIFEST_SHAPE_INVALID", "Portable manifest");
  assertExactKeys(manifest.release, ["npmPackage", "relayVersion"], "PORTABLE_RELEASE_SHAPE_INVALID", "Portable release");
  assertExactKeys(manifest.cell, ["imageRepository", "imageDigest"], "PORTABLE_CELL_SHAPE_INVALID", "Portable Cell");
  assertExactKeys(manifest.substrate, ["osId", "osVersionId", "architecture", "cpuCount", "memoryBytes", "diskBytes"], "PORTABLE_SUBSTRATE_SHAPE_INVALID", "Portable substrate");
  assertExactKeys(manifest.tools, ["nodeVersion", "nodeArchiveSha256", "cosignVersion", "cosignSha256"], "PORTABLE_TOOLS_SHAPE_INVALID", "Portable tools");
  assertExactKeys(manifest.bootstrap, ["path", "sha256", "completionReceipt"], "PORTABLE_BOOTSTRAP_SHAPE_INVALID", "Portable bootstrap");
  assertExactKeys(manifest.paths, ["app", "data", "supervisor"], "PORTABLE_PATHS_SHAPE_INVALID", "Portable paths");
  assert(manifest?.schema === "orionfold.relay-host-portable/v1", "PORTABLE_MANIFEST_SCHEMA_INVALID", "Portable manifest schema must be v1.");
  assert(manifest?.release?.npmPackage === "orionfold-relay", "PORTABLE_NPM_PACKAGE_INVALID", "Portable manifest npm package is invalid.");
  assert(SEMVER.test(manifest?.release?.relayVersion ?? ""), "PORTABLE_RELEASE_VERSION_INVALID", "Portable manifest requires an exact Relay semantic version.");
  assert(manifest.release.relayVersion === packageJson?.version, "PORTABLE_RELEASE_VERSION_MISMATCH", "Portable manifest and npm package versions differ.");
  assert(manifest.release.relayVersion === cellRelease?.relayVersion, "PORTABLE_CELL_VERSION_MISMATCH", "Portable manifest and Relay Cell release versions differ.");
  assert(manifest?.cell?.imageRepository === cellRelease?.imageRepository, "PORTABLE_CELL_REPOSITORY_MISMATCH", "Portable manifest and Relay Cell repositories differ.");
  assert(DIGEST.test(manifest?.cell?.imageDigest ?? ""), "PORTABLE_CELL_DIGEST_INVALID", "Portable manifest requires an immutable Cell digest.");
  assert(manifest.cell.imageDigest === cellRelease?.imageDigest, "PORTABLE_CELL_DIGEST_MISMATCH", "Portable manifest and Relay Cell digests differ.");
  assert(manifest?.substrate?.osId === "ubuntu" && manifest?.substrate?.osVersionId === "24.04", "PORTABLE_SUBSTRATE_OS_INVALID", "Portable substrate must be Ubuntu 24.04.");
  assert(manifest?.substrate?.architecture === "x64", "PORTABLE_SUBSTRATE_ARCH_INVALID", "Portable substrate must be x64.");
  assert(Number.isInteger(manifest?.substrate?.cpuCount) && manifest.substrate.cpuCount >= 2, "PORTABLE_SUBSTRATE_CPU_INVALID", "Portable substrate requires at least 2 vCPU.");
  assert(Number.isInteger(manifest?.substrate?.memoryBytes) && manifest.substrate.memoryBytes >= 4 * 1024 ** 3, "PORTABLE_SUBSTRATE_MEMORY_INVALID", "Portable substrate requires at least 4 GiB memory.");
  assert(Number.isInteger(manifest?.substrate?.diskBytes) && manifest.substrate.diskBytes >= 80 * 1024 ** 3, "PORTABLE_SUBSTRATE_DISK_INVALID", "Portable substrate requires at least 80 GiB disk.");
  assert(manifest?.tools?.nodeVersion === "22.23.1", "PORTABLE_NODE_VERSION_INVALID", "Portable Node version is not the accepted release toolchain.");
  assert(SHA256.test(manifest?.tools?.nodeArchiveSha256 ?? ""), "PORTABLE_NODE_CHECKSUM_INVALID", "Portable Node archive checksum is invalid.");
  assert(manifest.tools.nodeArchiveSha256 === NODE_ARCHIVE_SHA256, "PORTABLE_NODE_CHECKSUM_MISMATCH", "Portable Node archive checksum differs from the accepted release toolchain.");
  assert(manifest?.tools?.cosignVersion === "3.1.2", "PORTABLE_COSIGN_VERSION_INVALID", "Portable Cosign version is not the accepted release toolchain.");
  assert(SHA256.test(manifest?.tools?.cosignSha256 ?? ""), "PORTABLE_COSIGN_CHECKSUM_INVALID", "Portable Cosign checksum is invalid.");
  assert(manifest.tools.cosignSha256 === COSIGN_SHA256, "PORTABLE_COSIGN_CHECKSUM_MISMATCH", "Portable Cosign checksum differs from the accepted release toolchain.");
  assert(manifest?.bootstrap?.path === "deploy/relay-host/bootstrap.sh", "PORTABLE_BOOTSTRAP_PATH_INVALID", "Portable bootstrap path is invalid.");
  assert(SHA256.test(manifest?.bootstrap?.sha256 ?? ""), "PORTABLE_BOOTSTRAP_CHECKSUM_INVALID", "Portable bootstrap checksum is invalid.");
  assert(manifest.bootstrap.sha256 === sha256Hex(bootstrap), "PORTABLE_BOOTSTRAP_CHECKSUM_MISMATCH", "Portable bootstrap bytes differ from the manifest checksum.");
  assert(manifest?.bootstrap?.completionReceipt === "/var/lib/relay-host-portable/bootstrap.json", "PORTABLE_RECEIPT_PATH_INVALID", "Portable bootstrap receipt path is invalid.");
  assert(manifest?.paths?.app === "/srv/relay-host/app" && manifest?.paths?.data === "/srv/relay-host/data" && manifest?.paths?.supervisor === "/srv/relay-host/supervisor", "PORTABLE_PATHS_INVALID", "Portable Host paths differ from the accepted contract.");
  return manifest;
}

export function assertSecretFree(value, trail = "input") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${trail}[${index}]`));
    return value;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) {
        fail("PORTABLE_SECRET_INPUT_REFUSED", `Secret-bearing field ${trail}.${key} is forbidden in cloud user-data.`);
      }
      assertSecretFree(item, `${trail}.${key}`);
    }
    return value;
  }
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
    fail("PORTABLE_SECRET_INPUT_REFUSED", `Secret-like content is forbidden at ${trail}.`);
  }
  return value;
}

export function validateRenderInput(input) {
  const allowed = new Set(["sshPublicKey", "hostname"]);
  for (const key of Object.keys(input ?? {})) {
    if (!allowed.has(key)) fail("PORTABLE_RENDER_INPUT_UNKNOWN", `Unknown render input: ${key}.`);
  }
  assertSecretFree(input);
  assert(SSH_PUBLIC_KEY.test(input?.sshPublicKey ?? ""), "PORTABLE_SSH_PUBLIC_KEY_INVALID", "A valid SSH ed25519 or RSA public key is required.");
  assert(HOST_LABEL.test(input?.hostname ?? ""), "PORTABLE_HOSTNAME_INVALID", "Hostname must be one lowercase DNS label of at most 63 characters.");
  return input;
}

function replaceOnce(source, token, value) {
  const occurrences = source.split(token).length - 1;
  assert(occurrences > 0, "PORTABLE_TEMPLATE_TOKEN_MISSING", `Portable template is missing ${token}.`);
  return source.replaceAll(token, value);
}

export function renderCloudInit({ manifest, template, bootstrap, input }) {
  validateRenderInput(input);
  let rendered = template;
  const cellImage = `${manifest.cell.imageRepository}@${manifest.cell.imageDigest}`;
  const values = new Map([
    ["__HOSTNAME__", input.hostname],
    ["__SSH_PUBLIC_KEY__", JSON.stringify(input.sshPublicKey)],
    ["__BOOTSTRAP_BASE64__", Buffer.from(bootstrap, "utf8").toString("base64")],
    ["__BOOTSTRAP_SHA256__", manifest.bootstrap.sha256],
    ["__RELAY_VERSION__", manifest.release.relayVersion],
    ["__CELL_IMAGE__", cellImage],
    ["__NODE_VERSION__", manifest.tools.nodeVersion],
    ["__NODE_ARCHIVE_SHA256__", manifest.tools.nodeArchiveSha256],
    ["__COSIGN_VERSION__", manifest.tools.cosignVersion],
    ["__COSIGN_SHA256__", manifest.tools.cosignSha256],
  ]);
  for (const [token, value] of values) rendered = replaceOnce(rendered, token, value);
  assert(!/__[A-Z0-9_]+__/.test(rendered), "PORTABLE_TEMPLATE_UNRESOLVED", "Portable cloud-init contains an unresolved token.");
  assert(rendered.startsWith("#cloud-config\n"), "PORTABLE_TEMPLATE_HEADER_INVALID", "Rendered user-data must be cloud-config.");
  return rendered;
}

export function redactPortable(value) {
  if (Array.isArray(value)) return value.map(redactPortable);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = FORBIDDEN_KEY.test(key) ? "[REDACTED]" : redactPortable(item);
  }
  return result;
}

export function validateSubstrateFacts(facts, manifest, now = new Date()) {
  const required = manifest.substrate;
  const failures = [];
  if (facts?.osId !== required.osId || facts?.osVersionId !== required.osVersionId) failures.push("os");
  if (facts?.architecture !== required.architecture) failures.push("architecture");
  if (!Number.isInteger(facts?.cpuCount) || facts.cpuCount < required.cpuCount) failures.push("cpu");
  if (!Number.isFinite(facts?.memoryBytes) || facts.memoryBytes < required.memoryBytes) failures.push("memory");
  if (!Number.isFinite(facts?.diskBytes) || facts.diskBytes < required.diskBytes) failures.push("disk");
  if (facts?.dnsReady !== true) failures.push("dns");
  if (facts?.outboundHttps !== true) failures.push("outbound_https");
  if (facts?.clockSynchronized !== true) failures.push("clock");
  if (failures.length > 0) {
    fail("PORTABLE_SUBSTRATE_UNSUPPORTED", `Compatible-VM preflight failed: ${failures.join(", ")}.`, { failures, facts: redactPortable(facts) });
  }
  return {
    schema: "orionfold.relay-host-portable-receipt/v1",
    status: "passed",
    reasonCode: "PORTABLE_SUBSTRATE_PREFLIGHT_PASSED",
    checkedAt: now.toISOString(),
    relayVersion: manifest.release.relayVersion,
    cellImage: `${manifest.cell.imageRepository}@${manifest.cell.imageDigest}`,
    facts: redactPortable(facts),
    supportLevel: "portable-playbook",
  };
}

function readOsRelease(file = "/etc/os-release") {
  const result = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return result;
}

function commandOk(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
  } catch {
    return "";
  }
}

export function collectLocalSubstrateFacts({ osReleaseFile = "/etc/os-release" } = {}) {
  let release;
  try {
    release = readOsRelease(osReleaseFile);
  } catch (cause) {
    fail("PORTABLE_SUBSTRATE_FACTS_UNAVAILABLE", `Could not read ${osReleaseFile}.`, undefined, { cause });
  }
  const disk = statfsSync("/");
  const timedate = commandOutput("timedatectl", ["show", "--property=NTPSynchronized", "--value"]);
  return {
    osId: release.ID ?? "unknown",
    osVersionId: release.VERSION_ID ?? "unknown",
    architecture: os.arch(),
    cpuCount: os.cpus().length,
    memoryBytes: os.totalmem(),
    diskBytes: Number(disk.blocks) * Number(disk.bsize),
    dnsReady: commandOk("getent", ["hosts", "registry.npmjs.org"]),
    outboundHttps: commandOk("curl", ["--fail", "--silent", "--show-error", "--head", "--max-time", "10", "https://registry.npmjs.org/orionfold-relay"]),
    clockSynchronized: timedate === "yes",
  };
}

export function verifyBootstrapReceipt(receipt, manifest) {
  assert(receipt?.schema === "orionfold.relay-host-bootstrap-receipt/v1", "PORTABLE_BOOTSTRAP_RECEIPT_SCHEMA_INVALID", "Bootstrap receipt schema is invalid.");
  assert(receipt?.status === "prepared", "PORTABLE_BOOTSTRAP_INCOMPLETE", `Bootstrap is ${receipt?.status ?? "unknown"}, not prepared.`, redactPortable(receipt));
  assert(["PORTABLE_BOOTSTRAP_PREPARED", "PORTABLE_BOOTSTRAP_DRY_RUN_PREPARED"].includes(receipt?.reasonCode), "PORTABLE_BOOTSTRAP_REASON_INVALID", "Bootstrap receipt reason code is invalid.");
  assert(receipt?.relayVersion === manifest.release.relayVersion, "PORTABLE_BOOTSTRAP_VERSION_MISMATCH", "Bootstrap receipt Relay version differs from the manifest.");
  assert(receipt?.cellImage === `${manifest.cell.imageRepository}@${manifest.cell.imageDigest}`, "PORTABLE_BOOTSTRAP_CELL_MISMATCH", "Bootstrap receipt Cell image differs from the manifest.");
  return {
    ok: true,
    status: receipt.status,
    reasonCode: receipt.reasonCode,
    relayVersion: receipt.relayVersion,
    cellImage: receipt.cellImage,
    dryRun: receipt.dryRun === true,
  };
}
