import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowReceiptRuns, workflows } from "@/lib/db/schema";
import { resolveWorkflowExecutionTargets } from "@/lib/workflows/execution-targets";
import type { WorkflowDefinition } from "@/lib/workflows/types";
import {
  prepareBlueprintInstantiation,
  type PreparedBlueprintInstantiation,
} from "./instantiator";

export class BlueprintStartConflictError extends Error {
  readonly code = "BLUEPRINT_START_IDEMPOTENCY_CONFLICT";

  constructor(readonly workflowId: string) {
    super("This start request identity already belongs to a different workflow.");
    this.name = "BlueprintStartConflictError";
  }
}

export interface StartBlueprintInput {
  blueprintId: string;
  variables: Record<string, unknown>;
  projectId?: string;
  idempotencyKey: string;
}

export interface StartBlueprintResult {
  workflowId: string;
  name: string;
  duplicate: boolean;
}

function isSameStart(
  prepared: PreparedBlueprintInstantiation,
  existing: { definition: string; projectId: string | null },
): boolean {
  try {
    const preparedDefinition = JSON.parse(prepared.definition) as {
      _blueprintId?: string;
      steps?: unknown;
    };
    const existingDefinition = JSON.parse(existing.definition) as {
      _blueprintId?: string;
      steps?: unknown;
    };
    return (
      preparedDefinition._blueprintId === existingDefinition._blueprintId &&
      JSON.stringify(preparedDefinition.steps) ===
        JSON.stringify(existingDefinition.steps) &&
      prepared.projectId === existing.projectId
    );
  } catch {
    return false;
  }
}

/**
 * Preflight the resolved workflow before one transaction creates and claims
 * its first run. Reusing the idempotency key as the workflow identity makes a
 * retried/double-submitted request converge on the same visible run.
 */
export async function startBlueprint(
  input: StartBlueprintInput,
): Promise<StartBlueprintResult> {
  const prepared = prepareBlueprintInstantiation(
    input.blueprintId,
    input.variables,
    input.projectId,
    undefined,
    input.idempotencyKey,
  );
  const existingBeforePreflight = db
    .select({
      definition: workflows.definition,
      projectId: workflows.projectId,
    })
    .from(workflows)
    .where(eq(workflows.id, prepared.workflowId))
    .get();
  if (existingBeforePreflight) {
    if (!isSameStart(prepared, existingBeforePreflight)) {
      throw new BlueprintStartConflictError(prepared.workflowId);
    }
    return {
      workflowId: prepared.workflowId,
      name: prepared.name,
      duplicate: true,
    };
  }

  await resolveWorkflowExecutionTargets({
    definition: JSON.parse(prepared.definition) as WorkflowDefinition,
  });

  const duplicate = db.transaction((tx) => {
    const inserted = tx
      .insert(workflows)
      .values({
        id: prepared.workflowId,
        projectId: prepared.projectId,
        name: prepared.name.slice(0, 100),
        definition: prepared.definition,
        status: "active",
        runNumber: 1,
        successCriteriaRunSnapshot: "[]",
        createdAt: prepared.createdAt,
        updatedAt: prepared.createdAt,
      })
      .onConflictDoNothing()
      .run();

    if (inserted.changes === 0) {
      const existing = tx
        .select({
          definition: workflows.definition,
          projectId: workflows.projectId,
        })
        .from(workflows)
        .where(eq(workflows.id, prepared.workflowId))
        .get();
      if (!existing || !isSameStart(prepared, existing)) {
        throw new BlueprintStartConflictError(prepared.workflowId);
      }
      return true;
    }

    tx.insert(workflowReceiptRuns)
      .values({
        id: crypto.randomUUID(),
        workflowId: prepared.workflowId,
        runNumber: 1,
        criteriaSnapshot: "[]",
        terminalStatus: null,
        startedAt: prepared.createdAt,
        finishedAt: null,
      })
      .run();
    return false;
  });

  return {
    workflowId: prepared.workflowId,
    name: prepared.name,
    duplicate,
  };
}
