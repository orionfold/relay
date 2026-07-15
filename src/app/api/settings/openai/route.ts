import { NextRequest, NextResponse } from "next/server";
import {
  getOpenAIAuthSettings,
  setOpenAIAuthSettings,
} from "@/lib/settings/openai-auth";
import { readCodexAuthState } from "@/lib/agents/runtime/openai-codex-auth";
import { updateOpenAISettingsSchema } from "@/lib/validators/settings";

export async function GET() {
  const settings = await getOpenAIAuthSettings();
  if (settings.method !== "oauth") {
    return NextResponse.json(settings);
  }

  try {
    const current = await readCodexAuthState({ refreshToken: true });
    return NextResponse.json({
      ...settings,
      oauthConnected: current.connected,
      account: current.account,
      rateLimits: current.rateLimits,
    });
  } catch {
    return NextResponse.json({
      ...settings,
      oauthConnected: false,
      account: null,
      rateLimits: null,
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = updateOpenAISettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await setOpenAIAuthSettings(parsed.data);
  const { clearRuntimeRoutingStatusCache } = await import(
    "@/lib/settings/runtime-routing-status"
  );
  clearRuntimeRoutingStatusCache();
  const updated = await getOpenAIAuthSettings();
  return NextResponse.json(updated);
}
