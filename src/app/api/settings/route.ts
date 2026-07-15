import { NextRequest, NextResponse } from "next/server";
import { getAuthSettings, setAuthSettings } from "@/lib/settings/auth";
import { updateAuthSettingsSchema } from "@/lib/validators/settings";

export async function GET() {
  const settings = await getAuthSettings();
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = updateAuthSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await setAuthSettings(parsed.data);
  const { clearRuntimeRoutingStatusCache } = await import(
    "@/lib/settings/runtime-routing-status"
  );
  clearRuntimeRoutingStatusCache();
  const updated = await getAuthSettings();
  return NextResponse.json(updated);
}
