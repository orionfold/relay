/** @vitest-environment node */

/**
 * The restart, simulated: rows left in the persisted waiting line by a process
 * that is gone, and an empty in-memory line.
 *
 * The dispatcher is mocked because recovery's job is to decide *what* to call
 * for each deferred row, not to run an agent. `recoverDeferredTaskRuns` imports
 * it dynamically, so the mock is still the module it gets.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings, tasks } from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/constants/settings";

const { mockStartTaskExecution, mockResumeTaskExecution } = vi.hoisted(() => ({
  mockStartTaskExecution: vi.fn(),
  mockResumeTaskExecution: vi.fn(),
}));

vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: mockStartTaskExecution,
  resumeTaskExecution: mockResumeTaskExecution,
}));

import { recoverDeferredTaskRuns } from "../deferred-run-recovery";
import {
  __resetTaskSlotsForTests,
  countDeferredTaskRuns,
  listDeferredTaskRuns,
} from "../task-slots";

function seedTask(overrides: Partial<typeof tasks.$inferInsert> = {}): string {
  const id = randomUUID();
  const now = new Date();
  db.insert(tasks)
    .values({
      id,
      title: `task-${id.slice(0, 4)}`,
      status: "queued",
      priority: 2,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return id;
}

/** A row the previous process had parked in the waiting line. */
function seedDeferred(
  requestedAtMs: number,
  overrides: Partial<typeof tasks.$inferInsert> = {},
): string {
  return seedTask({
    sourceType: "manual",
    status: "queued",
    runRequestedAt: new Date(requestedAtMs),
    runRequestedMode: "start",
    ...overrides,
  });
}

function rowOf(id: string) {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStartTaskExecution.mockResolvedValue(undefined);
  mockResumeTaskExecution.mockResolvedValue(undefined);
  // The in-memory line is empty after a restart, by definition.
  __resetTaskSlotsForTests();
  db.delete(tasks).run();
  db.delete(settings)
    .where(eq(settings.key, SETTINGS_KEYS.TASK_MAX_CONCURRENT))
    .run();
});

afterEach(() => {
  __resetTaskSlotsForTests();
  vi.unstubAllEnvs();
});

describe("recoverDeferredTaskRuns", () => {
  it("re-dispatches deferred runs oldest submission first", async () => {
    const third = seedDeferred(3_000);
    const first = seedDeferred(1_000);
    const second = seedDeferred(2_000);

    const report = await recoverDeferredTaskRuns();

    expect(report.redispatched).toEqual([first, second, third]);
    expect(mockStartTaskExecution.mock.calls.map(([id]) => id)).toEqual([
      first,
      second,
      third,
    ]);
    expect(mockResumeTaskExecution).not.toHaveBeenCalled();
  });

  it("resumes a run that was deferred as a resume", async () => {
    const started = seedDeferred(1_000, { runRequestedMode: "start" });
    const resumed = seedDeferred(2_000, { runRequestedMode: "resume" });

    await recoverDeferredTaskRuns();

    expect(mockStartTaskExecution.mock.calls.map(([id]) => id)).toEqual([started]);
    expect(mockResumeTaskExecution.mock.calls.map(([id]) => id)).toEqual([resumed]);
  });

  it("starts a run whose mode was never recorded", async () => {
    // Rows parked by a build that predates `run_requested_mode`.
    const legacy = seedDeferred(1_000, { runRequestedMode: null });

    await recoverDeferredTaskRuns();

    expect(mockStartTaskExecution.mock.calls.map(([id]) => id)).toEqual([legacy]);
  });

  it("fails a deferred workflow step instead of re-dispatching it", async () => {
    const step = seedDeferred(1_000, { sourceType: "workflow" });
    const manual = seedDeferred(2_000);

    const report = await recoverDeferredTaskRuns();

    expect(report.failed).toEqual([step]);
    expect(report.redispatched).toEqual([manual]);
    expect(mockStartTaskExecution.mock.calls.map(([id]) => id)).toEqual([manual]);

    const failed = rowOf(step);
    expect(failed?.status).toBe("failed");
    expect(failed?.failureReason).toBe("process_restart");
    expect(failed?.runRequestedAt).toBeNull();
  });

  it("leaves a resting queued row alone", async () => {
    const resting = seedTask({ sourceType: "manual", status: "queued" });
    const planned = seedTask({ sourceType: "manual", status: "planned" });

    const report = await recoverDeferredTaskRuns();

    expect(report).toEqual({ redispatched: [], failed: [], cleared: [] });
    expect(mockStartTaskExecution).not.toHaveBeenCalled();
    expect(mockResumeTaskExecution).not.toHaveBeenCalled();
    expect(rowOf(resting)?.status).toBe("queued");
    expect(rowOf(planned)?.status).toBe("planned");
  });

  it("drops a marker left on a row that is no longer in the line", async () => {
    const cancelled = seedDeferred(1_000);
    db.update(tasks)
      .set({ status: "cancelled" })
      .where(eq(tasks.id, cancelled))
      .run();

    const report = await recoverDeferredTaskRuns();

    expect(report.cleared).toEqual([cancelled]);
    expect(report.redispatched).toEqual([]);
    expect(mockStartTaskExecution).not.toHaveBeenCalled();
    expect(rowOf(cancelled)?.runRequestedAt).toBeNull();
    expect(rowOf(cancelled)?.status).toBe("cancelled");
  });

  it("handles every deferred row — none survives unmarked and unhandled", async () => {
    const ids = [
      seedDeferred(1_000),
      seedDeferred(2_000, { runRequestedMode: "resume" }),
      seedDeferred(3_000, { sourceType: "workflow" }),
      seedDeferred(4_000, { sourceType: null }),
    ];
    const resting = seedTask({ sourceType: "manual", status: "queued" });

    const report = await recoverDeferredTaskRuns();

    expect([...report.redispatched, ...report.failed].sort()).toEqual(
      [...ids].sort(),
    );
    // The line is empty for the failed step and still marked for the three
    // that were re-dispatched — their dispatcher re-enters it and the marker
    // is what holds their place.
    expect(countDeferredTaskRuns()).toBe(3);
    expect(listDeferredTaskRuns().map((run) => run.id)).not.toContain(resting);
  });

  it("re-dispatches the rest when one dispatch throws", async () => {
    const first = seedDeferred(1_000);
    const second = seedDeferred(2_000);
    mockStartTaskExecution.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    const report = await recoverDeferredTaskRuns();

    expect(report.redispatched).toEqual([second]);
    expect(mockStartTaskExecution.mock.calls.map(([id]) => id)).toEqual([
      first,
      second,
    ]);
  });

  it("does not reject when a dispatch rejects asynchronously", async () => {
    const id = seedDeferred(1_000);
    mockStartTaskExecution.mockRejectedValueOnce(new Error("runtime gone"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const report = await recoverDeferredTaskRuns();
    await Promise.resolve();

    expect(report.redispatched).toEqual([id]);
    consoleError.mockRestore();
  });
});
