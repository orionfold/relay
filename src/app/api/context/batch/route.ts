import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { approvalErrorResponse } from "@/lib/notifications/approval-errors";
import { resolveContextProposalBatch } from "@/lib/notifications/resolve-context-proposal";

const batchSchema = z.object({
  notificationId: z.string().min(1),
  proposalIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "proposalIds must be unique",
    }),
  action: z.enum(["approve", "reject"]),
});

/**
 * POST /api/context/batch — batch approve or reject context proposals.
 *
 * Used by the batch proposal review UI after workflow completion.
 * Accepts the parent notification ID, its learned_context row IDs, and an action.
 */
export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "The batch response must be valid JSON.",
          code: "APPROVAL_PAYLOAD_MALFORMED",
        },
        { status: 400 }
      );
    }
    const parsed = batchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "notificationId, proposalIds (string[]), and action ('approve'|'reject') are required",
          code: "APPROVAL_PAYLOAD_MALFORMED",
        },
        { status: 400 }
      );
    }

    const { notificationId, proposalIds, action } = parsed.data;
    const result = await resolveContextProposalBatch({
      notificationId,
      proposalIds,
      action,
    });

    return NextResponse.json({ success: true, action, ...result });
  } catch (error: unknown) {
    const failure = approvalErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
