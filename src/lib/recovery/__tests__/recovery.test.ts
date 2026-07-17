// @vitest-environment node
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { getAinativeDataDir } from "@/lib/utils/ainative-paths";
import { authStorePath, completeBootstrap, createBootstrapToken } from "@/lib/host-ingress/store";
import { RelayRecoveryError } from "../errors";
import { createRecoveryKeyFile } from "../key";
import {
  createRecoveryBundle,
  drillRecoveryBundle,
  enforceRecoveryRetention,
  listRecoveryReceipts,
  reconcileRecoveryState,
  restoreRecoveryBundle,
  verifyRecoveryBundle,
} from "../orchestrator";

describe("customer-owned recovery", () => {
  let externalRoot: string;
  let keyFile: string;
  let destination: string;

  beforeEach(async () => {
    externalRoot = mkdtempSync(join(tmpdir(), "relay-recovery-test-"));
    keyFile = join(externalRoot, "keys", "cell-a.key");
    destination = join(externalRoot, "bundles");
    process.env.RELAY_CELL_ID = "cell-a";
    await db.delete(snapshots);
    rmSync(join(getAinativeDataDir(), "snapshots"), { recursive: true, force: true });
    rmSync(join(getAinativeDataDir(), "recovery"), { recursive: true, force: true });
    rmSync(authStorePath(), { force: true });
    rmSync(`${authStorePath()}-wal`, { force: true });
    rmSync(`${authStorePath()}-shm`, { force: true });
    mkdirSync(join(getAinativeDataDir(), "uploads"), { recursive: true });
    writeFileSync(join(getAinativeDataDir(), "uploads", "customer.txt"), "portable customer state");
    writeFileSync(join(getAinativeDataDir(), ".keyfile"), randomBytes(32), { mode: 0o600 });
    createRecoveryKeyFile(keyFile);
    const bootstrap = createBootstrapToken();
    completeBootstrap({ token: bootstrap.token, password: "a sufficiently long password", deviceName: "Recovery test", rateKey: "recovery-test" });
  });

  afterEach(() => {
    delete process.env.RELAY_CELL_ID;
    rmSync(externalRoot, { recursive: true, force: true });
  });

  it("creates, verifies, drills, and restores a complete Cell into an empty root", async () => {
    const created = await createRecoveryBundle({ destination, keyFile });
    expect(created.receipt.status).toBe("ready");
    expect(created.receipt.authIntegrity).toBe("ok");
    expect(created.receipt.secretRootPresent).toBe(true);
    expect(readdirSync(destination).some((name) => name.includes(".partial-"))).toBe(false);
    expect(readdirSync(destination).some((name) => name.includes(".candidate-"))).toBe(false);

    await expect(verifyRecoveryBundle({ bundlePath: created.bundlePath, keyFile })).resolves.toMatchObject({
      status: "verified",
      reasonCode: "RECOVERY_VERIFIED",
    });
    await expect(drillRecoveryBundle({ bundlePath: created.bundlePath, keyFile })).resolves.toMatchObject({
      status: "verified",
      reasonCode: "RECOVERY_DRILL_VERIFIED",
      restoredFileCount: 1,
    });

    const restoredRoot = join(externalRoot, "restored-cell");
    const restored = await restoreRecoveryBundle({ bundlePath: created.bundlePath, keyFile, targetDataDir: restoredRoot });
    expect(restored.status).toBe("restored");
    expect(readFileSync(join(restoredRoot, "uploads", "customer.txt"), "utf8")).toBe("portable customer state");
    expect(readFileSync(join(restoredRoot, ".keyfile"))).toEqual(readFileSync(join(getAinativeDataDir(), ".keyfile")));
    expect(existsSync(join(restoredRoot, "relay-auth.db"))).toBe(true);
    expect(statSync(join(restoredRoot, ".keyfile")).mode & 0o077).toBe(0);
  });

  it("refuses the wrong key, wrong Cell, and damaged ciphertext without touching a target", async () => {
    const created = await createRecoveryBundle({ destination, keyFile });
    const otherKey = join(externalRoot, "keys", "other.key");
    createRecoveryKeyFile(otherKey);
    await expect(verifyRecoveryBundle({ bundlePath: created.bundlePath, keyFile: otherKey })).rejects.toMatchObject({ code: "RECOVERY_AUTHENTICATION_FAILED" });
    await expect(verifyRecoveryBundle({ bundlePath: created.bundlePath, keyFile, cellId: "cell-b" })).rejects.toMatchObject({ code: "RECOVERY_CELL_MISMATCH" });

    const damaged = join(destination, "damaged.relay-recovery");
    copyFileSync(created.bundlePath, damaged);
    const bytes = readFileSync(damaged);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(damaged, bytes, { mode: 0o600 });
    await expect(verifyRecoveryBundle({ bundlePath: damaged, keyFile })).rejects.toMatchObject({ code: "RECOVERY_AUTHENTICATION_FAILED" });
    expect(existsSync(join(externalRoot, "never-created"))).toBe(false);
  });

  it("refuses a non-empty restore target", async () => {
    const created = await createRecoveryBundle({ destination, keyFile });
    const target = join(externalRoot, "occupied");
    mkdirSync(target);
    writeFileSync(join(target, "preserve.txt"), "preserve");
    await expect(restoreRecoveryBundle({ bundlePath: created.bundlePath, keyFile, targetDataDir: target })).rejects.toMatchObject({ code: "RECOVERY_TARGET_NOT_EMPTY" });
    expect(readFileSync(join(target, "preserve.txt"), "utf8")).toBe("preserve");
  });

  it("keeps old bundles bound to their old key after rotation", async () => {
    const first = await createRecoveryBundle({ destination, keyFile });
    const rotatedKey = join(externalRoot, "keys", "cell-a-rotated.key");
    createRecoveryKeyFile(rotatedKey);
    const second = await createRecoveryBundle({ destination, keyFile: rotatedKey });
    await expect(verifyRecoveryBundle({ bundlePath: first.bundlePath, keyFile })).resolves.toMatchObject({ status: "verified" });
    await expect(verifyRecoveryBundle({ bundlePath: second.bundlePath, keyFile: rotatedKey })).resolves.toMatchObject({ status: "verified" });
    await expect(verifyRecoveryBundle({ bundlePath: first.bundlePath, keyFile: rotatedKey })).rejects.toMatchObject({ code: "RECOVERY_AUTHENTICATION_FAILED" });
  });

  it("reconciles stale partials and enforces explicit count retention", () => {
    mkdirSync(destination, { recursive: true });
    const oldPartial = join(destination, "old.partial-fixture");
    writeFileSync(oldPartial, "partial");
    const oldCandidate = join(destination, "old.relay-recovery.candidate-fixture");
    writeFileSync(oldCandidate, "candidate");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(oldPartial, twoHoursAgo, twoHoursAgo);
    utimesSync(oldCandidate, twoHoursAgo, twoHoursAgo);
    expect(reconcileRecoveryState(destination)).toBe(2);
    expect(existsSync(oldPartial)).toBe(false);
    expect(existsSync(oldCandidate)).toBe(false);

    for (let index = 0; index < 3; index++) {
      const file = join(destination, `relay-cell-a-2026-01-0${index + 1}.relay-recovery`);
      writeFileSync(file, String(index));
      const when = new Date(Date.now() - (3 - index) * 1000);
      utimesSync(file, when, when);
    }
    expect(enforceRecoveryRetention({ destination, cellId: "cell-a", maxCount: 2 })).toBe(1);
    expect(readdirSync(destination).filter((name) => name.endsWith(".relay-recovery"))).toHaveLength(2);
    expect(() => enforceRecoveryRetention({ destination, cellId: "cell-a", maxCount: Number.NaN })).toThrowError(RelayRecoveryError);
  });

  it("surfaces corrupt receipts instead of silently hiding failed recovery evidence", () => {
    const receipts = join(getAinativeDataDir(), "recovery", "receipts");
    mkdirSync(receipts, { recursive: true });
    writeFileSync(join(receipts, "invalid.json"), "not-json");
    expect(() => listRecoveryReceipts()).toThrowError(RelayRecoveryError);
  });

  it("uses named errors for unsafe key placement", () => {
    expect(() => createRecoveryKeyFile(join(getAinativeDataDir(), "bad.key"))).toThrowError(RelayRecoveryError);
  });

  it("resolves parent links before accepting recovery key placement", async () => {
    const linkedCell = join(externalRoot, "linked-cell");
    const { symlinkSync } = await import("node:fs");
    symlinkSync(getAinativeDataDir(), linkedCell, "dir");
    expect(() => createRecoveryKeyFile(join(linkedCell, "linked.key"))).toThrowError(RelayRecoveryError);
  });

  it("refuses a symlinked recovery destination", async () => {
    const linked = join(externalRoot, "linked-bundles");
    const real = join(externalRoot, "real-bundles");
    mkdirSync(real);
    const { symlinkSync } = await import("node:fs");
    symlinkSync(real, linked, "dir");
    await expect(createRecoveryBundle({ destination: linked, keyFile })).rejects.toMatchObject({ code: "RECOVERY_DESTINATION_INVALID" });
  });

  it("refuses file-archive links before publishing a completed bundle", async () => {
    const outside = join(externalRoot, "outside.txt");
    writeFileSync(outside, "must not become a Cell link");
    const { symlinkSync } = await import("node:fs");
    symlinkSync(outside, join(getAinativeDataDir(), "uploads", "outside-link"));
    await expect(createRecoveryBundle({ destination, keyFile })).rejects.toMatchObject({ code: "RECOVERY_FILE_ARCHIVE_ENTRY_REFUSED" });
    expect(readdirSync(destination).some((name) => name.endsWith(".relay-recovery"))).toBe(false);
  });
});
