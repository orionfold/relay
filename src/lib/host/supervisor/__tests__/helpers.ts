import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { signEnvelope } from "@/lib/licensing/__tests__/sign-helper";
import {
  HOST_CELL_MANIFEST_SCHEMA,
  type CellManifest,
  type HostCapacity,
} from "../contracts";

export const ACTIVE_NOW = new Date("2026-08-01T00:00:00Z");
export const LAPSED_NOW = new Date("2027-08-01T00:00:00Z");

export const HOST_CAPACITY: HostCapacity = {
  cpuMillis: 10_000,
  memoryBytes: 16 * 1024 * 1024 * 1024,
  storageBytes: 100 * 1024 * 1024 * 1024,
  reservePercent: 20,
};

export function hostPayload(input: {
  licenseId?: string;
  licenseeRef?: string;
  managedCells?: number;
  expiresAt?: string;
} = {}): Record<string, unknown> {
  const licenseId = input.licenseId ?? "OF-RELAY-HOST-TEST-G083";
  const licenseeRef = input.licenseeRef ?? "org_northstar";
  const managedCells = input.managedCells ?? 10;
  return {
    schema: "orionfold.license/v1",
    license_id: licenseId,
    product: "orionfold-relay-host",
    tier: "host",
    issued_to: { email: "operator@example.com", org: "Northstar" },
    issued_at: "2026-07-17T00:00:00Z",
    not_before: "2026-07-17T00:00:00Z",
    expires_at: input.expiresAt ?? "2027-07-17T00:00:00Z",
    entitlements: ["product:relay-host"],
    grants: {
      "product:relay-host": {
        schema: "orionfold.relay-host/v1",
        sku: `relay-host-${managedCells}-annual`,
        licensee: { kind: "organization", ref: licenseeRef },
        limits: { hosts: 1, managed_cells: managedCells },
        updates_until: "2027-07-17T00:00:00Z",
        rights: {
          managed_customer_cells: true,
          packs: "separate",
          reseller: false,
          transfer: "same-licensee-replacement",
          critical_security_updates: "included",
        },
      },
    },
  };
}

export function writeHostLicense(
  dir: string,
  input: Parameters<typeof hostPayload>[0] = {},
): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const envelope = signEnvelope(hostPayload(input));
  const path = join(dir, `${String((envelope.payload as { license_id: string }).license_id)}.license.json`);
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export function manifest(
  cellId: string,
  port: number,
  overrides: Partial<CellManifest> = {},
): CellManifest {
  const digest = `sha256:${cellId.charCodeAt(0).toString(16).padStart(2, "0").repeat(32)}`;
  return {
    schema: HOST_CELL_MANIFEST_SCHEMA,
    cellId,
    ownerRef: `owner_${cellId}`,
    origin: "create",
    artifact: {
      version: "0.43.0",
      imageReference: `ghcr.io/orionfold/relay-cell@${digest}`,
      imageDigest: digest,
      schemaMin: 1,
      schemaMax: 1,
    },
    loopbackPort: port,
    resources: {
      cpuMillis: 500,
      memoryBytes: 512 * 1024 * 1024,
      storageBytes: 1024 * 1024 * 1024,
    },
    ...overrides,
  };
}
