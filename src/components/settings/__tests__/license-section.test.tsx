// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LicenseSection } from "../license-section";
import { resolveCustomerOrientation } from "@/lib/onboarding/orientation";
import type { StoredLicenseInfo } from "@/lib/licensing/store";
import { INSTANCE_IDENTITY_CHANGED_EVENT } from "@/lib/onboarding/events";

const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("sonner", () => ({ toast }));

const activeLicense: StoredLicenseInfo = {
  licenseId: "OF-RELAY-1",
  filePath: "/tmp/licenses/OF-RELAY-1.license.json",
  valid: true,
  issuedTo: { org: "Northstar Agency" },
  issuedAt: "2026-07-01T00:00:00.000Z",
  expiresAt: "2027-07-01T00:00:00.000Z",
  entitlements: ["product:orionfold-relay"],
};

function orientation(licenses: StoredLicenseInfo[]) {
  return resolveCustomerOrientation({
    licenses,
    installedPackIds: [],
    agencyBundled: true,
    host: { licenseStatus: "missing" },
    now: new Date("2026-07-22T12:00:00.000Z"),
  });
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LicenseSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leads Community customers with current value, not storage mechanics", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ licenses: [] })));

    render(<LicenseSection orientation={orientation([])} />);

    expect(await screen.findByText(/Community Edition is active/)).toBeInTheDocument();
    expect(screen.getByText("Premium Packs not unlocked")).toBeInTheDocument();
    expect(screen.getByText("Managed Host optional")).toBeInTheDocument();
    expect(
      screen.getByText(/Core Relay and free Packs remain available/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Technical and trust details"),
    ).toBeInTheDocument();
  });

  it("keeps licensee identity separate from the human-readable entitlement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ licenses: [activeLicense] })),
    );

    render(<LicenseSection orientation={orientation([activeLicense])} />);

    expect(
      await screen.findByText("Licensed to Northstar Agency"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("All premium Packs").length).toBeGreaterThan(0);
    expect(screen.getByText("Premium Packs unlocked")).toBeInTheDocument();
    expect(screen.queryByText("product:orionfold-relay")).not.toBeInTheDocument();
  });

  it("uses a customer-readable activation confirmation and refreshes shared state", async () => {
    const identityChanged = vi.fn();
    window.addEventListener(INSTANCE_IDENTITY_CHANGED_EVENT, identityChanged);
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? json(activeLicense)
        : json({ licenses: [activeLicense] }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<LicenseSection orientation={orientation([])} />);
    await screen.findByText(/Community Edition is active/);

    fireEvent.change(screen.getByLabelText("License file contents"), {
      target: { value: JSON.stringify({ payload: {}, signature: "test" }) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    expect(
      await screen.findByText("License activated for Northstar Agency"),
    ).toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(identityChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Unlocked: All premium Packs/)).toBeInTheDocument();
    window.removeEventListener(INSTANCE_IDENTITY_CHANGED_EVENT, identityChanged);
  });
});
