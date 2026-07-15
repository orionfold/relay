/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

const cancelControl = vi.hoisted(() => ({ failure: null as Error | null }));

vi.mock("@/lib/agents/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agents/runtime")>(
    "@/lib/agents/runtime"
  );
  return {
    ...actual,
    cancelTaskWithRuntime: (...args: Parameters<typeof actual.cancelTaskWithRuntime>) =>
      cancelControl.failure
        ? Promise.reject(cancelControl.failure)
        : actual.cancelTaskWithRuntime(...args),
  };
});

import { POST } from "../route";

function seedTask(assignedAgent: string) {
  const id = randomUUID();
  const now = new Date();
  db.insert(tasks)
    .values({
      id,
      title: "Cancel contract",
      status: "running",
      assignedAgent,
      priority: 2,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
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
  cancelControl.failure = null;
});

describe("POST /api/tasks/[id]/cancel boundary contract", () => {
  it("uses the real runtime adapter and persists cancellation before success", async () => {
    const id = seedTask("claude-code");

    const response = await invoke(id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(db.select().from(tasks).where(eq(tasks.id, id)).get()?.status).toBe(
      "cancelled"
    );
  });

  it("returns 404 without mutation when the task is missing", async () => {
    const response = await invoke(randomUUID());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("names provider cancellation failure and preserves the running task", async () => {
    const id = seedTask("claude-code");
    cancelControl.failure = new Error("Provider interrupt channel closed");

    const response = await invoke(id);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Provider interrupt channel closed",
      code: "task_cancel_failed",
    });
    expect(db.select().from(tasks).where(eq(tasks.id, id)).get()?.status).toBe(
      "running"
    );
  });
});
