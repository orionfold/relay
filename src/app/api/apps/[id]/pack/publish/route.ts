import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  PackPublishError,
  runPackDeployment,
  triggerPackPublish,
} from "@/lib/publishers/pack-publish";

const requestSchema = z
  .object({
    targetId: z.string().min(1),
    confirm: z.literal(true),
    includeSampleData: z.boolean().default(false),
    author: z.string().min(1).max(120).optional(),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

function errorResponse(error: unknown) {
  if (error instanceof PackPublishError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error("[apps/pack/publish] route error:", error);
  return NextResponse.json({ error: "Pack publish failed to start" }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = triggerPackPublish(id, parsed.data.targetId, parsed.data);
    runPackDeployment(result.deployment.id).catch((error) => {
      console.error("[apps/pack/publish] background deployment failed:", error);
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
