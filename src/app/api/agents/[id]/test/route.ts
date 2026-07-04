import { NextRequest, NextResponse } from "next/server";
import { runProfileTests } from "@/lib/agents/profiles/test-runner";
import { BudgetLimitExceededError } from "@/lib/settings/budget-guardrails";
import {
  DEFAULT_AGENT_RUNTIME,
  resolveAgentRuntime,
} from "@/lib/agents/runtime/catalog";
import { saveProfileTestReport } from "@/lib/data/profile-test-results";

/**
 * POST /api/agents/[id]/test
 *
 * Run behavioral smoke tests for a profile. Returns test results
 * with pass/fail per test case and keyword match details.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  let runtimeId = DEFAULT_AGENT_RUNTIME;

  try {
    runtimeId = resolveAgentRuntime(body?.runtimeId ?? DEFAULT_AGENT_RUNTIME);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  try {
    const report = await runProfileTests(id, runtimeId);
    if (!report.unsupported) {
      saveProfileTestReport(report);
    }
    return NextResponse.json(report);
  } catch (err: unknown) {
    if (err instanceof BudgetLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : "Test execution failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
