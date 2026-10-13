import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, usageLedger } from "@/lib/db/schema";
import { __resetTaskSlotsForTests } from "@/lib/agents/task-slots";

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
    __resetTaskSlotsForTests();
  });

  afterEach(() => {
    __resetTaskSlotsForTests();
    vi.unstubAllEnvs();
    db.delete(usageLedger).run();
    db.delete(tasks).run();
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

  it("returns 404 without target resolution when the task is missing", async () => {
    const response = await POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: randomUUID() }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(mockResolveTarget).not.toHaveBeenCalled();
    expect(mockStartTaskExecution).not.toHaveBeenCalled();
  });

  it("rejects a non-queued task without changing state", async () => {
    db.update(tasks).set({ status: "planned" }).where(eq(tasks.id, taskId)).run();

    const response = await POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: taskId }),
    });

    expect(response.status).toBe(400);
    expect(db.select().from(tasks).where(eq(tasks.id, taskId)).get()?.status).toBe(
      "planned"
    );
    expect(mockStartTaskExecution).not.toHaveBeenCalled();
  });

  it("allows only one concurrent request to claim and dispatch the task", async () => {
    let release!: (value: typeof target) => void;
    mockResolveTarget.mockReturnValue(
      new Promise<typeof target>((resolve) => {
        release = resolve;
      })
    );

    const first = POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: taskId }),
    });
    const second = POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: taskId }),
    });
    await vi.waitFor(() => expect(mockResolveTarget).toHaveBeenCalledTimes(2));
    release(target);

    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status).sort()).toEqual([202, 409]);
    expect(mockStartTaskExecution).toHaveBeenCalledTimes(1);
    expect(db.select().from(tasks).where(eq(tasks.id, taskId)).get()?.status).toBe(
      "running"
    );
  });
});

describe("POST /api/tasks/[id]/execute concurrency cap", () => {
  let taskId: string;

  function seedRunning(): string {
    const id = randomUUID();
    const now = new Date();
    db.insert(tasks)
      .values({
        id,
        title: "In flight",
        status: "running",
        sourceType: "manual",
        priority: 2,
        resumeCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    __resetTaskSlotsForTests();
    db.delete(usageLedger).run();
    db.delete(tasks).run();
    taskId = randomUUID();
    const now = new Date();
    db.insert(tasks)
      .values({
        id: taskId,
        title: "Draft report",
        status: "queued",
        assignedAgent: "ollama",
        agentProfile: "general",
        sourceType: "manual",
        priority: 2,
        resumeCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    mockResolveTarget.mockResolvedValue(target);
    mockStartTaskExecution.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __resetTaskSlotsForTests();
    vi.unstubAllEnvs();
    db.delete(usageLedger).run();
    db.delete(tasks).run();
  });

  it("accepts an over-cap run as queued rather than failing it", async () => {
    vi.stubEnv("TASK_MAX_CONCURRENT", "1");
    seedRunning();

    const response = await POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: taskId }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ state: "queued", taskId, cap: 1 });
    expect(db.select().from(tasks).where(eq(tasks.id, taskId)).get()?.status).toBe(
      "queued"
    );
    // Still dispatched — the dispatcher is what holds the place in the queue.
    expect(mockStartTaskExecution).toHaveBeenCalledWith(taskId, {
      requestedRuntimeId: "ollama",
      preflightTarget: target,
    });
    expect(db.select().from(usageLedger).all()).toHaveLength(0);
  });

  it("force bypasses a full cap and audits the bypass before dispatch", async () => {
    vi.stubEnv("TASK_MAX_CONCURRENT", "1");
    seedRunning();

    const response = await POST(
      new Request("http://relay.test/?force=true") as never,
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ state: "running", forced: true });
    expect(db.select().from(tasks).where(eq(tasks.id, taskId)).get()?.status).toBe(
      "running"
    );

    const ledger = db.select().from(usageLedger).all();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      taskId,
      activityType: "manual_force_bypass",
    });
  });
});
