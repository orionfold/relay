import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { parseAppScheduleId } from "@/lib/apps/app-schedule-id";
import {
  deleteUsageBudgetPolicy,
  getAppBudgetSnapshot,
  updateUsageBudgetPolicySchema,
  upsertUsageBudgetPolicy,
} from "@/lib/schedules/budget-policies";

const AppPolicyRequestSchema = z.object({
  scopeType: z.enum(["app", "schedule"]),
  scopeId: z.string().min(1),
  policy: updateUsageBudgetPolicySchema,
});

const DeletePolicyRequestSchema = AppPolicyRequestSchema.pick({
  scopeType: true,
  scopeId: true,
});

function belongsToApp(
  appId: string,
  scopeType: "app" | "schedule",
  scopeId: string
) {
  return scopeType === "app"
    ? scopeId === appId
    : parseAppScheduleId(scopeId)?.appId === appId;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return NextResponse.json(await getAppBudgetSnapshot(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("App not found") ? 404 : 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const input = AppPolicyRequestSchema.parse(await request.json());
    if (!belongsToApp(id, input.scopeType, input.scopeId)) {
      return NextResponse.json(
        { error: "Budget scope does not belong to this app" },
        { status: 400 }
      );
    }
    await upsertUsageBudgetPolicy(input);
    return NextResponse.json(await getAppBudgetSnapshot(id));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid budget policy", issues: error.issues },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message },
      { status: message.includes("not found") ? 404 : 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const input = DeletePolicyRequestSchema.parse(await request.json());
    if (!belongsToApp(id, input.scopeType, input.scopeId)) {
      return NextResponse.json(
        { error: "Budget scope does not belong to this app" },
        { status: 400 }
      );
    }
    const removed = await deleteUsageBudgetPolicy(
      input.scopeType,
      input.scopeId
    );
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid budget scope", issues: error.issues },
        { status: 400 }
      );
    }
    throw error;
  }
}
