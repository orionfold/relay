import { NextRequest, NextResponse } from "next/server";
import { getIngressConfig } from "@/lib/host-ingress/config";
import { AUTH_COOKIE_NAME } from "@/lib/host-ingress/policy";
import { authIsConfigured, validateSession } from "@/lib/host-ingress/store";

export async function GET(request: NextRequest) {
  const config = getIngressConfig();
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? validateSession(token) : null;
  return NextResponse.json({
    exposureProfile: config.profile,
    configured: authIsConfigured(),
    authenticated: Boolean(session),
    cellId: config.cellId,
    session: session
      ? { id: session.id, deviceName: session.deviceName, expiresAt: session.expiresAt }
      : null,
  });
}
