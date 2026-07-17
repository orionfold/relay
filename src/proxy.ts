import { NextRequest, NextResponse } from "next/server";
import { getIngressConfig, RelayIngressConfigError } from "@/lib/host-ingress/config";
import {
  AUTH_COOKIE_NAME,
  AUTH_PAGE_HEADER,
  CELL_HEADER,
  SESSION_HEADER,
  classifyRoute,
  hasValidMutationOrigin,
  isUnsafeMethod,
  isSignedWebhookRoute,
  stripRoutePrefix,
} from "@/lib/host-ingress/policy";
import { hashOpaqueSecret, secureEqual } from "@/lib/host-ingress/credentials";
import { validateSession } from "@/lib/host-ingress/store";

export function proxy(request: NextRequest) {
  let config;
  try {
    config = getIngressConfig();
  } catch (error) {
    const message = error instanceof RelayIngressConfigError ? error.message : "Relay ingress configuration is invalid.";
    return reject(request, 503, "INGRESS_CONFIG_INVALID", message);
  }

  if (config.profile === "trusted-local") return NextResponse.next();

  const internalToken = request.headers.get("x-relay-internal-auth");
  const expectedInternalToken = process.env.RELAY_INTERNAL_AUTH_TOKEN;
  if (
    internalToken &&
    expectedInternalToken &&
    secureEqual(internalToken, expectedInternalToken) &&
    isLoopbackHostname(request.nextUrl.hostname)
  ) {
    const headers = new Headers(request.headers);
    headers.delete("x-relay-internal-auth");
    headers.set(CELL_HEADER, config.cellId);
    return securityHeaders(NextResponse.next({ request: { headers } }));
  }

  const ingressAuthenticated = hasAuthenticatedIngress(request);
  if (config.profile === "remote-authenticated" && !ingressAuthenticated) {
    return reject(request, 403, "INGRESS_AUTH_REQUIRED");
  }
  const forwardedPrefix = ingressAuthenticated ? request.headers.get("x-forwarded-prefix") : null;
  if (forwardedPrefix && forwardedPrefix !== config.routePrefix) {
    return reject(request, 404, "INGRESS_ROUTE_MISMATCH");
  }
  const externalPathname = forwardedPrefix
    ? `${forwardedPrefix}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`
    : request.nextUrl.pathname;

  const effectiveOrigin = resolveEffectiveOrigin(request, ingressAuthenticated);
  const decision = classifyRoute({
    config,
    pathname: externalPathname,
    effectiveOrigin,
    headers: request.headers,
  });
  if (decision.kind === "reject") return reject(request, decision.status, decision.code);
  if (decision.kind === "allow-local") return NextResponse.next();

  if (
    isUnsafeMethod(request.method) &&
    config.publicOrigin &&
    !isSignedWebhookRoute(stripRoutePrefix(externalPathname, config.routePrefix))
  ) {
    if (!hasValidMutationOrigin(request.headers.get("origin"), config.publicOrigin)) {
      return reject(request, 403, "CSRF_ORIGIN_MISMATCH");
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-relay-ingress-token");
  requestHeaders.delete("x-forwarded-user");
  requestHeaders.delete("x-forwarded-email");
  requestHeaders.delete("x-forwarded-host");
  requestHeaders.delete("x-forwarded-prefix");
  requestHeaders.delete("x-forwarded-proto");
  const forwardedFor = ingressAuthenticated ? request.headers.get("x-forwarded-for") : null;
  requestHeaders.delete("x-forwarded-for");
  requestHeaders.delete("x-real-ip");
  if (forwardedFor) {
    const firstAddress = forwardedFor.split(",", 1)[0].trim().slice(0, 128);
    requestHeaders.set("x-relay-client-hash", hashOpaqueSecret(`ip:${firstAddress}`).slice(0, 24));
  }
  requestHeaders.set(CELL_HEADER, config.cellId);
  const strippedPath = forwardedPrefix
    ? request.nextUrl.pathname
    : stripRoutePrefix(request.nextUrl.pathname, config.routePrefix);
  if (strippedPath.startsWith("/auth/")) requestHeaders.set(AUTH_PAGE_HEADER, "true");

  if (decision.kind === "require-session") {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? validateSession(token) : null;
    if (!session) {
      if (strippedPath.startsWith("/api/")) {
        return reject(request, 401, token ? "AUTH_SESSION_INVALID" : "AUTH_SESSION_REQUIRED");
      }
      const login = new URL(`${config.routePrefix === "/" ? "" : config.routePrefix}/auth/login`, config.publicOrigin);
      return securityHeaders(NextResponse.redirect(login));
    }
    requestHeaders.set(SESSION_HEADER, session.id);
  }

  const response = config.routePrefix === "/" || forwardedPrefix
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.rewrite(new URL(`${strippedPath}${request.nextUrl.search}`, request.url), {
        request: { headers: requestHeaders },
      });
  return securityHeaders(response);
}

function hasAuthenticatedIngress(request: NextRequest): boolean {
  const received = request.headers.get("x-relay-ingress-token");
  const expected = process.env.RELAY_INGRESS_TOKEN;
  return Boolean(received && expected && secureEqual(received, expected));
}

function resolveEffectiveOrigin(request: NextRequest, ingressAuthenticated: boolean): string {
  if (ingressAuthenticated) {
    const proto = request.headers.get("x-forwarded-proto");
    const host = request.headers.get("x-forwarded-host");
    if (proto && host) return `${proto}://${host}`;
  }
  // Next dev may normalize nextUrl.host to its configured server default.
  // The received Host header is the direct-request authority and is already
  // compared against the operator-configured origin before any app handler.
  const host = request.headers.get("host");
  return host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function reject(request: NextRequest, status: number, code: string, detail?: string) {
  const isApi = request.nextUrl.pathname.includes("/api/");
  const response = isApi
    ? NextResponse.json({ error: code, detail }, { status })
    : new NextResponse(
        `<!doctype html><title>Relay access refused</title><main><h1>Relay access refused</h1><p>${code}</p></main>`,
        { status, headers: { "content-type": "text/html; charset=utf-8" } },
      );
  return securityHeaders(response);
}

function securityHeaders(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = {
  // Only immutable framework assets bypass the access boundary. A blanket
  // extension exemption would also expose protected upload routes such as
  // /api/uploads/private.png.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
