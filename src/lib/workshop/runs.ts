import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  operationsReceipts,
  userTables,
  workshopRuns,
  workflows,
  type WorkshopRunRow,
} from "@/lib/db/schema";
import {
  AppManifestSchema,
  deleteAppCascade,
  getApp,
  writeAppManifest,
} from "@/lib/apps/registry";
import {
  ensureAppProject,
  upsertAppManifest,
} from "@/lib/apps/compose-integration";
import { addRows, createTable } from "@/lib/data/tables";
import { serializeSuccessCriteria } from "@/lib/operations/criteria";
import {
  BUILTIN_WORKSHOP_EDITION,
  WORKSHOP_APP_ID,
  WORKSHOP_STARTER,
} from "@/lib/workshop/builtin";
import { WorkshopError } from "@/lib/workshop/errors";
import { getWorkshopPreflight } from "@/lib/workshop/preflight";

export type WorkshopCheckpointStatus = "pending" | "passed" | "failed";

export interface WorkshopCheckpointResult {
  id: "inspect" | "adapt" | "govern" | "run" | "retain";
  title: string;
  description: string;
  sourceRoute: string;
  required: boolean;
  status: WorkshopCheckpointStatus;
  detail: string;
  recovery?: string;
}

export interface WorkshopRunView {
  id: string;
  editionId: string;
  editionVersion: string;
  editionHash: string;
  status: WorkshopRunRow["status"];
  projectId: string | null;
  appId: string | null;
  workflowId: string | null;
  receiptId: string | null;
  fallbackUsed: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  checkpoints: WorkshopCheckpointResult[];
  completedCount: number;
  requiredCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

const RUN_ID = `${BUILTIN_WORKSHOP_EDITION.id}:${BUILTIN_WORKSHOP_EDITION.editionVersion}`;
let startInFlight: Promise<WorkshopRunView> | null = null;

function parseCheckpointState(
  raw: string
): Partial<Record<WorkshopCheckpointResult["id"], WorkshopCheckpointResult>> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function evaluateCheckpointState(
  run: WorkshopRunRow
): Promise<WorkshopCheckpointResult[]> {
  const stored = parseCheckpointState(run.checkpointState);
  const app = run.appId ? getApp(run.appId) : null;
  const appTableIds = app?.manifest.tables.map((table) => table.id) ?? [];
  const tableRows =
    appTableIds.length > 0
      ? await db
          .select({ id: userTables.id, rowCount: userTables.rowCount })
          .from(userTables)
          .where(inArray(userTables.id, appTableIds))
      : [];
  const workflow = run.workflowId
    ? (
        await db
          .select()
          .from(workflows)
          .where(eq(workflows.id, run.workflowId))
      )[0] ?? null
    : null;
  const receipt = run.receiptId
    ? (
        await db
          .select()
          .from(operationsReceipts)
          .where(eq(operationsReceipts.id, run.receiptId))
      )[0] ?? null
    : null;
  let governed = false;
  if (workflow) {
    try {
      const definition = JSON.parse(workflow.definition) as {
        steps?: Array<{ requiresInput?: boolean; requiresApproval?: boolean }>;
      };
      governed =
        Boolean(
          definition.steps?.some(
            (step) => step.requiresInput || step.requiresApproval
          )
        ) && Boolean(workflow.successCriteria);
    } catch {
      governed = false;
    }
  }

  const facts: Record<
    WorkshopCheckpointResult["id"],
    Pick<WorkshopCheckpointResult, "status" | "detail" | "recovery">
  > = {
    inspect: app && tableRows.length > 0 && workflow
      ? {
          status: "passed",
          detail: "Starter app, table and governed workflow are present.",
          recovery: undefined,
        }
      : {
          status: "failed",
          detail: "The starter app is incomplete.",
          recovery: "Retry starter installation from Workshop.",
        },
    adapt: tableRows.some((table) => table.rowCount >= 2)
      ? {
          status: "passed",
          detail: "The starter contains at least one learner-added process.",
          recovery: undefined,
        }
      : {
          status: "pending",
          detail: "Add one process row to the Workshop Process table.",
          recovery: "Open the table, add a row, then check progress again.",
        },
    govern: governed
      ? {
          status: "passed",
          detail: "The workflow has a human checkpoint and success criteria.",
          recovery: undefined,
        }
      : {
          status: "failed",
          detail: "The human or success boundary is missing.",
          recovery: "Repair the workflow checkpoint and success criteria.",
        },
    run: receipt
      ? {
          status: receipt.verdict === "failed" ? "failed" : "passed",
          detail: `Operations Receipt verdict: ${receipt.verdict}.`,
          recovery:
            receipt.verdict === "failed"
              ? receipt.nextAction
              : undefined,
        }
      : {
          status: "pending",
          detail: "No terminal Operations Receipt exists yet.",
          recovery:
            "Run the workflow or use the clearly labeled deterministic rehearsal.",
        },
    retain: stored.retain?.status === "passed"
      ? stored.retain
      : {
          status: "pending",
          detail: "Download the completion bundle to retain the capstone.",
          recovery: "Use Download completion bundle after a terminal run.",
        },
  };

  return BUILTIN_WORKSHOP_EDITION.checkpoints.map((checkpoint) => ({
    ...checkpoint,
    sourceRoute:
      checkpoint.id === "inspect" && run.appId
        ? `/apps/${run.appId}`
        : checkpoint.id === "adapt" && appTableIds[0]
          ? `/tables/${appTableIds[0]}`
          : (checkpoint.id === "govern" || checkpoint.id === "run") &&
              run.workflowId
            ? `/workflows/${run.workflowId}`
            : checkpoint.sourceRoute,
    ...facts[checkpoint.id],
  }));
}

async function toView(run: WorkshopRunRow): Promise<WorkshopRunView> {
  const checkpoints = await evaluateCheckpointState(run);
  return {
    id: run.id,
    editionId: run.editionId,
    editionVersion: run.editionVersion,
    editionHash: run.editionHash,
    status: run.status,
    projectId: run.projectId,
    appId: run.appId,
    workflowId: run.workflowId,
    receiptId: run.receiptId,
    fallbackUsed: run.fallbackUsed,
    lastErrorCode: run.lastErrorCode,
    lastErrorMessage: run.lastErrorMessage,
    checkpoints,
    completedCount: checkpoints.filter((item) => item.status === "passed").length,
    requiredCount: checkpoints.filter((item) => item.required).length,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export async function getWorkshopRun(id: string): Promise<WorkshopRunView> {
  const [run] = await db.select().from(workshopRuns).where(eq(workshopRuns.id, id));
  if (!run) {
    throw new WorkshopError(
      "run_not_found",
      `Workshop run "${id}" was not found.`,
      "Start the built-in workshop edition."
    );
  }
  return toView(run);
}

export async function getCurrentWorkshopRun(): Promise<WorkshopRunView | null> {
  const [run] = await db
    .select()
    .from(workshopRuns)
    .where(
      inArray(workshopRuns.status, [
        "ready",
        "active",
        "at_risk",
        "completed",
        "failed",
      ])
    )
    .orderBy(desc(workshopRuns.updatedAt))
    .limit(1);
  return run ? toView(run) : null;
}

async function installBuiltinWorkshop(): Promise<WorkshopRunView> {
  const preflight = await getWorkshopPreflight();
  if (!preflight.ready) {
    const first = preflight.failures[0];
    throw new WorkshopError(
      first?.code === "data_dir_unavailable"
        ? "data_dir_unavailable"
        : first?.code === "relay_version_incompatible"
          ? "relay_version_incompatible"
          : "integrity_failed",
      first?.message ?? "Workshop preflight failed.",
      first?.recovery ?? "Repair preflight before starting."
    );
  }

  const [existing] = await db
    .select()
    .from(workshopRuns)
    .where(eq(workshopRuns.id, RUN_ID));
  if (existing?.appId && existing.workflowId) return toView(existing);
  if (existing && Date.now() - existing.updatedAt.getTime() < 5 * 60_000) {
    return toView(existing);
  }

  const now = new Date();
  await db
    .insert(workshopRuns)
    .values({
      id: RUN_ID,
      editionId: BUILTIN_WORKSHOP_EDITION.id,
      editionVersion: BUILTIN_WORKSHOP_EDITION.editionVersion,
      editionHash: BUILTIN_WORKSHOP_EDITION.contentHash,
      status: "ready",
      checkpointState: "{}",
      fallbackUsed: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workshopRuns.id,
      set: {
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: now,
      },
    });

  if (getApp(WORKSHOP_APP_ID)) {
    throw new WorkshopError(
      "install_conflict",
      `An app named "${WORKSHOP_APP_ID}" already exists outside this workshop run.`,
      "Rename or remove the conflicting app, then retry. Relay will not overwrite it."
    );
  }

  let projectCreated = false;
  try {
    const project = await ensureAppProject(WORKSHOP_APP_ID);
    projectCreated = project.created;
    if (!project.created) {
      throw new WorkshopError(
        "install_conflict",
        `Project "${WORKSHOP_APP_ID}" already exists.`,
        "Use an isolated workspace or rename the conflicting project."
      );
    }
    const table = await createTable({
      name: WORKSHOP_STARTER.table.name,
      description: WORKSHOP_STARTER.table.description,
      projectId: WORKSHOP_APP_ID,
      source: "template",
      columns: WORKSHOP_STARTER.table.columns.map((column, position) => ({
        ...column,
        position,
      })),
    });
    await addRows(
      table.id,
      WORKSHOP_STARTER.table.rows.map((data) => ({
        data: { ...data },
        createdBy: "user",
      }))
    );
    upsertAppManifest(
      WORKSHOP_APP_ID,
      {
        kind: "table",
        id: table.id,
        columns: WORKSHOP_STARTER.table.columns.map((column) => column.name),
      },
      "Relay Operator Workshop Capstone"
    );
    const app = getApp(WORKSHOP_APP_ID);
    if (!app) throw new Error("Starter manifest was not created");
    writeAppManifest(
      WORKSHOP_APP_ID,
      AppManifestSchema.parse({
        ...app.manifest,
        description:
          "User-owned capstone built from the synthetic Marketing Line workshop fixture.",
        origin: "user-created",
        tables: [
          {
            id: table.id,
            name: WORKSHOP_STARTER.table.name,
            description: WORKSHOP_STARTER.table.description,
            columns: WORKSHOP_STARTER.table.columns.map((column) => column.name),
            columnDefinitions: WORKSHOP_STARTER.table.columns.map((column) => ({
              ...column,
            })),
          },
        ],
        view: {
          kit: "tracker",
          bindings: { hero: { table: table.id } },
        },
      })
    );

    const workflowId = crypto.randomUUID();
    const successCriteria = serializeSuccessCriteria([
      {
        id: "terminal-completion",
        label: "Workflow reaches a completed terminal",
        level: "required",
        check: "status_is",
        value: "completed",
      },
      {
        id: "governed-result",
        label: "Result names the governed workflow",
        level: "required",
        check: "result_contains",
        value: "governed workflow",
      },
      {
        id: "retained-output",
        label: "At least one output is retained",
        level: "advisory",
        check: "output_count_at_least",
        value: 1,
      },
    ]);
    await db.insert(workflows).values({
      id: workflowId,
      projectId: WORKSHOP_APP_ID,
      name: "Governed memo-to-workflow capstone",
      definition: JSON.stringify({
        pattern: "sequence",
        steps: [
          {
            id: "adapt-process",
            name: "Adapt the process",
            prompt:
              "Turn the selected operating memo into one bounded governed workflow.",
            requiresInput: true,
            inputPrompt:
              "What bounded process should this workshop capstone govern?",
          },
          {
            id: "human-review",
            name: "Human review",
            prompt:
              "Summarize the governed workflow and the explicit human decision boundary.",
            requiresApproval: true,
          },
        ],
      }),
      successCriteria,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(workshopRuns)
      .set({
        status: "active",
        projectId: WORKSHOP_APP_ID,
        appId: WORKSHOP_APP_ID,
        workflowId,
        updatedAt: new Date(),
      })
      .where(eq(workshopRuns.id, RUN_ID));
  } catch (error) {
    if (projectCreated) await deleteAppCascade(WORKSHOP_APP_ID);
    const workshopError =
      error instanceof WorkshopError
        ? error
        : new WorkshopError(
            "install_conflict",
            error instanceof Error ? error.message : String(error),
            "Retry in an isolated workspace. Existing user work was not overwritten.",
            { cause: error }
          );
    await db
      .update(workshopRuns)
      .set({
        status: "failed",
        lastErrorCode: workshopError.code,
        lastErrorMessage: workshopError.message,
        updatedAt: new Date(),
      })
      .where(eq(workshopRuns.id, RUN_ID));
    throw workshopError;
  }

  return getWorkshopRun(RUN_ID);
}

export function startBuiltinWorkshop(): Promise<WorkshopRunView> {
  if (startInFlight) return startInFlight;
  startInFlight = installBuiltinWorkshop().finally(() => {
    startInFlight = null;
  });
  return startInFlight;
}

export async function refreshWorkshopRun(id: string): Promise<WorkshopRunView> {
  const view = await getWorkshopRun(id);
  await db
    .update(workshopRuns)
    .set({
      status:
        view.receiptId && view.checkpoints.some((item) => item.status === "failed")
          ? "at_risk"
          : view.status === "failed"
            ? "active"
            : view.status,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(workshopRuns.id, id));
  return getWorkshopRun(id);
}

export async function markWorkshopRetained(
  id: string
): Promise<WorkshopRunView> {
  const [run] = await db.select().from(workshopRuns).where(eq(workshopRuns.id, id));
  if (!run || !run.receiptId) {
    throw new WorkshopError(
      "evidence_unavailable",
      "A terminal receipt is required before retaining the capstone.",
      "Run the workflow or deterministic rehearsal first."
    );
  }
  const [receipt] = await db
    .select()
    .from(operationsReceipts)
    .where(eq(operationsReceipts.id, run.receiptId));
  if (!receipt) {
    throw new WorkshopError(
      "evidence_unavailable",
      "The run receipt could not be found.",
      "Reconcile the workflow receipt, then retry export."
    );
  }
  const state = parseCheckpointState(run.checkpointState);
  state.retain = {
    ...BUILTIN_WORKSHOP_EDITION.checkpoints.find(
      (checkpoint) => checkpoint.id === "retain"
    )!,
    status: "passed",
    detail: "Completion bundle downloaded and retained locally.",
  };
  const completedAt = new Date();
  await db
    .update(workshopRuns)
    .set({
      checkpointState: JSON.stringify(state),
      updatedAt: completedAt,
    })
    .where(eq(workshopRuns.id, id));
  const evaluated = await getWorkshopRun(id);
  const allRequiredPassed = evaluated.checkpoints
    .filter((checkpoint) => checkpoint.required)
    .every((checkpoint) => checkpoint.status === "passed");
  await db
    .update(workshopRuns)
    .set({
      status:
        receipt.verdict === "passed" && allRequiredPassed
          ? "completed"
          : "at_risk",
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(workshopRuns.id, id));
  return getWorkshopRun(id);
}
