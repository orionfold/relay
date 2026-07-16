import crypto from "node:crypto";
import { z } from "zod";
import pkg from "../../../package.json";
import {
  BUILTIN_WORKSHOP_EDITION,
  WORKSHOP_STARTER_HASH,
  WORKSHOP_STARTER_ID,
} from "@/lib/workshop/builtin";
import { stableJson } from "@/lib/workshop/schema";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const TimestampSchema = z.string().regex(
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z$/
);

const SourceReferenceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    owner: z.enum(["relay", "website", "training", "motion"]),
    classification: z.enum(["public", "private-paid", "operator-only"]),
    path: z.string().min(1),
    role: z.string().min(1),
    contentHash: Sha256Schema,
  })
  .strict();

const WebsiteHandoffSchema = z
  .object({
    schemaVersion: z.literal(1),
    offeringId: z.literal("relay-operator-workshop"),
    editionVersion: z.string().min(1),
    status: z.literal("awaiting-website-configuration"),
    publicPromise: z.string().min(1),
    price: z
      .object({
        lookupKey: z.null(),
        amountCents: z.null(),
        currency: z.literal("USD"),
        authority: z.literal("website-catalog-and-stripe"),
      })
      .strict(),
    access: z
      .object({
        accountRequired: z.literal(false),
        mode: z.literal("guest-purchase-account-free-download"),
        editionHash: Sha256Schema,
        paidInstructionsIncluded: z.literal(false),
        fulfillmentOwner: z.literal("website"),
      })
      .strict(),
    externalGates: z.array(
      z.enum([
        "offer-copy",
        "price-and-lookup-key",
        "checkout",
        "transactional-email",
        "refund-policy",
        "public-publishing",
      ])
    ),
  })
  .strict();

