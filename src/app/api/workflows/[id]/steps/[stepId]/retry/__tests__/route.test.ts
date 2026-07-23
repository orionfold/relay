/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentLogs,
  documents,
  operationsReceipts,
  tasks,
  workflowReceiptRuns,
  workflows,
} from "@/lib/db/schema";
import type { WorkflowState } from "@/lib/workflows/types";

const dispatch = vi.hoisted(() => ({
  handler: null as null | ((taskId: string) => Promise<void>),
  calls: [] as string[],
}));
const targets = vi.hoisted(() => ({
  error: null as Error | null,
}));
vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: vi.fn(async (taskId: string) => {
    dispatch.calls.push(taskId);
    if (!dispatch.handler) throw new Error("Missing retry dispatch handler");
    await dispatch.handler(taskId);
  }),
}));
vi.mock("@/lib/workflows/execution-targets", () => ({
  resolveWorkflowExecutionTargets: vi.fn(async () => {
    if (targets.error) throw targets.error;
    return [];
  }),
}));

import { POST } from "../route";

function seedFailedWorkflow(includeSuffix = true) {
  const id = randomUUID();
  const now = new Date();
  const steps = [
    { id: "prefix", name: "Prefix", prompt: "already done" },
    { id: "target", name: "Target", prompt: "retry me" },
    ...(includeSuffix ? [{ id: "suffix", name: "Suffix", prompt: "continue" }] : []),
  ];
  const state: WorkflowState = {
    currentStepIndex: 1,
    status: "failed",
    startedAt: now.toISOString(),
    stepStates: [
      { stepId: "prefix", status: "completed", result: "prefix result" },
      { stepId: "target", status: "failed", error: "first attempt failed" },
      ...(includeSuffix ? [{ stepId: "suffix", status: "pending" as const }] : []),
    ],
  };
  db.insert(workflows)
    .values({
      id,
      name: "Retry contract",
      definition: JSON.stringify({ pattern: "sequence", steps, _state: state }),
      status: "failed",
      runNumber: 1,
      successCriteriaRunSnapshot: "[]",
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
      terminalStatus: "failed",
      finishedAt: now,
    })
    .run();
  return id;
}

function seedRuntimeBlockedWorkflow() {
  const id = seedFailedWorkflow();
  const workflow = db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .get()!;
  const parsed = JSON.parse(workflow.definition) as {
    _state: WorkflowState;
    [key: string]: unknown;
  };
  parsed._state.status = "paused";
  parsed._state.stepStates[1] = {
    stepId: "target",
    status: "blocked_runtime",
    error: "The runtime timed out. Your completed steps are safe.",
    recovery: {
      kind: "runtime_transient",
      reason: "timeout",
      attempts: 0,
      maxAttempts: 2,
      blockedAt: new Date().toISOString(),
      lastHealthCheck: "unavailable",
    },
  };
  db.update(workflows)
    .set({
      status: "paused",
      definition: JSON.stringify(parsed),
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, id))
    .run();
  db.update(workflowReceiptRuns)
    .set({ terminalStatus: null, finishedAt: null })
    .where(eq(workflowReceiptRuns.workflowId, id))
    .run();
  return id;
}

function invoke(id: string, stepId = "target") {
  return POST(
    new NextRequest(`http://relay.test/api/workflows/${id}/steps/${stepId}/retry`),
    { params: Promise.resolve({ id, stepId }) }
  );
}

