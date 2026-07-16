import crypto from "node:crypto";
import { z } from "zod";
import { WorkshopError } from "@/lib/workshop/errors";

const CheckpointSchema = z
  .object({
    id: z.enum(["inspect", "adapt", "govern", "run", "retain"]),
    title: z.string().min(1),
    description: z.string().min(1),
    sourceRoute: z.string().startsWith("/"),
    required: z.boolean(),
  })
  .strict();

const RescueSchema = z
  .object({
    code: z.string().min(1),
    title: z.string().min(1),
    action: z.string().min(1),
    fallback: z.string().min(1).optional(),
  })
  .strict();

const EditionPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    editionVersion: z.string().min(1),
    title: z.string().min(1),
    promise: z.string().min(1),
    relayRange: z.string().min(1),
    fixture: z
      .object({
        family: z.literal("marketing-line"),
        starterId: z.string().min(1),
        sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    capabilities: z
      .object({
        required: z.array(z.string().min(1)),
        optional: z.array(z.string().min(1)),
        deterministicFallback: z.boolean(),
      })
      .strict(),
    checkpoints: z.array(CheckpointSchema).length(5),
    rescues: z.array(RescueSchema),
    sourceReferences: z.array(z.string().min(1)),
    completion: z
      .object({
        includeReceipt: z.boolean(),
        includeSelectedOutputs: z.boolean(),
        includeUserAppExport: z.boolean(),
        verdicts: z
          .array(z.enum(["passed", "at_risk", "failed"]))
          .length(3),
      })
      .strict(),
  })
  .strict();

export const WorkshopEditionSchema = EditionPayloadSchema.extend({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z
    .object({
      algorithm: z.literal("ed25519"),
      keyId: z.string().min(1),
      value: z.string().min(1),
    })
    .strict()
    .optional(),
}).strict();

export type WorkshopEdition = z.infer<typeof WorkshopEditionSchema>;
export type WorkshopEditionPayload = z.infer<typeof EditionPayloadSchema>;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson(
            (value as Record<string, unknown>)[key]
          )}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function editionContentHash(payload: WorkshopEditionPayload): string {
  return crypto.createHash("sha256").update(stableJson(payload)).digest("hex");
}

export function verifyWorkshopEdition(
  input: unknown,
  options: {
    allowUnsignedHash?: string;
    trustedKeys?: Readonly<Record<string, string>>;
  } = {}
): WorkshopEdition {
  const parsed = WorkshopEditionSchema.safeParse(input);
  if (!parsed.success) {
    throw new WorkshopError(
      "edition_unsupported",
      parsed.error.issues[0]?.message ?? "Workshop edition is unsupported.",
      "Use an edition built for this Relay release."
    );
  }
  const edition = parsed.data;
  const { contentHash: _contentHash, signature: _signature, ...payload } =
    edition;
  const actualHash = editionContentHash(payload);
  if (actualHash !== edition.contentHash) {
    throw new WorkshopError(
      "integrity_failed",
      "Workshop edition content does not match its declared hash.",
      "Download the edition again or use the built-in known-good starter."
    );
  }
  if (!edition.signature) {
    if (options.allowUnsignedHash !== actualHash) {
      throw new WorkshopError(
        "signature_failed",
        "Unsigned external workshop editions are not accepted.",
        "Use the built-in edition or obtain a signed edition from Orionfold."
      );
    }
    return edition;
  }
  const publicKey = options.trustedKeys?.[edition.signature.keyId];
  if (!publicKey) {
    throw new WorkshopError(
      "signature_failed",
      `Workshop signing key "${edition.signature.keyId}" is not trusted.`,
      "Update Relay or obtain an edition signed by a trusted key."
    );
  }
  const valid = crypto.verify(
    null,
    Buffer.from(actualHash, "utf8"),
    publicKey,
    Buffer.from(edition.signature.value, "base64")
  );
  if (!valid) {
    throw new WorkshopError(
      "signature_failed",
      "Workshop edition signature is invalid.",
      "Do not run this edition. Download a fresh copy from Orionfold."
    );
  }
  return edition;
}
