import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("attachCompletionContext", () => {
  let tempDataDir: string;
  const originalDataDir = process.env.RELAY_DATA_DIR;

  beforeEach(() => {
    tempDataDir = mkdtempSync(join(tmpdir(), "relay-notification-docs-"));
    process.env.RELAY_DATA_DIR = tempDataDir;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.RELAY_DATA_DIR = originalDataDir;
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("batches output documents onto completion notifications only", async () => {
    const { db } = await import("@/lib/db");
    const { documents, tasks } = await import("@/lib/db/schema");
    const { attachCompletionContext } = await import("../completion-context");
    const now = new Date("2026-07-12T20:00:00.000Z");
    db.insert(tasks).values({
      id: "task-1",
      title: "Task",
      status: "completed",
      result: `\`★ Insight ─────\`\n- Full result survives.\n\`────────────\`\n${"x".repeat(6_000)}`,
      createdAt: now,
      updatedAt: now,
    }).run();
    db.insert(documents).values([
      {
        id: "output-1",
        taskId: "task-1",
        filename: "output.md",
        originalName: "output.md",
        mimeType: "text/markdown",
        size: 100,
        storagePath: "/tmp/output.md",
        direction: "output",
        status: "ready",
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "input-1",
        taskId: "task-1",
        filename: "input.md",
        originalName: "input.md",
        mimeType: "text/markdown",
        size: 50,
        storagePath: "/tmp/input.md",
        direction: "input",
        status: "ready",
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "output-2",
        taskId: "task-1",
        filename: "evidence.md",
        originalName: "evidence.md",
        mimeType: "text/markdown",
        size: 75,
        storagePath: "/tmp/evidence.md",
        direction: "output",
        status: "ready",
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]).run();

    const result = await attachCompletionContext([
      { id: "completed", taskId: "task-1", type: "task_completed" },
      { id: "failed", taskId: "task-1", type: "task_failed" },
      { id: "empty", taskId: null, type: "task_completed" },
    ]);

    expect(result[0].outputDocuments).toHaveLength(2);
    expect(result[0].outputDocuments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "output-1", direction: "output" }),
      expect.objectContaining({ id: "output-2", direction: "output" }),
    ]));
    expect(result[0].completionResultPreview).toContain("Full result survives.");
    expect(result[0].completionResultPreview).toHaveLength(4_000);
    expect(result[1].outputDocuments).toEqual([]);
    expect(result[1].completionResultPreview).toBeNull();
    expect(result[2].outputDocuments).toEqual([]);
  });
});
