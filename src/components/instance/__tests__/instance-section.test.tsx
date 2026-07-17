import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstanceSection } from "@/components/instance/instance-section";

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

    render(<InstanceSection />);

    expect(await screen.findByRole("button", { name: "Check" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repair setup" })).toBeInTheDocument();
    expect(screen.queryByText("Upgrade instance")).not.toBeInTheDocument();
    expect(screen.queryByText("Advanced: re-run instance setup")).not.toBeInTheDocument();
    expect(screen.queryByText("Blocked branches")).not.toBeInTheDocument();
    expect(screen.queryByText("Pre-push hook")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Relay cell boundary" })).toBeInTheDocument();
    expect(screen.getByText("/tmp/relay-cell-a")).toBeInTheDocument();
    expect(screen.getByText(/Customer and project records organize work/)).toBeInTheDocument();
  });

  it("shows an npx-install notice instead of the setup warning when skippedReason=no_git", async () => {
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

    expect(await screen.findByText("npx install")).toBeInTheDocument();
    // The explanatory paragraph wraps .git + the upgrade command in <code>
    // elements, so matchers must work around the split text nodes.
    expect(screen.getByText(/This folder has no/i)).toBeInTheDocument();
    expect(
      screen.getByText("npx orionfold-relay@latest")
    ).toBeInTheDocument();
    // Critical: the scary "setup incomplete" warning must NOT appear here.
    expect(
      screen.queryByText("Instance setup incomplete. Run setup to initialize this workspace.")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run setup" })).not.toBeInTheDocument();
    expect(screen.getByText("Not initialized")).toBeInTheDocument();
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
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    );

    render(<InstanceSection />);

    expect(
      await screen.findByText(/Relay could not load the active cell facts: HTTP 503/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/Instance setup incomplete/)).not.toBeInTheDocument();
  });
});
