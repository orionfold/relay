/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { MAX_RESUME_COUNT } from "@/lib/constants/task-status";

const mocks = vi.hoisted(() => ({
  enforceBudget: vi.fn(),
  resolveTarget: vi.fn(),
  resumeExecution: vi.fn(),
}));

vi.mock("@/lib/settings/budget-guardrails", () => ({
  BudgetLimitExceededError: class BudgetLimitExceededError extends Error {},
  enforceTaskBudgetGuardrails: mocks.enforceBudget,
}));
vi.mock("@/lib/agents/runtime/execution-target", () => ({
  resolveResumeExecutionTarget: mocks.resolveTarget,
}));
vi.mock("@/lib/agents/task-dispatch", () => ({
  resumeTaskExecution: mocks.resumeExecution,
}));

import { POST } from "../route";

function seedTask(overrides: Partial<typeof tasks.$inferInsert> = {}) {
  const id = randomUUID();
  const now = new Date();
  db.insert(tasks)
    .values({
      id,
      title: "Resume contract",
      status: "failed",
      sessionId: "session-1",
      assignedAgent: "claude-code",
      effectiveRuntimeId: "claude-code",
      priority: 2,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return id;
}

function invoke(id: string) {
  return POST(new Request("http://relay.test") as never, {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  db.delete(tasks).run();
  vi.clearAllMocks();
  mocks.resolveTarget.mockResolvedValue({ effectiveRuntimeId: "claude-code" });
  mocks.resumeExecution.mockReturnValue(new Promise(() => {}));
});

describe("POST /api/tasks/[id]/resume boundary contract", () => {
  it("claims a resumable task before dispatching the exact runtime", async () => {
    const id = seedTask();

    const response = await invoke(id);

    expect(response.status).toBe(202);
    expect(db.select().from(tasks).where(eq(tasks.id, id)).get()?.status).toBe("running");
    expect(mocks.resumeExecution).toHaveBeenCalledWith(id, {
      requestedRuntimeId: "claude-code",
      effectiveRuntimeId: "claude-code",
    });
  });

  it("rolls a refused execution target back to failed with a visible result", async () => {
    const id = seedTask({ status: "cancelled" });
    mocks.resolveTarget.mockRejectedValue(new Error("Runtime cannot resume this session"));

    const response = await invoke(id);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Runtime cannot resume this session" });
    expect(db.select().from(tasks).where(eq(tasks.id, id)).get()).toMatchObject({
      status: "failed",
      result: "Runtime cannot resume this session",
    });
    expect(mocks.resumeExecution).not.toHaveBeenCalled();
  });

  it.each([
    ["missing task", null, 404, "Not found"],
    ["missing session", { sessionId: null }, 400, "No session to resume — use Retry instead"],
    ["resume limit", { resumeCount: MAX_RESUME_COUNT }, 400, "Resume limit reached. Re-queue for fresh start."],
    ["invalid state", { status: "completed" as const }, 400, "Task must be failed or cancelled to resume, current status: completed"],
  ])("rejects %s without dispatch", async (_name, overrides, status, error) => {
    const id = overrides ? seedTask(overrides) : randomUUID();

    const response = await invoke(id);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(mocks.resumeExecution).not.toHaveBeenCalled();
  });
});