function complete(taskId: string, result = "recovered") {
  db.update(tasks)
    .set({ status: "completed", result, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .run();
}

beforeEach(() => {
  db.delete(operationsReceipts).run();
  db.delete(documents).run();
  db.delete(agentLogs).run();
  db.delete(tasks).run();
  db.delete(workflowReceiptRuns).run();
  db.delete(workflows).run();
  dispatch.calls = [];
  dispatch.handler = async (taskId) => complete(taskId);
  targets.error = null;
  vi.clearAllMocks();
});

describe("POST workflow step retry recovery boundary", () => {
  it("runs only the failed sequence suffix and reaches one completed terminal", async () => {
    const id = seedFailedWorkflow();

    const response = await invoke(id);
    expect(response.status).toBe(202);
    await vi.waitFor(() => {
      expect(db.select().from(workflows).where(eq(workflows.id, id)).get()?.status).toBe(
        "completed"
      );
    });

    const children = db.select().from(tasks).where(eq(tasks.workflowId, id)).all();
    expect(children.map(({ title }) => title)).toEqual([
      "[Workflow] Target",
      "[Workflow] Suffix",
    ]);
    expect(dispatch.calls).toHaveLength(2);
  });

  it("admits one retry claim while provider dispatch is held", async () => {
    const id = seedFailedWorkflow(false);
    let release!: () => void;
    dispatch.handler = (taskId) =>
      new Promise<void>((resolve) => {
        release = () => {
          complete(taskId);
          resolve();
        };
      });

    const first = await invoke(id);
    expect(first.status).toBe(202);
    await vi.waitFor(() => expect(dispatch.calls).toHaveLength(1));

    const duplicate = await invoke(id);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: "WORKFLOW_TRANSITION_CONFLICT",
    });
    expect(dispatch.calls).toHaveLength(1);

    release();
    await vi.waitFor(() => {
      expect(db.select().from(workflows).where(eq(workflows.id, id)).get()?.status).toBe(
        "completed"
      );
    });
  });

  it("persists provider refusal as a failed recovery", async () => {
    const id = seedFailedWorkflow(false);
    dispatch.handler = async () => {
      throw new Error("Provider unavailable during retry");
    };

    const response = await invoke(id);
    expect(response.status).toBe(202);
    await vi.waitFor(() => {
      const workflow = db.select().from(workflows).where(eq(workflows.id, id)).get()!;
      expect(workflow.status).toBe("failed");
      const state = (JSON.parse(workflow.definition) as { _state: WorkflowState })._state;
      expect(state.stepStates[1]).toMatchObject({
        status: "failed",
        error: "Provider unavailable during retry",
      });
    });
  });

  it("names missing workflows and invalid step transitions before dispatch", async () => {
    const missing = await invoke(randomUUID());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "WORKFLOW_NOT_FOUND" });

    const id = seedFailedWorkflow(false);
    const prefix = await invoke(id, "prefix");
    expect(prefix.status).toBe(409);
    expect(await prefix.json()).toMatchObject({
      code: "WORKFLOW_TRANSITION_CONFLICT",
    });
    expect(dispatch.calls).toEqual([]);
  });

  it("preflights and resumes only a runtime-blocked suffix", async () => {
    const id = seedRuntimeBlockedWorkflow();
    const failedAttemptId = randomUUID();
    db.insert(tasks)
      .values({
        id: failedAttemptId,
        workflowId: id,
        workflowRunNumber: 1,
        title: "[Workflow] Target",
        status: "failed",
        result: "temporary provider outage",
        sourceType: "workflow",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    db.insert(operationsReceipts)
      .values({
        id: randomUUID(),
        sourceKey: `workflow:${id}:prefix`,
        ownerType: "workflow",
        workflowId: id,
        workflowRunNumber: 1,
        verdict: "passed",
        criteriaSnapshot: "[]",
        evidence: "{}",
        summary: "Prefix effect",
        nextAction: "none",
        finishedAt: new Date(),
        createdAt: new Date(),
      })
      .run();

    const response = await invoke(id);
    expect(response.status).toBe(202);
    await vi.waitFor(() =>
      expect(
        db.select().from(workflows).where(eq(workflows.id, id)).get()?.status,
      ).toBe("completed"),
    );

    const resumedTasks = db
      .select()
      .from(tasks)
      .where(eq(tasks.workflowId, id))
      .all();
    expect(resumedTasks.map((task) => task.title)).toEqual([
      "[Workflow] Target",
      "[Workflow] Target",
      "[Workflow] Suffix",
    ]);
    expect(resumedTasks[1].description).toContain(
      "Previous step output:\nprefix result",
    );
    expect(resumedTasks[0]).toMatchObject({
      id: failedAttemptId,
      status: "failed",
    });
    expect(
      db
        .select()
        .from(operationsReceipts)
        .where(eq(operationsReceipts.sourceKey, `workflow:${id}:prefix`))
        .all(),
    ).toHaveLength(1);
    expect(
      db
        .select()
        .from(operationsReceipts)
        .where(
          eq(
            operationsReceipts.sourceKey,
            `workflow:${id}:run:1`,
          ),
        )
        .get(),
    ).toMatchObject({
      verdict: "at_risk",
      summary: "Run completed, but no success criteria were configured.",
    });
  });

  it("keeps work paused on the first unavailable preflight and fails closed at the limit", async () => {
    const id = seedRuntimeBlockedWorkflow();
    targets.error = new Error("LM Studio is unavailable");

    const first = await invoke(id);
    expect(first.status).toBe(409);
    let workflow = db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .get()!;
    expect(workflow.status).toBe("paused");
    expect(
      (JSON.parse(workflow.definition) as { _state: WorkflowState })._state
        .stepStates[1].recovery?.attempts,
    ).toBe(1);

    const second = await invoke(id);
    expect(second.status).toBe(409);
    workflow = db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .get()!;
    expect(workflow.status).toBe("failed");
    const exhaustedStep = (
      JSON.parse(workflow.definition) as { _state: WorkflowState }
    )._state.stepStates[1];
    expect(exhaustedStep.status).toBe("failed");
    expect(exhaustedStep).not.toHaveProperty("recovery");
    expect(
      db
        .select()
        .from(workflowReceiptRuns)
        .where(eq(workflowReceiptRuns.workflowId, id))
        .get()?.terminalStatus,
    ).toBe("failed");
    expect(dispatch.calls).toEqual([]);
  });
});
