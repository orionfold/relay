import { NextRequest, NextResponse } from "next/server";
import { listAuthEvents } from "@/lib/host-ingress/store";

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit") || "50");
  return NextResponse.json({ events: listAuthEvents(Number.isFinite(limit) ? limit : 50) });
}
