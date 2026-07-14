import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { learnedContext, notifications, settings } from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { ApprovalResolutionError } from "@/lib/notifications/approval-errors";
import { resolvePermission } from "@/lib/notifications/resolve-permission";
import {
  resolveContextProposal,
  resolveContextProposalBatch,
} from "@/lib/notifications/resolve-context-proposal";
import { waitForToolPermissionResponse } from "@/lib/agents/tool-permissions";

function pendingNotification(input: {
  id: string;
  type:
    | "permission_required"
    | "agent_message"
    | "context_proposal"
    | "context_proposal_batch";
  toolName?: string;
  toolInput?: string;
}) {
  db.insert(notifications)
    .values({
      id: input.id,
      taskId: null,
      type: input.type,
      title: "Approval required",
      toolName: input.toolName ?? null,
      toolInput: input.toolInput ?? null,
      createdAt: new Date(),
    })
    .run();
}

function proposal(input: {
  id: string;
  profileId: string;
  notificationId?: string;
  additions: string;
}) {
  db.insert(learnedContext)
    .values({
      id: input.id,
      profileId: input.profileId,
      version: 1,
      content: null,
      diff: input.additions,
      changeType: "proposal",
      proposalNotificationId: input.notificationId ?? null,
      proposedAdditions: input.additions,
      createdAt: new Date(),
    })
    .run();
}

afterEach(() => {
  db.delete(learnedContext).run();
  db.delete(notifications).run();
  db.delete(settings).run();
});

