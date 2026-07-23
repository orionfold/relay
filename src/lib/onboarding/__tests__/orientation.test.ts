import { describe, expect, it } from "vitest";
import type { StoredLicenseInfo } from "@/lib/licensing/store";
import {
  RELAY_HOST_ENTITLEMENT,
  RELAY_PACKS_ENTITLEMENT,
} from "@/lib/licensing/host-entitlement";
import { resolveCustomerOrientation } from "../orientation";

const NOW = new Date("2026-07-22T12:00:00.000Z");

function license(
  overrides: Partial<StoredLicenseInfo> = {},
): StoredLicenseInfo {
  return {
    licenseId: "OF-TEST-1",
    filePath: "/tmp/OF-TEST-1.license.json",
    valid: true,
    issuedTo: { org: "Northstar Agency" },
    issuedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2027-07-01T00:00:00.000Z",
    entitlements: [],
    ...overrides,
  };
}

function resolve(
  overrides: Partial<Parameters<typeof resolveCustomerOrientation>[0]> = {},
) {
  return resolveCustomerOrientation({
    licenses: [],
    installedPackIds: [],
    agencyBundled: true,
    host: { licenseStatus: "missing" },
    now: NOW,
    ...overrides,
  });
}

describe("customer onboarding orientation", () => {
  it("keeps a bundled Agency Pack available—not installed—and makes its install opt-in", () => {
    const result = resolve();

    expect(result.edition).toBe("community");
    expect(result.license.lifecycle).toBe("none");
    expect(result.packs.agency).toBe("available");
    expect(result.primaryAction).toEqual({
      kind: "install_pack",
      label: "Install free Relay Agency",
      packId: "relay-agency",
      packName: "Relay Agency",
    });
    expect(result.description).toContain("Install it only when you choose");
  });

  it("never offers an install when Agency is already installed", () => {
    const result = resolve({ installedPackIds: ["relay-agency"] });

    expect(result.packs.agency).toBe("installed");
    expect(result.primaryAction).toEqual({
      kind: "link",
      label: "Open Relay Agency",
      href: "/apps/relay-agency",
    });
  });

  it("ranks premium Pack selection for a Packs entitlement and keeps identity separate", () => {
    const result = resolve({
      licenses: [
        license({ entitlements: [RELAY_PACKS_ENTITLEMENT] }),
      ],
    });

    expect(result.edition).toBe("licensed");
    expect(result.license.licensee).toBe("Northstar Agency");
    expect(result.entitlementLabel).toBe("Premium Packs");
    expect(result.entitlements).toEqual({ packs: true, host: false });
    expect(result.primaryAction).toEqual({
      kind: "link",
      label: "Choose Packs to install",
      href: "/packs",
    });
    expect(result.secondaryActions).toContainEqual(
      expect.objectContaining({ kind: "install_pack", packId: "relay-agency" }),
    );
  });

  it("ranks Host setup for a Host-only entitlement", () => {
    const result = resolve({
      licenses: [
        license({ entitlements: [RELAY_HOST_ENTITLEMENT] }),
      ],
      host: {
        licenseStatus: "active",
        managedCellsLimit: 10,
        journeyStage: "configure",
      },
    });

    expect(result.entitlements).toEqual({ packs: false, host: true });
    expect(result.host.state).toBe("entitled");
    expect(result.primaryAction).toEqual({
      kind: "link",
      label: "Configure managed Host",
      href: "/settings#settings-host-deployment",
    });
  });

  it("summarizes combined entitlements without treating them as one generic license", () => {
    const result = resolve({
      licenses: [
        license({
          entitlements: [RELAY_PACKS_ENTITLEMENT, RELAY_HOST_ENTITLEMENT],
        }),
      ],
      host: {
        licenseStatus: "active",
        managedCellsLimit: 25,
        journeyStage: "ready",
        hostActualState: "ready",
      },
    });

    expect(result.entitlementLabel).toBe("Packs + Host");
    expect(result.entitlements).toEqual({ packs: true, host: true });
    expect(result.host).toMatchObject({ state: "ready", managedCellsLimit: 25 });
    expect(result.primaryAction.label).toBe("Choose Packs to install");
    expect(result.secondaryActions).toContainEqual(
      expect.objectContaining({ label: "Configure managed Host" }),
    );
  });

  it("distinguishes active from expiring", () => {
    const result = resolve({
      licenses: [
        license({ expiresAt: "2026-08-01T00:00:00.000Z" }),
      ],
    });

    expect(result.license.lifecycle).toBe("expiring");
    expect(result.license.detail).toContain("nearing renewal");
  });

  it("preserves Pack and Host continuity truth after lapse without granting new actions", () => {
    const result = resolve({
      licenses: [
        license({
          valid: false,
          reason: "License expired 2026-07-01T00:00:00.000Z.",
          expiresAt: "2026-07-01T00:00:00.000Z",
          entitlements: [RELAY_PACKS_ENTITLEMENT, RELAY_HOST_ENTITLEMENT],
        }),
      ],
      host: {
        licenseStatus: "lapsed",
        managedCellsLimit: 10,
      },
    });

    expect(result.edition).toBe("community");
    expect(result.license.lifecycle).toBe("lapsed");
    expect(result.entitlements).toEqual({ packs: false, host: false });
    expect(result.packs.premium).toBe("continuity");
    expect(result.host.state).toBe("lapsed");
    expect(result.license.detail).toContain("Installed Packs");
    expect(result.license.detail).toContain("existing managed Cells");
  });

  it("names invalid and read-error states instead of silently claiming Community", () => {
    const invalid = resolve({
      licenses: [
        license({
          valid: false,
          reason: "signature does not verify",
          expiresAt: "2027-07-01T00:00:00.000Z",
        }),
      ],
    });
    const unreadable = resolve({
      licenseReadError: "EACCES",
    });

    expect(invalid.license.lifecycle).toBe("invalid");
    expect(invalid.license.licensee).toBeNull();
    expect(invalid.entitlementLabel).toBe("License needs attention");
    expect(unreadable.license.lifecycle).toBe("read_error");
    expect(unreadable.license.detail).toContain("EACCES");
    expect(unreadable.entitlementLabel).toBe("License status unavailable");
  });

  it("does not trust an expired payload date when the signature is invalid", () => {
    const result = resolve({
      licenses: [
        license({
          valid: false,
          reason: "signature does not verify (payload may be tampered)",
          expiresAt: "2020-01-01T00:00:00.000Z",
        }),
      ],
    });

    expect(result.license.lifecycle).toBe("invalid");
    expect(result.packs.premium).toBe("locked");
  });

  it("uses only a verified lapsed license for customer identity when invalid files coexist", () => {
    const result = resolve({
      licenses: [
        license({
          licenseId: "OF-LAPSED",
          valid: false,
          reason: "License expired 2026-07-01T00:00:00.000Z.",
          issuedTo: { org: "Trusted Lapsed Customer" },
          issuedAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-07-01T00:00:00.000Z",
        }),
        license({
          licenseId: "OF-TAMPERED",
          valid: false,
          reason: "signature does not verify",
          issuedTo: { org: "Untrusted Newer Identity" },
          issuedAt: "2026-07-20T00:00:00.000Z",
        }),
      ],
    });

    expect(result.license.lifecycle).toBe("lapsed");
    expect(result.license.licensee).toBe("Trusted Lapsed Customer");
  });

  it("keeps Host read failure distinct from missing entitlement", () => {
    const result = resolve({
      host: { readError: "host.db is unreadable" },
    });

    expect(result.host.state).toBe("degraded");
    expect(result.host.detail).toContain("host.db is unreadable");
  });

  it("does not mislabel an existing Host as a preview when authority is missing", () => {
    const result = resolve({
      host: {
        licenseStatus: "missing",
        hostActualState: "ready",
      },
    });

    expect(result.host.state).toBe("degraded");
    expect(result.host.detail).toContain("managed Host exists");
  });

  it("falls back visibly when the bundled Agency Pack is missing", () => {
    const result = resolve({ agencyBundled: false });

    expect(result.packs.agency).toBe("unavailable");
    expect(result.primaryAction).toEqual({
      kind: "link",
      label: "Browse available Packs",
      href: "/packs",
    });
  });

  it("does not infer not-installed when the installed Pack registry is unreadable", () => {
    const result = resolve({
      packReadError: "EACCES reading apps",
    });

    expect(result.packs).toMatchObject({
      agency: "unavailable",
      readError: "EACCES reading apps",
    });
    expect(result.primaryAction.kind).not.toBe("install_pack");
  });
});
