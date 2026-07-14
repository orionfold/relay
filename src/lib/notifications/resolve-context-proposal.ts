import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { learnedContext, notifications } from "@/lib/db/schema";
import { checkContextSize, summarizeContext } from "@/lib/agents/learned-context";
import { ApprovalResolutionError } from "@/lib/notifications/approval-errors";

type ContextAction = "approve" | "reject";
const MAINTENANCE_WARNING =
  "The decision was saved, but learned-context maintenance needs attention.";

function assertPendingNotification(
  notification: typeof notifications.$inferSelect | undefined,
  expectedType: "context_proposal" | "context_proposal_batch"
): asserts notification is typeof notifications.$inferSelect {
  if (!notification) {
    throw new ApprovalResolutionError(
      "APPROVAL_NOT_FOUND",
      "This context proposal no longer exists. Refresh the approval list."
    );
  }
  if (notification.type !== expectedType) {
    throw new ApprovalResolutionError(
      "APPROVAL_TYPE_MISMATCH",
      "This response does not match the context proposal type."
    );
  }
  if (notification.response) {
    throw new ApprovalResolutionError(
      "APPROVAL_ALREADY_RESOLVED",
      "This context proposal was already resolved in another view or session."
    );
  }
}

function activeContent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  profileId: string
): string | null {
  const [row] = tx
    .select({ content: learnedContext.content })
    .from(learnedContext)
    .where(
      and(
        eq(learnedContext.profileId, profileId),
        eq(learnedContext.changeType, "approved")
      )
    )
    .orderBy(desc(learnedContext.version))
    .limit(1)
    .all();
  return row?.content ?? null;
}

function nextVersion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  profileId: string
): number {
  const [row] = tx
    .select({ version: learnedContext.version })
    .from(learnedContext)
    .where(eq(learnedContext.profileId, profileId))
    .orderBy(desc(learnedContext.version))
    .limit(1)
    .all();
  return (row?.version ?? 0) + 1;
}

function recordProposalDecision(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  proposal: typeof learnedContext.$inferSelect,
  action: ContextAction,
  notificationId: string,
  editedContent?: string
): void {
  const currentContent = activeContent(tx, proposal.profileId);
  const additions = editedContent ?? proposal.proposedAdditions ?? "";
  const content =
    action === "approve"
      ? currentContent
        ? `${currentContent}\n\n${additions}`
        : additions
      : currentContent;

  tx.insert(learnedContext)
    .values({
      id: crypto.randomUUID(),
      profileId: proposal.profileId,
      version: nextVersion(tx, proposal.profileId),
      content,
      diff: additions,
      changeType: action === "approve" ? "approved" : "rejected",
      sourceTaskId: proposal.sourceTaskId,
      proposalNotificationId: notificationId,
      proposedAdditions: additions,
      approvedBy: action === "approve" ? "human" : undefined,
      createdAt: new Date(),
    })
    .run();
}

function markResolved(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  notificationId: string,
  action: ContextAction
): void {
  const result = tx
    .update(notifications)
    .set({
      response: JSON.stringify({
        action: action === "approve" ? "approved" : "rejected",
      }),
      respondedAt: new Date(),
      read: true,
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        isNull(notifications.response)
      )
    )
    .run();

  if (result.changes !== 1) {
    throw new ApprovalResolutionError(
      "APPROVAL_ALREADY_RESOLVED",
      "This context proposal was already resolved in another view or session."
    );
  }
}

function wrapPersistenceFailure(error: unknown): never {
  if (error instanceof ApprovalResolutionError) throw error;
  throw new ApprovalResolutionError(
    "APPROVAL_PERSISTENCE_FAILED",
    "The context decision could not be saved. It is still pending; retry the action.",
    { cause: error }
  );
}

