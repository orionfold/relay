import { describe, expect, it } from "vitest";
import {
  classifyRoute,
  hasValidMutationOrigin,
  isPublicRoute,
  matchesRoutePrefix,
  stripRoutePrefix,
  type IngressConfig,
} from "../policy";

const config: IngressConfig = {
  profile: "remote-authenticated",
  cellId: "cell-a",
  publicOrigin: new URL("https://relay.example.test/cell-a"),
  routePrefix: "/cell-a",
};

describe("Host ingress route policy", () => {
  it("protects unknown and newly added routes by default", () => {
    expect(isPublicRoute("/api/future-sensitive-route")).toBe(false);
    expect(isPublicRoute("/projects")).toBe(false);
    expect(isPublicRoute("/api/health")).toBe(true);
    expect(isPublicRoute("/api/auth/login")).toBe(true);
    expect(isPublicRoute("/api/auth/sessions")).toBe(false);
    expect(isPublicRoute("/api/auth/events")).toBe(false);
  });

  it("binds one prefix to one Cell and rejects a sibling route", () => {
    expect(matchesRoutePrefix("/cell-a/projects", "/cell-a")).toBe(true);
    expect(stripRoutePrefix("/cell-a/projects", "/cell-a")).toBe("/projects");
    expect(
      classifyRoute({
        config,
        pathname: "/cell-b/projects",
        effectiveOrigin: "https://relay.example.test",
        headers: new Headers(),
      }),
    ).toMatchObject({ kind: "reject", code: "INGRESS_ROUTE_MISMATCH" });
  });

  it.each(["x-relay-cell-id", "x-relay-customer-id", "x-forwarded-user", "x-relay-session-id", "x-relay-client-hash"])(
    "rejects caller-supplied authority header %s",
    (name) => {
      expect(
        classifyRoute({
          config,
          pathname: "/cell-a/projects",
          effectiveOrigin: "https://relay.example.test",
          headers: new Headers({ [name]: "attacker-value" }),
        }),
      ).toMatchObject({ kind: "reject", code: "INGRESS_AUTHORITY_HEADER_SPOOF" });
    },
  );

  it("requires the configured origin for browser mutations", () => {
    expect(hasValidMutationOrigin("https://relay.example.test", config.publicOrigin!)).toBe(true);
    expect(hasValidMutationOrigin("https://evil.example", config.publicOrigin!)).toBe(false);
    expect(hasValidMutationOrigin(null, config.publicOrigin!)).toBe(false);
  });

  it("preserves trusted-local behavior without application sessions", () => {
    expect(
      classifyRoute({
        config: { ...config, profile: "trusted-local", publicOrigin: undefined, routePrefix: "/" },
        pathname: "/api/tasks",
        effectiveOrigin: "http://127.0.0.1:3000",
        headers: new Headers(),
      }),
    ).toEqual({ kind: "allow-local" });
  });
});
