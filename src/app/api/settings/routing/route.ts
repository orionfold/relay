import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRoutingSettings, setRoutingSettings } from "@/lib/settings/routing";
import { SUPPORTED_AGENT_RUNTIMES } from "@/lib/agents/runtime/catalog";
import { ROUTING_POLICY_VERSION } from "@/lib/settings/routing-policy";

const routingSettingsSchema = z
  .object({
    preference: z.enum(["cost", "latency", "quality", "manual"]),
    policy: z
      .object({
        version: z.literal(ROUTING_POLICY_VERSION),
        eligibleRuntimeIds: z
          .array(z.enum(SUPPORTED_AGENT_RUNTIMES))
          .max(SUPPORTED_AGENT_RUNTIMES.length)
          .refine((ids) => new Set(ids).size === ids.length, {
            message: "eligibleRuntimeIds must not contain duplicates",
          }),
        manualDefaultRuntimeId: z.enum(SUPPORTED_AGENT_RUNTIMES),
        automaticFallback: z.boolean(),
      })
      .strict(),
  })
  .strict();

export async function GET() {
  return NextResponse.json(await getRoutingSettings());
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = routingSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid routing settings" },
      { status: 400 },
    );
  }

  try {
    await setRoutingSettings(parsed.data);
    return NextResponse.json(await getRoutingSettings());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save routing settings" },
      { status: 500 },
    );
  }
}

// Compatibility for the existing Settings client while G-077 lands. The
// payload contract is intentionally identical; preference-only writes are no
// longer accepted because they would silently discard pool edits.
export const POST = PUT;
