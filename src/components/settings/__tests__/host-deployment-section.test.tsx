// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostDeploymentSection } from "../host-deployment-section";
import type { HostDeploymentView } from "@/lib/host/deployment/contracts";

function view(overrides: Partial<HostDeploymentView> = {}): HostDeploymentView {
  return {
    journey: {
      schemaVersion: 1,
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
        updatedAt: 1,
      },
      stage: "configure",
      planDigest: null,
      estimate: null,
      providerHostRef: null,
      authorizationConfirmedAt: null,
      invalidatedReason: null,
      lastReasonCode: "HOST_DEPLOYMENT_DRAFT_READY",
      updatedAt: 1,
    },
    license: {
      status: "missing",
      code: "HOST_LICENSE_REQUIRED",
      detail: "A signed product:relay-host license is required.",
      licenseId: null,
      licenseeRef: null,
      managedCellsLimit: null,
      expiresAt: null,
    },
    runtimeMode: "preview",
    host: null,
    cells: [],
    receipts: [],
    ...overrides,
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("HostDeploymentSection", () => {
  it("keeps placement, ownership and the paid gate readable without a Host license", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(view())));
    render(<HostDeploymentSection />);
    await screen.findByRole("button", { name: /Local device/ });
    expect(screen.getByRole("heading", { name: "Relay Host deployment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Local device/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cloud server preview/ })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "16.666666666666664");
    expect(screen.getByText(/Host administrator can inspect every resident Cell/)).toBeInTheDocument();
    expect(screen.getByText(/Managed Host automation is paid-license gated/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open License settings" })).toHaveAttribute("href", "#settings-license");
  });

  it("invalidates edits visibly and sends a strict save-draft request", async () => {
    const licensed = view({
      license: {
        status: "active",
        code: "HOST_LICENSE_ACTIVE",
        detail: "Active",
        licenseId: "host-1",
        licenseeRef: "org-one",
        managedCellsLimit: 10,
        expiresAt: "2027-07-17T00:00:00.000Z",
      },
    });
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return json(licensed);
      return json(licensed);
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<HostDeploymentSection />);
    await screen.findByRole("button", { name: /Cloud server preview/ });
    screen.getByRole("button", { name: /Cloud server preview/ }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText(/Unsaved edits invalidate/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const request = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
    expect(request).toMatchObject({
      action: "save_draft",
      draft: { placement: "cloud_preview", regionRef: "sfo3", exposure: "tailnet" },
    });
    expect(JSON.stringify(request)).not.toMatch(/token|credential|password/i);
  });

  it("identifies the dated estimate source as an external link", async () => {
    const estimated = view();
    estimated.journey.estimate = {
      sourceDate: "2026-07-16",
      sourceUrl: "https://www.digitalocean.com/pricing/droplets",
      currency: "USD",
      hostCount: 1,
      admittedCellsPerHost: 3,
      requestedCells: 1,
      reservePercent: 20,
      monthlyLow: 24,
      monthlyHigh: 30,
      provisional: true,
      exclusions: ["model charges"],
    };
    vi.stubGlobal("fetch", vi.fn(async () => json(estimated)));
    render(<HostDeploymentSection />);
    const source = await screen.findByRole("link", { name: /Source snapshot.*opens in new tab/ });
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noreferrer");
  });

  it("requires the exact Cell ID before enabling permanent purge", async () => {
    const installed = view({
      license: {
        status: "active",
        code: "HOST_LICENSE_ACTIVE",
        detail: "Active",
        licenseId: "host-1",
        licenseeRef: "org-one",
        managedCellsLimit: 10,
        expiresAt: "2027-07-17T00:00:00.000Z",
      },
      host: {
        hostId: "relay-host",
        supervisorVersion: "0.44.3",
        actualState: "ready",
        desiredState: "ready",
        capacity: { cpuMillis: 2000, memoryBytes: 4 * 1024 ** 3, storageBytes: 48 * 1024 ** 3, reservePercent: 20 },
      },
      cells: [{
        cellId: "cell-a",
        ownerRef: "owner-a",
        version: "0.44.3",
        imageDigest: `sha256:${"a".repeat(64)}`,
        state: "stopped",
        health: "unknown",
        backupStatus: "unknown",
        loopbackPort: 4100,
        cpuMillis: 500,
        memoryBytes: 1024 ** 3,
        storageBytes: 10 * 1024 ** 3,
        lastReceiptId: null,
      }],
    });
    vi.stubGlobal("fetch", vi.fn(async () => json(installed)));
    const user = userEvent.setup();
    render(<HostDeploymentSection />);
    await user.click(await screen.findByRole("button", { name: "Purge" }));
    const confirm = screen.getByRole("button", { name: "Permanently purge" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type cell-a to confirm/), { target: { value: "cell-a" } });
    expect(confirm).toBeEnabled();
  });

  it("keeps destructive confirmation open when purge fails", async () => {
    const installed = view({
      license: {
        status: "active", code: "HOST_LICENSE_ACTIVE", detail: "Active",
        licenseId: "host-1", licenseeRef: "org-one", managedCellsLimit: 10,
        expiresAt: "2027-07-17T00:00:00.000Z",
      },
      host: {
        hostId: "relay-host", supervisorVersion: "0.44.3", actualState: "ready", desiredState: "ready",
        capacity: { cpuMillis: 2000, memoryBytes: 4 * 1024 ** 3, storageBytes: 48 * 1024 ** 3, reservePercent: 20 },
      },
      cells: [{
        cellId: "cell-a", ownerRef: "owner-a", version: "0.44.3",
        imageDigest: `sha256:${"a".repeat(64)}`, state: "stopped", health: "unknown", backupStatus: "unknown",
        loopbackPort: 4100, cpuMillis: 500, memoryBytes: 1024 ** 3, storageBytes: 10 * 1024 ** 3, lastReceiptId: null,
      }],
    });
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
      ? json({ error: "Recovery is required.", code: "HOST_RECOVERY_REQUIRED" }, 422)
      : json(installed));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<HostDeploymentSection />);
    await user.click(await screen.findByRole("button", { name: "Purge" }));
    await user.type(screen.getByLabelText(/Type cell-a to confirm/), "cell-a");
    await user.click(screen.getByRole("button", { name: "Permanently purge" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("HOST_RECOVERY_REQUIRED");
    expect(screen.getByLabelText(/Type cell-a to confirm/)).toHaveValue("cell-a");
  });
});
