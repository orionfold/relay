import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { suggestRuntime } from "@/lib/agents/router";
import { getRoutingSettings } from "@/lib/settings/routing";
import { getRuntimeSetupStates } from "@/lib/settings/runtime-setup";
import { listConfiguredRuntimeIds } from "@/lib/settings/runtime-setup";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import { getComparableRuntimeCost } from "@/lib/settings/runtime-routing-evidence";

const suggestionRequestSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    profileId: z.string().nullable().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const parsed = suggestionRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A non-empty title and valid suggestion payload are required" },
      { status: 400 },
    );
  }
  const { title, description, profileId } = parsed.data;

  const routing = await getRoutingSettings();
  if (routing.preference === "manual") {
    return NextResponse.json({
      runtimeId: routing.policy.manualDefaultRuntimeId,
      orderedRuntimeIds: [routing.policy.manualDefaultRuntimeId],
      reason: "Manual routing uses the strict default runtime",
      evidence: "pool-order",
      advisory: true,
    });
  }
  const runtimeStates = await getRuntimeSetupStates();
  const configuredRuntimeIds = listConfiguredRuntimeIds(
    runtimeStates,
  ) as AgentRuntimeId[];
  const availableRuntimeIds = routing.policy.eligibleRuntimeIds.filter(
    (runtimeId) => configuredRuntimeIds.includes(runtimeId),
  );
  if (availableRuntimeIds.length === 0) {
    return NextResponse.json(
      { error: "No configured runtime is currently eligible for automatic routing" },
      { status: 409 },
    );
  }
  const candidates = await Promise.all(
    availableRuntimeIds.map(async (runtimeId) => ({
      runtimeId,
      comparableCostPerMillionMicros: await getComparableRuntimeCost({
        runtimeId,
      }),
    })),
  );

  const suggestion = suggestRuntime(
    title,
    description,
    profileId,
    candidates,
    routing.preference,
  );

  return NextResponse.json({ ...suggestion, advisory: true });
}
