import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { completeBootstrap, createBootstrapToken } from "../store";

describe("Host ingress proxy", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-proxy-test-"));
    process.env.RELAY_DATA_DIR = dir;
    process.env.RELAY_EXPOSURE_PROFILE = "private-authenticated";
    process.env.RELAY_PUBLIC_ORIGIN = "http://relay.test";
    process.env.RELAY_ROUTE_PREFIX = "/";
    process.env.RELAY_CELL_ID = "cell-a";
    process.env.RELAY_INTERNAL_AUTH_TOKEN = "internal-secret";
  });

  afterEach(() => {
    for (const key of [
      "RELAY_DATA_DIR",
      "RELAY_EXPOSURE_PROFILE",
      "RELAY_PUBLIC_ORIGIN",
      "RELAY_ROUTE_PREFIX",
      "RELAY_CELL_ID",
      "RELAY_INTERNAL_AUTH_TOKEN",
      "RELAY_INGRESS_TOKEN",
    ]) delete process.env[key];
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects unauthenticated APIs and redirects unauthenticated pages", async () => {
    const api = proxy(new NextRequest("http://relay.test/api/tasks"));
    expect(api.status).toBe(401);
    await expect(api.json()).resolves.toMatchObject({ error: "AUTH_SESSION_REQUIRED" });

    const page = proxy(new NextRequest("http://relay.test/projects"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://relay.test/auth/login");
  });

  it("does not infer public access from a protected route's file extension", async () => {
    const response = proxy(new NextRequest("http://relay.test/api/uploads/private.png"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "AUTH_SESSION_REQUIRED" });
  });

  it("enforces exact Origin on auth and authenticated mutations", async () => {
    const missing = proxy(new NextRequest("http://relay.test/api/auth/login", { method: "POST" }));
    expect(missing.status).toBe(403);
    await expect(missing.json()).resolves.toMatchObject({ error: "CSRF_ORIGIN_MISMATCH" });

    const accepted = proxy(new NextRequest("http://relay.test/api/auth/login", {
      method: "POST",
      headers: { origin: "http://relay.test" },
    }));
    expect(accepted.status).toBe(200);
  });

  it("accepts a live session and rejects it after expiry", () => {
    const now = Date.now();
    const bootstrap = createBootstrapToken(now);
    const session = completeBootstrap({
      token: bootstrap.token,
      password: "a sufficiently long password",
      deviceName: "Browser",
      rateKey: "proxy:bootstrap",
      now,
    });
    const accepted = proxy(new NextRequest("http://relay.test/api/tasks", {
      headers: { cookie: `relay_session=${session.token}` },
    }));
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("x-middleware-request-x-relay-session-id")).toBe(session.session.id);
  });

  it("rejects Cell-header spoofing before session evaluation", async () => {
    const response = proxy(new NextRequest("http://relay.test/api/health/live", {
      headers: { "x-relay-cell-id": "cell-b" },
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INGRESS_AUTHORITY_HEADER_SPOOF" });
  });

  it("allows authenticated server-to-self calls only on loopback", () => {
    const accepted = proxy(new NextRequest("http://127.0.0.1:3000/api/tasks", {
      method: "POST",
      headers: { "x-relay-internal-auth": "internal-secret" },
    }));
    expect(accepted.status).toBe(200);

    const rejected = proxy(new NextRequest("http://relay.test/api/tasks", {
      method: "POST",
      headers: { "x-relay-internal-auth": "internal-secret" },
    }));
    expect(rejected.status).toBe(400);
  });

  it("accepts configured TLS ingress routing and refuses the wrong Host", () => {
    process.env.RELAY_EXPOSURE_PROFILE = "remote-authenticated";
    process.env.RELAY_PUBLIC_ORIGIN = "https://relay.example.test";
    process.env.RELAY_INGRESS_TOKEN = "ingress-secret";
    const accepted = proxy(new NextRequest("http://127.0.0.1:3000/api/health/ready", {
      headers: {
        "x-relay-ingress-token": "ingress-secret",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "relay.example.test",
      },
    }));
    expect(accepted.status).toBe(200);

    const rejected = proxy(new NextRequest("http://wrong.example.test/api/health/ready"));
    expect(rejected.status).toBe(403);
  });

  it("requires the configured ingress credential on every remote request", async () => {
    process.env.RELAY_EXPOSURE_PROFILE = "remote-authenticated";
    process.env.RELAY_PUBLIC_ORIGIN = "https://relay.example.test";
    process.env.RELAY_INGRESS_TOKEN = "ingress-secret";
    const response = proxy(new NextRequest("https://relay.example.test/api/health/live"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "INGRESS_AUTH_REQUIRED" });
  });

  it("accepts only the configured prefix asserted by authenticated ingress", async () => {
    process.env.RELAY_EXPOSURE_PROFILE = "remote-authenticated";
    process.env.RELAY_PUBLIC_ORIGIN = "https://relay.example.test/cells/cell-a";
    process.env.RELAY_ROUTE_PREFIX = "/cells/cell-a";
    process.env.RELAY_INGRESS_TOKEN = "ingress-secret";
    const headers = {
      "x-relay-ingress-token": "ingress-secret",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "relay.example.test",
      "x-forwarded-prefix": "/cells/cell-a",
    };

    const accepted = proxy(new NextRequest("http://127.0.0.1:3000/api/health/ready", { headers }));
    expect(accepted.status).toBe(200);

    const rejected = proxy(new NextRequest("http://127.0.0.1:3000/api/health/ready", {
      headers: { ...headers, "x-forwarded-prefix": "/cells/cell-b" },
    }));
    expect(rejected.status).toBe(404);
    await expect(rejected.json()).resolves.toMatchObject({ error: "INGRESS_ROUTE_MISMATCH" });
  });

  it("ignores and strips forwarding metadata from an unauthenticated caller", () => {
    const response = proxy(new NextRequest("http://relay.test/api/health/live", {
      headers: { "x-forwarded-host": "relay.test" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-forwarded-host")).toBeNull();
  });
});
