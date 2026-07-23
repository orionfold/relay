import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { signEnvelope } from "@/lib/licensing/__tests__/sign-helper";

/**
 * Exercises the identity route's two contract-level shadow-path rules against
 * real dependencies (temp RELAY_DATA_DIR for the license store), mocking only
 * the two leaves that can't be driven by data in-test:
 *   - relayCoreVersion()   → to force the "0.0.0" build-fallback (rule 1)
 *   - the runtime/model resolution → so no real auth is required
 */

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-identity-api-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
  vi.stubEnv("RELAY_HOST_ROOT", path.join(dataDir, "host"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/packs/install");
  vi.doUnmock("@/lib/settings/runtime-routing-status");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function mockVersion(version: string) {
  vi.doMock("@/lib/packs/install", () => ({
    relayCoreVersion: () => version,
  }));
}

function mockActiveModel(modelId: string | null, throwInResolve = false) {
  vi.doMock("@/lib/settings/runtime-routing-status", () => ({
    getRuntimeRoutingStatuses: async () => {
      if (throwInResolve) throw new Error("no model configured");
      return modelId
        ? [{ runtimeId: "claude-code", ready: true, modelId }]
        : [];
    },
    pickReadyRuntime: (
      statuses: Array<{ ready: boolean; modelId: string | null }>,
    ) => statuses.find((status) => status.ready) ?? null,
  }));
}

function makePayload(
  overrides: Record<string, unknown> = {},
  issuedTo: Record<string, unknown> = { email: "naya@example.com", name: "Naya Patel" },
): Record<string, unknown> {
  return {
    schema: "orionfold.license/v1",
    license_id: "OF-RELAY-ID-0001",
    product: "orionfold-relay",
    tier: "relay",
    issued_to: issuedTo,
    issued_at: "2026-07-01T00:00:00Z",
    not_before: "2026-07-01T00:00:00Z",
    expires_at: "2099-07-01T00:00:00Z",
    seats: 1,
    entitlements: ["product:orionfold-relay"],
    ...overrides,
  };
}

/** Persist a valid license into the temp store the route will read. */
async function activateLicense(issuedTo: Record<string, unknown>) {
  const { POST } = await import("@/app/api/license/route");
  const res = await POST(
    new Request("http://localhost/api/license", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        envelope: signEnvelope(makePayload({}, issuedTo)),
      }),
    }),
  );
  expect(res.status).toBe(200);
}

describe("GET /api/instance/identity — version shadow path (rule 1)", () => {
  it("surfaces a valid version as-is", async () => {
    mockVersion("0.28.0");
    mockActiveModel("claude-opus-4-8");
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.version).toBe("0.28.0");
  });

  it("maps the 0.0.0 build-fallback to null, never the wrong string", async () => {
    mockVersion("0.0.0");
    mockActiveModel("claude-opus-4-8");
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.version).toBeNull();
  });

  it("maps a non-semver value to null", async () => {
    mockVersion("not-a-version");
    mockActiveModel("claude-opus-4-8");
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.version).toBeNull();
  });
});

describe("GET /api/instance/identity — licenseTag union (rule 2)", () => {
  it("fails open to community on a fresh store", async () => {
    mockVersion("0.28.0");
    mockActiveModel("claude-opus-4-8");
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.licenseTag).toEqual({ kind: "community" });
    expect(body.orientation).toMatchObject({
      edition: "community",
      license: { lifecycle: "none", licensee: null },
      entitlements: { packs: false, host: false },
      packs: { agency: "available" },
    });
  });

  it("returns a licensed tag using org→name→email precedence", async () => {
    mockVersion("0.28.0");
    mockActiveModel("claude-opus-4-8");
    await activateLicense({
      email: "naya@example.com",
      name: "Naya Patel",
      org: "Acme Corp",
    });
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.licenseTag).toEqual({ kind: "licensed", label: "Acme Corp" });
    expect(body.orientation).toMatchObject({
      edition: "licensed",
      license: { licensee: "Acme Corp" },
      entitlements: { packs: true, host: false },
      entitlementLabel: "Premium Packs",
    });
  });

  it("falls back to the name when no org, never a dangling label", async () => {
    mockVersion("0.28.0");
    mockActiveModel("claude-opus-4-8");
    await activateLicense({ email: "naya@example.com", name: "Naya Patel" });
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.licenseTag).toEqual({ kind: "licensed", label: "Naya Patel" });
  });
});

describe("GET /api/instance/identity — activeModel shadow path", () => {
  it("returns the resolved model id", async () => {
    mockVersion("0.28.0");
    mockActiveModel("claude-opus-4-8");
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.activeModel).toBe("claude-opus-4-8");
  });

  it("returns null (never crashes) when model resolution throws", async () => {
    mockVersion("0.28.0");
    mockActiveModel(null, true);
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).activeModel).toBeNull();
  });
});
