import { NextResponse } from "next/server";
import {
  DashboardPreferencesSchema,
  getDashboardPreferences,
  resetDashboardPreferences,
  setDashboardPreferences,
} from "@/lib/settings/dashboard";

export async function GET() {
  return NextResponse.json(await getDashboardPreferences());
}

export async function POST(req: Request) {
  const parsed = DashboardPreferencesSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid dashboard preferences",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }
  return NextResponse.json(await setDashboardPreferences(parsed.data));
}

export async function DELETE() {
  return NextResponse.json(await resetDashboardPreferences());
}
