import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeLanding } from "@/components/dashboard/welcome-landing";
import { resolveCustomerOrientation } from "@/lib/onboarding/orientation";
import type { StarterTemplate } from "@/lib/apps/starters";
import type { StoredLicenseInfo } from "@/lib/licensing/store";

const { push, refresh, toast } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast }));

const STARTERS: StarterTemplate[] = [
  {
    id: "finance-pack",
    name: "Finance pack",
    description: "Monthly close.",
    persona: "personal-finance",
    icon: "wallet",
    starterPrompt: "Build me a personal finance dashboard.",
    preview: { profiles: 1, blueprints: 1, tables: 1, schedules: 1 },
  },
  {
    id: "habit-tracker",
    name: "Habit tracker",
    description: "Daily habits.",
    persona: "personal",
    icon: "check-circle",
    starterPrompt: "Build me a daily habit tracker.",
    preview: { profiles: 1, blueprints: 1, tables: 2, schedules: 1 },
  },
  {
    id: "research-digest",
    name: "Research digest",
    description: "Weekly synthesis.",
    persona: "research",
    icon: "library",
    starterPrompt: "Build me a research digest.",
    preview: { profiles: 1, blueprints: 1, tables: 1, schedules: 1 },
  },
];

function communityOrientation(agencyBundled = true) {
  return resolveCustomerOrientation({
    licenses: [],
    installedPackIds: [],
    agencyBundled,
    host: { licenseStatus: "missing" },
    now: new Date("2026-07-22T12:00:00.000Z"),
  });
}

const combinedLicense: StoredLicenseInfo = {
  licenseId: "OF-COMBINED-1",
  filePath: "/tmp/OF-COMBINED-1.license.json",
  valid: true,
  issuedTo: { org: "Northstar Agency" },
  issuedAt: "2026-07-01T00:00:00.000Z",
  expiresAt: "2027-07-01T00:00:00.000Z",
  entitlements: ["product:orionfold-relay", "product:relay-host"],
};

describe("WelcomeLanding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leads Community customers to an explicit free Agency install", () => {
    render(
      <WelcomeLanding
        orientation={communityOrientation()}
        starters={STARTERS}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Start with a ready-to-run agency workspace",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Community Edition")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Install free Relay Agency" }),
    ).toHaveTextContent("Install free Relay Agency");
    expect(
      screen.getByRole("link", { name: /Ask Relay what it can do/i }),
    ).toHaveAttribute("href", "/chat");
    expect(screen.getByText(/Install it only when you choose/)).toBeInTheDocument();
    expect(screen.getByText(/finance pack/i)).toBeInTheDocument();
    expect(screen.getByText(/habit tracker/i)).toBeInTheDocument();
    expect(screen.getByText(/research digest/i)).toBeInTheDocument();
    expect(screen.getByText(/packs from a sentence/i)).toBeInTheDocument();
  });

  it("installs Agency once and opens its Pack shell on success", async () => {
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetch);
    render(<WelcomeLanding orientation={communityOrientation()} />);

    const install = screen.getByRole("button", { name: "Install free Relay Agency" });
    fireEvent.click(install);
    fireEvent.click(install);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(install).toBeDisabled();
    release?.(
      new Response(
        JSON.stringify({
          tablesCreated: 2,
          customersSeeded: 6,
          profilesDropped: 4,
          blueprintsDropped: 3,
        }),
        { status: 200 },
      ),
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/apps/relay-agency");
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Installed Relay Agency",
      expect.objectContaining({ description: expect.stringContaining("2 table(s)") }),
    );
  });

  it("keeps install retryable and names an upstream failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: "Bundled Pack files are unavailable." }),
          { status: 500 },
        ),
      ),
    );
    render(<WelcomeLanding orientation={communityOrientation()} />);

    const install = screen.getByRole("button", { name: "Install free Relay Agency" });
    fireEvent.click(install);

    await waitFor(() => expect(install).toBeEnabled());
    expect(toast.error).toHaveBeenCalledWith(
      "Could not install Relay Agency",
      { description: "Bundled Pack files are unavailable." },
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("falls back to Packs when Agency is not bundled and hides an empty starter row", () => {
    render(
      <WelcomeLanding orientation={communityOrientation(false)} />,
    );

    expect(
      screen.getByRole("link", { name: /Browse available Packs/i }),
    ).toHaveAttribute("href", "/packs");
    expect(
      screen.queryByRole("button", { name: "Install free Relay Agency" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Or start from a ready-made pack")).toBeNull();
  });

  it("shows combined entitlement, licensee, and ranked next actions separately", () => {
    const orientation = resolveCustomerOrientation({
      licenses: [combinedLicense],
      installedPackIds: [],
      agencyBundled: true,
      host: {
        licenseStatus: "active",
        journeyStage: "configure",
        managedCellsLimit: 10,
      },
      now: new Date("2026-07-22T12:00:00.000Z"),
    });

    render(<WelcomeLanding orientation={orientation} />);

    expect(screen.getByText("Packs + Host")).toBeInTheDocument();
    expect(screen.getByText("Licensed to Northstar Agency")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Choose Packs to install/i }),
    ).toHaveAttribute("href", "/packs");
    expect(
      screen.getByRole("link", { name: "Configure managed Host" }),
    ).toHaveAttribute("href", "/settings#settings-host-deployment");
    expect(
      screen.getByRole("button", { name: "Install free Relay Agency" }),
    ).toBeInTheDocument();
  });

  it("does not offer an install when Relay cannot verify installed Pack state", () => {
    const orientation = resolveCustomerOrientation({
      licenses: [],
      installedPackIds: [],
      packReadError: "Pack registry is unreadable.",
      agencyBundled: true,
      host: { licenseStatus: "missing" },
      now: new Date("2026-07-22T12:00:00.000Z"),
    });

    render(<WelcomeLanding orientation={orientation} />);

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("Pack registry is unreadable");
    expect(
      screen.queryByRole("button", { name: "Install free Relay Agency" }),
    ).not.toBeInTheDocument();
  });
});
