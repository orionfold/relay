import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { notifications, settings } from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { ApprovalResolutionError } from "@/lib/notifications/approval-errors";
import { buildPermissionPattern } from "@/lib/notifications/permissions";

export interface PermissionResolution {
  expectedTaskId: string;
  notificationId: string;
  behavior: "allow" | "deny";
  message?: string;
  updatedInput?: unknown;
  alwaysAllow?: boolean;
  permissionPattern?: string;
}

/**
 * Persist a tool/question response exactly once. The notification response and
 * Always Allow pattern share one SQLite transaction, so neither can commit on
 * its own when persistence fails.
 */
export function resolvePermission(input: PermissionResolution): void {
  try {
    db.transaction((tx) => {
      const [notification] = tx
        .select()
        .from(notifications)
        .where(eq(notifications.id, input.notificationId))
        .all();

      if (!notification) {
        throw new ApprovalResolutionError(
          "APPROVAL_NOT_FOUND",
          "This approval request no longer exists. Refresh the approval list."
        );
      }
      const isQuestion =
        notification.toolName === "AskUserQuestion" ||
        notification.toolName === "ask_user_question";
      const hasExpectedType =
        notification.type === "permission_required" ||
        (notification.type === "agent_message" && isQuestion);
      if (!hasExpectedType) {
        throw new ApprovalResolutionError(
          "APPROVAL_TYPE_MISMATCH",
          "This response does not match the approval request type."
        );
      }
      const taskMatches =
        input.expectedTaskId === "_checkpoint"
          ? notification.taskId === null
          : notification.taskId === input.expectedTaskId;
      if (!taskMatches) {
        throw new ApprovalResolutionError(
          "APPROVAL_PAYLOAD_MISMATCH",
          "This approval does not belong to the requested task."
        );
      }
      if (notification.response) {
        throw new ApprovalResolutionError(
          "APPROVAL_ALREADY_RESOLVED",
          "This approval was already resolved in another view or session."
        );
      }

      if (isQuestion && input.behavior === "allow" && input.updatedInput === undefined) {
        throw new ApprovalResolutionError(
          "APPROVAL_PAYLOAD_MALFORMED",
          "A question approval requires an answer. The request remains pending."
        );
      }
      if (input.alwaysAllow && (input.behavior !== "allow" || isQuestion)) {
        throw new ApprovalResolutionError(
          "APPROVAL_PAYLOAD_MALFORMED",
          "Always Allow is valid only for an allowed tool request."
        );
      }

      if (input.behavior === "allow" && input.alwaysAllow) {
        if (!input.permissionPattern) {
          throw new ApprovalResolutionError(
            "APPROVAL_PAYLOAD_MALFORMED",
            "Always Allow requires a permission pattern."
          );
        }

        let originalInput: Record<string, unknown>;
        try {
          const parsed = JSON.parse(notification.toolInput ?? "{}");
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("Tool input is not an object");
          }
          originalInput = parsed;
        } catch (error) {
          throw new ApprovalResolutionError(
            "APPROVAL_PAYLOAD_MALFORMED",
            "Always Allow could not verify the stored tool input. The request remains pending.",
            { cause: error }
          );
        }
        const expectedPattern = buildPermissionPattern(
          notification.toolName ?? "",
          originalInput
        );
        if (input.permissionPattern !== expectedPattern) {
          throw new ApprovalResolutionError(
            "APPROVAL_PAYLOAD_MISMATCH",
            "The permission pattern does not match this approval request."
          );
        }

        const key = SETTINGS_KEYS.PERMISSIONS_ALLOW;
        const [row] = tx.select().from(settings).where(eq(settings.key, key)).all();
        let patterns: string[];
        try {
          const parsed = row ? JSON.parse(row.value) : [];
          if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
            throw new Error("Permission settings are not a string array");
          }
          patterns = parsed;
        } catch (error) {
          throw new ApprovalResolutionError(
            "APPROVAL_PERSISTENCE_FAILED",
            "Always Allow could not be saved because the permission settings are malformed. The request is still pending.",
            { cause: error }
          );
        }

        if (!patterns.includes(input.permissionPattern)) {
          const value = JSON.stringify([...patterns, input.permissionPattern]);
          const updatedAt = new Date();
          if (row) {
            tx.update(settings)
              .set({ value, updatedAt })
              .where(eq(settings.key, key))
              .run();
          } else {
            tx.insert(settings).values({ key, value, updatedAt }).run();
          }
        }
      }

      const responseData = {
        behavior: input.behavior,
        message: input.message,
        updatedInput: input.updatedInput,
        alwaysAllow: input.alwaysAllow,
      };
      const result = tx
        .update(notifications)
        .set({
          response: JSON.stringify(responseData),
          respondedAt: new Date(),
          read: true,
        })
        .where(
          and(
            eq(notifications.id, input.notificationId),
            isNull(notifications.response)
          )
        )
        .run();

      if (result.changes !== 1) {
        throw new ApprovalResolutionError(
          "APPROVAL_ALREADY_RESOLVED",
          "This approval was already resolved in another view or session."
        );
      }
    });
  } catch (error) {
    if (error instanceof ApprovalResolutionError) throw error;
    throw new ApprovalResolutionError(
      "APPROVAL_PERSISTENCE_FAILED",
      "The approval could not be saved. It is still pending; retry the action.",
      { cause: error }
    );
  }
}
