import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  RELAY_HOST_ENTITLEMENT,
  RELAY_HOST_GRANT_SCHEMA,
  RELAY_PACKS_ENTITLEMENT,
  countManagedCells,
  evaluateHostAction,
  inspectHostLicense,
  selectEffectiveHostLicense,
  type HostLifecycleAction,
  type ManagedCellState,
} from "../host-entitlement";
import { canonicalBytes } from "../canonicalize";
import { verifySignature, type SignedLicense } from "../verify";
import { signEnvelope } from "./sign-helper";
import hostVector from "./fixtures/relay-host-license-v1.json";

const ACTIVE_NOW = new Date("2026-08-01T00:00:00Z");
const LAPSED_NOW = new Date("2027-08-01T00:00:00Z");

function hostGrant(overrides: Record<string, unknown> = {}) {
  return {
    schema: RELAY_HOST_GRANT_SCHEMA,
    sku: "relay-host-10-annual",
    licensee: { kind: "organization", ref: "org_northstar" },
    limits: { hosts: 1, managed_cells: 10 },
    updates_until: "2027-07-17T00:00:00Z",
    rights: {
      managed_customer_cells: true,
      packs: "separate",
      reseller: false,
      transfer: "same-licensee-replacement",
      critical_security_updates: "included",
    },
    ...overrides,
  };
}

function hostPayload(overrides: Record<string, unknown> = {}) {
  return {
    schema: "orionfold.license/v1",
    license_id: "OF-RELAY-HOST-TEST-0001",
    product: "orionfold-relay-host",
    tier: "host",
    issued_to: {
      email: "operator@example.com",
      org: "Northstar Automation",
    },
    issued_at: "2026-07-17T00:00:00Z",
    not_before: "2026-07-17T00:00:00Z",
    expires_at: "2027-07-17T00:00:00Z",
    entitlements: [RELAY_HOST_ENTITLEMENT],
    grants: { [RELAY_HOST_ENTITLEMENT]: hostGrant() },
    provenance: {
      stripe_purchase_id: "pi_TEST_HOST",
      stripe_price_id: "price_TEST_HOST",
    },
    ...overrides,
  };
}

function inspect(
  payload: Record<string, unknown> = hostPayload(),
  now = ACTIVE_NOW
) {
  return inspectHostLicense(signEnvelope(payload), { now });
}

