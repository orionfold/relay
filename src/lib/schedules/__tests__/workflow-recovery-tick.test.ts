import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";

const recoveryMocks = vi.hoisted(() => ({
  resumeDelayed: vi.fn(() => Promise.resolve()),
  resumeInteraction: vi.fn(() => Promise.resolve("not_ready" as const)),
}));

vi.mock("@/lib/workflows/engine", () => ({
  resumeWorkflow: recoveryMocks.resumeDelayed,
  resumeWorkflowInteraction: recoveryMocks.resumeInteraction,
}));

vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: vi.fn(() => Promise.resolve()),
}));

import { tickScheduler } from "../scheduler";

describe("tickScheduler workflow recovery sweep", () => {
  const workflowIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const id of workflowIds.splice(0)) {
      db.delete(workflows).where(eq(workflows.id, id)).run();
    }
  });

  it("hands paused input workflows to durable interaction reconciliation", async () => {
    const id = randomUUID();
    workflowIds.push(id);
    const now = new Date();

    db.insert(workflows)
      .values({
        id,
        name: "paused input recovery",
        definition: JSON.stringify({ pattern: "checkpoint", steps: [] }),
        status: "paused",
        resumeAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await tickScheduler();

    expect(recoveryMocks.resumeInteraction).toHaveBeenCalledWith(id);
  });
});
