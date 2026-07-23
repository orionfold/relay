import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstanceSection } from "@/components/instance/instance-section";
import { resolveCustomerOrientation } from "@/lib/onboarding/orientation";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

const boundary = {
  vocabularyVersion: "relay-host-cell-v1",
  instanceId: "instance_123456789",
  dataDirectory: "/tmp/relay-cell-a",
  databasePath: "/tmp/relay-cell-a/relay.db",
  launchWorkingDirectory: "/tmp/customer-work",
  dataDirectorySource: "override",
};

const communityOrientation = resolveCustomerOrientation({
  licenses: [],
  installedPackIds: [],
  agencyBundled: true,
  host: { licenseStatus: "missing" },
  now: new Date("2026-07-22T12:00:00.000Z"),
});

const hostOrientation = resolveCustomerOrientation({
  licenses: [
    {
      licenseId: "OF-HOST-1",
      filePath: "/tmp/OF-HOST-1.license.json",
      valid: true,
      issuedTo: { org: "Northstar Agency" },
      issuedAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2027-07-01T00:00:00.000Z",
      entitlements: ["product:relay-host"],
    },
  ],
  installedPackIds: [],
  agencyBundled: true,
  host: {
    licenseStatus: "active",
    journeyStage: "configure",
    managedCellsLimit: 10,
  },
  now: new Date("2026-07-22T12:00:00.000Z"),
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("instance section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders cell facts before initialized-instance maintenance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/instance/config" && method === "GET") {
          return {
            ok: true,
            json: async () => ({
              devMode: false,
              boundary,
              config: {
                instanceId: "instance_123456789",
                branchName: "instance/demo",
                isPrivateInstance: true,
                createdAt: 1712700000,
              },
              guardrails: {
                prePushHookInstalled: true,
                prePushHookVersion: "1",
                pushRemoteBlocked: ["main"],
                consentStatus: "enabled",
                firstBootCompletedAt: 1712700000,
              },
              upgrade: {
                lastPolledAt: 1712700000,
                upgradeAvailable: true,
                commitsBehind: 3,
                lastSuccessfulUpgradeAt: 1712600000,
                pollFailureCount: 0,
                lastPollError: null,
              },
            }),
          };
        }

        if (url === "/api/instance/upgrade/check" && method === "POST") {
          return {
            ok: true,
            json: async () => ({ ok: true }),
          };
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      })
    );

    render(<InstanceSection orientation={communityOrientation} />);

    expect(await screen.findByRole("button", { name: "Check" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repair setup" })).toBeInTheDocument();
    expect(screen.queryByText("Upgrade instance")).not.toBeInTheDocument();
    expect(screen.queryByText("Advanced: re-run instance setup")).not.toBeInTheDocument();
    expect(screen.queryByText("Blocked branches")).not.toBeInTheDocument();
    expect(screen.queryByText("Pre-push hook")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "This Relay's data boundary" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Community Edition")).toBeInTheDocument();
    expect(screen.getByText("Device administrator trusted")).toBeInTheDocument();
    expect(screen.getByText("/tmp/relay-cell-a")).toBeInTheDocument();
    expect(
      screen.getByText(/Customers and projects organize work, but they do not create separate security boundaries/),
    ).toBeInTheDocument();
  });

  it("shows an npx-install notice instead of the setup warning when skippedReason=no_git", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/instance/config" && method === "GET") {
          return {
            ok: true,
            json: async () => ({
              devMode: false,
              boundary: { ...boundary, instanceId: null },
              skippedReason: "no_git",
              maintenance: {
                launchContext: {
                  packageVersion: "0.45.2",
                  dataDir: "/tmp/relay-cell-a",
                  hostRoot: "/tmp/relay-host",
                  port: 3200,
                },
                upgradeCommand:
                  "RELAY_HOST_ROOT='/tmp/relay-host' npx --yes orionfold-relay@latest --data-dir '/tmp/relay-cell-a' --port 3200",
              },
              config: null,
              guardrails: null,
              upgrade: null,
            }),
          };
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      })
    );

    render(<InstanceSection />);

    expect(await screen.findByText("npm install")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Update this Relay" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Updating replaces Relay's application files/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "RELAY_HOST_ROOT='/tmp/relay-host' npx --yes orionfold-relay@latest --data-dir '/tmp/relay-cell-a' --port 3200",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy restart command" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "RELAY_HOST_ROOT='/tmp/relay-host' npx --yes orionfold-relay@latest --data-dir '/tmp/relay-cell-a' --port 3200",
      ),
    );
    expect(screen.getByText("Restart command copied.")).toBeInTheDocument();
    // Critical: the scary "setup incomplete" warning must NOT appear here.
    expect(
      screen.queryByText("Instance setup incomplete. Run setup to initialize this workspace.")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run setup" })).not.toBeInTheDocument();
    expect(screen.getByText("Not initialized")).toBeInTheDocument();
  });

  it("adapts the boundary explanation for a managed Host entitlement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          devMode: false,
          boundary,
          skippedReason: "no_git",
          config: null,
          guardrails: null,
          upgrade: null,
        }),
      })),
    );

    render(<InstanceSection orientation={hostOrientation} />);

    expect(await screen.findByText("Managed Host")).toBeInTheDocument();
    expect(screen.getByText("Host administrator trusted")).toBeInTheDocument();
    expect(
      screen.getByText(/Use separate Cells for customer isolation/),
    ).toBeInTheDocument();
  });

  it("shows the managed Cell ID in a no-git OCI install", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/instance/config" && method === "GET") {
          return {
            ok: true,
            json: async () => ({
              devMode: false,
              boundary: { ...boundary, instanceId: "g096-cell" },
              skippedReason: "no_git",
              config: null,
              guardrails: null,
              upgrade: null,
            }),
          };
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    render(<InstanceSection />);

    expect(await screen.findByText("npm install")).toBeInTheDocument();
    expect(
      screen.getByText(/could not reconstruct the command used to start/i),
    ).toBeInTheDocument();
    expect(screen.getByText("g096-cel…")).toBeInTheDocument();
    expect(screen.queryByText("Not initialized")).not.toBeInTheDocument();
  });

  it("uses the shorter setup CTA when the instance is not initialized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/instance/config" && method === "GET") {
          return {
            ok: true,
            json: async () => ({
              devMode: false,
              boundary: { ...boundary, instanceId: null },
              config: null,
              guardrails: null,
              upgrade: null,
            }),
          };
        }

        if (url === "/api/instance/init" && method === "POST") {
          return {
            ok: true,
            json: async () => ({ ok: true }),
          };
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      })
    );

    render(<InstanceSection />);

    expect(await screen.findByRole("button", { name: "Run setup" })).toBeInTheDocument();
    expect(
      screen.getByText("Instance setup incomplete. Run setup to initialize this workspace.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run setup" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/instance/init", { method: "POST" });
    });
  });

  it("names a boundary-loading failure and offers retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          code: "CELL_ID_INVALID",
          error: "RELAY_CELL_ID must be a lowercase DNS label of at most 63 characters.",
        }),
      })
    );

    render(<InstanceSection />);

    expect(
      await screen.findByText(/RELAY_CELL_ID must be a lowercase DNS label/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/Instance setup incomplete/)).not.toBeInTheDocument();
  });
});
