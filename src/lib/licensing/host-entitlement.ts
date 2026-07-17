import { z } from "zod";
import {
  LicenseVerificationError,
  verifySignature,
  type SignedLicense,
} from "./verify";

export const RELAY_HOST_ENTITLEMENT = "product:relay-host" as const;
export const RELAY_PACKS_ENTITLEMENT = "product:orionfold-relay" as const;
export const RELAY_HOST_GRANT_SCHEMA = "orionfold.relay-host/v1" as const;
export const RELAY_HOST_LAUNCH_SKU = "relay-host-10-annual" as const;
export const RELAY_HOST_LAUNCH_LIMITS = {
  hosts: 1,
  managedCells: 10,
} as const;

const LicenseeSchema = z.object({
  kind: z.enum(["organization", "individual"]),
  ref: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
}).strict();

export const RelayHostGrantSchema = z.object({
  schema: z.literal(RELAY_HOST_GRANT_SCHEMA),
  sku: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*$/),
  licensee: LicenseeSchema,
  limits: z.object({
    hosts: z.number().int().positive(),
    managed_cells: z.number().int().positive(),
  }).strict(),
  updates_until: z.iso.datetime(),
  rights: z.object({
    managed_customer_cells: z.literal(true),
    packs: z.literal("separate"),
    reseller: z.literal(false),
    transfer: z.literal("same-licensee-replacement"),
    critical_security_updates: z.literal("included"),
  }).strict(),
}).strict();

export type RelayHostGrant = z.infer<typeof RelayHostGrantSchema>;

export type HostLicenseFailureCode =
  | "HOST_LICENSE_SIGNATURE_INVALID"
  | "HOST_LICENSE_KEY_UNTRUSTED"
  | "HOST_LICENSE_SCHEMA_UNSUPPORTED"
  | "HOST_GRANT_MISSING"
  | "HOST_GRANT_INVALID"
  | "HOST_LICENSE_NOT_YET_VALID"
  | "HOST_LICENSEE_MISMATCH"
  | "HOST_LICENSE_CONTAINS_REGISTRY_SECRET";

export interface HostLicenseInspectionOk {
  ok: true;
  licenseId: string;
  entitlements: string[];
  grant: RelayHostGrant;
  term: "active" | "lapsed";
  updates: "current" | "expired";
  expiresAt: string;
}

export interface HostLicenseInspectionFail {
  ok: false;
  code: HostLicenseFailureCode;
  detail: string;
}

export type HostLicenseInspection =
  | HostLicenseInspectionOk
  | HostLicenseInspectionFail;

interface HostPayloadShape {
  schema?: unknown;
  license_id?: unknown;
  product?: unknown;
  tier?: unknown;
  issued_at?: unknown;
  not_before?: unknown;
  expires_at?: unknown;
  entitlements?: unknown;
  grants?: unknown;
}

const FORBIDDEN_LICENSE_KEYS = new Set([
  "registry",
  "pull_token",
  "registry_token",
  "registry_password",
  "registry_credentials",
]);

function findForbiddenRegistrySecret(
  value: unknown,
  path: string[] = []
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const hit = findForbiddenRegistrySecret(value[index], [...path, String(index)]);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_LICENSE_KEYS.has(key)) return [...path, key].join(".");
    const hit = findForbiddenRegistrySecret(child, [...path, key]);
    if (hit) return hit;
  }
  return null;
}

function fail(
  code: HostLicenseFailureCode,
  detail: string
): HostLicenseInspectionFail {
  return { ok: false, code, detail };
}

/**
 * Verify the raw signed bytes before reading the Host grant. Expired licenses
 * remain inspectable because continuity operations need their authentic limits
 * and licensee even after paid expansion has lapsed.
 */
