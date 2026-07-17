import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { relayCoreVersion } from "@/lib/packs/install";

export const dynamic = "force-dynamic";

const CELL_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

export function GET() {
  const cellId = process.env.RELAY_CELL_ID ?? "local";
  if (!CELL_ID_PATTERN.test(cellId)) {
    return NextResponse.json(
      { status: "not_ready", reason: "CELL_ID_INVALID", contractVersion: 1 },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    sqlite.prepare("SELECT 1 AS ready").get();
    return NextResponse.json(
      {
        status: "ready",
        cellId,
        relayVersion: relayCoreVersion(),
        schema: { contractVersion: 1, min: 1, max: 1 },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "not_ready", reason: "SQLITE_UNAVAILABLE", contractVersion: 1 },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
