import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeHostLicense } from "@/lib/host/supervisor/__tests__/helpers";
import { GET, POST } from "../route";

// Exercise the last accepted release authority while a newer Cell candidate
// is being built; npm publication separately fails closed on version parity.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.44.9" }));

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "relay-host-deployment-api-"));
  vi.stubEnv("RELAY_HOST_ROOT", join(root, "host"));
  vi.stubEnv("RELAY_DATA_DIR", join(root, "data"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("Host deployment API", () => {
  it("returns a redacted no-store comparison view", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.license).toMatchObject({ status: "missing", code: "HOST_LICENSE_REQUIRED" });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/license\.json|secretRootRef|resourceRefs|providerToken|Bearer /);
  });

  it("rejects malformed and unknown mutation requests", async () => {
    const malformed = await POST(new Request("http://relay.test/api/host-deployment", {
      method: "POST",
      body: "not-json",
    }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ code: "HOST_DEPLOYMENT_REQUEST_INVALID" });

    const unknown = await POST(new Request("http://relay.test/api/host-deployment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "install", planDigest: `sha256:${"a".repeat(64)}`, providerToken: "secret" }),
    }));
    expect(unknown.status).toBe(400);
  });

  it("maps missing entitlement to a named forbidden response", async () => {
    const response = await POST(new Request("http://relay.test/api/host-deployment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "estimate" }),
    }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ code: "HOST_LICENSE_REQUIRED" });
    expect(body).not.toHaveProperty("details");
  });

  it("accepts a strict licensed draft without returning the envelope", async () => {
    writeHostLicense(join(root, "data", "licenses"));
    const response = await POST(new Request("http://relay.test/api/host-deployment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_draft",
        draft: {
          placement: "local",
          hostId: "relay-host",
          regionRef: "local",
          sizeRef: "basic-4gib-2vcpu",
          desiredCells: 1,
          exposure: "local",
          runtimeProfile: "byok_hosted",
          backupProfile: "manual_export",
          concurrency: "light",
        },
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.license).toMatchObject({ status: "active", licenseeRef: "org_northstar" });
    expect(JSON.stringify(body)).not.toContain("signature");
  });
});
