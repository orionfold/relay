import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/packs/catalog", () => ({
  findPackTemplate: vi.fn(),
}));
vi.mock("@/lib/packs/install", () => ({
  installPack: vi.fn(),
}));

import { POST } from "../route";
import { findPackTemplate } from "@/lib/packs/catalog";
import { installPack } from "@/lib/packs/install";
import { PackValidationError } from "@/lib/packs/format";
import { PackLicenseError } from "@/lib/licensing/gate";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/packs/install", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const REPORT = {
  packId: "relay-agency",
  packVersion: "0.1.0",
  projectCreated: true,
  tablesCreated: 1,
  customersSeeded: 6,
  profilesDropped: 7,
  blueprintsDropped: 8,
  rowsSeeded: 12,
};

describe("POST /api/packs/install", () => {
  beforeEach(() => {
    vi.mocked(findPackTemplate).mockReset();
    vi.mocked(installPack).mockReset();
  });

  it("installs a bundled pack by id and returns the report", async () => {
    vi.mocked(findPackTemplate).mockReturnValue({
      id: "relay-agency",
      dir: "/pkg/src/lib/packs/templates/relay-agency",
    });
    vi.mocked(installPack).mockResolvedValue(REPORT);

    const res = await POST(makeRequest({ id: "relay-agency" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packId).toBe("relay-agency");
    expect(body.customersSeeded).toBe(6);
    // The route installs from the resolved template dir — bundled ids only.
    expect(installPack).toHaveBeenCalledWith(
      "/pkg/src/lib/packs/templates/relay-agency"
    );
  });

  it("400s with bad_request on malformed JSON", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("bad_request");
  });

  it("400s with validation_failed on a missing id", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("validation_failed");
  });

  it("404s with not_found for an id that is not a bundled template", async () => {
    vi.mocked(findPackTemplate).mockReturnValue(null);
    const res = await POST(makeRequest({ id: "no-such-pack" }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
    expect(installPack).not.toHaveBeenCalled();
  });

  it("402s with license_required when the entitlement gate refuses", async () => {
    vi.mocked(findPackTemplate).mockReturnValue({
      id: "premium-pack",
      dir: "/pkg/src/lib/packs/templates/premium-pack",
    });
    vi.mocked(installPack).mockRejectedValue(
      new PackLicenseError(
        'Pack "premium-pack" requires a license.',
        "missing_license"
      )
    );
    const res = await POST(makeRequest({ id: "premium-pack" }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("license_required");
    expect(body.error).toContain("requires a license");
  });

  it("422s with pack_invalid when the template fails validation at install", async () => {
    vi.mocked(findPackTemplate).mockReturnValue({
      id: "relay-agency",
      dir: "/pkg/src/lib/packs/templates/relay-agency",
    });
    vi.mocked(installPack).mockRejectedValue(
      new PackValidationError("pack.yaml failed schema validation")
    );
    const res = await POST(makeRequest({ id: "relay-agency" }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("pack_invalid");
  });

  it("500s with install_failed on an unexpected error", async () => {
    vi.mocked(findPackTemplate).mockReturnValue({
      id: "relay-agency",
      dir: "/pkg/src/lib/packs/templates/relay-agency",
    });
    vi.mocked(installPack).mockRejectedValue(new Error("disk on fire"));
    const res = await POST(makeRequest({ id: "relay-agency" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("install_failed");
    expect(body.error).toContain("disk on fire");
  });
});