const MotionJobSeedSchema = z
  .object({
    schema_version: z.literal(1),
    revision: z.literal(0),
    job_id: z.string().regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{8}t[0-9]{6}z-[a-f0-9]{4,8}$/
    ),
    state: z.literal("draft"),
    title: z.string().min(1),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
    source: z
      .object({
        requesting_project: z.literal("orionfold-relay"),
        source_paths: z.array(z.string().startsWith("/")).min(1),
        source_commit: z.null(),
        source_state: z.literal("unknown"),
        copied_inputs: z.array(
          z
            .object({
              source_path: z.string().min(1),
              snapshot_path: z.string().min(1),
              sha256: Sha256Schema,
            })
            .strict()
        ),
      })
      .strict(),
    brief: z
      .object({
        snapshot_path: z.string().min(1),
        sha256: Sha256Schema,
        claims_status: z.literal("pending"),
        creative_status: z.literal("pending"),
      })
      .strict(),
    target: z
      .object({
        composition: z.null(),
        width: z.literal(1920),
        height: z.literal(1080),
        fps: z.literal(30),
        duration_policy: z.literal("training-owner-approved"),
        delivery_profiles: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    route: z
      .object({
        profile: z.literal("manual"),
        operations: z.array(z.never()),
      })
      .strict(),
    stages: z
      .array(
        z
          .object({
            stage_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            ordinal: z.number().int().nonnegative(),
            state: z.literal("pending"),
            attempts: z.literal(0),
            plan_hash: z.null(),
            accepted_receipt: z.null(),
            current_attempt: z.null(),
            error: z.null(),
          })
          .strict()
      )
      .min(1),
    gates: z.array(
      z
        .object({
          gate_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          stage_id: z.string().min(1),
          type: z.enum(["brief-claims", "creative-direction"]),
          reason: z.string().min(1),
          scope: z.string().min(1),
          authority: z.literal("operator"),
          occurrence: z.literal("once-per-job"),
          scope_key: z.null(),
          status: z.literal("pending"),
          plan_hash: z.null(),
          requested_at: TimestampSchema,
          decided_at: z.null(),
          decision: z.null(),
          operator: z.null(),
          decisions: z.array(z.never()),
        })
        .strict()
    ),
    assets: z.array(z.never()),
    costs: z
      .object({
        currency: z.literal("USD"),
        estimated: z.null(),
        actual: z.null(),
        status: z.literal("not-applicable"),
        receipts: z.array(z.never()),
      })
      .strict(),
    outputs: z
      .object({
        previews: z.array(z.never()),
        master: z.null(),
        renditions: z.array(z.never()),
        qc_receipt: z.null(),
        delivery_receipt: z.null(),
        visual_reviews: z.array(z.never()),
      })
      .strict(),
    dry_runs: z.array(z.never()),
    steering: z.array(z.never()),
    codex: z.null(),
  })
  .strict();

const NoFounderTouchSchema = z
  .object({
    step: z.enum([
      "purchase",
      "access",
      "preflight",
      "instruction",
      "capstone-execution",
      "validation",
      "diagnosis-and-retry",
      "completion-and-retention",
    ]),
    owner: z.enum(["website", "relay", "training-bundle"]),
    status: z.enum(["passed", "external-gate"]),
    evidence: z.string().min(1),
  })
  .strict();

const HandoffPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("relay-operator-workshop-production-handoff"),
    basisDate: z.literal("2026-07-16"),
    relay: z
      .object({
        packageVersion: z.string().min(1),
        editionId: z.literal("relay-operator-workshop"),
        editionVersion: z.string().min(1),
        editionHash: Sha256Schema,
        starterId: z.literal(WORKSHOP_STARTER_ID),
        starterHash: Sha256Schema,
        freeCoreSufficient: z.literal(true),
        accountRequired: z.literal(false),
      })
      .strict(),
    sources: z.array(SourceReferenceSchema).min(1),
    sourceBasisHash: Sha256Schema,
    website: WebsiteHandoffSchema,
    motion: z
      .object({
        schemaId: z.literal(
          "https://orionfold.local/motion/schemas/job-v1.schema.json"
        ),
        schemaVersion: z.literal(1),
        status: z.literal("ready-for-manual-import"),
        paidGenerationAuthorized: z.literal(false),
        jobSeed: MotionJobSeedSchema,
      })
      .strict(),
    noFounderTouch: z.array(NoFounderTouchSchema).length(8),
    decision: z
      .object({
        recommendation: z.literal("revise"),
        relayRuntime: z.literal("passed"),
        staticSample: z.literal("passed"),
        websiteRelease: z.literal("external-gate"),
        motionProduction: z.literal("external-gate"),
        reasons: z.array(z.string().min(1)).min(1),
        launchWhen: z.array(z.string().min(1)).min(1),
        stopWhen: z.array(z.string().min(1)).min(1),
      })
      .strict(),
  })
  .strict();

export const WorkshopProductionHandoffSchema = HandoffPayloadSchema.extend({
  contentHash: Sha256Schema,
}).strict();

export type WorkshopProductionHandoff = z.infer<
  typeof WorkshopProductionHandoffSchema
>;

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

const sourceInputs = [
  {
    id: "marketing-line-memo",
    owner: "relay" as const,
    classification: "public" as const,
    path: "_ASSETS/memos/marketing-line/article.md",
    role: "canonical operating memo",
    contentHash:
      "d3722bf26ad08b281d2b62de78ea7cef510269d6003d7d7bf616265b0a062a62",
  },
  {
    id: "relay-user-guides",
    owner: "relay" as const,
    classification: "public" as const,
    path: "_ASSETS/docs/guide-sync-report.json",
    role: "version-aware product instruction source receipt",
    contentHash:
      "a7ea996ed840de46889d0784c447684e61aaa47246863b3bda97a98db7944239",
  },
  {
    id: "relay-api-reference",
    owner: "relay" as const,
    classification: "public" as const,
    path: "_ASSETS/api/api-sync-report.json",
    role: "version-aware product contract source receipt",
    contentHash:
      "a21b1762e0609d658f91a7c42476a18ed59150e485f9b67775416ed8f453a599",
  },
  {
    id: "relay-static-sample-fixture",
    owner: "relay" as const,
    classification: "public" as const,
    path: "_ASSETS/demo/source/public/relay-demo/fixtures.json",
    role: "free try-before-buy workshop state",
    contentHash:
      "0a0c07edd85d22ff1fb5ad3af75dbeb60aa0bf0f58c6052b1b05a0bad9a47162",
  },
  {
    id: "relay-static-sample-boot",
    owner: "relay" as const,
    classification: "public" as const,
    path: "_ASSETS/demo/source/public/relay-demo/boot.js",
    role: "free try-before-buy workshop interaction source",
    contentHash:
      "9ef00abf35d0e536428773741825ef6cfbf863d3176972dd4f46400a685bcb65",
  },
];

