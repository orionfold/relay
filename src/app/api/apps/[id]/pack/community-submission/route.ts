import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CommunityPackSubmissionError,
  prepareCommunityPackSubmission,
} from "@/lib/publishers/community-pack-submission";

const requestSchema = z.object({
  targetId: z.string().min(1),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

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
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(
      await prepareCommunityPackSubmission(id, parsed.data.targetId, parsed.data.expectedHash)
    );
  } catch (error) {
    if (error instanceof CommunityPackSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[apps/pack/community-submission] error:", error);
    return NextResponse.json({ error: "Community submission could not be prepared" }, { status: 500 });
  }
}
