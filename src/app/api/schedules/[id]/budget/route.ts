import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  deleteUsageBudgetPolicy,
  getScheduleBudgetSnapshot,
  updateUsageBudgetPolicySchema,
  upsertUsageBudgetPolicy,
} from "@/lib/schedules/budget-policies";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return NextResponse.json(await getScheduleBudgetSnapshot(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("Schedule not found") ? 404 : 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const policy = updateUsageBudgetPolicySchema.parse(await request.json());
    await upsertUsageBudgetPolicy({
      scopeType: "schedule",
      scopeId: id,
      policy,
    });
    return NextResponse.json(await getScheduleBudgetSnapshot(id));
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const removed = await deleteUsageBudgetPolicy("schedule", id);
  return NextResponse.json({ success: true, removed });
}
