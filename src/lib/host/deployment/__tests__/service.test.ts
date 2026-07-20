import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeHostLicense, ACTIVE_NOW } from "@/lib/host/supervisor/__tests__/helpers";
import { signEnvelope } from "@/lib/licensing/__tests__/sign-helper";
import { RelayHostError } from "@/lib/host/supervisor/errors";
import { HostDeploymentService } from "../service";

// See artifact.test.ts: candidate Cell publication necessarily precedes the
// matching digest authority committed for the npm release.
vi.mock("@/lib/config/version", () => ({ relayProductVersion: () => "0.44.5" }));

const roots: string[] = [];
function fixture(options: { licensed?: boolean; managedCells?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), "relay-host-deployment-service-"));
  const licenseDir = join(root, "licenses");
  roots.push(root);
  if (options.licensed !== false) writeHostLicense(licenseDir, { managedCells: options.managedCells });
  return new HostDeploymentService({ root: join(root, "host"), licenseDir, now: () => ACTIVE_NOW });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function configure(service: HostDeploymentService, overrides: Record<string, unknown> = {}) {
  const current = service.view().journey.draft;
  service.mutate({
    action: "save_draft",
    draft: {
      placement: "cloud_preview",
      hostId: current.hostId,
      regionRef: "sfo3",
      sizeRef: "basic-4gib-2vcpu",
      desiredCells: 1,
      exposure: "tailnet",
      runtimeProfile: "byok_hosted",
      backupProfile: "weekly_provider",
      concurrency: "light",
      ...overrides,
    },
  } as never);
  return service.mutate({ action: "estimate" });
}

function install(service: HostDeploymentService) {
  const estimated = configure(service);
  const digest = estimated.journey.planDigest!;
  service.mutate({ action: "preflight", planDigest: digest });
  service.mutate({ action: "authorize", planDigest: digest, confirmed: true });
  return service.mutate({ action: "install", planDigest: digest });
}

describe("HostDeploymentService", () => {
  it("keeps comparison readable but refuses an unlicensed draft", () => {
    const service = fixture({ licensed: false });
    expect(service.view().license.status).toBe("missing");
    expect(() => configure(service)).toThrowError(/signed product:relay-host/);
  });

  it("treats an installed Packs license as absent rather than an invalid Host license", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-deployment-pack-license-"));
    roots.push(root);
    const licenseDir = join(root, "licenses");
    mkdirSync(licenseDir, { recursive: true });
    writeFileSync(join(licenseDir, "packs.license.json"), JSON.stringify(signEnvelope({
      schema: "orionfold.license/v1",
      license_id: "OF-RELAY-PACKS-TEST",
      product: "orionfold-relay",
      tier: "pro",
      issued_at: "2026-07-17T00:00:00Z",
      expires_at: "2027-07-17T00:00:00Z",
      entitlements: ["product:orionfold-relay"],
      grants: {},
    })));
    const service = new HostDeploymentService({ root: join(root, "host"), licenseDir, now: () => ACTIVE_NOW });
    expect(service.view().license).toMatchObject({ status: "missing", code: "HOST_LICENSE_REQUIRED" });
  });

  it("invalidates downstream state after a configuration edit", () => {
    const service = fixture();
    const estimated = configure(service);
    expect(estimated.journey.stage).toBe("estimated");
    service.mutate({
      action: "save_draft",
      draft: { ...estimated.journey.draft, desiredCells: 2 },
    } as never);
    const stale = service.view();
    expect(stale.journey).toMatchObject({ stage: "configure", planDigest: null });
    expect(stale.journey.invalidatedReason).toContain("Configuration changed");
  });

  it("refuses a plan that needs multiple Hosts and a license-limit breach", () => {
    const service = fixture({ managedCells: 2 });
    const estimated = configure(service, { desiredCells: 10 });
    expect(() => service.mutate({ action: "preflight", planDigest: estimated.journey.planDigest! }))
      .toThrowError(/signed Host license allows 2/);

    const capacity = fixture({ managedCells: 25 });
    const sharded = configure(capacity, { desiredCells: 10 });
    expect(() => capacity.mutate({ action: "preflight", planDigest: sharded.journey.planDigest! }))
      .toThrowError(/multi-Host Fleet control is not part/);
  });

  it("persists the fake-provider install and delegates Cell lifecycle with replay safety", () => {
    const service = fixture();
    const installed = install(service);
    expect(installed).toMatchObject({
      runtimeMode: "preview",
      journey: { stage: "installed" },
      host: { hostId: "relay-host" },
    });
    expect(installed.journey.providerHostRef).toMatch(/^fake-host-/);
    expect(() => service.mutate({
      action: "save_draft",
      draft: { ...installed.journey.draft, desiredCells: 2 },
    } as never)).toThrowError(/already installed/);

    const createId = crypto.randomUUID();
    service.mutate({ action: "create_cell", operationId: createId, cellId: "cell-a", ownerRef: "owner-a" });
    const replayed = service.mutate({ action: "create_cell", operationId: createId, cellId: "cell-a", ownerRef: "owner-a" });
    expect(replayed.cells).toHaveLength(1);
    expect(replayed.cells[0]).toMatchObject({ state: "stopped", loopbackPort: 4100 });
    expect(replayed.receipts.filter((receipt) => receipt.operationId === createId)).toHaveLength(1);
    expect(replayed.receipts[0]).not.toHaveProperty("resourceRefs");

    const startId = crypto.randomUUID();
    service.mutate({ action: "cell_action", operationId: startId, cellId: "cell-a", lifecycle: "start" });
    expect(service.mutate({ action: "cell_action", operationId: startId, cellId: "cell-a", lifecycle: "start" }).cells[0].state).toBe("running");
    service.mutate({ action: "cell_action", operationId: crypto.randomUUID(), cellId: "cell-a", lifecycle: "retain" });
    expect(service.view().cells[0].state).toBe("retained");
    service.mutate({ action: "cell_action", operationId: crypto.randomUUID(), cellId: "cell-a", lifecycle: "start" });
    expect(service.view().cells[0].state).toBe("running");

    expect(() => service.mutate({ action: "cell_action", operationId: crypto.randomUUID(), cellId: "cell-a", lifecycle: "purge", confirmation: "wrong" }))
      .toThrowError(/confirmation equal to Cell ID/);
    service.mutate({ action: "cell_action", operationId: crypto.randomUUID(), cellId: "cell-a", lifecycle: "purge", confirmation: "cell-a" });
    expect(service.view().cells[0].state).toBe("purged");
  });

  it("rejects stale plan digests without initializing a Host", () => {
    const service = fixture();
    configure(service);
    expect(() => service.mutate({ action: "preflight", planDigest: `sha256:${"0".repeat(64)}` }))
      .toThrowError(RelayHostError);
    expect(service.view().host).toBeNull();
  });
});
