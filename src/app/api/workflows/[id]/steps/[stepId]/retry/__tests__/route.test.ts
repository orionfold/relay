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
vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: vi.fn(async (taskId: string) => {
    dispatch.calls.push(taskId);
    if (!dispatch.handler) throw new Error("Missing retry dispatch handler");
    await dispatch.handler(taskId);
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
});
