import { z } from "zod";

export const RECOVERY_MAGIC = Buffer.from("RLYRCV1\n", "ascii");
export const RECOVERY_TAG_BYTES = 16;
export const RECOVERY_IV_BYTES = 12;
export const RECOVERY_KEY_BYTES = 32;
export const RECOVERY_HEADER_MAX_BYTES = 16 * 1024;

export const recoveryHeaderSchema = z.object({
  format: z.literal("relay-recovery-v1"),
  algorithm: z.literal("aes-256-gcm"),
  cellId: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62})$/),
  relayVersion: z.string().regex(/^\d+\.\d+\.\d+(?:[-+].*)?$/),
  schemaContractVersion: z.literal(1),
  snapshotId: z.string().uuid(),
  createdAt: z.string().datetime(),
  iv: z.string().min(16).max(32),
});

export type RecoveryHeader = z.infer<typeof recoveryHeaderSchema>;

export const recoveryPayloadSchema = z.object({
  format: z.literal("relay-recovery-payload-v1"),
  snapshotManifestVersion: z.literal(2),
  cellId: z.string(),
  snapshotId: z.string().uuid(),
  secretRoot: z.object({
    present: z.boolean(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  }),
});

export type RecoveryPayload = z.infer<typeof recoveryPayloadSchema>;

export const recoveryReceiptSchema = z.object({
  format: z.literal("relay-recovery-receipt-v1"),
  operationId: z.string().uuid(),
  operation: z.enum(["create", "verify", "drill", "restore"]),
  status: z.enum(["ready", "verified", "restored", "failed"]),
  reasonCode: z.string(),
  cellId: z.string(),
  bundleFile: z.string(),
  bundleSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  keyFingerprint: z.string().regex(/^[a-f0-9]{16}$/).nullable(),
  snapshotId: z.string().uuid().nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  dbIntegrity: z.enum(["ok", "not-checked"]),
  authIntegrity: z.enum(["ok", "absent", "not-checked"]),
  secretRootPresent: z.boolean().nullable(),
  restoredFileCount: z.number().int().nonnegative().nullable(),
});

export type RecoveryReceipt = z.infer<typeof recoveryReceiptSchema>;

export type VerifiedRecovery = {
  header: RecoveryHeader;
  payload: RecoveryPayload;
  stagingDir: string;
  bundleSha256: string;
  keyFingerprint: string;
  dbIntegrity: "ok";
  authIntegrity: "ok" | "absent";
};
