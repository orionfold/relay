import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AppPublishError,
  runDeployment,
  triggerAppPublish,
} from "@/lib/publishers/app-publish";

const triggerPublishSchema = z
  .object({
    targetId: z.string().min(1),
    artifactId: z.string().min(1).optional(),
    pageSlug: z.string().min(1).optional(),
  })
  .strict();

function errorResponse(err: unknown) {
  if (err instanceof AppPublishError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode }
    );
  }
  console.error("[apps/publish] POST error:", err);
  return NextResponse.json({ error: "Failed to start publish" }, { status: 500 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = triggerPublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = parsed.data.pageSlug
      ? triggerAppPublish(id, parsed.data.targetId, { pageSlug: parsed.data.pageSlug })
      : triggerAppPublish(id, parsed.data.targetId);
    runDeployment(result.deployment.id, parsed.data.artifactId).catch((err) => {
      console.error("[apps/publish] background deployment failed:", err);
    });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
