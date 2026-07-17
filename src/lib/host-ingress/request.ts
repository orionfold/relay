import type { NextRequest } from "next/server";
import { hashOpaqueSecret } from "./credentials";
import { getIngressConfig } from "./config";

export function requestClientHash(request: NextRequest): string {
  const trustedProxyHash = request.headers.get("x-relay-client-hash");
  if (trustedProxyHash) return trustedProxyHash;
  const userAgent = request.headers.get("user-agent") || "unknown";
  const language = request.headers.get("accept-language") || "unknown";
  return hashOpaqueSecret(`${userAgent}\n${language}`).slice(0, 24);
}

export function requestRateKey(request: NextRequest): string {
  return `auth:${requestClientHash(request)}`;
}

export function sessionCookieIsSecure(): boolean {
  return getIngressConfig().publicOrigin?.protocol === "https:";
}

export function sessionIdFromRequest(request: NextRequest): string | undefined {
  return request.headers.get("x-relay-session-id") || undefined;
}