const sourceBasisHash = hash(sourceInputs);
const motionTimestamp = "2026-07-16T00:00:00Z";

const payload = {
  schemaVersion: 1,
  kind: "relay-operator-workshop-production-handoff",
  basisDate: "2026-07-16",
  relay: {
    packageVersion: pkg.version,
    editionId: "relay-operator-workshop",
    editionVersion: BUILTIN_WORKSHOP_EDITION.editionVersion,
    editionHash: BUILTIN_WORKSHOP_EDITION.contentHash,
    starterId: WORKSHOP_STARTER_ID,
    starterHash: WORKSHOP_STARTER_HASH,
    freeCoreSufficient: true,
    accountRequired: false,
  },
  sources: sourceInputs,
  sourceBasisHash,
  website: {
    schemaVersion: 1,
    offeringId: "relay-operator-workshop",
    editionVersion: BUILTIN_WORKSHOP_EDITION.editionVersion,
    status: "awaiting-website-configuration",
    publicPromise: BUILTIN_WORKSHOP_EDITION.promise,
    price: {
      lookupKey: null,
      amountCents: null,
      currency: "USD",
      authority: "website-catalog-and-stripe",
    },
    access: {
      accountRequired: false,
      mode: "guest-purchase-account-free-download",
      editionHash: BUILTIN_WORKSHOP_EDITION.contentHash,
      paidInstructionsIncluded: false,
      fulfillmentOwner: "website",
    },
    externalGates: [
      "offer-copy",
      "price-and-lookup-key",
      "checkout",
      "transactional-email",
      "refund-policy",
      "public-publishing",
    ],
  },
  motion: {
    schemaId: "https://orionfold.local/motion/schemas/job-v1.schema.json",
    schemaVersion: 1,
    status: "ready-for-manual-import",
    paidGenerationAuthorized: false,
    jobSeed: {
      schema_version: 1,
      revision: 0,
      job_id: "relay-operator-workshop-20260716t000000z-a001",
      state: "draft",
      title: "Relay Operator Workshop production seed",
      created_at: motionTimestamp,
      updated_at: motionTimestamp,
      source: {
        requesting_project: "orionfold-relay",
        source_paths: ["/handoff/relay/workshop/source-fragment.v1.json"],
        source_commit: null,
        source_state: "unknown",
        copied_inputs: [
          {
            source_path: "/relay/_ASSETS/memos/marketing-line/article.md",
            snapshot_path: "inputs/marketing-line-memo.md",
            sha256: sourceInputs[0].contentHash,
          },
          {
            source_path: "/relay/workshop/source-fragment.v1.json",
            snapshot_path: "inputs/relay-workshop-source-fragment.json",
            sha256: sourceBasisHash,
          },
        ],
      },
      brief: {
        snapshot_path: "inputs/relay-workshop-source-fragment.json",
        sha256: sourceBasisHash,
        claims_status: "pending",
        creative_status: "pending",
      },
      target: {
        composition: null,
        width: 1920,
        height: 1080,
        fps: 30,
        duration_policy: "training-owner-approved",
        delivery_profiles: [
          "field-lesson-16x9",
          "discovery-short-9x16",
          "landing-trailer-16x9",
        ],
      },
      route: { profile: "manual", operations: [] },
      stages: [
        {
          stage_id: "source-intake",
          ordinal: 0,
          state: "pending",
          attempts: 0,
          plan_hash: null,
          accepted_receipt: null,
          current_attempt: null,
          error: null,
        },
      ],
      gates: [
        {
          gate_id: "approve-brief-claims",
          stage_id: "source-intake",
          type: "brief-claims",
          reason: "Training owns the learner promise and approved claims.",
          scope: "Relay Operator Workshop public and private production claims",
          authority: "operator",
          occurrence: "once-per-job",
          scope_key: null,
          status: "pending",
          plan_hash: null,
          requested_at: motionTimestamp,
          decided_at: null,
          decision: null,
          operator: null,
          decisions: [],
        },
        {
          gate_id: "approve-creative-direction",
          stage_id: "source-intake",
          type: "creative-direction",
          reason: "Motion production requires an operator-approved direction.",
          scope: "Relay Operator Workshop audiovisual direction",
          authority: "operator",
          occurrence: "once-per-job",
          scope_key: null,
          status: "pending",
          plan_hash: null,
          requested_at: motionTimestamp,
          decided_at: null,
          decision: null,
          operator: null,
          decisions: [],
        },
      ],
      assets: [],
      costs: {
        currency: "USD",
        estimated: null,
        actual: null,
        status: "not-applicable",
        receipts: [],
      },
      outputs: {
        previews: [],
        master: null,
        renditions: [],
        qc_receipt: null,
        delivery_receipt: null,
        visual_reviews: [],
      },
      dry_runs: [],
      steering: [],
      codex: null,
    },
  },
  noFounderTouch: [
    {
      step: "purchase",
      owner: "website",
      status: "external-gate",
      evidence: "Website must configure a catalog lookup key and guest checkout.",
    },
    {
      step: "access",
      owner: "website",
      status: "external-gate",
      evidence:
        "Website must deliver the account-free edition and transactional access link.",
    },
    {
      step: "preflight",
      owner: "relay",
      status: "passed",
      evidence: "Relay exposes deterministic version, data-dir, runtime and fixture checks.",
    },
    {
      step: "instruction",
      owner: "training-bundle",
      status: "external-gate",
      evidence:
        "Paid instruction is Website-delivered and intentionally excluded from the public Relay package.",
    },
    {
      step: "capstone-execution",
      owner: "relay",
      status: "passed",
      evidence:
        "The source-hashed Marketing Line starter installs idempotently and remains learner-owned.",
    },
    {
      step: "validation",
      owner: "relay",
      status: "passed",
      evidence:
        "Existing Operations Receipts provide passed, at-risk and failed verdicts.",
    },
    {
      step: "diagnosis-and-retry",
      owner: "relay",
      status: "passed",
      evidence:
        "Named rescue states and an explicit no-provider deterministic rehearsal are available.",
    },
    {
      step: "completion-and-retention",
      owner: "relay",
      status: "passed",
      evidence:
        "Relay exports a deterministic redacted bundle with hashes, receipt, outputs and app pack.",
    },
  ],
  decision: {
    recommendation: "revise",
    relayRuntime: "passed",
    staticSample: "passed",
    websiteRelease: "external-gate",
    motionProduction: "external-gate",
    reasons: [
      "The customer-identical Relay path is locally complete without founder runtime.",
      "A public launch would be premature until Website checkout/access and operator-approved Motion production are verified.",
    ],
    launchWhen: [
      "Website proves guest purchase, automatic account-free access and transactional delivery.",
      "Motion accepts the source snapshot, produces approved renditions and passes technical QC.",
      "A release candidate reruns the full no-founder path with no manual learner touch.",
    ],
    stopWhen: [
      "Any paid/private instruction enters the public Relay package or free sample.",
      "Any normal learner requires founder teaching, grading, scheduling, rescue or fulfillment.",
      "Source, edition, receipt or exported-artifact hashes cannot be reproduced.",
    ],
  },
} satisfies z.input<typeof HandoffPayloadSchema>;

export const WORKSHOP_PRODUCTION_HANDOFF: WorkshopProductionHandoff =
  WorkshopProductionHandoffSchema.parse({
    ...payload,
    contentHash: hash(payload),
  });

export function verifyWorkshopProductionHandoff(
  input: unknown
): WorkshopProductionHandoff {
  const parsed = WorkshopProductionHandoffSchema.parse(input);
  const { contentHash, ...unsigned } = parsed;
  if (hash(unsigned) !== contentHash) {
    throw new Error("WorkshopProductionHandoffIntegrityError");
  }
  return parsed;
}
