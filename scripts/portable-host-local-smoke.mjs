import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readPortableAssets, validatePortableManifest, verifyBootstrapReceipt } from "./lib/cloud-host/portable-contract.mjs";

const assets = readPortableAssets();
const manifest = validatePortableManifest(assets);
const directory = mkdtempSync(path.join(os.tmpdir(), "relay-portable-host-"));

try {
  const envFile = path.join(directory, "relay-host-portable.env");
  writeFileSync(envFile, [
    `RELAY_VERSION=${manifest.release.relayVersion}`,
    `CELL_IMAGE=${manifest.cell.imageRepository}@${manifest.cell.imageDigest}`,
    `NODE_VERSION=${manifest.tools.nodeVersion}`,
    `NODE_ARCHIVE_SHA256=${manifest.tools.nodeArchiveSha256}`,
    `COSIGN_VERSION=${manifest.tools.cosignVersion}`,
    `COSIGN_SHA256=${manifest.tools.cosignSha256}`,
    "",
  ].join("\n"), { mode: 0o600 });

  const bootstrap = path.resolve("deploy/relay-host/bootstrap.sh");
  execFileSync("docker", [
    "run", "--rm", "--pull=missing", "--platform=linux/amd64", "--cpus=2", "--memory=4g",
    "--mount", `type=bind,src=${bootstrap},dst=/usr/local/sbin/relay-host-bootstrap,readonly`,
    "--mount", `type=bind,src=${envFile},dst=/etc/relay-host-portable.env,readonly`,
    "--mount", `type=bind,src=${directory},dst=/evidence`,
    "--env", "RELAY_PORTABLE_DRY_RUN=1",
    "--env", "RELAY_PORTABLE_TEST_DISK_KIB=1",
    "ubuntu:24.04", "bash", "-lc",
    "set +e; /usr/local/sbin/relay-host-bootstrap; code=$?; set -e; test \"$code\" -eq 49; cp /var/lib/relay-host-portable/bootstrap.json /evidence/failed.json; export RELAY_PORTABLE_TEST_DISK_KIB=83886080; /usr/local/sbin/relay-host-bootstrap && /usr/local/sbin/relay-host-bootstrap && cp /var/lib/relay-host-portable/bootstrap.json /evidence/bootstrap.json",
  ], { stdio: "inherit", timeout: 180_000 });

  const failed = JSON.parse(readFileSync(path.join(directory, "failed.json"), "utf8"));
  assert.equal(failed.status, "failed");
  assert.equal(failed.reasonCode, "PORTABLE_SUBSTRATE_DISK_INSUFFICIENT");
  assert.equal(failed.exitCode, 49);
  const receipt = JSON.parse(readFileSync(path.join(directory, "bootstrap.json"), "utf8"));
  const verified = verifyBootstrapReceipt(receipt, manifest);
  assert.equal(verified.reasonCode, "PORTABLE_BOOTSTRAP_DRY_RUN_PREPARED");
  assert.equal(verified.dryRun, true);
  console.log(JSON.stringify({ reasonCode: "PORTABLE_LOCAL_UBUNTU_SMOKE_PASSED", failureReceipt: failed.reasonCode, retries: 2, receipt: verified }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
