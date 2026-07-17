import { NextResponse } from "next/server";
import {
  InvalidRelayCellIdError,
  relayCellIdOverride,
} from "@/lib/config/env";
import { sqlite } from "@/lib/db";
import { relayCoreVersion } from "@/lib/packs/install";

export const dynamic = "force-dynamic";

export function GET() {
  let cellId: string;
  try {
    cellId = relayCellIdOverride() ?? "local";
  } catch (error) {
    if (!(error instanceof InvalidRelayCellIdError)) throw error;
    return NextResponse.json(
      { status: "not_ready", reason: error.code, contractVersion: 1 },
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
