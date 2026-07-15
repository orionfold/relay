import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_AGENT_RUNTIME,
  SUPPORTED_AGENT_RUNTIMES,
} from "@/lib/agents/runtime/catalog";
import { getRuntimeSummary, testRuntimeConnection } from "@/lib/agents/runtime";

const runtimeTestRequestSchema = z.object({
  runtime: z.enum(SUPPORTED_AGENT_RUNTIMES).optional(),
}).strict();

export async function POST(req: Request) {
  let body: unknown = {};
  const rawBody = await req.text();
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { connected: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
  }
  const parsed = runtimeTestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { connected: false, error: "Invalid runtime test request" },
      { status: 400 }
    );
  }

  try {
    const runtimeId = parsed.data.runtime ?? DEFAULT_AGENT_RUNTIME;
    const result = await testRuntimeConnection(runtimeId);
    const summary = getRuntimeSummary(runtimeId);
    return NextResponse.json({
      ...result,
      runtime: summary.runtime.id,
      capabilities: summary.capabilities,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { connected: false, error: message },
      { status: 200 } // 200 so the client can read the error
    );
  }
}
