import { z } from "zod";

export const HOST_DEPLOYMENT_SCHEMA_VERSION = 1 as const;

const SafeRefSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9._-]{0,62})$/);

export const HostDeploymentDraftSchema = z.object({
  placement: z.enum(["local", "cloud_preview"]),
  hostId: SafeRefSchema,
  regionRef: z.enum(["local", "sfo3", "nyc3", "ams3"]),
  sizeRef: z.enum([
    "basic-2gib-1vcpu",
    "basic-4gib-2vcpu",
    "basic-8gib-4vcpu",
    "basic-16gib-8vcpu",
  ]),
  desiredCells: z.number().int().min(1).max(100),
  exposure: z.enum(["local", "tailnet", "authenticated_public"]),
  runtimeProfile: z.enum(["byok_hosted", "private_runtime"]),
  backupProfile: z.enum(["manual_export", "weekly_provider"]),
  concurrency: z.enum(["light", "steady", "busy"]),
  updatedAt: z.number().int().nonnegative(),
}).strict();

export type HostDeploymentDraft = z.infer<typeof HostDeploymentDraftSchema>;

export const HostDeploymentEstimateSchema = z.object({
  sourceDate: z.string().date(),
  sourceUrl: z.url(),
  currency: z.literal("USD"),
  hostCount: z.number().int().positive(),
  admittedCellsPerHost: z.number().int().positive(),
  requestedCells: z.number().int().positive(),
  reservePercent: z.number().int().min(0).max(50),
  monthlyLow: z.number().nonnegative(),
  monthlyHigh: z.number().nonnegative(),
  provisional: z.literal(true),
  exclusions: z.array(z.string().min(1)).min(1),
}).strict();

export type HostDeploymentEstimate = z.infer<typeof HostDeploymentEstimateSchema>;

export const HostDeploymentStageSchema = z.enum([
  "configure",
  "estimated",
  "preflight_passed",
  "authorized",
  "installed",
  "ready",
  "failed",
]);

export const HostDeploymentJourneySchema = z.object({
  schemaVersion: z.literal(HOST_DEPLOYMENT_SCHEMA_VERSION),
  draft: HostDeploymentDraftSchema,
  stage: HostDeploymentStageSchema,
  planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  estimate: HostDeploymentEstimateSchema.nullable(),
  providerHostRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/).nullable(),
  authorizationConfirmedAt: z.number().int().nonnegative().nullable(),
  invalidatedReason: z.string().min(1).max(240).nullable(),
  lastReasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/),
  updatedAt: z.number().int().nonnegative(),
}).strict();

export type HostDeploymentJourney = z.infer<typeof HostDeploymentJourneySchema>;

export const HostDeploymentMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_draft"), draft: HostDeploymentDraftSchema.omit({ updatedAt: true }) }).strict(),
  z.object({ action: z.literal("estimate") }).strict(),
  z.object({ action: z.literal("preflight"), planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("authorize"), planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("install"), planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict(),
  z.object({
    action: z.literal("create_cell"),
    operationId: z.string().uuid(),
    cellId: SafeRefSchema,
    ownerRef: SafeRefSchema,
  }).strict(),
  z.object({
    action: z.literal("cell_action"),
    operationId: z.string().uuid(),
    cellId: SafeRefSchema,
    lifecycle: z.enum(["start", "stop", "restart", "retain", "purge"]),
    confirmation: z.string().max(63).optional(),
  }).strict(),
]);

export type HostDeploymentMutation = z.infer<typeof HostDeploymentMutationSchema>;

export type HostDeploymentLicenseView = {
  status: "active" | "lapsed" | "missing" | "invalid";
  code: string;
  detail: string;
  licenseId: string | null;
  licenseeRef: string | null;
  managedCellsLimit: number | null;
  expiresAt: string | null;
};

export type HostDeploymentCellView = {
  cellId: string;
  ownerRef: string;
  version: string;
  imageDigest: string;
  state: string;
  health: string;
  backupStatus: string;
  loopbackPort: number;
  cpuMillis: number;
  memoryBytes: number;
  storageBytes: number;
  lastReceiptId: string | null;
};

export type HostDeploymentReceiptView = {
  receiptId: string;
  operationId: string;
  cellId: string | null;
  action: string;
  outcome: string;
  reasonCode: string;
  startedAt: number;
  completedAt: number | null;
};

export type HostDeploymentView = {
  journey: HostDeploymentJourney;
  license: HostDeploymentLicenseView;
  runtimeMode: "preview" | "docker";
  host: null | {
    hostId: string;
    supervisorVersion: string;
    actualState: string;
    desiredState: string;
    capacity: {
      cpuMillis: number;
      memoryBytes: number;
      storageBytes: number;
      reservePercent: number;
    };
  };
  cells: HostDeploymentCellView[];
  receipts: HostDeploymentReceiptView[];
};

export function defaultHostDeploymentDraft(now = Date.now()): HostDeploymentDraft {
  return {
    placement: "local",
    hostId: "relay-host",
    regionRef: "local",
    sizeRef: "basic-4gib-2vcpu",
    desiredCells: 1,
    exposure: "local",
    runtimeProfile: "byok_hosted",
    backupProfile: "manual_export",
    concurrency: "light",
    updatedAt: now,
  };
}

export function defaultHostDeploymentJourney(now = Date.now()): HostDeploymentJourney {
  return {
    schemaVersion: HOST_DEPLOYMENT_SCHEMA_VERSION,
    draft: defaultHostDeploymentDraft(now),
    stage: "configure",
    planDigest: null,
    estimate: null,
    providerHostRef: null,
    authorizationConfirmedAt: null,
    invalidatedReason: null,
    lastReasonCode: "HOST_DEPLOYMENT_DRAFT_READY",
    updatedAt: now,
  };
}
