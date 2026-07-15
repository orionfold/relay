import { NextRequest, NextResponse } from "next/server";
import {
  isOpenAICompatibleRuntimeId,
  listOpenAICompatibleModels,
} from "@/lib/agents/runtime/openai-compatible";

type RouteContext = { params: Promise<{ runtimeId: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { runtimeId } = await params;
  if (!isOpenAICompatibleRuntimeId(runtimeId)) {
    return NextResponse.json(
      { error: "runtimeId must be litellm or lmstudio" },
      { status: 404 }
    );
  }
  try {
    const models = await listOpenAICompatibleModels(runtimeId);
    return NextResponse.json({ runtimeId, models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