describe("approval resolution", () => {
  it("persists a permission response once and rejects a second session", () => {
    pendingNotification({
      id: "permission-1",
      type: "permission_required",
      toolName: "Bash",
      toolInput: JSON.stringify({ command: "npm test" }),
    });

    resolvePermission({
      expectedTaskId: "_checkpoint",
      notificationId: "permission-1",
      behavior: "allow",
      updatedInput: { command: "npm test" },
    });

    expect(() =>
      resolvePermission({
        expectedTaskId: "_checkpoint",
        notificationId: "permission-1",
        behavior: "deny",
      })
    ).toThrowError(
      expect.objectContaining<Partial<ApprovalResolutionError>>({
        code: "APPROVAL_ALREADY_RESOLVED",
      })
    );

    const [row] = db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "permission-1"))
      .all();
    expect(JSON.parse(row.response ?? "{}")).toMatchObject({ behavior: "allow" });
    expect(row.read).toBe(true);
  });

  it("commits Always Allow and its response atomically", () => {
    pendingNotification({
      id: "permission-2",
      type: "permission_required",
      toolName: "Bash",
      toolInput: JSON.stringify({ command: "npm run build" }),
    });
    db.insert(settings)
      .values({
        key: SETTINGS_KEYS.PERMISSIONS_ALLOW,
        value: "not-json",
        updatedAt: new Date(),
      })
      .run();

    expect(() =>
      resolvePermission({
        expectedTaskId: "_checkpoint",
        notificationId: "permission-2",
        behavior: "allow",
        alwaysAllow: true,
        permissionPattern: "Bash(command:npm *)",
      })
    ).toThrowError(
      expect.objectContaining<Partial<ApprovalResolutionError>>({
        code: "APPROVAL_PERSISTENCE_FAILED",
      })
    );

    const [stillPending] = db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "permission-2"))
      .all();
    expect(stillPending.response).toBeNull();

    db.update(settings)
      .set({ value: "[]", updatedAt: new Date() })
      .where(eq(settings.key, SETTINGS_KEYS.PERMISSIONS_ALLOW))
      .run();
    resolvePermission({
      expectedTaskId: "_checkpoint",
      notificationId: "permission-2",
      behavior: "allow",
      alwaysAllow: true,
      permissionPattern: "Bash(command:npm *)",
    });

    const [permissionSetting] = db
      .select()
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEYS.PERMISSIONS_ALLOW))
      .all();
    expect(JSON.parse(permissionSetting.value)).toEqual(["Bash(command:npm *)"]);
  });

  it("keeps a question pending when an allow response has no answer", () => {
    pendingNotification({
      id: "question-without-answer",
      type: "agent_message",
      toolName: "AskUserQuestion",
      toolInput: JSON.stringify({ question: "Continue?" }),
    });

    expect(() =>
      resolvePermission({
        expectedTaskId: "_checkpoint",
        notificationId: "question-without-answer",
        behavior: "allow",
      })
    ).toThrowError(
      expect.objectContaining<Partial<ApprovalResolutionError>>({
        code: "APPROVAL_PAYLOAD_MALFORMED",
      })
    );

    const [row] = db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "question-without-answer"))
      .all();
    expect(row.response).toBeNull();
  });

  it("creates one learned-context version for a single proposal", async () => {
    pendingNotification({
      id: "context-1",
      type: "context_proposal",
      toolName: "general",
    });
    proposal({
      id: "proposal-1",
      profileId: "general",
      notificationId: "context-1",
      additions: "Prefer named errors",
    });

    await resolveContextProposal({
      notificationId: "context-1",
      profileId: "general",
      action: "approve",
    });
    await expect(
      resolveContextProposal({
        notificationId: "context-1",
        profileId: "general",
        action: "reject",
      })
    ).rejects.toMatchObject({ code: "APPROVAL_ALREADY_RESOLVED" });

    const decisions = db
      .select()
      .from(learnedContext)
      .where(eq(learnedContext.changeType, "approved"))
      .all();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].content).toBe("Prefer named errors");
  });

  it("resolves an exact batch once and leaves mismatched batches pending", async () => {
    pendingNotification({
      id: "batch-1",
      type: "context_proposal_batch",
      toolInput: JSON.stringify({ proposalIds: ["proposal-1", "proposal-2"] }),
    });
    proposal({ id: "proposal-1", profileId: "general", additions: "First" });
    proposal({ id: "proposal-2", profileId: "general", additions: "Second" });

    await expect(
      resolveContextProposalBatch({
        notificationId: "batch-1",
        proposalIds: ["proposal-1"],
        action: "approve",
      })
    ).rejects.toMatchObject({ code: "APPROVAL_PAYLOAD_MISMATCH" });
    expect(
      db
        .select()
        .from(learnedContext)
        .where(eq(learnedContext.changeType, "approved"))
        .all()
    ).toHaveLength(0);

    await expect(
      resolveContextProposalBatch({
        notificationId: "batch-1",
        proposalIds: ["proposal-1", "proposal-2"],
        action: "approve",
      })
    ).resolves.toEqual({ count: 2 });
    await expect(
      resolveContextProposalBatch({
        notificationId: "batch-1",
        proposalIds: ["proposal-1", "proposal-2"],
        action: "reject",
      })
    ).rejects.toMatchObject({ code: "APPROVAL_ALREADY_RESOLVED" });

    const decisions = db
      .select()
      .from(learnedContext)
      .where(eq(learnedContext.changeType, "approved"))
      .all();
    expect(decisions).toHaveLength(2);
    expect(decisions.map((row) => row.version)).toEqual([2, 3]);
  });

  it("rejects duplicate proposal IDs without creating decision versions", async () => {
    pendingNotification({
      id: "batch-duplicates",
      type: "context_proposal_batch",
      toolInput: JSON.stringify({ proposalIds: ["proposal-1", "proposal-1"] }),
    });
    proposal({ id: "proposal-1", profileId: "general", additions: "First" });

    await expect(
      resolveContextProposalBatch({
        notificationId: "batch-duplicates",
        proposalIds: ["proposal-1", "proposal-1"],
        action: "approve",
      })
    ).rejects.toMatchObject({ code: "APPROVAL_PAYLOAD_MISMATCH" });
    expect(
      db
        .select()
        .from(learnedContext)
        .where(eq(learnedContext.changeType, "approved"))
        .all()
    ).toHaveLength(0);
  });

  it("durably resolves a timed-out waiter so stale UI cannot approve it", async () => {
    pendingNotification({ id: "permission-timeout", type: "permission_required" });
    vi.useFakeTimers();
    try {
      const responsePromise = waitForToolPermissionResponse("permission-timeout");
      await vi.advanceTimersByTimeAsync(56_000);
      await expect(responsePromise).resolves.toEqual({
        behavior: "deny",
        message: "Permission request timed out",
      });
    } finally {
      vi.useRealTimers();
    }

    const [row] = db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "permission-timeout"))
      .all();
    expect(JSON.parse(row.response ?? "{}")).toEqual({
      behavior: "deny",
      message: "Permission request timed out",
    });
    expect(row.respondedAt).toBeInstanceOf(Date);
  });
});
