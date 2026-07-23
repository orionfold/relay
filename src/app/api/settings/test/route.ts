import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_AGENT_RUNTIME,
  SUPPORTED_AGENT_RUNTIMES,
} from "@/lib/agents/runtime/catalog";
import { getRuntimeSummary, testRuntimeConnection } from "@/lib/agents/runtime";
import { getRuntimeSetupStates } from "@/lib/settings/runtime-setup";
import {
  classifyRuntimeReadiness,
  recordRuntimeReadiness,
} from "@/lib/settings/runtime-readiness";
import { sanitizeProviderError } from "@/lib/agents/runtime/provider-endpoint";

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
    const setup = (await getRuntimeSetupStates())[runtimeId];
    const readiness = classifyRuntimeReadiness({
      connected: result.connected,
      error: result.error ? sanitizeProviderError(result.error) : null,
      credentialSource: setup.apiKeySource,
    });
    await recordRuntimeReadiness(runtimeId, readiness);
    const { clearRuntimeRoutingStatusCache } = await import(
      "@/lib/settings/runtime-routing-status"
    );
    clearRuntimeRoutingStatusCache();
    return NextResponse.json({
      ...result,
      runtime: summary.runtime.id,
      capabilities: summary.capabilities,
      readiness,
    });
  } catch (error: unknown) {
    const runtimeId = parsed.data.runtime ?? DEFAULT_AGENT_RUNTIME;
    const message = sanitizeProviderError(
      error instanceof Error ? error.message : String(error),
    );
    const setup = (await getRuntimeSetupStates().catch(() => null))?.[runtimeId];
    const readiness = classifyRuntimeReadiness({
      connected: false,
      error: message,
      credentialSource: setup?.apiKeySource ?? "unknown",
    });
    await recordRuntimeReadiness(runtimeId, readiness).catch(() => undefined);
    const { clearRuntimeRoutingStatusCache } = await import(
      "@/lib/settings/runtime-routing-status"
    );
    clearRuntimeRoutingStatusCache();

    return NextResponse.json(
      { connected: false, error: message, readiness },
      { status: 200 } // 200 so the client can read the error
    );
  }
}
