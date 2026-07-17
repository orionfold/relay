import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listSessions, revokeSession } from "@/lib/host-ingress/store";
import { sessionIdFromRequest } from "@/lib/host-ingress/request";
import { authErrorResponse, jsonRequest } from "../_shared";

export async function GET(request: NextRequest) {
  const current = sessionIdFromRequest(request);
  return NextResponse.json({ sessions: listSessions(current) });
}

export async function DELETE(request: NextRequest) {
  try {
    const current = sessionIdFromRequest(request);
    if (!current) return NextResponse.json({ error: "AUTH_SESSION_REQUIRED" }, { status: 401 });
    const body = z.object({ sessionId: z.string().uuid() }).parse(await jsonRequest(request));
    const revoked = revokeSession(body.sessionId, current);
    return NextResponse.json({ ok: revoked });
  } catch (error) {
    return authErrorResponse(error);
  }
}
