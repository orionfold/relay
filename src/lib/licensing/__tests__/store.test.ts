import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SignedLicense } from "../verify";
import {
  LicenseStoreError,
  saveLicense,
  listLicenses,
  findEntitledLicense,
  removeLicense,
  getLicensedIdentity,
} from "../store";
import { signEnvelope } from "./sign-helper";
import vector from "./fixtures/license-conformance-v1.json";
import realLicense from "./fixtures/of-relay-verify-20260701.license.json";

const ENTITLEMENT = "product:orionfold-relay";
const NOW = new Date("2026-08-01T00:00:00Z");

function makePayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: "orionfold.license/v1",
    license_id: "OF-RELAY-TEST-0001",
    product: "orionfold-relay",
    tier: "relay",
    issued_to: { email: "naya@example.com", name: "Naya Patel" },
    issued_at: "2026-07-01T00:00:00Z",
    not_before: "2026-07-01T00:00:00Z",
    expires_at: "2027-07-01T00:00:00Z",
    seats: 1,
    entitlements: [ENTITLEMENT],
    ...overrides,
  };
}

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-license-store-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("saveLicense", () => {
  it("persists a valid envelope as <license_id>.license.json with mode 0600", () => {
    const info = saveLicense(signEnvelope(makePayload()), { dir, now: NOW });

    expect(info.licenseId).toBe("OF-RELAY-TEST-0001");
    expect(info.entitlements).toEqual([ENTITLEMENT]);
    expect(info.issuedTo).toEqual({
      email: "naya@example.com",
      name: "Naya Patel",
    });

    const file = path.join(dir, "OF-RELAY-TEST-0001.license.json");
    expect(fs.existsSync(file)).toBe(true);
    const mode = fs.statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
    // Round-trips as the exact envelope (payload bytes must stay signable).
    const written = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(written.payload.license_id).toBe("OF-RELAY-TEST-0001");
    expect(written.signature.key_id).toBe(vector.dev_key.key_id);
  });

  it("accepts the real prod-signed fixture", () => {
    const info = saveLicense(realLicense as SignedLicense, { dir, now: NOW });
    expect(info.licenseId).toBe("OF-RELAY-VERIFY-20260701");
    expect(info.issuedTo.email).toBe(realLicense.payload.issued_to.email);
  });

  it("rejects a tampered envelope with LicenseStoreError (nothing written)", () => {
    const doc = signEnvelope(makePayload());
    (doc.payload as Record<string, unknown>).seats = 500;
    expect(() => saveLicense(doc, { dir, now: NOW })).toThrow(
      LicenseStoreError
    );
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("rejects an expired license at save time", () => {
    const doc = signEnvelope(
      makePayload({ expires_at: "2026-07-15T00:00:00Z" })
    );
    expect(() => saveLicense(doc, { dir, now: NOW })).toThrow(
      LicenseStoreError
    );
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("rejects a payload with no license_id", () => {
    const doc = signEnvelope(makePayload({ license_id: undefined }));
    delete (doc.payload as Record<string, unknown>).license_id;
    // Re-sign after the delete so the failure is the missing id, not the signature.
    const resigned = signEnvelope(doc.payload as Record<string, unknown>);
    expect(() => saveLicense(resigned, { dir, now: NOW })).toThrow(
      LicenseStoreError
    );
  });
});

describe("listLicenses", () => {
  it("re-verifies validity at read time (expiry after save shows invalid)", () => {
    saveLicense(signEnvelope(makePayload()), { dir, now: NOW });

    const later = new Date("2027-08-01T00:00:00Z"); // past expires_at
    const listed = listLicenses({ dir, now: later });
    expect(listed).toHaveLength(1);
    expect(listed[0].licenseId).toBe("OF-RELAY-TEST-0001");
    expect(listed[0].valid).toBe(false);
    expect(listed[0].reason).toMatch(/expired/i);
  });

  it("lists a corrupt file as invalid with a reason, never silently skips", () => {
    saveLicense(signEnvelope(makePayload()), { dir, now: NOW });
    fs.writeFileSync(path.join(dir, "BROKEN.license.json"), "{not json");

    const listed = listLicenses({ dir, now: NOW });
    expect(listed).toHaveLength(2);
    const broken = listed.find((l) => l.valid === false);
    expect(broken).toBeDefined();
    expect(broken!.reason).toBeTruthy();
    const ok = listed.find((l) => l.valid);
    expect(ok!.licenseId).toBe("OF-RELAY-TEST-0001");
  });

  it("returns [] for a store dir that does not exist yet", () => {
    expect(
      listLicenses({ dir: path.join(dir, "never-created"), now: NOW })
    ).toEqual([]);
  });
});

describe("findEntitledLicense", () => {
  it("returns a persisted license passing the full 3-step gate", () => {
    saveLicense(signEnvelope(makePayload()), { dir, now: NOW });
    const hit = findEntitledLicense(ENTITLEMENT, { dir, now: NOW });
    expect(hit).not.toBeNull();
    expect(hit!.info.licenseId).toBe("OF-RELAY-TEST-0001");
    expect(hit!.envelope.signature.key_id).toBe(vector.dev_key.key_id);
  });

  it("returns null when no persisted license grants the entitlement", () => {
    saveLicense(
      signEnvelope(makePayload({ entitlements: ["product:orionfold-arena"] })),
      { dir, now: NOW }
    );
    expect(findEntitledLicense(ENTITLEMENT, { dir, now: NOW })).toBeNull();
  });

  it("returns null when the only entitled license has expired", () => {
    saveLicense(signEnvelope(makePayload()), { dir, now: NOW });
    const later = new Date("2027-08-01T00:00:00Z");
    expect(findEntitledLicense(ENTITLEMENT, { dir, now: later })).toBeNull();
  });
});

describe("removeLicense", () => {
  it("deletes the persisted file and returns true", () => {
    saveLicense(signEnvelope(makePayload()), { dir, now: NOW });
    expect(removeLicense("OF-RELAY-TEST-0001", { dir })).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("returns false for an id that is not in the store", () => {
    expect(removeLicense("OF-RELAY-NOPE-0000", { dir })).toBe(false);
  });
});

describe("getLicensedIdentity (banner read — fail-open)", () => {
  it("prefers org over name over email", () => {
    saveLicense(
      signEnvelope(
        makePayload({
          issued_to: {
            email: "naya@example.com",
            name: "Naya Patel",
            org: "Acme Co",
          },
        })
      ),
      { dir, now: NOW }
    );
    expect(getLicensedIdentity({ dir, now: NOW })).toBe("Acme Co");
  });

  it("falls back to name, then email", () => {
    saveLicense(signEnvelope(makePayload()), { dir, now: NOW });
    expect(getLicensedIdentity({ dir, now: NOW })).toBe("Naya Patel");

    removeLicense("OF-RELAY-TEST-0001", { dir });
    saveLicense(
      signEnvelope(
        makePayload({
          license_id: "OF-RELAY-TEST-0002",
          issued_to: { email: "naya@example.com" },
        })
      ),
      { dir, now: NOW }
    );
    expect(getLicensedIdentity({ dir, now: NOW })).toBe("naya@example.com");
  });

  it("returns null when the store is empty or missing", () => {
    expect(getLicensedIdentity({ dir, now: NOW })).toBeNull();
    expect(
      getLicensedIdentity({ dir: path.join(dir, "nope"), now: NOW })
    ).toBeNull();
  });

  it("ignores invalid licenses (expired => Community banner)", () => {
    saveLicense(signEnvelope(makePayload()), { dir, now: NOW });
    const later = new Date("2027-08-01T00:00:00Z");
    expect(getLicensedIdentity({ dir, now: later })).toBeNull();
  });

  it("never throws on a corrupt store (fail-open)", () => {
    fs.writeFileSync(path.join(dir, "junk.license.json"), "{nope");
    expect(getLicensedIdentity({ dir, now: NOW })).toBeNull();
  });
});