export function inspectHostLicense(
  envelope: SignedLicense,
  options: { now?: Date; expectedLicenseeRef?: string } = {}
): HostLicenseInspection {
  try {
    if (!verifySignature(envelope)) {
      return fail(
        "HOST_LICENSE_SIGNATURE_INVALID",
        "Host license signature does not verify (payload may be tampered)."
      );
    }
  } catch (error) {
    if (error instanceof LicenseVerificationError) {
      const untrusted = /untrusted license signing key/i.test(error.message);
      return fail(
        untrusted
          ? "HOST_LICENSE_KEY_UNTRUSTED"
          : "HOST_LICENSE_SIGNATURE_INVALID",
        error.message
      );
    }
    throw error;
  }

  const secretPath = findForbiddenRegistrySecret(envelope.payload);
  if (secretPath) {
    return fail(
      "HOST_LICENSE_CONTAINS_REGISTRY_SECRET",
      `Host license contains forbidden registry credential material at ${secretPath}.`
    );
  }

  const payload = (envelope.payload ?? {}) as HostPayloadShape;
  if (payload.schema !== "orionfold.license/v1") {
    return fail(
      "HOST_LICENSE_SCHEMA_UNSUPPORTED",
      `Unsupported outer license schema: ${String(payload.schema ?? "(missing)")}.`
    );
  }

  const validProductTier =
    (payload.product === "orionfold-relay-host" && payload.tier === "host") ||
    (payload.product === "orionfold-relay-operator" &&
      payload.tier === "operator-bundle");
  if (!validProductTier) {
    return fail(
      "HOST_GRANT_INVALID",
      "Host license product/tier must be orionfold-relay-host/host or orionfold-relay-operator/operator-bundle."
    );
  }

  const entitlements = Array.isArray(payload.entitlements)
    ? payload.entitlements.map(String)
    : [];
  if (!entitlements.includes(RELAY_HOST_ENTITLEMENT)) {
    return fail(
      "HOST_GRANT_MISSING",
      `License does not grant ${RELAY_HOST_ENTITLEMENT}.`
    );
  }

  const grants =
    payload.grants && typeof payload.grants === "object"
      ? (payload.grants as Record<string, unknown>)
      : null;
  if (!grants || !(RELAY_HOST_ENTITLEMENT in grants)) {
    return fail(
      "HOST_GRANT_MISSING",
      `License entitlement has no matching ${RELAY_HOST_GRANT_SCHEMA} grant.`
    );
  }

  const rawGrant = grants[RELAY_HOST_ENTITLEMENT];
  const rawGrantSchema =
    rawGrant && typeof rawGrant === "object"
      ? (rawGrant as Record<string, unknown>).schema
      : undefined;
  if (
    rawGrantSchema != null &&
    rawGrantSchema !== RELAY_HOST_GRANT_SCHEMA
  ) {
    return fail(
      "HOST_LICENSE_SCHEMA_UNSUPPORTED",
      `Unsupported Host grant schema: ${String(rawGrantSchema)}.`
    );
  }

  const parsedGrant = RelayHostGrantSchema.safeParse(rawGrant);
  if (!parsedGrant.success) {
    return fail(
      "HOST_GRANT_INVALID",
      `Host grant is invalid: ${z.prettifyError(parsedGrant.error)}`
    );
  }

  if (
    options.expectedLicenseeRef &&
    parsedGrant.data.licensee.ref !== options.expectedLicenseeRef
  ) {
    return fail(
      "HOST_LICENSEE_MISMATCH",
      `Host license belongs to ${parsedGrant.data.licensee.ref}, not ${options.expectedLicenseeRef}.`
    );
  }

  const notBeforeRaw = payload.not_before ?? payload.issued_at;
  const notBefore = new Date(String(notBeforeRaw ?? ""));
  const expiresAt = new Date(String(payload.expires_at ?? ""));
  if (
    typeof payload.license_id !== "string" ||
    payload.license_id.length === 0 ||
    Number.isNaN(notBefore.getTime()) ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt <= notBefore
  ) {
    return fail(
      "HOST_GRANT_INVALID",
      "Host license must contain a license_id and ordered, valid not_before/issued_at and expires_at instants."
    );
  }

  const now = options.now ?? new Date();
  if (now < notBefore) {
    return fail(
      "HOST_LICENSE_NOT_YET_VALID",
      `Host license is not valid until ${notBefore.toISOString()}.`
    );
  }

  const updatesUntil = new Date(parsedGrant.data.updates_until);
  return {
    ok: true,
    licenseId: payload.license_id,
    entitlements,
    grant: parsedGrant.data,
    term: now < expiresAt ? "active" : "lapsed",
    updates: now < updatesUntil ? "current" : "expired",
    expiresAt: expiresAt.toISOString(),
  };
}

export type ManagedCellState =
  | "running"
  | "stopped"
  | "retained"
  | "exported"
  | "purged"
  | "direct_unmanaged";

const COUNTED_CELL_STATES = new Set<ManagedCellState>([
  "running",
  "stopped",
  "retained",
]);

export function countManagedCells(states: readonly ManagedCellState[]): number {
  return states.reduce(
    (count, state) => count + (COUNTED_CELL_STATES.has(state) ? 1 : 0),
    0
  );
}

export type HostLifecycleAction =
  | "create"
  | "import"
  | "adopt"
  | "clone"
  | "restore_new"
  | "start"
  | "stop"
  | "restart"
  | "backup"
  | "export"
  | "recover"
  | "restore_existing"
  | "rollback"
  | "purge"
  | "export_and_release"
  | "feature_upgrade"
  | "critical_security_update"
  | "claim_replacement_host";

export type HostAdmissionFailureCode =
  | HostLicenseFailureCode
  | "HOST_LICENSE_REQUIRED"
  | "HOST_LICENSE_LAPSED"
  | "HOST_UPDATES_EXPIRED"
  | "HOST_CAPACITY_REQUEST_INVALID"
  | "HOST_CAPACITY_EXCEEDED"
  | "HOST_REPLACEMENT_REQUIRES_RETIREMENT";

export type HostAdmissionResult =
  | {
      allowed: true;
      mode: "licensed" | "continuity";
      managedCells: number;
      limit?: number;
    }
  | {
      allowed: false;
      code: HostAdmissionFailureCode;
      detail: string;
      managedCells: number;
      limit?: number;
    };

