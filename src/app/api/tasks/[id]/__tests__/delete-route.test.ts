import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Regression test for #46 / #51 — deleting a `failed` task.
 *
 * A task that reached `failed` always has agentLogs + usageLedger child rows.
 * Foreign keys are enforced and no table cascades, so the pre-fix bare
 * `db.delete(tasks)` threw a FOREIGN KEY constraint failure → 500, which the
 * card (#51) and modal (#46) surfaced as "Failed to delete" / a dead button.
 *
 * This test runs against a REAL isolated SQLite (not a mock) so it actually
 * exercises the FK behavior — a mock would pass even with the broken handler,
 * and would not have caught the "Transaction function cannot return a promise"
 * async-callback bug that a synchronous better-sqlite3 transaction rejects.
 */
describe("DELETE /api/tasks/[id] — failed task with children (#46/#51)", () => {
  let tempDataDir: string;
  const originalDataDir = process.env.RELAY_DATA_DIR;

  beforeEach(() => {
    tempDataDir = mkdtempSync(join(tmpdir(), "relay-task-delete-"));
    process.env.RELAY_DATA_DIR = tempDataDir;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.RELAY_DATA_DIR = originalDataDir;
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("deletes a failed task, removes its execution children, and nulls out documents", async () => {
    const { db, sqlite } = await import("@/lib/db");
    const { tasks, agentLogs, usageLedger, documents } = await import(
      "@/lib/db/schema"
    );
    const { eq } = await import("drizzle-orm");
    const { DELETE } = await import("../route");

    const taskId = "task-fk-1";
    const now = new Date();

    // A failed task with the child rows a real failed run always produces.
    db.insert(tasks)
      .values({
        id: taskId,
        title: "failed task",
        status: "failed",
        priority: 3,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(agentLogs)
      .values({
        id: "log-1",
        taskId,
        agentType: "general",
        event: "failed",
        payload: "{}",
        timestamp: now,
      })
      .run();
    db.insert(usageLedger)
      .values({
        id: "usage-1",
        taskId,
        activityType: "task_run",
        runtimeId: "ollama",
        providerId: "ollama",
        status: "failed",
        startedAt: now,
        finishedAt: now,
      })
      .run();
    // A document linked to the task must SURVIVE deletion (taskId nulled).
    db.insert(documents)
      .values({
        id: "doc-1",
        taskId,
        filename: "keep-me.txt",
        originalName: "keep-me.txt",
        mimeType: "text/plain",
        size: 5,
        storagePath: "/tmp/keep-me.txt",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const res = await DELETE(new Request("http://test/api/tasks/task-fk-1") as never, {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    // Task + execution children gone.
    expect(db.select().from(tasks).where(eq(tasks.id, taskId)).all()).toHaveLength(0);
    expect(
      db.select().from(agentLogs).where(eq(agentLogs.taskId, taskId)).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(usageLedger).where(eq(usageLedger.taskId, taskId)).all(),
    ).toHaveLength(0);

    // Document survives with its task reference cleared.
    const [doc] = db.select().from(documents).where(eq(documents.id, "doc-1")).all();
    expect(doc).toBeDefined();
    expect(doc.taskId).toBeNull();

    // No dangling foreign keys.
    const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
    expect(violations).toHaveLength(0);
  });

  it("returns 404 for a task that does not exist", async () => {
    const { DELETE } = await import("../route");
    const res = await DELETE(new Request("http://test/api/tasks/nope") as never, {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});
