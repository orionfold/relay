import { NextResponse } from "next/server";
import {
  getContextHistory,
  approveProposal,
  rejectProposal,
  rollbackToVersion,
  addDirectContext,
  checkContextSize,
} from "@/lib/agents/learned-context";

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

  const body = await request.json();
  const { action, notificationId, targetVersion, editedContent } = body as {
    action?: string;
    notificationId?: string;
    targetVersion?: number;
    editedContent?: string;
  };

  if (!action) {
    return NextResponse.json(
      { error: "action is required (approve | reject | rollback)" },
      { status: 400 }
    );
  }

  try {
    switch (action) {
      case "approve":
        if (!notificationId) {
          return NextResponse.json(
            { error: "notificationId is required for approve" },
            { status: 400 }
          );
        }
        await approveProposal(notificationId, editedContent ?? undefined);
        break;

      case "reject":
        if (!notificationId) {
          return NextResponse.json(
            { error: "notificationId is required for reject" },
            { status: 400 }
          );
        }
        await rejectProposal(notificationId);
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
