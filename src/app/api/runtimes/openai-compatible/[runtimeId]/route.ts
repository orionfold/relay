import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOpenAICompatibleRuntimeId } from "@/lib/agents/runtime/openai-compatible";
import {
  discoverOpenAICompatibleProviderModels,
  getLMStudioModelDownloadStatus,
  startLMStudioModelDownload,
} from "@/lib/agents/runtime/provider-models";

type RouteContext = { params: Promise<{ runtimeId: string }> };

const downloadSchema = z
  .object({
    action: z.literal("download"),
    model: z.string().trim().min(1),
    quantization: z.string().trim().min(1).optional(),
  })
  .strict();

async function runtime(context: RouteContext) {
  const { runtimeId } = await context.params;
  return isOpenAICompatibleRuntimeId(runtimeId) ? runtimeId : null;
}

function invalidRuntime() {
  return NextResponse.json(
    { error: "runtimeId must be litellm or lmstudio" },
    { status: 404 }
  );
}

export async function GET(req: NextRequest, context: RouteContext) {
  const runtimeId = await runtime(context);
  if (!runtimeId) return invalidRuntime();
  try {
    const jobId = req.nextUrl.searchParams.get("downloadJobId")?.trim();
    if (jobId) {
      if (runtimeId !== "lmstudio") {
        return NextResponse.json(
          { phase: "acquisition", error: "LiteLLM does not download model artifacts" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        runtimeId,
        action: "download",
        ...(await getLMStudioModelDownloadStatus(jobId)),
      });
    }
    return NextResponse.json(
      await discoverOpenAICompatibleProviderModels(runtimeId)
    );
  } catch (error) {
    return NextResponse.json(
      {
        phase: "discovery",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const runtimeId = await runtime(context);
  if (!runtimeId) return invalidRuntime();
  if (runtimeId !== "lmstudio") {
    return NextResponse.json(
      { phase: "acquisition", error: "LiteLLM models are managed by the gateway administrator" },
      { status: 400 }
    );
  }
  const parsed = downloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        phase: "acquisition",
        error: parsed.error.issues[0]?.message ?? "Invalid download request",
      },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json({
      runtimeId,
      action: "download",
      model: parsed.data.model,
      ...(await startLMStudioModelDownload(
        parsed.data.model,
        parsed.data.quantization
      )),
    });
  } catch (error) {
    return NextResponse.json(
      {
        phase: "acquisition",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
