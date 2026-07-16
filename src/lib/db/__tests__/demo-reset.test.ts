import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DatabaseModule = typeof import("@/lib/db");
type SchemaModule = typeof import("@/lib/db/schema");

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-demo-reset-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function seedResetGraph(
  db: DatabaseModule["db"],
  schema: SchemaModule,
  suffix: string
) {
  const now = new Date();
  const projectId = `demo_project_${suffix}`;
  const workflowId = `demo_workflow_${suffix}`;
  const taskId = `demo_task_${suffix}`;
  const receiptId = `demo_receipt_${suffix}`;

  db.insert(schema.projects)
    .values({
      id: projectId,
      name: "Demo reset project",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(schema.workflows)
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
  db.insert(schema.tasks)
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
  db.insert(schema.workflowReceiptRuns)
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
  db.insert(schema.operationsReceipts)
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
  db.insert(schema.workshopRuns)
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

describe("demo reset", () => {
  it("clears and reseeds the same used database twice with foreign keys enabled", async () => {
    const database = await import("@/lib/db");
    const schema = await import("@/lib/db/schema");
    const { clearAllData } = await import("@/lib/data/clear");

    try {
      seedResetGraph(database.db, schema, "first");
      const firstReset = clearAllData();
      expect(firstReset.workshopRuns).toBe(1);
      expect(firstReset.operationsReceipts).toBe(1);
      expect(firstReset.workflowReceiptRuns).toBe(1);

      seedResetGraph(database.db, schema, "second");
      const secondReset = clearAllData();
      expect(secondReset.workshopRuns).toBe(1);
      expect(secondReset.operationsReceipts).toBe(1);
      expect(secondReset.workflowReceiptRuns).toBe(1);

      seedResetGraph(database.db, schema, "third");
      expect(
        database.sqlite.prepare("PRAGMA foreign_key_check").all()
      ).toEqual([]);
      expect(database.db.select().from(schema.tasks).all()).toHaveLength(1);
      expect(database.db.select().from(schema.workshopRuns).all()).toHaveLength(
        1
      );
    } finally {
      database.sqlite.close();
    }
  });
});
