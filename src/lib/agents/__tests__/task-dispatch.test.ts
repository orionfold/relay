import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentLogs, notifications, tasks } from "@/lib/db/schema";
import { RetryableRuntimeLaunchError } from "@/lib/agents/runtime/launch-failure";

const {
  mockExecuteTaskWithRuntime,
  mockResumeTaskWithRuntime,
  mockResolveTaskExecutionTarget,
  mockResolveResumeExecutionTarget,
} = vi.hoisted(() => ({
  mockExecuteTaskWithRuntime: vi.fn(),
  mockResumeTaskWithRuntime: vi.fn(),
  mockResolveTaskExecutionTarget: vi.fn(),
  mockResolveResumeExecutionTarget: vi.fn(),
}));

vi.mock("@/lib/agents/runtime", () => ({
  executeTaskWithRuntime: mockExecuteTaskWithRuntime,
  resumeTaskWithRuntime: mockResumeTaskWithRuntime,
}));

vi.mock("@/lib/agents/runtime/execution-target", () => ({
  resolveTaskExecutionTarget: mockResolveTaskExecutionTarget,
  resolveResumeExecutionTarget: mockResolveResumeExecutionTarget,
}));

import { startTaskExecution } from "../task-dispatch";

function seedTask(assignedAgent: string | null = "claude-code") {
  const id = randomUUID();
  const now = new Date();
  db.insert(tasks)
    .values({
      id,
      title: "Upgrade local clone",
      description: "Merge upstream changes safely",
      status: "queued",
      assignedAgent,
      agentProfile: "upgrade-assistant",
      priority: 2,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe("startTaskExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.delete(notifications).run();
    db.delete(agentLogs).run();
    db.delete(tasks).run();
  });

  it("retries an automatically selected target once and persists the visible fallback", async () => {
    const taskId = seedTask(null);

    mockResolveTaskExecutionTarget
      .mockResolvedValueOnce({
        requestedRuntimeId: null,
        effectiveRuntimeId: "claude-code",
        requestedModelId: null,
        effectiveModelId: null,
        fallbackApplied: false,
        fallbackReason: null,
        selectionMode: "automatic",
        selectionReason: "test",
        routingPreference: "latency",
        automaticFallbackEnabled: true,
        consideredRuntimeIds: ["claude-code", "openai-codex-app-server"],
        skippedRuntimes: [],
      })
      .mockResolvedValueOnce({
        requestedRuntimeId: null,
        effectiveRuntimeId: "openai-codex-app-server",
        requestedModelId: null,
        effectiveModelId: null,
        fallbackApplied: false,
        fallbackReason: null,
        selectionMode: "automatic",
        selectionReason: "test fallback",
        routingPreference: "latency",
        automaticFallbackEnabled: true,
        consideredRuntimeIds: ["openai-codex-app-server"],
        skippedRuntimes: [
          { runtimeId: "claude-code", reason: "launch failed" },
        ],
      });

    mockExecuteTaskWithRuntime
      .mockRejectedValueOnce(
        new RetryableRuntimeLaunchError({
          runtimeId: "claude-code",
          message:
            "Claude Code failed to launch before task execution started: Claude Code process exited with code 1",
          cause: new Error("Claude Code process exited with code 1"),
        })
      )
      .mockResolvedValueOnce(undefined);

    await startTaskExecution(taskId);

    expect(mockExecuteTaskWithRuntime).toHaveBeenNthCalledWith(1, taskId, "claude-code");
    expect(mockExecuteTaskWithRuntime).toHaveBeenNthCalledWith(
      2,
      taskId,
      "openai-codex-app-server"
    );
    expect(mockResolveTaskExecutionTarget).toHaveBeenNthCalledWith(2, {
      title: "Upgrade local clone",
      description: "Merge upstream changes safely",
      requestedRuntimeId: null,
      profileId: "upgrade-assistant",
      unavailableRuntimeIds: ["claude-code"],
      unavailableReasons: {
        "claude-code":
          "Claude Code failed to launch before task execution started: Claude Code process exited with code 1",
      },
    });

    const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    expect(row?.status).toBe("running");
    expect(row?.effectiveRuntimeId).toBe("openai-codex-app-server");
    expect(row?.runtimeFallbackReason).toContain("Fell back to OpenAI Codex App Server.");

    const logs = db
      .select({ event: agentLogs.event, payload: agentLogs.payload })
      .from(agentLogs)
      .where(eq(agentLogs.taskId, taskId))
      .all();
    expect(logs.map((log) => log.event)).toContain("runtime_launch_failed");
    expect(logs.map((log) => log.event)).toContain("runtime_fallback");
    expect(logs.filter((log) => log.event === "runtime_selected")).toHaveLength(2);
    expect(
      JSON.parse(
        logs.find((log) => log.event === "runtime_selected")?.payload ?? "{}",
      ),
    ).toMatchObject({
      selectionMode: "automatic",
      routingPreference: "latency",
      effectiveRuntimeId: "claude-code",
      automaticFallbackEnabled: true,
    });
  });

  it("marks an explicit target failed without silently retrying another runtime", async () => {
    const taskId = seedTask();

    mockResolveTaskExecutionTarget.mockResolvedValueOnce({
        requestedRuntimeId: "claude-code",
        effectiveRuntimeId: "claude-code",
        requestedModelId: null,
        effectiveModelId: null,
        fallbackApplied: false,
        fallbackReason: null,
        selectionMode: "explicit",
        selectionReason: "Explicit runtime override",
        automaticFallbackEnabled: false,
      });

    mockExecuteTaskWithRuntime.mockRejectedValueOnce(
      new RetryableRuntimeLaunchError({
        runtimeId: "claude-code",
        message:
          "Claude Code failed to launch before task execution started: Claude Code process exited with code 1",
        cause: new Error("Claude Code process exited with code 1"),
      })
    );

    await expect(
      startTaskExecution(taskId, { requestedRuntimeId: "claude-code" })
    ).rejects.toThrow("Claude Code failed to launch before task execution started");

    const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    expect(row?.status).toBe("failed");
    expect(row?.result).toContain("Claude Code failed to launch before task execution started");
    expect(mockResolveTaskExecutionTarget).toHaveBeenCalledTimes(1);
    expect(mockExecuteTaskWithRuntime).toHaveBeenCalledTimes(1);

    const taskNotifications = db
      .select()
      .from(notifications)
      .where(eq(notifications.taskId, taskId))
      .all();
    expect(taskNotifications).toHaveLength(1);
  });

  it("redacts credential fingerprints from launch failures before persistence and rethrow", async () => {
    const taskId = seedTask();
    mockResolveTaskExecutionTarget.mockResolvedValueOnce({
      requestedRuntimeId: "claude-code",
      effectiveRuntimeId: "claude-code",
      requestedModelId: null,
      effectiveModelId: null,
      fallbackApplied: false,
      fallbackReason: null,
      selectionMode: "explicit",
      selectionReason: "Explicit runtime override",
      automaticFallbackEnabled: false,
    });
    mockExecuteTaskWithRuntime.mockRejectedValueOnce(
      new RetryableRuntimeLaunchError({
        runtimeId: "claude-code",
        message: "Authentication failed for sk-proj-****************_0MA",
        cause: new Error("provider rejected credential"),
      }),
    );

    const error = await startTaskExecution(taskId).then(
      () => null,
      (caught) => caught as Error,
    );
    const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    const logs = db
      .select({ payload: agentLogs.payload })
      .from(agentLogs)
      .where(eq(agentLogs.taskId, taskId))
      .all();

    expect(error?.message).toContain("[redacted credential]");
    expect(row?.result).toContain("[redacted credential]");
    expect(JSON.stringify(logs)).not.toContain("sk-proj-");
    expect(JSON.stringify(logs)).not.toContain("_0MA");
  });

  it("does not retry a Manual or automatic-no-fallback target", async () => {
    for (const target of [
      {
        requestedRuntimeId: null,
        effectiveRuntimeId: "claude-code",
        requestedModelId: null,
        effectiveModelId: null,
        fallbackApplied: false,
        fallbackReason: null,
        selectionMode: "manual-default",
        selectionReason: "Manual routing is strict",
        automaticFallbackEnabled: false,
      },
      {
        requestedRuntimeId: null,
        effectiveRuntimeId: "claude-code",
        requestedModelId: null,
        effectiveModelId: null,
        fallbackApplied: false,
        fallbackReason: null,
        selectionMode: "automatic",
        selectionReason: "Pool order",
        automaticFallbackEnabled: false,
      },
    ]) {
      const taskId = seedTask(null);
      mockResolveTaskExecutionTarget.mockResolvedValueOnce(target);
      mockExecuteTaskWithRuntime.mockRejectedValueOnce(
        new RetryableRuntimeLaunchError({
          runtimeId: "claude-code",
          message: "Claude Code failed to launch",
        }),
      );
      await expect(startTaskExecution(taskId)).rejects.toThrow(
        "Claude Code failed to launch",
      );
      expect(
        db.select().from(tasks).where(eq(tasks.id, taskId)).get()?.status,
      ).toBe("failed");
    }
    expect(mockResolveTaskExecutionTarget).toHaveBeenCalledTimes(2);
    expect(mockExecuteTaskWithRuntime).toHaveBeenCalledTimes(2);
  });
});
