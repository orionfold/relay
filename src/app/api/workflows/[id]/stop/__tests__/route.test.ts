/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documents,
  operationsReceipts,
  tasks,
  workflowReceiptRuns,
  workflows,
} from "@/lib/db/schema";
import type { WorkflowState } from "@/lib/workflows/types";

const cancel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agents/runtime", () => ({ cancelTaskWithRuntime: cancel }));

import { POST } from "../route";

function seedRunningWorkflow() {
  const id = randomUUID();
  const runningId = randomUUID();
  const queuedId = randomUUID();
  const now = new Date();
  const state: WorkflowState = {
    currentStepIndex: 1,
    status: "running",
    startedAt: now.toISOString(),
    stepStates: [
      { stepId: "running", taskId: runningId, status: "running" },
      { stepId: "queued", taskId: queuedId, status: "running" },
    ],
  };
  db.insert(workflows)
    .values({
      id,
      name: "Stop contract",
      definition: JSON.stringify({
        pattern: "sequence",
        steps: [
          { id: "running", name: "Running", prompt: "run" },
          { id: "queued", name: "Queued", prompt: "queue" },
        ],
        _state: state,
      }),
      status: "active",
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
    })
    .run();
  for (const [taskId, status] of [
    [runningId, "running"],
    [queuedId, "queued"],
  ] as const) {
    db.insert(tasks)
      .values({
        id: taskId,
        workflowId: id,
        workflowRunNumber: 1,
        title: taskId,
        status,
        assignedAgent: "claude-code",
        priority: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  return { id, runningId, queuedId };
}

function invoke(id: string) {
  return POST(new NextRequest(`http://relay.test/api/workflows/${id}/stop`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  db.delete(operationsReceipts).run();
  db.delete(documents).run();
  db.delete(tasks).run();
  db.delete(workflowReceiptRuns).run();
  db.delete(workflows).run();
  vi.clearAllMocks();
  cancel.mockResolvedValue(undefined);
});

describe("POST /api/workflows/[id]/stop recovery boundary", () => {
  it("returns 404 for a missing workflow", async () => {
    const response = await invoke(randomUUID());
    expect(response.status).toBe(404);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("keeps cancellation refusal visible and lets a later stop settle truthfully", async () => {
    const { id, runningId, queuedId } = seedRunningWorkflow();
    cancel.mockRejectedValueOnce(new Error("Provider interrupt channel closed"));

    const refused = await invoke(id);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({
      error: "One or more workflow tasks could not be cancelled",
      code: "WORKFLOW_CANCELLATION_FAILED",
      failedCancellations: [
        { taskId: runningId, error: "Provider interrupt channel closed" },
      ],
      cancelledTasks: 1,
    });
    expect(db.select().from(tasks).where(eq(tasks.id, runningId)).get()?.status).toBe(
      "running"
    );
    expect(db.select().from(tasks).where(eq(tasks.id, queuedId)).get()?.status).toBe(
      "cancelled"
    );
    expect(db.select().from(workflows).where(eq(workflows.id, id)).get()?.status).toBe(
      "active"
    );

    const stopped = await invoke(id);
    expect(stopped.status).toBe(200);
    expect(await stopped.json()).toEqual({
      status: "stopped",
      workflowId: id,
      cancelledTasks: 1,
    });
    expect(db.select().from(tasks).where(eq(tasks.id, runningId)).get()?.status).toBe(
      "cancelled"
    );
    const workflow = db.select().from(workflows).where(eq(workflows.id, id)).get()!;
    expect(workflow.status).toBe("failed");
    const state = (JSON.parse(workflow.definition) as { _state: WorkflowState })._state;
    expect(state.status).toBe("failed");
    expect(state.stepStates.map(({ status }) => status)).toEqual(["failed", "failed"]);
    expect(
      db.select()
        .from(workflowReceiptRuns)
        .where(eq(workflowReceiptRuns.workflowId, id))
        .get()?.terminalStatus
    ).toBe("failed");
  });

  it("rejects stopping an already terminal workflow without mutation", async () => {
    const { id } = seedRunningWorkflow();
    db.update(tasks).set({ status: "cancelled" }).where(eq(tasks.workflowId, id)).run();
    db.update(workflows).set({ status: "failed" }).where(eq(workflows.id, id)).run();

    const response = await invoke(id);
    expect(response.status).toBe(409);
    expect(cancel).not.toHaveBeenCalled();
  });
});
