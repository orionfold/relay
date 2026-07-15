import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

const {
  mockResolveTarget,
  mockStartTaskExecution,
  mockClassifyTargetError,
} = vi.hoisted(() => ({
  mockResolveTarget: vi.fn(),
  mockStartTaskExecution: vi.fn(),
  mockClassifyTargetError: vi.fn(),
}));

vi.mock("@/lib/settings/budget-guardrails", () => ({
  BudgetLimitExceededError: class BudgetLimitExceededError extends Error {},
  enforceTaskBudgetGuardrails: vi.fn(),
}));
vi.mock("@/lib/environment/auto-scan", () => ({ ensureFreshScan: vi.fn() }));
vi.mock("@/lib/agents/profiles/assignment-validation", () => ({
  validateRuntimeProfileAssignment: vi.fn(() => null),
}));
vi.mock("@/lib/agents/runtime/execution-target", () => ({
  resolveTaskExecutionTarget: mockResolveTarget,
}));
vi.mock("@/lib/agents/runtime/execution-target-preview", () => ({
  classifyExecutionTargetError: mockClassifyTargetError,
}));
vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: mockStartTaskExecution,
}));

import { POST } from "../route";

const target = {
  requestedRuntimeId: "ollama",
  effectiveRuntimeId: "ollama",
  requestedModelId: null,
  effectiveModelId: "qwen3:8b",
  fallbackApplied: false,
  fallbackReason: null,
  selectionMode: "explicit",
  selectionReason: "Explicit runtime override",
} as const;

describe("POST /api/tasks/[id]/execute target preflight", () => {
  let taskId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    taskId = randomUUID();
    const now = new Date();
    db.insert(tasks)
      .values({
        id: taskId,
        title: "Draft report",
        description: "Use local evidence",
        status: "queued",
        assignedAgent: "ollama",
        agentProfile: "general",
        priority: 2,
        resumeCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    mockStartTaskExecution.mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.delete(tasks).where(eq(tasks.id, taskId)).run();
  });

  it("leaves the task queued when its explicit target cannot run", async () => {
    mockResolveTarget.mockRejectedValue(new Error("Ollama is unavailable"));
    mockClassifyTargetError.mockReturnValue({
      code: "runtime_unavailable",
      message: "Ollama is unavailable",
    });

    const response = await POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: taskId }),
    });

    expect(response.status).toBe(409);
    expect(db.select().from(tasks).where(eq(tasks.id, taskId)).get()?.status).toBe("queued");
    expect(mockStartTaskExecution).not.toHaveBeenCalled();
  });

  it("claims the task and launches the exact preflighted target", async () => {
    mockResolveTarget.mockResolvedValue(target);

    const response = await POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: taskId }),
    });

    expect(response.status).toBe(202);
    expect(db.select().from(tasks).where(eq(tasks.id, taskId)).get()?.status).toBe("running");
    expect(mockStartTaskExecution).toHaveBeenCalledWith(taskId, {
      requestedRuntimeId: "ollama",
      preflightTarget: target,
    });
  });
});
