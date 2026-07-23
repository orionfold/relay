import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { eq } from "drizzle-orm";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "relay-operations-receipts-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function loadModules() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  const receipts = await import("../receipts");
  return { db, ...schema, ...receipts };
}

describe("Operations Receipt persistence", () => {
  it("records one idempotent schedule receipt from the firing's criteria snapshot", async () => {
    const {
      db,
      schedules,
      tasks,
      operationsReceipts,
      ensureScheduleReceipt,
      listScheduleReceipts,
    } = await loadModules();
    const scheduleId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const now = new Date("2026-07-13T12:00:00.000Z");
    const firingCriteria = JSON.stringify([
      {
        id: "run-completed",
        label: "Run completed",
        level: "required",
        check: "status_is",
        value: "completed",
      },
      {
        id: "result-ready",
        label: "Result says ready",
        level: "required",
        check: "result_contains",
        value: "ready",
      },
    ]);

    await db.insert(schedules).values({
      id: scheduleId,
      name: "Release readiness",
      prompt: "Check release readiness",
      cronExpression: "0 9 * * *",
      successCriteria: firingCriteria,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(tasks).values({
      id: taskId,
      scheduleId,
      title: "Release readiness — firing #1",
      status: "completed",
      result: "Release is READY",
      sourceType: "scheduled",
      successCriteriaSnapshot: firingCriteria,
      slotClaimedAt: new Date(now.getTime() - 20_000),
      createdAt: new Date(now.getTime() - 30_000),
      updatedAt: now,
    });

    const first = await ensureScheduleReceipt(taskId);
    await db
      .update(schedules)
      .set({ successCriteria: null })
      .where(eq(schedules.id, scheduleId));
    const reconciled = await ensureScheduleReceipt(taskId);
    const rows = await db.select().from(operationsReceipts);

    expect(first.verdict).toBe("passed");
    expect(reconciled.verdict).toBe("passed");
    expect(reconciled.criteriaSnapshot).toHaveLength(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceKey).toBe(`schedule:${scheduleId}:task:${taskId}`);

    await db
      .update(operationsReceipts)
      .set({ evidence: "not-json" })
      .where(eq(operationsReceipts.id, first.id));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const [corrupt] = await listScheduleReceipts(scheduleId);
    expect(corrupt?.verdict).toBe("at_risk");
    expect(corrupt?.summary).toContain("could not be fully decoded");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`receipt ${first.id} has corrupt evidence`)
    );
    errorSpy.mockRestore();
  });

  it("records one workflow receipt per run with durable step evidence", async () => {
    const {
      db,
      workflows,
      workflowReceiptRuns,
      tasks,
      operationsReceipts,
      ensureWorkflowReceipt,
    } = await loadModules();
    const workflowId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const startedAt = new Date("2026-07-13T12:00:00.000Z");
    const finishedAt = new Date("2026-07-13T12:01:00.000Z");

    await db.insert(workflows).values({
      id: workflowId,
      name: "Publish release",
      status: "completed",
      runNumber: 1,
      successCriteria: JSON.stringify([
        {
          id: "result-done",
          label: "Publish finished",
          level: "required",
          check: "result_contains",
          value: "done",
        },
      ]),
      successCriteriaRunSnapshot: JSON.stringify([
        {
          id: "result-done",
          label: "Publish finished",
          level: "required",
          check: "result_contains",
          value: "done",
        },
      ]),
      definition: JSON.stringify({
        pattern: "sequence",
        steps: [{ id: "publish", name: "Publish", prompt: "Publish it" }],
        _state: {
          status: "completed",
          stepStates: [
            { stepId: "publish", status: "completed", result: "Publish done" },
          ],
        },
      }),
      createdAt: startedAt,
      updatedAt: finishedAt,
    });
    await db.insert(tasks).values({
      id: taskId,
      workflowId,
      workflowRunNumber: 1,
      successCriteriaSnapshot: JSON.stringify([
        {
          id: "result-done",
          label: "Publish finished",
          level: "required",
          check: "result_contains",
          value: "done",
        },
      ]),
      title: "Publish",
      status: "completed",
      result: "Publish done",
      sourceType: "workflow",
      createdAt: startedAt,
      updatedAt: finishedAt,
    });
    await db.insert(workflowReceiptRuns).values({
      id: crypto.randomUUID(),
      workflowId,
      runNumber: 1,
      criteriaSnapshot: JSON.stringify([
        {
          id: "result-done",
          label: "Publish finished",
          level: "required",
          check: "result_contains",
          value: "done",
        },
      ]),
      terminalStatus: "completed",
      startedAt,
      finishedAt,
    });

    const first = await ensureWorkflowReceipt(workflowId, 1);
    const reconciled = await ensureWorkflowReceipt(workflowId, 1);
    const rows = await db.select().from(operationsReceipts);

    expect(first.verdict).toBe("passed");
    expect(first.evidence[0]).toEqual(
      expect.objectContaining({ actual: "contains_expected_text" })
    );
    expect(JSON.stringify(first.evidence)).not.toContain("Publish done");
    expect(reconciled.workflowRunNumber).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceKey).toBe(`workflow:${workflowId}:run:1`);
  });

  it("repairs an interrupted historical workflow receipt from child-task snapshots", async () => {
    const {
      db,
      workflows,
      workflowReceiptRuns,
      tasks,
      ensureWorkflowReceipt,
    } = await loadModules();
    const workflowId = crypto.randomUUID();
    const now = new Date("2026-07-13T12:00:00.000Z");
    const oldSnapshot = JSON.stringify([
      {
        id: "old-bar",
        label: "Old run bar",
        level: "required",
        check: "result_contains",
        value: "old marker",
      },
    ]);

    await db.insert(workflows).values({
      id: workflowId,
      name: "Historical repair",
      status: "active",
      runNumber: 2,
      successCriteria: null,
      successCriteriaRunSnapshot: "[]",
      definition: JSON.stringify({ pattern: "sequence", steps: [] }),
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(tasks).values({
      id: crypto.randomUUID(),
      workflowId,
      workflowRunNumber: 1,
      successCriteriaSnapshot: oldSnapshot,
      title: "Old run",
      status: "completed",
      result: "OLD MARKER",
      sourceType: "workflow",
      createdAt: new Date(now.getTime() - 60_000),
      updatedAt: new Date(now.getTime() - 30_000),
    });
    await db.insert(workflowReceiptRuns).values({
      id: crypto.randomUUID(),
      workflowId,
      runNumber: 1,
      criteriaSnapshot: oldSnapshot,
      terminalStatus: "completed",
      startedAt: new Date(now.getTime() - 60_000),
      finishedAt: new Date(now.getTime() - 30_000),
    });

    const repaired = await ensureWorkflowReceipt(workflowId, 1);

    expect(repaired.verdict).toBe("passed");
    expect(repaired.criteriaSnapshot[0]?.id).toBe("old-bar");
  });

  it("refreshes a same-run receipt after a failed source is retried successfully", async () => {
    const {
      db,
      workflows,
      workflowReceiptRuns,
      tasks,
      operationsReceipts,
      ensureWorkflowReceipt,
    } = await loadModules();
    const workflowId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const now = new Date("2026-07-13T12:00:00.000Z");
    const snapshot = JSON.stringify([
      {
        id: "completed",
        label: "Run completed",
        level: "required",
        check: "status_is",
        value: "completed",
      },
    ]);

    await db.insert(workflows).values({
      id: workflowId,
      name: "Retry receipt",
      status: "failed",
      runNumber: 1,
      successCriteriaRunSnapshot: snapshot,
      definition: JSON.stringify({ pattern: "sequence", steps: [] }),
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(workflowReceiptRuns).values({
      id: crypto.randomUUID(),
      workflowId,
      runNumber: 1,
      criteriaSnapshot: snapshot,
      terminalStatus: "failed",
      startedAt: now,
      finishedAt: now,
    });
    await db.insert(tasks).values({
      id: taskId,
      workflowId,
      workflowRunNumber: 1,
      successCriteriaSnapshot: snapshot,
      title: "Retry task",
      status: "failed",
      result: "temporary failure",
      sourceType: "workflow",
      createdAt: now,
      updatedAt: now,
    });

    const failed = await ensureWorkflowReceipt(workflowId, 1);
    const recoveredTaskId = crypto.randomUUID();
    await db.insert(tasks).values({
      id: recoveredTaskId,
      workflowId,
      workflowRunNumber: 1,
      successCriteriaSnapshot: snapshot,
      title: "Retry task",
      status: "completed",
      result: "recovered",
      sourceType: "workflow",
      createdAt: new Date(now.getTime() + 1000),
      updatedAt: new Date(now.getTime() + 1000),
    });
    await db
      .update(workflows)
      .set({ status: "completed", updatedAt: new Date(now.getTime() + 1000) })
      .where(eq(workflows.id, workflowId));
    const recovered = await ensureWorkflowReceipt(workflowId, 1);
    const rows = await db.select().from(operationsReceipts);

    expect(failed.verdict).toBe("failed");
    expect(recovered.verdict).toBe("passed");
    expect(recovered.id).toBe(failed.id);
    expect(rows).toHaveLength(1);
    expect(
      await db
        .select()
        .from(tasks)
        .where(eq(tasks.workflowId, workflowId))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: taskId, status: "failed" }),
        expect.objectContaining({ id: recoveredTaskId, status: "completed" }),
      ])
    );
  });
});
