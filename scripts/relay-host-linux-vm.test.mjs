import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertSecretFree,
  PortableHostError,
  readPortableAssets,
  redactPortable,
  renderCloudInit,
  validatePortableManifest,
  validateRenderInput,
  validateSubstrateFacts,
  verifyBootstrapReceipt,
} from "./lib/cloud-host/portable-contract.mjs";

const assets = readPortableAssets();
const manifest = validatePortableManifest(assets);
const cloneAssets = () => structuredClone(assets);
const validFacts = () => ({
  osId: "ubuntu",
  osVersionId: "24.04",
  architecture: "x64",
  cpuCount: 2,
  memoryBytes: 4 * 1024 ** 3,
  diskBytes: 80 * 1024 ** 3,
  dnsReady: true,
  outboundHttps: true,
  clockSynchronized: true,
});
const validReceipt = () => ({
  schema: "orionfold.relay-host-bootstrap-receipt/v1",
  status: "prepared",
  reasonCode: "PORTABLE_BOOTSTRAP_PREPARED",
  relayVersion: manifest.release.relayVersion,
  cellImage: `${manifest.cell.imageRepository}@${manifest.cell.imageDigest}`,
});

function rejectsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof PortableHostError && error.code === code);
}

test("portable manifest matches release authority", () => {
  assert.equal(manifest.release.relayVersion, assets.packageJson.version);
  assert.equal(manifest.cell.imageDigest, assets.cellRelease.imageDigest);
});

for (const [name, mutate, code] of [
  ["package version", (copy) => { copy.packageJson.version = "9.9.9"; }, "PORTABLE_RELEASE_VERSION_MISMATCH"],
  ["Cell version", (copy) => { copy.cellRelease.relayVersion = "9.9.9"; }, "PORTABLE_CELL_VERSION_MISMATCH"],
  ["Cell digest", (copy) => { copy.manifest.cell.imageDigest = `sha256:${"a".repeat(64)}`; }, "PORTABLE_CELL_DIGEST_MISMATCH"],
  ["bootstrap bytes", (copy) => { copy.bootstrap += "\n# tampered\n"; }, "PORTABLE_BOOTSTRAP_CHECKSUM_MISMATCH"],
  ["operating system", (copy) => { copy.manifest.substrate.osVersionId = "22.04"; }, "PORTABLE_SUBSTRATE_OS_INVALID"],
  ["architecture", (copy) => { copy.manifest.substrate.architecture = "arm64"; }, "PORTABLE_SUBSTRATE_ARCH_INVALID"],
  ["CPU", (copy) => { copy.manifest.substrate.cpuCount = 1; }, "PORTABLE_SUBSTRATE_CPU_INVALID"],
  ["memory", (copy) => { copy.manifest.substrate.memoryBytes = 1024; }, "PORTABLE_SUBSTRATE_MEMORY_INVALID"],
  ["disk", (copy) => { copy.manifest.substrate.diskBytes = 1024; }, "PORTABLE_SUBSTRATE_DISK_INVALID"],
  ["Node checksum", (copy) => { copy.manifest.tools.nodeArchiveSha256 = "mutable"; }, "PORTABLE_NODE_CHECKSUM_INVALID"],
  ["valid-looking Node checksum", (copy) => { copy.manifest.tools.nodeArchiveSha256 = "a".repeat(64); }, "PORTABLE_NODE_CHECKSUM_MISMATCH"],
  ["Cosign checksum", (copy) => { copy.manifest.tools.cosignSha256 = "mutable"; }, "PORTABLE_COSIGN_CHECKSUM_INVALID"],
  ["valid-looking Cosign checksum", (copy) => { copy.manifest.tools.cosignSha256 = "a".repeat(64); }, "PORTABLE_COSIGN_CHECKSUM_MISMATCH"],
  ["managed paths", (copy) => { copy.manifest.paths.data = "/tmp/data"; }, "PORTABLE_PATHS_INVALID"],
  ["unknown field", (copy) => { copy.manifest.provider = "example"; }, "PORTABLE_MANIFEST_SHAPE_INVALID"],
]) {
  test(`portable manifest refuses mismatched ${name}`, () => {
    const copy = cloneAssets();
    mutate(copy);
    rejectsCode(() => validatePortableManifest(copy), code);
  });
}

for (const key of ["token", "password", "license", "apiKey", "privateKey", "recoveryKey", "providerCredential", "authorization"]) {
  test(`cloud-init input refuses ${key}`, () => {
    rejectsCode(() => assertSecretFree({ [key]: "do-not-print-this" }), "PORTABLE_SECRET_INPUT_REFUSED");
  });
}

for (const value of [
  "-----BEGIN PRIVATE KEY-----",
  "sk_1234567890123456",
  "DIGITALOCEAN_TOKEN=abc",
  "AWS_SECRET_ACCESS_KEY=abc",
]) {
  test("cloud-init input refuses secret-like values", () => {
    rejectsCode(() => assertSecretFree({ note: value }), "PORTABLE_SECRET_INPUT_REFUSED");
  });
}

