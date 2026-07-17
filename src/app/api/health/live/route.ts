import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "live", contractVersion: 1 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
