import { z } from "zod";

export const HOST_REGISTRY_SCHEMA_VERSION = 1 as const;
export const HOST_CELL_MANIFEST_SCHEMA = "orionfold.relay-host-cell/v1" as const;
export const RELAY_CELL_IMAGE_REPOSITORY = "ghcr.io/orionfold/relay-cell" as const;

const SafeIdSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9._-]{0,62})$/);
const OpaqueRefSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,199})$/);
const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ImageReferenceSchema = z
  .string()
  .regex(/^ghcr\.io\/orionfold\/relay-cell@sha256:[a-f0-9]{64}$/);
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);

export const HostCapacitySchema = z
  .object({
    cpuMillis: z.number().int().positive(),
    memoryBytes: z.number().int().positive(),
    storageBytes: z.number().int().positive(),
    reservePercent: z.number().int().min(0).max(50),
  })
  .strict();

export const HostConfigSchema = z
  .object({
    schemaVersion: z.literal(HOST_REGISTRY_SCHEMA_VERSION),
    hostId: SafeIdSchema,
    licenseeRef: OpaqueRefSchema,
    licenseId: OpaqueRefSchema,
    supervisorVersion: SemverSchema,
    runtimeKind: z.enum(["docker", "podman"]),
    desiredState: z.enum(["ready", "draining", "offline"]),
    actualState: z.enum([
      "initializing",
      "ready",
      "degraded",
      "draining",
      "offline",
      "error",
    ]),
    capacity: HostCapacitySchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const CellArtifactSchema = z
  .object({
    version: SemverSchema,
    imageReference: ImageReferenceSchema,
    imageDigest: DigestSchema,
    schemaMin: z.literal(1),
    schemaMax: z.literal(1),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    if (!artifact.imageReference.endsWith(`@${artifact.imageDigest}`)) {
      ctx.addIssue({
        code: "custom",
        path: ["imageDigest"],
        message: "imageDigest must match the digest-pinned imageReference",
      });
    }
  });

export const CellResourceRequestSchema = z
  .object({
    cpuMillis: z.number().int().min(100),
    memoryBytes: z.number().int().min(128 * 1024 * 1024),
    storageBytes: z.number().int().min(256 * 1024 * 1024),
  })
  .strict();

export const CellManifestSchema = z
  .object({
    schema: z.literal(HOST_CELL_MANIFEST_SCHEMA),
    cellId: SafeIdSchema,
    ownerRef: OpaqueRefSchema,
    origin: z.enum(["create", "import", "adopt", "clone", "restore_new"]),
    artifact: CellArtifactSchema,
    loopbackPort: z.number().int().min(1024).max(65535),
    resources: CellResourceRequestSchema,
  })
  .strict();

export const CellAllocationSchema = z
  .object({
    containerName: z.string().regex(/^relay-cell-[a-z0-9][a-z0-9._-]{0,62}$/),
    dataRoot: z.string().min(1),
    secretRootRef: z.string().min(1),
    networkName: z.string().regex(/^relay-cell-[a-z0-9][a-z0-9._-]{0,62}-net$/),
    hostLoopbackPort: z.number().int().min(1024).max(65535),
    cpuMillis: z.number().int().positive(),
    memoryBytes: z.number().int().positive(),
    storageBytes: z.number().int().positive(),
  })
  .strict();

export const CellActualStateSchema = z.enum([
  "absent",
  "creating",
  "stopped",
  "starting",
  "running",
  "stopping",
  "restarting",
  "exporting",
  "removing",
  "rolling_back",
  "retained",
  "exported",
  "purged",
  "partial",
  "error",
  "orphaned",
]);

export const CellRecordSchema = z
  .object({
    schemaVersion: z.literal(HOST_REGISTRY_SCHEMA_VERSION),
    cellId: SafeIdSchema,
    ownerRef: OpaqueRefSchema,
    artifact: CellArtifactSchema,
    desiredState: z.enum(["absent", "stopped", "running"]),
    actualState: CellActualStateSchema,
    allocation: CellAllocationSchema,
    manifestDigest: DigestSchema,
    health: z.enum(["unknown", "starting", "healthy", "degraded", "unreachable"]),
    backupStatus: z.enum(["unknown", "pending", "verified", "degraded"]),
    checkpointRef: DigestSchema.nullable(),
    lastReceiptId: z.string().uuid().nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const HostOperationActionSchema = z.enum([
  "create",
  "start",
  "stop",
  "restart",
  "retain",
  "export_release",
  "purge",
  "reconcile",
]);

export const LifecycleReceiptSchema = z
  .object({
    schemaVersion: z.literal(HOST_REGISTRY_SCHEMA_VERSION),
    receiptId: z.string().uuid(),
    operationId: OpaqueRefSchema,
    planDigest: DigestSchema,
    hostId: SafeIdSchema,
    cellId: SafeIdSchema.nullable(),
    actorRef: OpaqueRefSchema,
    action: HostOperationActionSchema,
    outcome: z.enum([
      "running",
      "succeeded",
      "failed",
      "partial",
      "rolled_back",
      "rollback_partial",
      "cancelled",
    ]),
    reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/),
    resourceRefs: z.array(z.string().min(1).max(500)).max(16),
    startedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative().nullable(),
  })
  .strict();

export type HostCapacity = z.infer<typeof HostCapacitySchema>;
export type HostConfig = z.infer<typeof HostConfigSchema>;
export type CellManifest = z.infer<typeof CellManifestSchema>;
export type CellArtifact = z.infer<typeof CellArtifactSchema>;
export type CellAllocation = z.infer<typeof CellAllocationSchema>;
export type CellActualState = z.infer<typeof CellActualStateSchema>;
export type CellRecord = z.infer<typeof CellRecordSchema>;
export type HostOperationAction = z.infer<typeof HostOperationActionSchema>;
export type LifecycleReceipt = z.infer<typeof LifecycleReceiptSchema>;