test("render input accepts a public key and DNS label", () => {
  assert.equal(validateRenderInput({ sshPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakePublicKey relay", hostname: "relay-host" }).hostname, "relay-host");
});

for (const [input, code] of [
  [{ sshPublicKey: "private", hostname: "relay-host" }, "PORTABLE_SSH_PUBLIC_KEY_INVALID"],
  [{ sshPublicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQFake", hostname: "Relay.Host" }, "PORTABLE_HOSTNAME_INVALID"],
  [{ sshPublicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQFake", hostname: "relay", region: "us" }, "PORTABLE_RENDER_INPUT_UNKNOWN"],
]) {
  test(`render input rejects ${code}`, () => rejectsCode(() => validateRenderInput(input), code));
}

test("golden cloud-init embeds exact checked bootstrap and no unresolved tokens", () => {
  const rendered = renderCloudInit({
    manifest,
    template: assets.template,
    bootstrap: assets.bootstrap,
    input: { sshPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakePublicKey relay", hostname: "relay-host" },
  });
  assert.ok(rendered.startsWith("#cloud-config\n"));
  assert.match(rendered, new RegExp(manifest.bootstrap.sha256));
  assert.match(rendered, new RegExp(manifest.cell.imageDigest));
  assert.doesNotMatch(rendered, /__[A-Z0-9_]+__/);
  const encoded = rendered.match(/content: ([A-Za-z0-9+/=]+)\n/)?.[1];
  assert.equal(Buffer.from(encoded, "base64").toString("utf8"), assets.bootstrap);
  assert.match(rendered, /- name: relayadmin/);
  assert.doesNotMatch(rendered, /- default/);
  assert.doesNotMatch(rendered, /- name: relay\n/);
  assert.match(assets.bootstrap, /--shell \/usr\/sbin\/nologin relay/);
  assert.match(assets.bootstrap, /PORTABLE_BOOTSTRAP_RUNTIME_PRIVILEGED/);
});

test("cloud-init rendering refuses an incomplete template", () => {
  rejectsCode(() => renderCloudInit({ manifest, template: assets.template.replace("__HOSTNAME__", "relay"), bootstrap: assets.bootstrap, input: { sshPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakePublicKey", hostname: "relay" } }), "PORTABLE_TEMPLATE_TOKEN_MISSING");
});

test("compatible facts produce a redacted portable-playbook receipt", () => {
  const receipt = validateSubstrateFacts(validFacts(), manifest, new Date("2026-07-21T00:00:00Z"));
  assert.equal(receipt.reasonCode, "PORTABLE_SUBSTRATE_PREFLIGHT_PASSED");
  assert.equal(receipt.supportLevel, "portable-playbook");
});

for (const [field, value, failure] of [
  ["osVersionId", "22.04", "os"],
  ["architecture", "arm64", "architecture"],
  ["cpuCount", 1, "cpu"],
  ["memoryBytes", 1024, "memory"],
  ["diskBytes", 1024, "disk"],
  ["dnsReady", false, "dns"],
  ["outboundHttps", false, "outbound_https"],
  ["clockSynchronized", false, "clock"],
]) {
  test(`preflight names ${failure} failure`, () => {
    const facts = validFacts();
    facts[field] = value;
    assert.throws(() => validateSubstrateFacts(facts, manifest), (error) => error.code === "PORTABLE_SUBSTRATE_UNSUPPORTED" && error.details.failures.includes(failure));
  });
}

test("bootstrap verifier accepts normal and dry-run completion", () => {
  assert.equal(verifyBootstrapReceipt(validReceipt(), manifest).dryRun, false);
  const dry = validReceipt();
  dry.reasonCode = "PORTABLE_BOOTSTRAP_DRY_RUN_PREPARED";
  dry.dryRun = true;
  assert.equal(verifyBootstrapReceipt(dry, manifest).dryRun, true);
});

for (const [field, value, code] of [
  ["schema", "old", "PORTABLE_BOOTSTRAP_RECEIPT_SCHEMA_INVALID"],
  ["status", "failed", "PORTABLE_BOOTSTRAP_INCOMPLETE"],
  ["reasonCode", "UNKNOWN", "PORTABLE_BOOTSTRAP_REASON_INVALID"],
  ["relayVersion", "9.9.9", "PORTABLE_BOOTSTRAP_VERSION_MISMATCH"],
  ["cellImage", "ghcr.io/example/other@sha256:bad", "PORTABLE_BOOTSTRAP_CELL_MISMATCH"],
]) {
  test(`bootstrap verifier rejects ${field}`, () => {
    const receipt = validReceipt();
    receipt[field] = value;
    rejectsCode(() => verifyBootstrapReceipt(receipt, manifest), code);
  });
}

test("receipt redaction removes named secret values", () => {
  assert.deepEqual(redactPortable({ token: "value", nested: { ok: true, apiKey: "value" } }), { token: "[REDACTED]", nested: { ok: true, apiKey: "[REDACTED]" } });
});

test("npm allowlist carries portable assets and CLI", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  for (const entry of ["deploy/relay-host/", "docs/relay-host-linux-vm.md", "scripts/relay-host-linux-vm.mjs", "scripts/lib/cloud-host/portable-contract.mjs"]) {
    assert.ok(packageJson.files.includes(entry), `${entry} must be included in npm files`);
  }
  assert.equal(packageJson.bin["relay-host-playbook"], "./scripts/relay-host-linux-vm.mjs");
});
