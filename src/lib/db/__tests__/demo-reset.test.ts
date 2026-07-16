import { afterEach, describe, expect, it } from "vitest";
import { clearAllData } from "@/lib/data/clear";
import { db, sqlite } from "@/lib/db";
import {
  operationsReceipts,
  projects,
  tasks,
  workshopRuns,
  workflowReceiptRuns,
  workflows,
} from "@/lib/db/schema";

function seedResetGraph(suffix: string) {
  const now = new Date();
  const projectId = `demo_project_${suffix}`;
  const workflowId = `demo_workflow_${suffix}`;
  const taskId = `demo_task_${suffix}`;
  const receiptId = `demo_receipt_${suffix}`;

  db.insert(projects)
    .values({
      id: projectId,
      name: "Demo reset project",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(workflows)
    .values({
      id: workflowId,
      projectId,
      name: "Demo reset workflow",
      definition: JSON.stringify({ pattern: "sequence", steps: [] }),
      runNumber: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(tasks)
    .values({
      id: taskId,
      projectId,
      workflowId,
      title: "Demo reset task",
      status: "completed",
      sourceType: "workflow",
      workflowRunNumber: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(workflowReceiptRuns)
    .values({
      id: `demo_receipt_run_${suffix}`,
      workflowId,
      runNumber: 1,
      criteriaSnapshot: "[]",
      terminalStatus: "completed",
      startedAt: now,
      finishedAt: now,
    })
    .run();
  db.insert(operationsReceipts)
    .values({
      id: receiptId,
      sourceKey: `workflow:${workflowId}:1`,
      ownerType: "workflow",
      workflowId,
      taskId,
      workflowRunNumber: 1,
      verdict: "passed",
      criteriaSnapshot: "[]",
      evidence: "[]",
      summary: "Fixture receipt",
      nextAction: "None",
      startedAt: now,
      finishedAt: now,
      createdAt: now,
    })
    .run();
  db.insert(workshopRuns)
    .values({
      id: `demo_workshop_${suffix}`,
      editionId: "relay-operator-workshop",
      editionVersion: "fixture",
      editionHash: "fixture-hash",
      status: "completed",
      projectId,
      workflowId,
      receiptId,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    })
    .run();
}

afterEach(() => {
  clearAllData();
});

describe("demo reset", () => {
  it("clears and reseeds the same used database twice with foreign keys enabled", () => {
    seedResetGraph("first");
    const firstReset = clearAllData();
    expect(firstReset.workshopRuns).toBe(1);
    expect(firstReset.operationsReceipts).toBe(1);
    expect(firstReset.workflowReceiptRuns).toBe(1);

    seedResetGraph("second");
    const secondReset = clearAllData();
    expect(secondReset.workshopRuns).toBe(1);
    expect(secondReset.operationsReceipts).toBe(1);
    expect(secondReset.workflowReceiptRuns).toBe(1);

    seedResetGraph("third");
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.select().from(tasks).all()).toHaveLength(1);
    expect(db.select().from(workshopRuns).all()).toHaveLength(1);
  });
});
