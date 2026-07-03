// @vitest-environment node
/**
 * Snapshot manager round-trip + lock regression tests.
 *
 * Guards the P1 re-entrant deadlock (issue #24): restoreFromSnapshot acquired
 * the mutex, then called createSnapshot for its pre-restore safety snapshot,
 * which threw "Another snapshot operation is already in progress" every time.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { getAinativeDataDir } from "@/lib/utils/ainative-paths";
import {
  createSnapshot,
  restoreFromSnapshot,
  listSnapshots,
  SnapshotBusyError,
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
});
