import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/agents/profiles/registry";
import { resolveProfileRuntimePayload } from "@/lib/agents/profiles/compatibility";
import { runSingleProfileTest } from "@/lib/agents/runtime/claude";
import { BudgetLimitExceededError } from "@/lib/settings/budget-guardrails";
import { enforceBudgetGuardrails } from "@/lib/settings/budget-guardrails";
import {
  DEFAULT_AGENT_RUNTIME,
  resolveAgentRuntime,
} from "@/lib/agents/runtime/catalog";

/**
 * POST /api/agents/[id]/test-single
 *
 * Run a single profile test by index. Used by the client to get
 * real-time progress during test execution.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const testIndex = typeof body?.testIndex === "number" ? body.testIndex : -1;

  let runtimeId = DEFAULT_AGENT_RUNTIME;
  try {
    runtimeId = resolveAgentRuntime(body?.runtimeId ?? DEFAULT_AGENT_RUNTIME);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  const profile = getProfile(id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const payload = resolveProfileRuntimePayload(profile, runtimeId);
  if (!payload.supported || !payload.tests || testIndex < 0 || testIndex >= payload.tests.length) {
    return NextResponse.json(
      { error: "Invalid test index or unsupported runtime" },
      { status: 400 }
    );
  }

  try {
    await enforceBudgetGuardrails({
      runtimeId,
      activityType: "profile_test",
    });

    const result = await runSingleProfileTest(id, payload.tests[testIndex]);
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof BudgetLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : "Test execution failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
