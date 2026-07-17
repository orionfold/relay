import type { RelayExposureProfile } from "@/lib/config/env";

export const AUTH_COOKIE_NAME = "relay_session";
export const AUTH_PAGE_HEADER = "x-relay-auth-page";
export const SESSION_HEADER = "x-relay-session-id";
export const CELL_HEADER = "x-relay-cell-id";

export const PUBLIC_ROUTE_PREFIXES = [
  "/auth/",
  "/api/health",
  "/api/channels/inbound/slack",
  "/_next/",
] as const;

export const PUBLIC_AUTH_ROUTES = new Set([
  "/api/auth/status",
  "/api/auth/bootstrap",
  "/api/auth/login",
  "/api/auth/recovery",
  "/api/auth/logout",
]);

export const SPOOFABLE_AUTHORITY_HEADERS = [
  "x-relay-internal-auth",
  "x-relay-cell-id",
  "x-relay-customer-id",
  "x-relay-session-id",
  "x-relay-client-hash",
  "x-forwarded-user",
  "x-forwarded-email",
] as const;

export type IngressConfig = {
  profile: RelayExposureProfile;
  cellId: string;
  publicOrigin?: URL;
  routePrefix: string;
};

export type RouteDecision =
  | { kind: "allow-local" }
  | { kind: "allow-public" }
  | { kind: "require-session" }
  | { kind: "reject"; status: 400 | 403 | 404 | 503; code: string };

export function isPublicRoute(pathname: string): boolean {
  return (
    pathname === "/auth" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/apple-icon-") ||
    PUBLIC_AUTH_ROUTES.has(pathname) ||
    PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function isSignedWebhookRoute(pathname: string): boolean {
  return pathname === "/api/channels/inbound/slack";
}

export function classifyRoute(input: {
  config: IngressConfig;
  pathname: string;
  effectiveOrigin: string;
  headers: Headers;
}): RouteDecision {
  if (input.config.profile === "trusted-local") return { kind: "allow-local" };
  if (!input.config.publicOrigin) {
    return { kind: "reject", status: 503, code: "INGRESS_ORIGIN_REQUIRED" };
  }

  for (const name of SPOOFABLE_AUTHORITY_HEADERS) {
    if (input.headers.has(name)) {
      return { kind: "reject", status: 400, code: "INGRESS_AUTHORITY_HEADER_SPOOF" };
    }
  }

  if (normalizeOrigin(input.effectiveOrigin) !== normalizeOrigin(input.config.publicOrigin.origin)) {
    return { kind: "reject", status: 403, code: "INGRESS_ORIGIN_MISMATCH" };
  }

  if (!matchesRoutePrefix(input.pathname, input.config.routePrefix)) {
    return { kind: "reject", status: 404, code: "INGRESS_ROUTE_MISMATCH" };
  }

  return isPublicRoute(stripRoutePrefix(input.pathname, input.config.routePrefix))
    ? { kind: "allow-public" }
    : { kind: "require-session" };
}

export function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return prefix === "/" || pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function stripRoutePrefix(pathname: string, prefix: string): string {
  if (prefix === "/") return pathname;
  const stripped = pathname.slice(prefix.length);
  return stripped || "/";
}

export function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function hasValidMutationOrigin(origin: string | null, expectedOrigin: URL): boolean {
  if (!origin) return false;
  try {
    return normalizeOrigin(new URL(origin).origin) === normalizeOrigin(expectedOrigin.origin);
  } catch {
    return false;
  }
}

function normalizeOrigin(origin: string): string {
  return origin.toLowerCase().replace(/\/$/, "");
}
