import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/host-ingress/policy";
import { clearSessionCookie } from "@/lib/host-ingress/cookies";
import { revokeSession, validateSession } from "@/lib/host-ingress/store";
import { sessionCookieIsSecure } from "@/lib/host-ingress/request";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? validateSession(token) : null;
  if (session) revokeSession(session.id, session.id);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response, sessionCookieIsSecure());
  return response;
}
