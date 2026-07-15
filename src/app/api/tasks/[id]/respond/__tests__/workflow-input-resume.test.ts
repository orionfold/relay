/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

const resumeInteraction = vi.hoisted(() => vi.fn().mockResolvedValue("resumed"));
vi.mock("@/lib/workflows/engine", () => ({
  resumeWorkflowInteraction: resumeInteraction,
}));

import { POST } from "../route";

function seedWorkflowQuestion(workflowId: string) {
  const id = randomUUID();
  db.insert(notifications)
    .values({
      id,
      taskId: null,
      type: "permission_required",
      title: "Workflow needs input",
      toolName: "AskUserQuestion",
      toolInput: JSON.stringify({
        question: "What evidence should be used?",
        workflowId,
        stepName: "Gather evidence",
      }),
      createdAt: new Date(),
    })
    .run();
  return id;
}

function invoke(notificationId: string) {
  return POST(
    new NextRequest("http://relay.test/api/tasks/_checkpoint/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId,
        behavior: "allow",
        updatedInput: { answer: "Use signed evidence" },
      }),
    }),
    { params: Promise.resolve({ id: "_checkpoint" }) }
  );
}

beforeEach(() => {
  db.delete(notifications).run();
  vi.clearAllMocks();
});

describe("workflow input notification response", () => {
  it("dispatches the exact persisted workflow interaction after committing the answer", async () => {
    const workflowId = randomUUID();
    const notificationId = seedWorkflowQuestion(workflowId);

    const response = await invoke(notificationId);
    expect(response.status).toBe(200);
    await vi.waitFor(() => {
      expect(resumeInteraction).toHaveBeenCalledWith(workflowId, notificationId);
    });
    expect(db.select().from(notifications).all()[0].response).toContain(
      "Use signed evidence"
    );
  });

  it("refuses a duplicate answer without dispatching a second continuation", async () => {
    const workflowId = randomUUID();
    const notificationId = seedWorkflowQuestion(workflowId);

    expect((await invoke(notificationId)).status).toBe(200);
    await vi.waitFor(() => expect(resumeInteraction).toHaveBeenCalledTimes(1));

    const duplicate = await invoke(notificationId);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: "APPROVAL_ALREADY_RESOLVED",
    });
    expect(resumeInteraction).toHaveBeenCalledTimes(1);
  });
});
