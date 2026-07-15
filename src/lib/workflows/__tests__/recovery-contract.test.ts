/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentLogs,
  documents,
  notifications,
  operationsReceipts,
  tasks,
  workflowReceiptRuns,
  workflows,
} from "@/lib/db/schema";
import { resolvePermission } from "@/lib/notifications/resolve-permission";
import type { WorkflowDefinition, WorkflowState } from "../types";

const dispatch = vi.hoisted(() => ({
  handler: null as null | ((taskId: string) => Promise<void>),
  calls: [] as string[],
}));

vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: vi.fn(async (taskId: string) => {
    dispatch.calls.push(taskId);
    if (!dispatch.handler) throw new Error("Missing deterministic dispatch handler");
    await dispatch.handler(taskId);
  }),
}));

import {
  executeWorkflow,
  parseWorkflowState,
  resumeWorkflow,
  resumeWorkflowInteraction,
} from "../engine";

function setTaskTerminal(taskId: string, status: "completed" | "failed", result: string) {
  db.update(tasks)
    .set({ status, result, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .run();
}

function seedWorkflow(input: {
  definition: WorkflowDefinition | Record<string, unknown>;
  status?: "draft" | "active" | "paused" | "completed" | "failed";
  resumeAt?: number | null;
}): string {
  const id = randomUUID();
  const now = new Date();
  db.insert(workflows)
    .values({
      id,
      name: `Recovery ${id.slice(0, 6)}`,
      definition: JSON.stringify(input.definition),
      status: input.status ?? "active",
      runNumber: 1,
      successCriteria: "[]",
      successCriteriaRunSnapshot: "[]",
      resumeAt: input.resumeAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(workflowReceiptRuns)
    .values({
      id: randomUUID(),
      workflowId: id,
      runNumber: 1,
      criteriaSnapshot: "[]",
      startedAt: now,
    })
    .run();
  return id;
}

function readWorkflow(id: string) {
  return db.select().from(workflows).where(eq(workflows.id, id)).get()!;
}

function readState(id: string): WorkflowState {
  const state = parseWorkflowState(readWorkflow(id).definition).state;
  if (!state) throw new Error(`Workflow ${id} has no state`);
  return state;
}

function expectFailedReceipt(id: string) {
  expect(
    db.select()
      .from(workflowReceiptRuns)
      .where(eq(workflowReceiptRuns.workflowId, id))
      .get()?.terminalStatus
  ).toBe("failed");
  expect(
    db.select()
      .from(operationsReceipts)
      .where(eq(operationsReceipts.workflowId, id))
      .get()?.verdict
  ).toBe("failed");
}

beforeEach(() => {
  db.delete(operationsReceipts).run();
  db.delete(documents).run();
  db.delete(agentLogs).run();
  db.delete(notifications).run();
  db.delete(tasks).run();
  db.delete(workflowReceiptRuns).run();
  db.delete(workflows).run();
  dispatch.calls = [];
  dispatch.handler = async (taskId) => setTaskTerminal(taskId, "completed", "ok");
});

describe("workflow recovery contract with real SQLite state", () => {
  it("fails a sequence and leaves dependents pending after a child timeout", async () => {
    const workflowId = seedWorkflow({
      definition: {
        pattern: "sequence",
        steps: [
          { id: "one", name: "One", prompt: "first" },
          { id: "two", name: "Two", prompt: "second" },
          { id: "three", name: "Three", prompt: "third" },
        ],
      },
    });
    dispatch.handler = async (taskId) => {
      const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()!;
      setTaskTerminal(
        taskId,
        task.title.endsWith("Two") ? "failed" : "completed",
        task.title.endsWith("Two") ? "Child task timed out" : "first result"
      );
    };

    await executeWorkflow(workflowId);

    expect(readWorkflow(workflowId).status).toBe("failed");
    expect(readState(workflowId).stepStates).toMatchObject([
      { stepId: "one", status: "completed" },
      { stepId: "two", status: "failed", error: "Child task timed out" },
      { stepId: "three", status: "pending" },
    ]);
    expect(db.select().from(tasks).all()).toHaveLength(2);
    expectFailedReceipt(workflowId);
  });

  it.each([
    ["partial", false],
    ["all", true],
  ])("settles %s parallel branch failure before failing the join", async (_name, failAll) => {
    const workflowId = seedWorkflow({
      definition: {
        pattern: "parallel",
        steps: [
          { id: "a", name: "Branch A", prompt: "a" },
          { id: "b", name: "Branch B", prompt: "b" },
          { id: "join", name: "Join", prompt: "join", dependsOn: ["a", "b"] },
        ],
      },
    });
    dispatch.handler = async (taskId) => {
      const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()!;
      const failed = failAll || task.title.endsWith("Branch B");
      setTaskTerminal(taskId, failed ? "failed" : "completed", failed ? "branch refused" : "a result");
    };

    await executeWorkflow(workflowId);

    const state = readState(workflowId);
    expect(readWorkflow(workflowId).status).toBe("failed");
    expect(state.stepStates[2]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Blocked by failed branches"),
    });
    expect(db.select().from(tasks).all()).toHaveLength(2);
    expect(db.select().from(tasks).all().some((task) => task.title.endsWith("Join"))).toBe(false);
    expectFailedReceipt(workflowId);
  });

  it("converts a parallel branch setup exception into a settled failure", async () => {
    const workflowId = seedWorkflow({
      definition: {
        pattern: "parallel",
        steps: [
          { id: "a", name: "Valid", prompt: "a" },
          { id: "b", name: "Invalid runtime", prompt: "b", runtimeId: "unknown-runtime" },
          { id: "join", name: "Join", prompt: "join", dependsOn: ["a", "b"] },
        ],
      },
    });

    await executeWorkflow(workflowId);

    expect(readWorkflow(workflowId).status).toBe("failed");
    expect(readState(workflowId).stepStates[1]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Unknown agent runtime"),
    });
    expect(db.select().from(tasks).all()).toHaveLength(1);
  });

  it("fails an autonomous loop when its child iteration fails", async () => {
    const workflowId = seedWorkflow({
      definition: {
        pattern: "loop",
        steps: [{ id: "loop", name: "Loop", prompt: "iterate" }],
        loopConfig: { maxIterations: 3 },
      },
    });
    dispatch.handler = async (taskId) => setTaskTerminal(taskId, "failed", "provider timeout");

    await executeWorkflow(workflowId);

    const { loopState } = parseWorkflowState(readWorkflow(workflowId).definition);
    expect(readWorkflow(workflowId).status).toBe("failed");
    expect(loopState).toMatchObject({
      status: "failed",
      stopReason: "error",
      iterations: [{ status: "failed", error: "provider timeout" }],
    });
    const workflowEvents = db
      .select({ event: agentLogs.event })
      .from(agentLogs)
      .where(eq(agentLogs.agentType, "workflow-engine"))
      .all()
      .map(({ event }) => event);
    expect(workflowEvents).toContain("workflow_failed");
    expect(workflowEvents).not.toContain("workflow_completed");
    expectFailedReceipt(workflowId);
  });

  it("settles remaining rows but fails a partially successful row loop", async () => {
    const workflowId = seedWorkflow({
      definition: {
        pattern: "loop",
        steps: [{ id: "row", name: "Enrich", prompt: "enrich" }],
        loopConfig: {
          maxIterations: 2,
          items: [{ id: "one" }, { id: "two" }],
          itemVariable: "row",
        },
      },
    });
    dispatch.handler = async (taskId) => {
      const failed = dispatch.calls.length === 1;
      setTaskTerminal(taskId, failed ? "failed" : "completed", failed ? "row timeout" : "done");
    };

    await executeWorkflow(workflowId);

    const { loopState } = parseWorkflowState(readWorkflow(workflowId).definition);
    expect(readWorkflow(workflowId).status).toBe("failed");
    expect(loopState?.iterations.map(({ status }) => status)).toEqual([
      "failed",
      "completed",
    ]);
    expect(loopState).toMatchObject({ status: "failed", stopReason: "error" });
    expectFailedReceipt(workflowId);
  });

  it("admits one delayed resume and one suffix child across competing callers", async () => {
    const state: WorkflowState = {
      currentStepIndex: 0,
      stepStates: [
        { stepId: "delay", status: "delayed" },
        { stepId: "after", status: "pending" },
      ],
      status: "paused",
      startedAt: new Date().toISOString(),
    };
    const workflowId = seedWorkflow({
      status: "paused",
      resumeAt: Date.now() - 1,
      definition: {
        pattern: "sequence",
        steps: [
          { id: "delay", name: "Wait", prompt: "", delayDuration: "1m" },
          { id: "after", name: "After", prompt: "continue" },
        ],
        _state: state,
      },
    });

    await Promise.all([resumeWorkflow(workflowId), resumeWorkflow(workflowId)]);

    expect(dispatch.calls).toHaveLength(1);
    expect(db.select().from(tasks).all()).toHaveLength(1);
    expect(readWorkflow(workflowId)).toMatchObject({ status: "completed", resumeAt: null });
    expect(readState(workflowId).stepStates.map(({ status }) => status)).toEqual([
      "completed",
      "completed",
    ]);
  });

  it("does not consume a paused row with invalid delayed state", async () => {
    const state: WorkflowState = {
      currentStepIndex: 0,
      stepStates: [{ stepId: "delay", status: "pending" }],
      status: "paused",
      startedAt: new Date().toISOString(),
    };
    const resumeAt = Date.now() - 1;
    const workflowId = seedWorkflow({
      status: "paused",
      resumeAt,
      definition: {
        pattern: "sequence",
        steps: [{ id: "delay", name: "Wait", prompt: "", delayDuration: "1m" }],
        _state: state,
      },
    });

    await expect(resumeWorkflow(workflowId)).rejects.toMatchObject({
      name: "WorkflowTransitionError",
      code: "WORKFLOW_STATE_INVALID",
    });
    expect(readWorkflow(workflowId)).toMatchObject({ status: "paused", resumeAt });
    expect(dispatch.calls).toEqual([]);
  });

  it("resumes one exact HITL input from persisted state after re-entry", async () => {
    const workflowId = seedWorkflow({
      definition: {
        pattern: "checkpoint",
        steps: [
          {
            id: "input",
            name: "Gather brief",
            prompt: "Write the brief",
            requiresInput: true,
            inputPrompt: "What should the brief contain?",
          },
        ],
      },
    });

    await executeWorkflow(workflowId);
    const pausedState = readState(workflowId);
    const notificationId = pausedState.pendingInteraction?.notificationId;
    expect(notificationId).toBeTruthy();
    expect(readWorkflow(workflowId).status).toBe("paused");
    expect(dispatch.calls).toEqual([]);

    resolvePermission({
      expectedTaskId: "_checkpoint",
      notificationId: notificationId!,
      behavior: "allow",
      updatedInput: { answer: "Use the signed customer evidence" },
    });
    expect(await resumeWorkflowInteraction(workflowId, notificationId)).toBe("resumed");
    expect(await resumeWorkflowInteraction(workflowId, notificationId)).toBe("not_ready");

    expect(dispatch.calls).toHaveLength(1);
    const [task] = db.select().from(tasks).all();
    expect(task.description).toContain("Use the signed customer evidence");
    expect(readWorkflow(workflowId).status).toBe("completed");
  });
});
