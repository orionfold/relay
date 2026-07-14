import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  approvalErrorResponse,
  ApprovalResolutionError,
} from "@/lib/notifications/approval-errors";
import { resolvePermission } from "@/lib/notifications/resolve-permission";

const respondSchema = z.object({
  notificationId: z.string().min(1),
  behavior: z.enum(["allow", "deny"]),
  message: z.string().optional(),
  updatedInput: z.record(z.string(), z.unknown()).optional(),
  alwaysAllow: z.boolean().optional(),
  permissionPattern: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: "The approval response must be valid JSON.",
        code: "APPROVAL_PAYLOAD_MALFORMED",
      },
      { status: 400 }
    );
  }
  const parsed = respondSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "notificationId (string) and behavior ('allow' | 'deny') are required",
        code: "APPROVAL_PAYLOAD_MALFORMED",
      },
      { status: 400 }
    );
  }

  const { notificationId, behavior, message, updatedInput, alwaysAllow, permissionPattern } = parsed.data;

  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId));

  if (!notification) {
    const failure = approvalErrorResponse(
      new ApprovalResolutionError(
        "APPROVAL_NOT_FOUND",
        "This approval request no longer exists. Refresh the approval list."
      )
    );
    return NextResponse.json(failure.body, { status: failure.status });
  }

  // Validate updatedInput keys against the original tool input to prevent injection.
  // Question tools return either a single `{ answer }` or the SDK's
  // `{ questions, answers }` shape. In the latter case the server restores the
  // original questions so a client cannot rewrite the prompt being answered.
  let sanitizedUpdatedInput = updatedInput;
  const isQuestion =
    notification.toolName === "AskUserQuestion" ||
    notification.toolName === "ask_user_question";
  if (updatedInput !== undefined) {
    let originalToolInput: Record<string, unknown>;
    try {
      const original = JSON.parse(notification.toolInput ?? "{}");
      if (typeof original !== "object" || original === null || Array.isArray(original)) {
        throw new Error("Stored tool input is not an object");
      }
      originalToolInput = original;
    } catch {
      return NextResponse.json(
        {
          error: "The stored tool input is malformed. Refresh before retrying this approval.",
          code: "APPROVAL_PAYLOAD_MALFORMED",
        },
        { status: 400 }
      );
    }

    if (isQuestion) {
      const inputRecord = updatedInput;
      const keys = Object.keys(inputRecord);
      const isSingleAnswer =
        keys.length === 1 && typeof inputRecord.answer === "string";
      const answers = inputRecord.answers;
      const isAnswerRecord =
        typeof answers === "object" &&
        answers !== null &&
        !Array.isArray(answers) &&
        Object.values(answers).every((answer) => typeof answer === "string");
      const isSdkAnswer =
        keys.length === 2 &&
        keys.includes("questions") &&
        keys.includes("answers") &&
        Array.isArray(originalToolInput.questions) &&
        isAnswerRecord;

      if (!isSingleAnswer && !isSdkAnswer) {
        return NextResponse.json(
          {
            error:
              "Question response must be { answer: string } or { questions, answers }.",
            code: "APPROVAL_PAYLOAD_MALFORMED",
          },
          { status: 400 }
        );
      }
      if (isSdkAnswer) {
        sanitizedUpdatedInput = {
          questions: originalToolInput.questions,
          answers,
        };
      }
    } else {
      const allowedKeys = new Set(Object.keys(originalToolInput));
      const extraKeys = Object.keys(updatedInput).filter(
        (key) => !allowedKeys.has(key)
      );
      if (extraKeys.length > 0) {
        return NextResponse.json(
          {
            error: `updatedInput contains disallowed keys: ${extraKeys.join(", ")}`,
            code: "APPROVAL_PAYLOAD_MALFORMED",
          },
          { status: 400 }
        );
      }
    }
  }

  try {
    resolvePermission({
      expectedTaskId: id,
      notificationId,
      behavior,
      message,
      updatedInput: sanitizedUpdatedInput,
      alwaysAllow,
      permissionPattern,
    });
  } catch (error) {
    const failure = approvalErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }

  return NextResponse.json({ success: true });
}
