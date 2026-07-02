import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { signEnvelope } from "@/lib/licensing/__tests__/sign-helper";

/**
 * Exercises the routes against the REAL license store (temp RELAY_DATA_DIR),
 * not a mock — the store is the D7 canonical source and these routes are its
 * only web surface; mocking it would test nothing.
 */

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-license-api-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function makePayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: "orionfold.license/v1",
    license_id: "OF-RELAY-API-0001",
    product: "orionfold-relay",
    tier: "relay",
    issued_to: { email: "naya@example.com", name: "Naya Patel" },
    issued_at: "2026-07-01T00:00:00Z",
    not_before: "2026-07-01T00:00:00Z",
    expires_at: "2099-07-01T00:00:00Z",
    seats: 1,
    entitlements: ["product:orionfold-relay"],
    ...overrides,
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/license", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function loadCollectionRoute() {
  return import("../route");
}
async function loadItemRoute() {
  return import("../[id]/route");
}

describe("POST /api/license", () => {
  it("activates a valid envelope and returns the stored summary", async () => {
    const { POST } = await loadCollectionRoute();
    const res = await POST(postRequest({ envelope: signEnvelope(makePayload()) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.licenseId).toBe("OF-RELAY-API-0001");
    expect(body.valid).toBe(true);
    expect(body.issuedTo).toEqual({
      email: "naya@example.com",
      name: "Naya Patel",
    });
    // Persisted to the SAME store the CLI banner reads (D7).
    expect(
      fs.existsSync(
        path.join(dataDir, "licenses", "OF-RELAY-API-0001.license.json")
      )
    ).toBe(true);
  });

  it("422s with license_rejected on a tampered envelope", async () => {
    const { POST } = await loadCollectionRoute();
    const envelope = signEnvelope(makePayload());
    (envelope.payload as Record<string, unknown>).seats = 999;
    const res = await POST(postRequest({ envelope }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("license_rejected");
    expect(body.error).toBeTruthy();
  });

  it("400s with bad_request on malformed JSON", async () => {
    const { POST } = await loadCollectionRoute();
    const res = await POST(postRequest("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("bad_request");
  });

  it("400s with validation_failed when envelope is missing", async () => {
    const { POST } = await loadCollectionRoute();
    const res = await POST(postRequest({ nope: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("validation_failed");
  });
});

describe("GET /api/license", () => {
  it("lists persisted licenses re-verified at read time, never the signature", async () => {
    const { POST, GET } = await loadCollectionRoute();
    await POST(postRequest({ envelope: signEnvelope(makePayload()) }));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.licenses).toHaveLength(1);
    expect(body.licenses[0].licenseId).toBe("OF-RELAY-API-0001");
    expect(body.licenses[0].valid).toBe(true);
    expect(body.licenses[0].entitlements).toEqual(["product:orionfold-relay"]);
    expect(JSON.stringify(body)).not.toContain("signature");
  });

  it("returns an empty list on a fresh store", async () => {
    const { GET } = await loadCollectionRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).licenses).toEqual([]);
  });
});

describe("DELETE /api/license/[id]", () => {
  it("removes a persisted license (packs stay installed — D4)", async () => {
    const { POST } = await loadCollectionRoute();
    await POST(postRequest({ envelope: signEnvelope(makePayload()) }));

    const { DELETE } = await loadItemRoute();
    const res = await DELETE(
      new Request("http://localhost/api/license/OF-RELAY-API-0001", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "OF-RELAY-API-0001" }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).removed).toBe(true);
    expect(
      fs.existsSync(
        path.join(dataDir, "licenses", "OF-RELAY-API-0001.license.json")
      )
    ).toBe(false);
  });

  it("404s for an unknown license id", async () => {
    const { DELETE } = await loadItemRoute();
    const res = await DELETE(
      new Request("http://localhost/api/license/OF-RELAY-MISSING", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "OF-RELAY-MISSING" }) }
    );
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
  });
});