const EXPANSION_ACTIONS = new Set<HostLifecycleAction>([
  "create",
  "import",
  "adopt",
  "clone",
  "restore_new",
]);

const CONTINUITY_ACTIONS = new Set<HostLifecycleAction>([
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
]);

function deny(
  code: HostAdmissionFailureCode,
  detail: string,
  managedCells: number,
  limit?: number
): HostAdmissionResult {
  return {
    allowed: false,
    code,
    detail,
    managedCells,
    ...(limit == null ? {} : { limit }),
  };
}

/**
 * Normative preflight policy for G-083. It has no side effects: callers must
 * obtain `allowed: true` before allocating any Host resource or registry row.
 */
export function evaluateHostAction(input: {
  action: HostLifecycleAction;
  inspection?: HostLicenseInspection | null;
  cellStates?: readonly ManagedCellState[];
  hasManagedCellReceipt?: boolean;
  replacementHostRetired?: boolean;
  requestedManagedCells?: number;
}): HostAdmissionResult {
  const managedCells = countManagedCells(input.cellStates ?? []);
  const inspection = input.inspection;

  if (CONTINUITY_ACTIONS.has(input.action)) {
    if (!input.hasManagedCellReceipt) {
      return deny(
        "HOST_LICENSE_REQUIRED",
        "Continuity operations require an existing Host-managed Cell receipt.",
        managedCells
      );
    }
    const limit = inspection?.ok
      ? inspection.grant.limits.managed_cells
      : undefined;
    return {
      allowed: true,
      mode: inspection?.ok && inspection.term === "active" ? "licensed" : "continuity",
      managedCells,
      ...(limit == null ? {} : { limit }),
    };
  }

  if (!inspection) {
    return deny(
      "HOST_LICENSE_REQUIRED",
      `Action ${input.action} requires a signed ${RELAY_HOST_ENTITLEMENT} grant.`,
      managedCells
    );
  }
  if (!inspection.ok) {
    return deny(inspection.code, inspection.detail, managedCells);
  }

  const limit = inspection.grant.limits.managed_cells;
  if (inspection.term === "lapsed") {
    return deny(
      "HOST_LICENSE_LAPSED",
      "Host license has lapsed; existing Cells continue, but paid expansion is unavailable.",
      managedCells,
      limit
    );
  }

  if (EXPANSION_ACTIONS.has(input.action)) {
    const requested = input.requestedManagedCells ?? 1;
    if (!Number.isSafeInteger(requested) || requested <= 0) {
      return deny(
        "HOST_CAPACITY_REQUEST_INVALID",
        `Requested managed Cell count must be a positive integer (got ${String(requested)}).`,
        managedCells,
        limit
      );
    }
    if (managedCells + requested > limit) {
      return deny(
        "HOST_CAPACITY_EXCEEDED",
        `Managed Cell capacity is ${managedCells}/${limit}; ${requested} requested and no resources were allocated.`,
        managedCells,
        limit
      );
    }
    return { allowed: true, mode: "licensed", managedCells, limit };
  }

  if (input.action === "feature_upgrade") {
    if (inspection.updates === "expired") {
      return deny(
        "HOST_UPDATES_EXPIRED",
        "Routine Host feature updates require current update eligibility; critical security updates remain available.",
        managedCells,
        limit
      );
    }
    return { allowed: true, mode: "licensed", managedCells, limit };
  }

  if (input.action === "claim_replacement_host") {
    if (!input.replacementHostRetired) {
      return deny(
        "HOST_REPLACEMENT_REQUIRES_RETIREMENT",
        "Retire the previous Host claim before using this one-Host entitlement on a replacement machine.",
        managedCells,
        limit
      );
    }
    return { allowed: true, mode: "licensed", managedCells, limit };
  }

  return deny(
    "HOST_LICENSE_REQUIRED",
    `Unsupported Host lifecycle action: ${String(input.action)}.`,
    managedCells,
    limit
  );
}

/** Pick one envelope; limits never sum. A higher signed replacement wins. */
export function selectEffectiveHostLicense(
  inspections: readonly HostLicenseInspection[],
  expectedLicenseeRef?: string
): HostLicenseInspectionOk | null {
  const candidates = inspections.filter(
    (inspection): inspection is HostLicenseInspectionOk =>
      inspection.ok &&
      (!expectedLicenseeRef ||
        inspection.grant.licensee.ref === expectedLicenseeRef)
  );
  candidates.sort((a, b) => {
    if (a.term !== b.term) return a.term === "active" ? -1 : 1;
    const cells =
      b.grant.limits.managed_cells - a.grant.limits.managed_cells;
    if (cells !== 0) return cells;
    const hosts = b.grant.limits.hosts - a.grant.limits.hosts;
    if (hosts !== 0) return hosts;
    const term = b.expiresAt.localeCompare(a.expiresAt);
    if (term !== 0) return term;
    return b.grant.updates_until.localeCompare(a.grant.updates_until);
  });
  return candidates[0] ?? null;
}
