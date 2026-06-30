import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "api-customers-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function loadRoute() {
  // Import after the env stub so the DB resolves to the tempdir.
  return import("../route");
}

function postReq(body: unknown) {
  return new Request("http://localhost/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // NextRequest is structurally compatible with Request for these handlers.
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/customers", () => {
  it("creates a customer (201) then is idempotent on slug (200, no duplicate)", async () => {
    const { POST, GET } = await loadRoute();

    const first = await POST(postReq({ name: "Meridian CRE", slug: "meridian-cre" }));
    expect(first.status).toBe(201);

    const second = await POST(postReq({ name: "Meridian CRE (again)", slug: "meridian-cre" }));
    expect(second.status).toBe(200);

    const listRes = await GET();
    const list = (await listRes.json()) as Array<{ slug: string; name: string }>;
    const meridian = list.filter((c) => c.slug === "meridian-cre");
    expect(meridian).toHaveLength(1);
    expect(meridian[0].name).toBe("Meridian CRE"); // not overwritten
  });

  it("rejects an invalid body with 400", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq({ name: "" }));
    expect(res.status).toBe(400);
  });
});
