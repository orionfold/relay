/** @vitest-environment node */

/**
 * A workflow fans out to parallel branches and awaits every one of them. With
 * the on-demand cap set to 1 those branches cannot all run at once, so this is
 * the deadlock question the cap has to answer: a branch that is waiting for a
 * slot holds nothing that another branch needs, so the fan-out completes one
 * child at a time instead of hanging.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentLogs, notifications, tasks, usageLedger, workflows } from "@/lib/db/schema";
import {
  __resetTaskSlotsForTests,
  countRunningTaskSlots,
} from "@/lib/agents/task-slots";

const { mockExecuteTaskWithRuntime, mockResolveTarget } = vi.hoisted(() => ({
  mockExecuteTaskWithRuntime: vi.fn(),
  mockResolveTarget: vi.fn(),
}));

vi.mock("@/lib/agents/runtime", () => ({
  executeTaskWithRuntime: mockExecuteTaskWithRuntime,
  resumeTaskWithRuntime: vi.fn(),
}));

vi.mock("@/lib/agents/runtime/execution-target", () => ({
  resolveTaskExecutionTarget: mockResolveTarget,
  resolveResumeExecutionTarget: mockResolveTarget,
}));

import { executeChildTask } from "../engine";

const target = {
  requestedRuntimeId: null,
  effectiveRuntimeId: "claude-code",
  requestedModelId: null,
  effectiveModelId: "sonnet",
  fallbackApplied: false,
  fallbackReason: null,
  selectionMode: "automatic",
  selectionReason: "test",
  automaticFallbackEnabled: false,
} as const;

let workflowId: string;
/** Highest number of child tasks observed running at the same instant. */
let peakConcurrency: number;

beforeEach(() => {
  vi.clearAllMocks();
  __resetTaskSlotsForTests();
  // agent_logs / usage_ledger / notifications carry FKs onto tasks.
  db.delete(agentLogs).run();
  db.delete(usageLedger).run();
  db.delete(notifications).run();
  db.delete(tasks).run();
  db.delete(workflows).run();
  peakConcurrency = 0;

  workflowId = randomUUID();
  const now = new Date();
  db.insert(workflows)
    .values({
      id: workflowId,
      name: "parallel fan-out",
      definition: JSON.stringify({ pattern: "parallel", steps: [] }),
      status: "active",
      runNumber: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  mockResolveTarget.mockResolvedValue(target);
  mockExecuteTaskWithRuntime.mockImplementation(async (taskId: string) => {
    peakConcurrency = Math.max(peakConcurrency, countRunningTaskSlots());
    // Yield so a sibling branch would interleave here if it could.
    await new Promise((resolve) => setTimeout(resolve, 5));
    db.update(tasks)
      .set({ status: "completed", result: `done:${taskId}`, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .run();
  });
});

afterEach(() => {
  __resetTaskSlotsForTests();
  vi.unstubAllEnvs();
});

describe("workflow child tasks under the on-demand cap", () => {
  it("completes three parallel branches with the cap set to 1", async () => {
    vi.stubEnv("TASK_MAX_CONCURRENT", "1");

    const results = await Promise.all(
      ["alpha", "beta", "gamma"].map((name) =>
        executeChildTask(workflowId, name, `do ${name}`),
      ),
    );

    expect(results.map((result) => result.status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
    expect(peakConcurrency).toBe(1);
    expect(mockExecuteTaskWithRuntime).toHaveBeenCalledTimes(3);
    expect(countRunningTaskSlots()).toBe(0);
  });

  it("stamps the step task with an explicit workflow source type", async () => {
    const result = await executeChildTask(workflowId, "solo", "do solo");

    const row = db.select().from(tasks).where(eq(tasks.id, result.taskId)).get();
    expect(row?.sourceType).toBe("workflow");
    expect(row?.slotClaimedAt).not.toBeNull();
  });

  it("runs branches concurrently when the cap allows it", async () => {
    vi.stubEnv("TASK_MAX_CONCURRENT", "3");

    await Promise.all(
      ["alpha", "beta", "gamma"].map((name) =>
        executeChildTask(workflowId, name, `do ${name}`),
      ),
    );

    expect(peakConcurrency).toBeGreaterThan(1);
  });
});
