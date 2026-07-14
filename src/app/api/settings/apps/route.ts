import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { getSetting, setSetting } from "@/lib/settings/helpers";

const AppsSettingsSchema = z.object({
  showInferenceDiagnostics: z.boolean(),
}).strict();

async function readAppsSettings() {
  return {
    showInferenceDiagnostics:
      (await getSetting(SETTINGS_KEYS.APPS_SHOW_INFERENCE_DIAGNOSTICS)) === "true",
  };
}

export async function GET() {
  return NextResponse.json(await readAppsSettings());
}

export async function POST(req: NextRequest) {
  const parsed = AppsSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid app diagnostics setting", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await setSetting(
    SETTINGS_KEYS.APPS_SHOW_INFERENCE_DIAGNOSTICS,
    parsed.data.showInferenceDiagnostics ? "true" : "false",
  );
  return NextResponse.json(await readAppsSettings());
}