export async function resolveContextProposal(input: {
  notificationId: string;
  profileId: string;
  action: ContextAction;
  editedContent?: string;
}): Promise<string | undefined> {
  let affectedProfileId = input.profileId;
  try {
    db.transaction((tx) => {
      const [notification] = tx
        .select()
        .from(notifications)
        .where(eq(notifications.id, input.notificationId))
        .all();
      assertPendingNotification(notification, "context_proposal");

      const [proposal] = tx
        .select()
        .from(learnedContext)
        .where(eq(learnedContext.proposalNotificationId, input.notificationId))
        .all();
      if (!proposal) {
        throw new ApprovalResolutionError(
          "APPROVAL_PAYLOAD_MISMATCH",
          "The proposal data is missing. The request remains pending."
        );
      }
      if (proposal.profileId !== input.profileId) {
        throw new ApprovalResolutionError(
          "APPROVAL_PAYLOAD_MISMATCH",
          "The proposal does not belong to this agent profile."
        );
      }

      affectedProfileId = proposal.profileId;
      recordProposalDecision(
        tx,
        proposal,
        input.action,
        input.notificationId,
        input.action === "approve" ? input.editedContent : undefined
      );
      markResolved(tx, input.notificationId, input.action);
    });
  } catch (error) {
    wrapPersistenceFailure(error);
  }

  if (input.action === "approve") {
    try {
      if (!checkContextSize(affectedProfileId).needsSummarization) return undefined;
      await summarizeContext(affectedProfileId);
    } catch (error) {
      console.error(
        "[approval-resolution] Approved context saved, but post-commit maintenance failed:",
        error
      );
      return MAINTENANCE_WARNING;
    }
  }
  return undefined;
}

export async function resolveContextProposalBatch(input: {
  notificationId: string;
  proposalIds: string[];
  action: ContextAction;
}): Promise<{ count: number; warning?: string }> {
  const touchedProfileIds = new Set<string>();
  try {
    db.transaction((tx) => {
      const [notification] = tx
        .select()
        .from(notifications)
        .where(eq(notifications.id, input.notificationId))
        .all();
      assertPendingNotification(notification, "context_proposal_batch");

      let expectedIds: unknown;
      try {
        expectedIds = JSON.parse(notification.toolInput ?? "{}").proposalIds;
      } catch (error) {
        throw new ApprovalResolutionError(
          "APPROVAL_PAYLOAD_MALFORMED",
          "The stored batch proposal is malformed. The request remains pending.",
          { cause: error }
        );
      }
      if (
        !Array.isArray(expectedIds) ||
        expectedIds.some((id) => typeof id !== "string") ||
        new Set(expectedIds).size !== expectedIds.length ||
        new Set(input.proposalIds).size !== input.proposalIds.length ||
        expectedIds.length !== input.proposalIds.length ||
        expectedIds.some((id) => !input.proposalIds.includes(id))
      ) {
        throw new ApprovalResolutionError(
          "APPROVAL_PAYLOAD_MISMATCH",
          "The submitted proposals do not match this batch approval."
        );
      }

      for (const proposalId of input.proposalIds) {
        const [proposal] = tx
          .select()
          .from(learnedContext)
          .where(
            and(
              eq(learnedContext.id, proposalId),
              eq(learnedContext.changeType, "proposal")
            )
          )
          .all();
        if (!proposal) {
          throw new ApprovalResolutionError(
            "APPROVAL_PAYLOAD_MISMATCH",
            `Proposal ${proposalId} is missing. The batch remains pending.`
          );
        }
        touchedProfileIds.add(proposal.profileId);
        recordProposalDecision(
          tx,
          proposal,
          input.action,
          input.notificationId
        );
      }

      markResolved(tx, input.notificationId, input.action);
    });
  } catch (error) {
    wrapPersistenceFailure(error);
  }

  if (input.action === "approve") {
    const maintenanceResults = await Promise.all(
      [...touchedProfileIds].map(async (profileId) => {
        try {
          if (!checkContextSize(profileId).needsSummarization) return true;
          await summarizeContext(profileId);
          return true;
        } catch (error) {
          console.error(
            "[approval-resolution] Approved context batch saved, but post-commit maintenance failed:",
            error
          );
          return false;
        }
      })
    );
    if (maintenanceResults.some((succeeded) => !succeeded)) {
      return { count: input.proposalIds.length, warning: MAINTENANCE_WARNING };
    }
  }

  return { count: input.proposalIds.length };
}
