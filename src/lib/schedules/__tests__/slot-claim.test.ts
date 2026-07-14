import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { tasks, schedules, projects, settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import {
  claimSlot,
  countRunningScheduledSlots,
  SLOT_CLAIM_SQL,
} from "../slot-claim";
import { reapExpiredLeases } from "../slot-claim";

function seedProject(): string {
  const id = randomUUID();
  const now = new Date();
  db.insert(projects)
    .values({ id, name: "test", status: "active", createdAt: now, updatedAt: now })
    .run();
  return id;
}

function seedSchedule(projectId: string): string {
  const id = randomUUID();
  const now = new Date();
  db.insert(schedules)
    .values({
      id,
      projectId,
      name: `sched-${id.slice(0, 4)}`,
      prompt: "test",
      cronExpression: "* * * * *",
      status: "active",
      type: "scheduled",
      firingCount: 0,
      suppressionCount: 0,
      heartbeatSpentToday: 0,
      failureStreak: 0,
      turnBudgetBreachStreak: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function seedQueuedTask(scheduleId: string): string {
  const id = randomUUID();
  const now = new Date();
  db.insert(tasks)
    .values({
      id,
      scheduleId,
      title: "test firing",
      status: "queued",
      priority: 2,
      sourceType: "scheduled",
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe("claimSlot", () => {
  beforeEach(() => {
    db.delete(tasks).run();
    db.delete(schedules).run();
    db.delete(projects).run();
    db.delete(settings).where(eq(settings.key, "schedule.maxConcurrent")).run();
  });

  it("claims a slot when capacity available, transitioning queued→running", () => {
    const pid = seedProject();
    const sid = seedSchedule(pid);
    const tid = seedQueuedTask(sid);

    const result = claimSlot(tid, 2, 1200);

    expect(result.claimed).toBe(true);
    const row = db.select().from(tasks).where(eq(tasks.id, tid)).get();
    expect(row?.status).toBe("running");
    expect(row?.slotClaimedAt).not.toBeNull();
    expect(row?.leaseExpiresAt).not.toBeNull();
  });

  it("refuses to claim when cap=0", () => {
    const pid = seedProject();
    const sid = seedSchedule(pid);
    const tid = seedQueuedTask(sid);

    const result = claimSlot(tid, 0, 1200);

    expect(result.claimed).toBe(false);
    const row = db.select().from(tasks).where(eq(tasks.id, tid)).get();
    expect(row?.status).toBe("queued");
  });

  it("refuses when cap already full", () => {
    const pid = seedProject();
    const sid1 = seedSchedule(pid);
    const sid2 = seedSchedule(pid);
    const tid1 = seedQueuedTask(sid1);
    const tid2 = seedQueuedTask(sid2);

    expect(claimSlot(tid1, 1, 1200).claimed).toBe(true);
    expect(claimSlot(tid2, 1, 1200).claimed).toBe(false);

    const row2 = db.select().from(tasks).where(eq(tasks.id, tid2)).get();
    expect(row2?.status).toBe("queued");
  });

  it("refuses a repeated claim for the same task", () => {
    const pid = seedProject();
    const sid = seedSchedule(pid);
    const tid = seedQueuedTask(sid);

    const first = claimSlot(tid, 10, 1200);
    const second = claimSlot(tid, 10, 1200);

    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false); // task already running, can't re-claim
  });

  it("allows exactly one winner when two SQLite connections race beneath cap 1", async () => {
    const projectId = seedProject();
    const firstTaskId = seedQueuedTask(seedSchedule(projectId));
    const secondTaskId = seedQueuedTask(seedSchedule(projectId));
    const databasePath = join(process.env.RELAY_DATA_DIR!, "relay.db");
    const startBarrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const startSignal = new Int32Array(startBarrier);

    const workerSource = `
      const { parentPort, workerData } = require("node:worker_threads");
      const Database = require("better-sqlite3");
      const db = new Database(workerData.databasePath);
      db.pragma("busy_timeout = 5000");
      const start = new Int32Array(workerData.startBarrier);
      parentPort.postMessage({ type: "ready" });
      Atomics.wait(start, 0, 0);
      try {
        const result = db.prepare(workerData.sql).run(
          workerData.nowSec,
          workerData.nowSec + 1200,
          workerData.nowSec,
          workerData.taskId,
          1,
        );
        parentPort.postMessage({ type: "result", changes: result.changes });
      } catch (error) {
        parentPort.postMessage({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        db.close();
      }
    `;

    const runClaim = (taskId: string) => {
      let markReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        markReady = resolve;
      });
      const result = new Promise<number>((resolve, reject) => {
        const worker = new Worker(workerSource, {
          eval: true,
          workerData: {
            databasePath,
            sql: SLOT_CLAIM_SQL,
            taskId,
            nowSec: Math.ceil(Date.now() / 1000),
            startBarrier,
          },
        });
        worker.on("message", (message) => {
          if (message.type === "ready") {
            markReady();
            return;
          }
          if (message.type === "error") {
            reject(new Error(`Competing claim failed: ${message.message}`));
            return;
          }
          resolve(message.changes);
        });
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`Competing claim worker exited ${code}`));
        });
      });
      return { ready, result };
    };

    const firstClaim = runClaim(firstTaskId);
    const secondClaim = runClaim(secondTaskId);
    // Let both connections open and block on the shared start signal before
    // releasing them together. SQLite then serializes the actual writers.
    await Promise.all([firstClaim.ready, secondClaim.ready]);
    Atomics.store(startSignal, 0, 1);
    Atomics.notify(startSignal, 0, 2);

    const changes = await Promise.all([firstClaim.result, secondClaim.result]);
    expect(changes.sort()).toEqual([0, 1]);
    expect(countRunningScheduledSlots()).toBe(1);

    const rows = db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.sourceType, "scheduled"))
      .all();
    expect(rows.filter((row) => row.status === "running")).toHaveLength(1);
    expect(rows.filter((row) => row.status === "queued")).toHaveLength(1);
  });

  it("respects cap across multiple tasks from different schedules", () => {
    const pid = seedProject();
    const tids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const sid = seedSchedule(pid);
      tids.push(seedQueuedTask(sid));
    }

    // Cap of 3 → first 3 claim, last 2 fail
    const results = tids.map((tid) => claimSlot(tid, 3, 1200));
    expect(results.filter((r) => r.claimed).length).toBe(3);
    expect(results.filter((r) => !r.claimed).length).toBe(2);

    expect(countRunningScheduledSlots()).toBe(3);
  });

  it("countRunningScheduledSlots ignores non-scheduled tasks", () => {
    const pid = seedProject();
    const sid = seedSchedule(pid);
    const schedTid = seedQueuedTask(sid);
    claimSlot(schedTid, 10, 1200);

    // Insert a manual running task — must not count against scheduled cap
    const manualId = randomUUID();
    const now = new Date();
    db.insert(tasks)
      .values({
        id: manualId,
        title: "manual",
        status: "running",
        priority: 2,
        sourceType: "manual",
        resumeCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(countRunningScheduledSlots()).toBe(1);
  });

  it("writes leaseExpiresAt = slotClaimedAt + leaseSec", () => {
    const pid = seedProject();
    const sid = seedSchedule(pid);
    const tid = seedQueuedTask(sid);

    const before = Date.now();
    claimSlot(tid, 10, 60);
    const row = db.select().from(tasks).where(eq(tasks.id, tid)).get();

    expect(row?.slotClaimedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(
      row!.leaseExpiresAt!.getTime() - row!.slotClaimedAt!.getTime(),
    ).toBe(60 * 1000);
  });
});

describe("reapExpiredLeases", () => {
  beforeEach(() => {
    db.delete(tasks).run();
    db.delete(schedules).run();
    db.delete(projects).run();
  });

  it("marks an expired running task as failed with failure_reason=lease_expired", () => {
    const pid = seedProject();
    const sid = seedSchedule(pid);
    const tid = seedQueuedTask(sid);

    // Claim with a 1-second lease, then fast-forward via direct DB edit
    claimSlot(tid, 10, 1);
    const past = new Date(Date.now() - 5000);
    db.update(tasks)
      .set({ leaseExpiresAt: past })
      .where(eq(tasks.id, tid))
      .run();

    const reaped = reapExpiredLeases();

    expect(reaped).toEqual([tid]);
    const row = db.select().from(tasks).where(eq(tasks.id, tid)).get();
    expect(row?.status).toBe("failed");
    expect(row?.failureReason).toBe("lease_expired");
  });

  it("leaves fresh running tasks alone", () => {
    const pid = seedProject();
    const sid = seedSchedule(pid);
    const tid = seedQueuedTask(sid);

    claimSlot(tid, 10, 3600); // 1-hour lease

    const reaped = reapExpiredLeases();

    expect(reaped).toEqual([]);
    const row = db.select().from(tasks).where(eq(tasks.id, tid)).get();
    expect(row?.status).toBe("running");
  });

  it("reaps multiple expired tasks in one sweep", () => {
    const pid = seedProject();
    const tids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const sid = seedSchedule(pid);
      const tid = seedQueuedTask(sid);
      claimSlot(tid, 10, 1);
      tids.push(tid);
    }
    const past = new Date(Date.now() - 5000);
    for (const tid of tids) {
      db.update(tasks)
        .set({ leaseExpiresAt: past })
        .where(eq(tasks.id, tid))
        .run();
    }

    const reaped = reapExpiredLeases();

    expect(reaped.sort()).toEqual([...tids].sort());
    expect(countRunningScheduledSlots()).toBe(0);
  });
});
