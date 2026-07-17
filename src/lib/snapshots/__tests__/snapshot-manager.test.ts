// @vitest-environment node
/**
 * Snapshot manager round-trip + lock regression tests.
 *
 * Guards the P1 re-entrant deadlock (issue #24): restoreFromSnapshot acquired
 * the mutex, then called createSnapshot for its pre-restore safety snapshot,
 * which threw "Another snapshot operation is already in progress" every time.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { getAinativeDataDir } from "@/lib/utils/ainative-paths";
import {
  createSnapshot,
  restoreFromSnapshot,
  listSnapshots,
  SnapshotBusyError,
  isSnapshotInProgress,
  reconcileInterruptedSnapshots,
} from "../snapshot-manager";

describe("snapshot manager", () => {
  beforeEach(async () => {
    await db.delete(snapshots);
    // Seed a file dir so the tarball step has a real path to archive.
    const uploads = join(getAinativeDataDir(), "uploads");
    mkdirSync(uploads, { recursive: true });
    writeFileSync(join(uploads, "seed.txt"), "seed");
  });

  it("creates a completed snapshot", async () => {
    const row = await createSnapshot("test-create", "manual");
    expect(row.status).toBe("completed");
    expect(row.label).toBe("test-create");
  });

  it("restore round-trip succeeds and takes a pre-restore safety snapshot", async () => {
    // Regression for the re-entrant deadlock: this call must NOT throw
    // "Another snapshot operation is already in progress".
    const snap = await createSnapshot("round-trip", "manual");

    const result = await restoreFromSnapshot(snap.id);

    expect(result.requiresRestart).toBe(true);
    expect(result.preRestoreSnapshotId).toBeTruthy();

    // The pre-restore safety snapshot must actually exist and be completed.
    const all = await listSnapshots();
    const preRestore = all.find((s) => s.id === result.preRestoreSnapshotId);
    expect(preRestore).toBeDefined();
    expect(preRestore?.status).toBe("completed");
    expect(preRestore?.type).toBe("auto");
  });

  it("throws a named SnapshotBusyError (not a generic Error) when locked", async () => {
    // Kick off a create and, without awaiting, start a second one. The second
    // must reject with the named busy error so the route can map it to 409.
    const first = createSnapshot("busy-a", "manual");
    await expect(createSnapshot("busy-b", "manual")).rejects.toBeInstanceOf(
      SnapshotBusyError
    );
    await first; // let the first finish and release the lock
  });

  it("reconciles durable snapshot work interrupted by an earlier process", async () => {
    const partialPath = join(getAinativeDataDir(), "snapshots", "interrupted-fixture");
    mkdirSync(partialPath, { recursive: true });
    writeFileSync(join(partialPath, "partial.db"), "incomplete");
    await db.insert(snapshots).values({
      id: "interrupted-fixture",
      label: "interrupted",
      type: "manual",
      status: "in_progress",
      filePath: partialPath,
      createdAt: new Date(),
    });

    expect(isSnapshotInProgress()).toBe(true);
    await expect(reconcileInterruptedSnapshots()).resolves.toBe(1);
    expect(isSnapshotInProgress()).toBe(false);
    expect(existsSync(partialPath)).toBe(false);

    const [row] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, "interrupted-fixture"));
    expect(row.status).toBe("failed");
    expect(row.error).toContain("SNAPSHOT_INTERRUPTED");
  });

  it("refuses to delete an interrupted snapshot path outside the snapshots root", async () => {
    const outsidePath = join(getAinativeDataDir(), "outside-snapshot-fixture");
    mkdirSync(outsidePath, { recursive: true });
    writeFileSync(join(outsidePath, "preserve.txt"), "preserve");
    await db.insert(snapshots).values({
      id: "outside-snapshot-fixture",
      label: "outside",
      type: "manual",
      status: "in_progress",
      filePath: outsidePath,
      createdAt: new Date(),
    });

    await expect(reconcileInterruptedSnapshots()).resolves.toBe(1);
    expect(existsSync(join(outsidePath, "preserve.txt"))).toBe(true);
    const [row] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, "outside-snapshot-fixture"));
    expect(row.status).toBe("failed");
    expect(row.error).toContain("SNAPSHOT_INTERRUPTED_PATH_REFUSED");
    rmSync(outsidePath, { recursive: true, force: true });
  });
});
