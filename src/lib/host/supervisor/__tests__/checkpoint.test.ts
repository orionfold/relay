import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileHostCheckpointVerifier } from "../checkpoint";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "relay-host-checkpoint-"));
  const bundlePath = join(root, "cell-a.relay-recovery");
  const bytes = Buffer.from("synthetic encrypted recovery bundle");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const receiptPath = `${bundlePath}.receipt.json`;
  writeFileSync(bundlePath, bytes);
  writeFileSync(receiptPath, JSON.stringify({
    format: "relay-recovery-receipt-v1",
    operationId: randomUUID(),
    operation: "verify",
    status: "verified",
    reasonCode: "RECOVERY_VERIFIED",
    cellId: "cell-a",
    bundleFile: basename(bundlePath),
    bundleSha256: digest,
    keyFingerprint: "a".repeat(16),
    snapshotId: randomUUID(),
    startedAt: "2026-07-18T00:00:00.000Z",
    completedAt: "2026-07-18T00:00:01.000Z",
    durationMs: 1000,
    dbIntegrity: "ok",
    authIntegrity: "ok",
    secretRootPresent: true,
    restoredFileCount: null,
  }));
  return { root, bundlePath, receiptPath, checkpointRef: `sha256:${digest}` };
}

describe("Relay Host recovery checkpoint evidence", () => {
  it("binds release to the exact verified Cell receipt and bundle bytes", () => {
    const value = fixture();
    try {
      expect(() => new FileHostCheckpointVerifier().verify({
        cellId: "cell-a",
        checkpointRef: value.checkpointRef,
        receiptPath: value.receiptPath,
        bundlePath: value.bundlePath,
      })).not.toThrow();
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  it("refuses another Cell and post-verification bundle tampering", () => {
    const value = fixture();
    const verifier = new FileHostCheckpointVerifier();
    try {
      expect(() => verifier.verify({
        cellId: "cell-b",
        checkpointRef: value.checkpointRef,
        receiptPath: value.receiptPath,
        bundlePath: value.bundlePath,
      })).toThrowError(/does not verify checkpoint continuity/);
      writeFileSync(value.bundlePath, "tampered");
      expect(() => verifier.verify({
        cellId: "cell-a",
        checkpointRef: value.checkpointRef,
        receiptPath: value.receiptPath,
        bundlePath: value.bundlePath,
      })).toThrowError(/no longer matches/);
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  });
});