describe("inspectHostLicense", () => {
  it.each(hostVector.cases)(
    "reproduces the shared canonical bytes/signature for $name",
    (entry) => {
      const canonical = Buffer.from(canonicalBytes(entry.payload));
      expect(canonical.toString("utf8")).toBe(entry.canonical_utf8);
      expect(crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 12)).toBe(
        entry.canonical_sha256_12
      );
      expect(
        verifySignature({ payload: entry.payload, signature: entry.signature } as SignedLicense)
      ).toBe(true);
    }
  );

  it("accepts a Host-only grant after verifying the signed raw payload", () => {
    const result = inspect();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.licenseId).toBe("OF-RELAY-HOST-TEST-0001");
    expect(result.term).toBe("active");
    expect(result.updates).toBe("current");
    expect(result.grant.limits).toEqual({ hosts: 1, managed_cells: 10 });
  });

  it("accepts a bundle without conflating Pack seats and Host limits", () => {
    const result = inspect(
      hostPayload({
        product: "orionfold-relay-operator",
        tier: "operator-bundle",
        seats: 4,
        entitlements: [RELAY_PACKS_ENTITLEMENT, RELAY_HOST_ENTITLEMENT],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entitlements).toContain(RELAY_PACKS_ENTITLEMENT);
    expect(result.grant.limits.managed_cells).toBe(10);
  });

  it("rejects tampering before parsing the modified grant", () => {
    const envelope = signEnvelope(hostPayload());
    const payload = envelope.payload as ReturnType<typeof hostPayload>;
    (payload.grants[RELAY_HOST_ENTITLEMENT] as ReturnType<typeof hostGrant>).limits = {
      hosts: 99,
      managed_cells: 999,
    };
    const result = inspectHostLicense(envelope, { now: ACTIVE_NOW });
    expect(result).toMatchObject({
      ok: false,
      code: "HOST_LICENSE_SIGNATURE_INVALID",
    });
  });

  it.each([
    [
      "unsupported outer schema",
      hostPayload({ schema: "orionfold.license/v2" }),
      "HOST_LICENSE_SCHEMA_UNSUPPORTED",
    ],
    [
      "Pack-only license",
      hostPayload({
        entitlements: [RELAY_PACKS_ENTITLEMENT],
        grants: undefined,
      }),
      "HOST_GRANT_MISSING",
    ],
    [
      "Host entitlement without grant",
      hostPayload({ grants: {} }),
      "HOST_GRANT_MISSING",
    ],
    [
      "zero capacity",
      hostPayload({
        grants: {
          [RELAY_HOST_ENTITLEMENT]: hostGrant({
            limits: { hosts: 1, managed_cells: 0 },
          }),
        },
      }),
      "HOST_GRANT_INVALID",
    ],
    [
      "unlimited sentinel",
      hostPayload({
        grants: {
          [RELAY_HOST_ENTITLEMENT]: hostGrant({
            limits: { hosts: 1, managed_cells: "unlimited" },
          }),
        },
      }),
      "HOST_GRANT_INVALID",
    ],
    [
      "registry credential",
      hostPayload({ registry_credentials: { pull_token: "secret" } }),
      "HOST_LICENSE_CONTAINS_REGISTRY_SECRET",
    ],
    [
      "registry block",
      hostPayload({ registry: { repository: "ghcr.io/orionfold/relay-cell" } }),
      "HOST_LICENSE_CONTAINS_REGISTRY_SECRET",
    ],
    [
      "unknown grant schema",
      hostPayload({
        grants: {
          [RELAY_HOST_ENTITLEMENT]: hostGrant({
            schema: "orionfold.relay-host/v2",
          }),
        },
      }),
      "HOST_LICENSE_SCHEMA_UNSUPPORTED",
    ],
    [
      "mismatched Host product and tier",
      hostPayload({ product: "orionfold-relay-host", tier: "operator-bundle" }),
      "HOST_GRANT_INVALID",
    ],
    [
      "unknown Host grant field",
      hostPayload({
        grants: {
          [RELAY_HOST_ENTITLEMENT]: hostGrant({ experimental_limit: 100 }),
        },
      }),
      "HOST_GRANT_INVALID",
    ],
  ])("names %s refusal", (_name, payload, code) => {
    expect(inspect(payload as Record<string, unknown>)).toMatchObject({
      ok: false,
      code,
    });
  });

  it("distinguishes not-yet-valid from a genuine lapse", () => {
    expect(
      inspectHostLicense(signEnvelope(hostPayload()), {
        now: new Date("2026-01-01T00:00:00Z"),
      })
    ).toMatchObject({ ok: false, code: "HOST_LICENSE_NOT_YET_VALID" });

    const lapsed = inspect(hostPayload(), LAPSED_NOW);
    expect(lapsed.ok).toBe(true);
    if (lapsed.ok) {
      expect(lapsed.term).toBe("lapsed");
      expect(lapsed.updates).toBe("expired");
    }
  });

  it("binds paid authority to the opaque signed licensee", () => {
    expect(
      inspectHostLicense(signEnvelope(hostPayload()), {
        now: ACTIVE_NOW,
        expectedLicenseeRef: "org_someone_else",
      })
    ).toMatchObject({ ok: false, code: "HOST_LICENSEE_MISMATCH" });
  });

  it("names an untrusted signing key", () => {
    const envelope = signEnvelope(hostPayload());
    envelope.signature.key_id = "of-license-attacker-2099";
    expect(inspectHostLicense(envelope, { now: ACTIVE_NOW })).toMatchObject({
      ok: false,
      code: "HOST_LICENSE_KEY_UNTRUSTED",
    });
  });

  it("preserves canonical bytes for Website-compatible signing", () => {
    const payload = hostPayload();
    const first = Buffer.from(canonicalBytes(payload)).toString("utf8");
    const reordered = {
      grants: payload.grants,
      entitlements: payload.entitlements,
      expires_at: payload.expires_at,
      issued_at: payload.issued_at,
      issued_to: payload.issued_to,
      license_id: payload.license_id,
      not_before: payload.not_before,
      product: payload.product,
      provenance: payload.provenance,
      schema: payload.schema,
      tier: payload.tier,
    };
    expect(Buffer.from(canonicalBytes(reordered)).toString("utf8")).toBe(first);
  });
});

