import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildG085BootstrapScript,
  currentCellManifest,
  g085Hostname,
  loadG085ProviderState,
  redactLiveReceipt,
  rollbackCellManifest,
} from "./lib/digitalocean-g085-live.mjs";

function state() {
  return {
    schema: 1,
    runId: "20260720a",
    plan: {
      prefix: "relay-g085-20260720a",
      relayVersion: "0.44.5",
      cellImage: `ghcr.io/orionfold/relay-cell@sha256:${"a".repeat(64)}`,
      resources: { volume: "relay-g085-20260720a-recovery" },
    },
    resourceIds: { reservedIp: "198.51.100.7", dropletId: 42 },
  };
}

test("live state and hostname require complete provider identity", () => {
  const dir = mkdtempSync(join(tmpdir(), "g085-live-"));
  try {
    const file = join(dir, "state.json");
    writeFileSync(file, JSON.stringify(state()));
    const loaded = loadG085ProviderState(file);
    assert.equal(g085Hostname(loaded), "relay-g085-20260720a.198-51-100-7.sslip.io");
    loaded.resourceIds.reservedIp = "0.0.0.0/0";
    writeFileSync(file, JSON.stringify(loaded));
    assert.throws(() => loadG085ProviderState(file), { code: "G085_LIVE_STATE_INVALID" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bootstrap is pinned, non-root and does not embed credentials", () => {
  const script = buildG085BootstrapScript(state());
  assert.match(script, /orionfold-relay@0\.44\.5/);
  assert.match(script, /cp -a \/usr\/local\/lib\/node_modules\/orionfold-relay \/srv\/relay-host\/app/);
  assert.match(script, /\/srv\/relay-host\/app\/dist\/cli\.js/);
  assert.match(script, /cosign verify-attestation/);
  assert.match(script, /https:\/\/slsa\.dev\/provenance\/v1/);
  assert.match(script, /--cap-add DAC_READ_SEARCH/);
  assert.match(script, /User=relay/);
  assert.match(script, /127\.0\.0\.1:3000/);
  assert.match(script, /caddy@sha256:[a-f0-9]{64}/);
  assert.match(script, /scsi-0DO_Volume_relay-g085-20260720a-recovery/);
  assert.equal(script.includes("DIGITALOCEAN_TOKEN"), false);
  assert.equal(script.includes("OF-RELAY-HOST"), false);
});

test("current and rollback manifests retain exact digest authority", () => {
  const current = currentCellManifest(state(), "cell-a", 4100);
  assert.equal(current.artifact.version, "0.44.5");
  assert.equal(current.artifact.imageDigest, `sha256:${"a".repeat(64)}`);
  assert.equal(current.loopbackPort, 4100);
  const rollback = rollbackCellManifest(state(), "cell-r", 4112);
  assert.equal(rollback.artifact.version, "0.44.3");
  assert.match(rollback.artifact.imageReference, /@sha256:[a-f0-9]{64}$/);
  assert.equal(rollback.origin, "restore_new");
});

test("live receipts recursively redact every credential class", () => {
  assert.deepEqual(
    redactLiveReceipt({ adminPassword: "one", nested: { cookie: "two", dropletId: 42 } }),
    { adminPassword: "[REDACTED]", nested: { cookie: "[REDACTED]", dropletId: 42 } },
  );
});
