import crypto from "node:crypto";
import {
  editionContentHash,
  type WorkshopEdition,
  type WorkshopEditionPayload,
} from "@/lib/workshop/schema";

export const WORKSHOP_APP_ID = "relay-operator-workshop-capstone";
export const WORKSHOP_STARTER_ID = "marketing-line-governed-workflow-v1";

export const WORKSHOP_STARTER = {
  id: WORKSHOP_STARTER_ID,
  appId: WORKSHOP_APP_ID,
  table: {
    name: "Workshop Process",
    description:
      "Synthetic Marketing Line process records for the Relay Operator Workshop.",
    columns: [
      {
        name: "title",
        displayName: "Process",
        dataType: "text" as const,
        config: { displayRole: "title" as const },
      },
      {
        name: "description",
        displayName: "Description",
        dataType: "text" as const,
        config: { displayRole: "description" as const },
      },
      {
        name: "status",
        displayName: "Status",
        dataType: "select" as const,
        config: {
          options: ["Draft", "Needs review", "Approved"],
          displayRole: "category" as const,
        },
      },
      {
        name: "owner",
        displayName: "Owner",
        dataType: "text" as const,
        config: { displayRole: "meta" as const },
      },
      {
        name: "impact",
        displayName: "Impact",
        dataType: "number" as const,
        config: {
          displayRole: "metric" as const,
          numberPolarity: "higher" as const,
          numberDomain: { min: 0, max: 100 },
        },
      },
    ],
    rows: [
      {
        title: "Campaign brief intake",
        description:
          "Turn one operating memo into a governed campaign brief with an explicit review boundary.",
        status: "Needs review",
        owner: "Marketing operator",
        impact: 72,
      },
    ],
  },
};

export const WORKSHOP_STARTER_HASH = crypto
  .createHash("sha256")
  .update(JSON.stringify(WORKSHOP_STARTER))
  .digest("hex");

const payload: WorkshopEditionPayload = {
  schemaVersion: 1,
  id: "relay-operator-workshop",
  editionVersion: "2026.07",
  title: "Relay Operator Workshop",
  promise: "Turn one operating memo into a governed Relay workflow.",
  relayRange: ">=0.42.2 <0.45.0",
  fixture: {
    family: "marketing-line",
    starterId: WORKSHOP_STARTER_ID,
    sourceHash: WORKSHOP_STARTER_HASH,
  },
  capabilities: {
    required: [
      "local-sqlite",
      "user-tables",
      "workflows",
      "human-checkpoints",
      "operations-receipts",
      "app-export",
    ],
    optional: ["configured-model-runtime"],
    deterministicFallback: true,
  },
  checkpoints: [
    {
      id: "inspect",
      title: "Inspect the governed starter",
      description: "Open the starter app, table and workflow before adapting it.",
      sourceRoute: `/apps/${WORKSHOP_APP_ID}`,
      required: true,
    },
    {
      id: "adapt",
      title: "Adapt one process",
      description: "Add one owned process record to the synthetic starter table.",
      sourceRoute: "/tables",
      required: true,
    },
    {
      id: "govern",
      title: "Confirm human and trust boundaries",
      description:
        "Keep a human-input checkpoint and explicit success criteria on the workflow.",
      sourceRoute: "/workflows",
      required: true,
    },
    {
      id: "run",
      title: "Produce truthful run evidence",
      description:
        "Run with a configured model or the clearly labeled deterministic rehearsal.",
      sourceRoute: "/workflows",
      required: true,
    },
    {
      id: "retain",
      title: "Retain the capstone",
      description:
        "Download the redacted completion bundle and user-owned app export.",
      sourceRoute: "/workshop",
      required: true,
    },
  ],
  rescues: [
    {
      code: "runtime_unavailable",
      title: "No model runtime available",
      action: "Configure a runtime in Settings.",
      fallback:
        "Run the deterministic rehearsal. It makes no provider call and labels that limitation in the receipt.",
    },
    {
      code: "integrity_failed",
      title: "Starter integrity check failed",
      action: "Reinstall the built-in known-good starter.",
    },
    {
      code: "checkpoint_failed",
      title: "A checkpoint is not yet observable",
      action: "Open the linked Relay surface, make the required change, then check again.",
    },
  ],
  sourceReferences: [
    "_ASSETS/memos/marketing-line/",
    "_ASSETS/docs/",
    "_ASSETS/api/",
    "_ASSETS/demo/",
    "src/lib/operations/receipts.ts",
    "src/lib/packs/app-exporter.ts",
  ],
  completion: {
    includeReceipt: true,
    includeSelectedOutputs: true,
    includeUserAppExport: true,
    verdicts: ["passed", "at_risk", "failed"],
  },
};

export const BUILTIN_WORKSHOP_EDITION: WorkshopEdition = {
  ...payload,
  contentHash: editionContentHash(payload),
};