describe("managed Cell capacity", () => {
  it.each<[{ states: ManagedCellState[]; expected: number }]>([
    [{ states: ["running"], expected: 1 }],
    [{ states: ["stopped"], expected: 1 }],
    [{ states: ["retained"], expected: 1 }],
    [{ states: ["exported"], expected: 0 }],
    [{ states: ["purged"], expected: 0 }],
    [{ states: ["direct_unmanaged"], expected: 0 }],
    [
      {
        states: [
          "running",
          "stopped",
          "retained",
          "exported",
          "purged",
          "direct_unmanaged",
        ],
        expected: 3,
      },
    ],
  ])("counts $states as $expected", ({ states, expected }) => {
    expect(countManagedCells(states)).toBe(expected);
  });

  it.each<HostLifecycleAction>([
    "create",
    "import",
    "adopt",
    "clone",
    "restore_new",
  ])("refuses %s at capacity before allocation", (action) => {
    const inspection = inspect();
    const result = evaluateHostAction({
      action,
      inspection,
      cellStates: Array.from({ length: 10 }, () => "stopped" as const),
    });
    expect(result).toMatchObject({
      allowed: false,
      code: "HOST_CAPACITY_EXCEEDED",
      managedCells: 10,
      limit: 10,
    });
  });

  it("allows the same expansion after a higher signed capacity envelope", () => {
    const oldInspection = inspect();
    const upgradedInspection = inspect(
      hostPayload({
        license_id: "OF-RELAY-HOST-TEST-0002",
        grants: {
          [RELAY_HOST_ENTITLEMENT]: hostGrant({
            sku: "relay-host-25-annual",
            limits: { hosts: 1, managed_cells: 25 },
          }),
        },
      })
    );
    const cells = Array.from({ length: 10 }, (_, index) => ({
      id: `cell-${index}`,
      state: "stopped" as const,
    }));
    const snapshot = structuredClone(cells);
    const selected = selectEffectiveHostLicense([
      oldInspection,
      upgradedInspection,
    ]);
    expect(selected?.licenseId).toBe("OF-RELAY-HOST-TEST-0002");
    expect(
      evaluateHostAction({
        action: "create",
        inspection: selected,
        cellStates: cells.map((cell) => cell.state),
      })
    ).toMatchObject({ allowed: true, limit: 25 });
    expect(cells).toEqual(snapshot);
  });

  it("prefers the longer active term when signed capacities tie", () => {
    const shorter = inspect();
    const longer = inspect(
      hostPayload({
        license_id: "OF-RELAY-HOST-TEST-0003",
        expires_at: "2028-07-17T00:00:00Z",
      })
    );
    expect(selectEffectiveHostLicense([shorter, longer])?.licenseId).toBe(
      "OF-RELAY-HOST-TEST-0003"
    );
  });

  it("accounts for multi-Cell requests before allocating the first Cell", () => {
    expect(
      evaluateHostAction({
        action: "import",
        inspection: inspect(),
        cellStates: Array.from({ length: 9 }, () => "running" as const),
        requestedManagedCells: 2,
      })
    ).toMatchObject({
      allowed: false,
      code: "HOST_CAPACITY_EXCEEDED",
      managedCells: 9,
      limit: 10,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid requested capacity %s",
    (requestedManagedCells) => {
      expect(
        evaluateHostAction({
          action: "create",
          inspection: inspect(),
          requestedManagedCells,
        })
      ).toMatchObject({
        allowed: false,
        code: "HOST_CAPACITY_REQUEST_INVALID",
      });
    }
  );
});

describe("term and continuity policy", () => {
  const continuityActions: HostLifecycleAction[] = [
    "start",
    "stop",
    "restart",
    "backup",
    "export",
    "recover",
    "restore_existing",
    "rollback",
    "purge",
    "export_and_release",
    "critical_security_update",
  ];

  it.each(continuityActions)(
    "allows receipt-bound %s after lapse",
    (action) => {
      const result = evaluateHostAction({
        action,
        inspection: inspect(hostPayload(), LAPSED_NOW),
        cellStates: ["stopped"],
        hasManagedCellReceipt: true,
      });
      expect(result).toMatchObject({ allowed: true, mode: "continuity" });
    }
  );

  it("does not let an unlicensed caller manufacture continuity authority", () => {
    expect(
      evaluateHostAction({ action: "export", inspection: null })
    ).toMatchObject({ allowed: false, code: "HOST_LICENSE_REQUIRED" });
  });

  it("blocks expansion after lapse without disturbing existing usage", () => {
    expect(
      evaluateHostAction({
        action: "create",
        inspection: inspect(hostPayload(), LAPSED_NOW),
        cellStates: ["running", "stopped"],
      })
    ).toMatchObject({
      allowed: false,
      code: "HOST_LICENSE_LAPSED",
      managedCells: 2,
    });
  });

  it("separates routine upgrades from critical security updates", () => {
    const updatesExpired = inspect(
      hostPayload({
        expires_at: "2028-07-17T00:00:00Z",
        grants: {
          [RELAY_HOST_ENTITLEMENT]: hostGrant({
            updates_until: "2026-07-31T00:00:00Z",
          }),
        },
      }),
      ACTIVE_NOW
    );
    expect(
      evaluateHostAction({
        action: "feature_upgrade",
        inspection: updatesExpired,
      })
    ).toMatchObject({ allowed: false, code: "HOST_UPDATES_EXPIRED" });
    expect(
      evaluateHostAction({
        action: "critical_security_update",
        inspection: updatesExpired,
        hasManagedCellReceipt: true,
      })
    ).toMatchObject({ allowed: true });
  });

  it("requires the prior Host to be retired before replacement", () => {
    const inspection = inspect();
    expect(
      evaluateHostAction({
        action: "claim_replacement_host",
        inspection,
        replacementHostRetired: false,
      })
    ).toMatchObject({
      allowed: false,
      code: "HOST_REPLACEMENT_REQUIRES_RETIREMENT",
    });
    expect(
      evaluateHostAction({
        action: "claim_replacement_host",
        inspection,
        replacementHostRetired: true,
      })
    ).toMatchObject({ allowed: true });
  });
});
