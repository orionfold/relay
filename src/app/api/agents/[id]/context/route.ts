import { NextResponse } from "next/server";
import {
  getContextHistory,
  rollbackToVersion,
  addDirectContext,
  checkContextSize,
} from "@/lib/agents/learned-context";
import { approvalErrorResponse } from "@/lib/notifications/approval-errors";
import { resolveContextProposal } from "@/lib/notifications/resolve-context-proposal";
import { z } from "zod";

const contextMutationSchema = z.object({
  action: z.enum(["approve", "reject", "rollback"]),
  notificationId: z.string().min(1).optional(),
  targetVersion: z.number().int().nonnegative().optional(),
  editedContent: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/agents/[id]/context — version history + size info */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id: profileId } = await params;

  const history = await getContextHistory(profileId);
  const sizeInfo = checkContextSize(profileId);

  return NextResponse.json({ history, ...sizeInfo });
}

/** POST /api/agents/[id]/context — manual direct addition */
export async function POST(request: Request, { params }: RouteParams) {
  const { id: profileId } = await params;

  const body = await request.json();
  const { additions } = body as { additions?: string };

  if (!additions || typeof additions !== "string" || !additions.trim()) {
    return NextResponse.json(
      { error: "additions is required" },
      { status: 400 }
    );
  }

  await addDirectContext(profileId, additions.trim());

  return NextResponse.json({ ok: true });
}

/** PATCH /api/agents/[id]/context — approve / reject / rollback */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id: profileId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "The context response must be valid JSON.",
        code: "APPROVAL_PAYLOAD_MALFORMED",
      },
      { status: 400 }
    );
  }
  const parsed = contextMutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "A valid approve, reject, or rollback payload is required.",
        code: "APPROVAL_PAYLOAD_MALFORMED",
      },
      { status: 400 }
    );
  }
  const { action, notificationId, targetVersion, editedContent } = parsed.data;
  let warning: string | undefined;

  try {
    switch (action) {
      case "approve":
        if (!notificationId) {
          return NextResponse.json(
            { error: "notificationId is required for approve" },
            { status: 400 }
          );
        }
        warning = await resolveContextProposal({
          notificationId,
          profileId,
          action: "approve",
          editedContent: editedContent ?? undefined,
        });
        break;

      case "reject":
        if (!notificationId) {
          return NextResponse.json(
            { error: "notificationId is required for reject" },
            { status: 400 }
          );
        }
        warning = await resolveContextProposal({
          notificationId,
          profileId,
          action: "reject",
        });
        break;

      case "rollback":
        if (targetVersion === undefined) {
          return NextResponse.json(
            { error: "targetVersion is required for rollback" },
            { status: 400 }
          );
        }
        await rollbackToVersion(profileId, targetVersion);
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    if (action === "approve" || action === "reject") {
      const failure = approvalErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        code: "CONTEXT_ROLLBACK_FAILED",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, ...(warning ? { warning } : {}) });
}
