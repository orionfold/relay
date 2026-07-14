import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { learnedContext, notifications, settings } from "@/lib/db/schema";
import { POST as respondToPermission } from "@/app/api/tasks/[id]/respond/route";
import { PATCH as respondToContext } from "@/app/api/agents/[id]/context/route";
import { POST as respondToBatch } from "@/app/api/context/batch/route";

function request(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function insertNotification(input: {
  id: string;
  type:
    | "permission_required"
    | "agent_message"
    | "context_proposal"
    | "context_proposal_batch";
  toolName: string;
  toolInput: Record<string, unknown>;
}) {
  db.insert(notifications)
    .values({
      id: input.id,
      taskId: null,
      type: input.type,
      title: "Approval required",
      toolName: input.toolName,
      toolInput: JSON.stringify(input.toolInput),
      createdAt: new Date(),
    })
    .run();
}

function insertProposal(input: {
  id: string;
  profileId: string;
  notificationId?: string;
}) {
  db.insert(learnedContext)
    .values({
      id: input.id,
      profileId: input.profileId,
      version: 1,
      content: null,
      diff: "Prefer explicit errors",
      changeType: "proposal",
      proposalNotificationId: input.notificationId ?? null,
      proposedAdditions: "Prefer explicit errors",
      createdAt: new Date(),
    })
    .run();
}

afterEach(() => {
  db.delete(learnedContext).run();
  db.delete(notifications).run();
  db.delete(settings).run();
});

describe("approval routes", () => {
  it("resolves Allow Once and rejects a repeat response", async () => {
    insertNotification({
      id: "permission-allow",
      type: "permission_required",
      toolName: "Bash",
      toolInput: { command: "npm test" },
    });
    const body = {
      notificationId: "permission-allow",
      behavior: "allow",
      updatedInput: { command: "npm test" },
    };

    const first = await respondToPermission(
      request("http://localhost/api/tasks/_checkpoint/respond", "POST", body),
      { params: Promise.resolve({ id: "_checkpoint" }) }
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ success: true });

    const repeat = await respondToPermission(
      request("http://localhost/api/tasks/_checkpoint/respond", "POST", body),
      { params: Promise.resolve({ id: "_checkpoint" }) }
    );
    expect(repeat.status).toBe(409);
    await expect(repeat.json()).resolves.toMatchObject({
      code: "APPROVAL_ALREADY_RESOLVED",
    });
  });

  it("accepts a question reply and a separate denial", async () => {
    insertNotification({
      id: "permission-question",
      type: "agent_message",
      toolName: "AskUserQuestion",
      toolInput: {
        questions: [{ question: "Continue?", header: "Decision" }],
      },
    });
    insertNotification({
      id: "permission-deny",
      type: "permission_required",
      toolName: "Write",
      toolInput: { path: "/tmp/example" },
    });

    const question = await respondToPermission(
      request("http://localhost/api/tasks/_checkpoint/respond", "POST", {
        notificationId: "permission-question",
        behavior: "allow",
        updatedInput: {
          questions: [{ question: "Rewritten prompt", header: "Unsafe" }],
          answers: { "Continue?": "yes" },
        },
      }),
      { params: Promise.resolve({ id: "_checkpoint" }) }
    );
    const denial = await respondToPermission(
      request("http://localhost/api/tasks/_checkpoint/respond", "POST", {
        notificationId: "permission-deny",
        behavior: "deny",
        message: "User denied this action",
      }),
      { params: Promise.resolve({ id: "_checkpoint" }) }
    );

    expect(question.status).toBe(200);
    expect(denial.status).toBe(200);
    const [storedQuestion] = db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "permission-question"))
      .all();
    expect(JSON.parse(storedQuestion.response ?? "{}").updatedInput).toEqual({
      questions: [{ question: "Continue?", header: "Decision" }],
      answers: { "Continue?": "yes" },
    });
  });

  it("resolves a single context proposal through its profile route", async () => {
    insertNotification({
      id: "context-single",
      type: "context_proposal",
      toolName: "general",
      toolInput: { profileId: "general" },
    });
    insertProposal({
      id: "proposal-single",
      profileId: "general",
      notificationId: "context-single",
    });

    const response = await respondToContext(
      request("http://localhost/api/agents/general/context", "PATCH", {
        action: "approve",
        notificationId: "context-single",
      }),
      { params: Promise.resolve({ id: "general" }) }
    );

    expect(response.status).toBe(200);
    expect(
      db
        .select()
        .from(learnedContext)
        .where(eq(learnedContext.changeType, "approved"))
        .all()
    ).toHaveLength(1);
  });

  it("resolves only the exact context batch named by notificationId", async () => {
    insertNotification({
      id: "context-batch",
      type: "context_proposal_batch",
      toolName: "workflow-context-batch",
      toolInput: { proposalIds: ["proposal-a", "proposal-b"] },
    });
    insertProposal({ id: "proposal-a", profileId: "general" });
    insertProposal({ id: "proposal-b", profileId: "general" });

    const response = await respondToBatch(
      request("http://localhost/api/context/batch", "POST", {
        notificationId: "context-batch",
        proposalIds: ["proposal-a", "proposal-b"],
        action: "reject",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      action: "reject",
      count: 2,
    });
  });

  it("rejects malformed permission and context payloads visibly", async () => {
    const invalidPermission = await respondToPermission(
      request("http://localhost/api/tasks/_checkpoint/respond", "POST", {
        notificationId: "missing-behavior",
      }),
      { params: Promise.resolve({ id: "_checkpoint" }) }
    );
    const invalidContext = await respondToContext(
      request("http://localhost/api/agents/general/context", "PATCH", {
        action: "approve",
        notificationId: "context-single",
        editedContent: { invalid: true },
      }),
      { params: Promise.resolve({ id: "general" }) }
    );

    expect(invalidPermission.status).toBe(400);
    expect(invalidContext.status).toBe(400);
  });
});
