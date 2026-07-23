import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadCustomerOrientation } = vi.hoisted(() => ({
  loadCustomerOrientation: vi.fn(),
}));

vi.mock("@/lib/onboarding/load-orientation", () => ({
  loadCustomerOrientation,
}));

import { GET } from "../route";

describe("GET /api/onboarding/orientation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the assembled presentation contract", async () => {
    loadCustomerOrientation.mockReturnValue({
      edition: "community",
      license: {
        lifecycle: "none",
        licensee: null,
        detail: "Community Edition is active.",
        expiresAt: null,
      },
      entitlements: { packs: false, host: false },
      packs: { premium: "locked", agency: "available", readError: null },
      host: { state: "preview", managedCellsLimit: null, detail: "Optional." },
      headline: "Start",
      description: "Start here.",
      entitlementLabel: "Community Edition",
      primaryAction: {
        kind: "install_pack",
        label: "Install free Relay Agency",
        packId: "relay-agency",
        packName: "Relay Agency",
      },
      secondaryActions: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      edition: "community",
      packs: { agency: "available" },
    });
  });

  it("returns a named error when assembly unexpectedly fails", async () => {
    loadCustomerOrientation.mockImplementation(() => {
      throw new Error("unexpected resolver fault");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "CUSTOMER_ORIENTATION_READ_FAILED",
      error: "Relay could not assemble the current onboarding state.",
    });
  });
});
