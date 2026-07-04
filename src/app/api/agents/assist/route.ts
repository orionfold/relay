import { NextRequest, NextResponse } from "next/server";
import { runProfileAssistWithRuntime } from "@/lib/agents/runtime";
import { BudgetLimitExceededError } from "@/lib/settings/budget-guardrails";
import type { ProfileAssistRequest } from "@/lib/agents/runtime/profile-assist-types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<ProfileAssistRequest>;

  if (!body.goal?.trim()) {
    return NextResponse.json(
      { error: "Provide a goal description" },
      { status: 400 }
    );
  }

  const input: ProfileAssistRequest = {
    goal: body.goal.trim(),
    domain: body.domain,
    mode: body.mode ?? "generate",
    existingSkillMd: body.existingSkillMd,
    existingTags: body.existingTags,
  };

  try {
    const result = await runProfileAssistWithRuntime(input);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BudgetLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    const message =
      error instanceof Error ? error.message : "Profile assist failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
