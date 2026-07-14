import { db } from "@/lib/db";
import { workflows, agentLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { executeChildTask } from "./engine";
import type {
  WorkflowDefinition,
  LoopState,
  IterationState,
  LoopStopReason,
  WorkflowEnrichmentTargetContract,
} from "./types";
import { createInitialLoopState } from "./types";
import {
  resolvePostAction,
  shouldSkipPostActionValue,
  extractPostActionValue,
} from "./post-action";
import { updateRow } from "@/lib/data/tables";
import { normalizeEnrichmentOutput } from "@/lib/tables/enrichment-planner";

/**
 * Execute the loop pattern — autonomous iteration with stop conditions.
 * Each iteration creates a child task, passes previous output as context,
 * and checks for completion signals, time budgets, and pause requests.
 */
export async function executeLoop(
  workflowId: string,
  definition: WorkflowDefinition
): Promise<void> {
  if (!definition.loopConfig) {
    throw new Error("Loop pattern requires loopConfig");
  }
  if (!definition.steps.length) {
    throw new Error("Loop pattern requires at least one step (the loop prompt)");
  }

  const {
    maxIterations,
    timeBudgetMs,
    assignedAgent,
    agentProfile,
    completionSignals,
    items,
    itemVariable,
  } = definition.loopConfig;

  // Row-driven loop: iterate exactly once per item (capped at maxIterations).
  // Items array presence flips the loop into a finite fan-out pattern.
  const isRowDriven = Array.isArray(items);
  const rowItems = isRowDriven ? (items as unknown[]) : [];
  const boundVarName = itemVariable && itemVariable.length > 0 ? itemVariable : "item";
  const effectiveMax = isRowDriven
    ? Math.min(rowItems.length, maxIterations)
    : maxIterations;

  // Restore existing state (resume) or create fresh
  const loopState = await restoreOrCreateLoopState(workflowId);
  loopState.status = "running";
  await updateLoopState(workflowId, loopState, "active");

  const startTime = new Date(loopState.startedAt).getTime();
  let previousOutput = "";

  // If resuming, grab the last completed iteration's result
  if (loopState.iterations.length > 0) {
    const lastCompleted = [...loopState.iterations]
      .reverse()
      .find((i) => i.status === "completed");
    if (lastCompleted?.result) {
      previousOutput = lastCompleted.result;
    }
  }

  try {
    while (loopState.currentIteration < effectiveMax) {
      // Check pause: re-fetch workflow status from DB
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId));

      if (workflow?.status === "paused") {
        loopState.status = "paused";
        loopState.stopReason = "human_pause";
        await updateLoopState(workflowId, loopState, "paused");
        return;
      }

      if (workflow?.status === "completed" || workflow?.status === "draft") {
        loopState.status = "completed";
        loopState.stopReason = "human_cancel";
        await updateLoopState(workflowId, loopState, workflow.status as "completed" | "draft");
        return;
      }

      // Check time budget
      if (timeBudgetMs) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeBudgetMs) {
          await finalizeLoop(workflowId, loopState, "time_budget");
          return;
        }
      }

      const iterationNum = loopState.currentIteration + 1;

      // Create iteration state
      const iterationState: IterationState = {
        iteration: iterationNum,
        taskId: "",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      loopState.iterations.push(iterationState);
      await updateLoopState(workflowId, loopState, "active");

      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId: null,
        agentType: "loop-executor",
        event: "loop_iteration_started",
        payload: JSON.stringify({
          workflowId,
          iteration: iterationNum,
          maxIterations,
        }),
        timestamp: new Date(),
      });

      const result = isRowDriven
        ? await executeRowDrivenIteration({
            workflowId,
            definition,
            row: rowItems[loopState.currentIteration],
            itemVariable: boundVarName,
            iteration: iterationNum,
            totalRows: effectiveMax,
            loopAssignedAgent: assignedAgent,
            loopAgentProfile: agentProfile,
          })
        : await executeChildTask(
            workflowId,
            `Loop Iteration ${iterationNum}`,
            buildIterationPrompt(
              definition.steps[0].prompt,
              previousOutput,
              iterationNum,
              maxIterations
            ),
            assignedAgent ?? definition.steps[0].assignedAgent,
            agentProfile ?? definition.steps[0].agentProfile
          );

      // Update iteration state
      const iterStartTime = new Date(iterationState.startedAt!).getTime();
      iterationState.taskId = result.taskId;
      iterationState.completedAt = new Date().toISOString();
      iterationState.durationMs = Date.now() - iterStartTime;

      if (result.status === "completed") {
        iterationState.status = "completed";
        iterationState.result = result.result;
        if (!isRowDriven) {
          previousOutput = result.result ?? "";
        }
      } else {
        iterationState.status = "failed";
        iterationState.error = result.error;
        loopState.currentIteration = iterationNum;
        await updateLoopState(workflowId, loopState, "active");
        if (!isRowDriven) {
          await finalizeLoop(workflowId, loopState, "error");
          return;
        }
        continue;
      }

      loopState.currentIteration = iterationNum;
      await updateLoopState(workflowId, loopState, "active");

      // Check completion signal — only for autonomous loops. Row-driven
      // loops always run through every item; per-row completion text like
      // "NOT_FOUND" must not abort the fan-out.
      if (
        !isRowDriven &&
        result.result &&
        detectCompletionSignal(result.result, completionSignals)
      ) {
        await finalizeLoop(workflowId, loopState, "agent_signaled");
        return;
      }
    }

    // Exhausted max iterations
    await finalizeLoop(workflowId, loopState, "max_iterations");
  } catch (error) {
    loopState.status = "failed";
    loopState.stopReason = "error";
    loopState.completedAt = new Date().toISOString();
    loopState.totalDurationMs =
      Date.now() - new Date(loopState.startedAt).getTime();
    await updateLoopState(workflowId, loopState, "failed");
    throw error;
  }
}

/**
 * Build the prompt for a single row-driven iteration.
 *
 * Row-driven loops fan out one iteration per item in `loopConfig.items` and
 * stop when items are exhausted (no LOOP_COMPLETE signal needed). The row
 * payload is serialized as JSON under the bound variable name so the agent
 * can read every field without us pre-committing to a templating syntax.
 */
export function buildRowIterationPrompt(
  template: string,
  row: unknown,
  itemVariable: string,
  iteration: number,
  totalRows: number,
  previousStepOutput: string,
  stepOutputs: Record<string, string>
): string {
  const resolvedTemplate = resolveRowTemplate(template, {
    [itemVariable]: row,
    previous: previousStepOutput,
    stepOutputs,
  });
  const parts: string[] = [];
  parts.push(`Row ${iteration} of ${totalRows}.`);
  parts.push(
    `\nCurrent ${itemVariable}:\n\`\`\`json\n${JSON.stringify(row, null, 2)}\n\`\`\``
  );
  if (previousStepOutput) {
    parts.push(`\nPrevious step output:\n${previousStepOutput}`);
  }
  parts.push(`\n---\n\n${resolvedTemplate}`);
  return parts.join("");
}

function resolveRowTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, path: string) => {
    const value = readContextPath(context, path.trim());
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

function readContextPath(value: unknown, path: string): unknown {
  const parts = path.split(".");
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Build the prompt for a single iteration, including previous output context.
 */
export function buildIterationPrompt(
  template: string,
  previousOutput: string,
  iteration: number,
  maxIterations: number
): string {
  const parts: string[] = [];

  parts.push(`Iteration ${iteration} of ${maxIterations}.`);

  if (previousOutput) {
    parts.push(`\nPrevious iteration output:\n${previousOutput}`);
  }

  parts.push(`\n---\n\n${template}`);
  parts.push(
    `\nWhen you are fully satisfied with the result, include "LOOP_COMPLETE" in your response.`
  );

  return parts.join("");
}

/**
 * Check if the output contains a completion signal.
 * Case-insensitive substring match against the signal list.
 */
export function detectCompletionSignal(
  output: string,
  signals?: string[]
): boolean {
  const effectiveSignals = signals?.length ? signals : ["LOOP_COMPLETE"];
  const lowerOutput = output.toLowerCase();
  return effectiveSignals.some((signal) =>
    lowerOutput.includes(signal.toLowerCase())
  );
}

/**
 * Store loop state in the workflow definition JSON alongside _state.
 */
export async function updateLoopState(
  workflowId: string,
  loopState: LoopState,
  workflowStatus: "draft" | "active" | "paused" | "completed" | "failed"
): Promise<void> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));

  if (!workflow) return;

  const parsed = JSON.parse(workflow.definition);
  const combined = { ...parsed, _loopState: loopState };

  await db
    .update(workflows)
    .set({
      definition: JSON.stringify(combined),
      status: workflowStatus,
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, workflowId));

  if (workflowStatus === "completed" || workflowStatus === "failed") {
    try {
      const { ensureWorkflowReceipt } = await import(
        "@/lib/operations/receipts"
      );
      await ensureWorkflowReceipt(workflowId, workflow.runNumber);
    } catch (error) {
      const { reportOperationsReceiptFailure } = await import(
        "@/lib/operations/receipts"
      );
      await reportOperationsReceiptFailure({
        ownerType: "workflow",
        ownerId: workflowId,
        error,
      });
    }
  }
}

/**
 * Restore existing loop state from DB or create a fresh one.
 */
async function restoreOrCreateLoopState(
  workflowId: string
): Promise<LoopState> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));

  if (workflow) {
    const parsed = JSON.parse(workflow.definition);
    if (parsed._loopState) {
      return parsed._loopState as LoopState;
    }
  }

  return createInitialLoopState();
}

/**
 * Apply a `postAction` for a single row-driven iteration. Resolves any
 * `{{row.field}}` placeholders, runs the skip rules, and writes the value
 * via `updateRow`. Every outcome is logged to `agent_logs` so enrichment
 * runs are auditable end-to-end. Errors are caught and logged — never
 * thrown — so a single bad row can't abort the fan-out.
 */
async function applyRowPostAction(params: {
  workflowId: string;
  taskId: string;
  postAction: NonNullable<import("./types").WorkflowStep["postAction"]>;
  row: unknown;
  itemVariable: string;
  taskResult: string;
  targetContract?: WorkflowEnrichmentTargetContract;
}): Promise<void> {
  const {
    workflowId,
    taskId,
    postAction,
    row,
    itemVariable,
    taskResult,
    targetContract,
  } = params;

  try {
    if (postAction.type !== "update_row") {
      // Future-proofing: unknown variants log + return rather than throwing.
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId,
        agentType: "loop-executor",
        event: "post_action_unknown_type",
        payload: JSON.stringify({ workflowId, postAction }),
        timestamp: new Date(),
      });
      return;
    }

    const resolved = resolvePostAction(postAction, row, itemVariable);
    const rawValue = extractPostActionValue(taskResult);

    if (!targetContract && shouldSkipPostActionValue(rawValue)) {
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId,
        agentType: "loop-executor",
        event: "post_action_skipped",
        payload: JSON.stringify({
          workflowId,
          rowId: resolved.rowId,
          column: resolved.column,
          reason: rawValue.trim() === "" ? "empty" : "not_found",
        }),
        timestamp: new Date(),
      });
      return;
    }

    const normalized = targetContract
      ? normalizeEnrichmentOutput(rawValue, targetContract)
      : { kind: "valid" as const, value: rawValue };

    if (normalized.kind === "skip") {
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId,
        agentType: "loop-executor",
        event: "post_action_skipped",
        payload: JSON.stringify({
          workflowId,
          rowId: resolved.rowId,
          column: resolved.column,
          reason: normalized.reason,
        }),
        timestamp: new Date(),
      });
      return;
    }

    if (normalized.kind === "invalid") {
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId,
        agentType: "loop-executor",
        event: "post_action_contract_invalid",
        payload: JSON.stringify({
          workflowId,
          rowId: resolved.rowId,
          column: resolved.column,
          error: normalized.reason,
          rawValue,
        }),
        timestamp: new Date(),
      });
      return;
    }

    if (!resolved.rowId) {
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId,
        agentType: "loop-executor",
        event: "post_action_failed",
        payload: JSON.stringify({
          workflowId,
          error: "rowId resolved to empty string — check postAction template",
          postAction,
        }),
        timestamp: new Date(),
      });
      return;
    }

    const updated = await updateRow(resolved.rowId, {
      data: { [resolved.column]: normalized.value },
    });

    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: "loop-executor",
      event: updated ? "post_action_applied" : "post_action_failed",
      payload: JSON.stringify({
        workflowId,
        rowId: resolved.rowId,
        column: resolved.column,
        tableId: resolved.tableId,
        ...(updated ? {} : { error: "row not found" }),
      }),
      timestamp: new Date(),
    });
  } catch (err) {
    // Never let postAction failures abort the loop iteration.
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: "loop-executor",
      event: "post_action_failed",
      payload: JSON.stringify({
        workflowId,
        error: err instanceof Error ? err.message : String(err),
      }),
      timestamp: new Date(),
    }).catch(() => {});
  }
}

async function executeRowDrivenIteration(params: {
  workflowId: string;
  definition: WorkflowDefinition;
  row: unknown;
  itemVariable: string;
  iteration: number;
  totalRows: number;
  loopAssignedAgent?: string;
  loopAgentProfile?: string;
}): Promise<{ taskId: string; status: string; result?: string; error?: string }> {
  const {
    workflowId,
    definition,
    row,
    itemVariable,
    iteration,
    totalRows,
    loopAssignedAgent,
    loopAgentProfile,
  } = params;

  let previousStepOutput = "";
  let lastTaskId = "";
  const stepOutputs: Record<string, string> = {};

  for (const step of definition.steps) {
    const prompt = buildRowIterationPrompt(
      step.prompt,
      row,
      itemVariable,
      iteration,
      totalRows,
      previousStepOutput,
      stepOutputs
    );

    const result = await executeChildTask(
      workflowId,
      `${step.name} · Row ${iteration}`,
      prompt,
      loopAssignedAgent ?? step.assignedAgent,
      loopAgentProfile ?? step.agentProfile,
      undefined,
      step.id,
      step.budgetUsd,
      step.runtimeId
    );
    lastTaskId = result.taskId;

    if (result.status !== "completed") {
      return {
        taskId: lastTaskId,
        status: "failed",
        error: `${step.name}: ${result.error ?? "Task did not complete successfully"}`,
      };
    }

    previousStepOutput = result.result ?? "";
    stepOutputs[step.id] = previousStepOutput;

    if (step.postAction) {
      await applyRowPostAction({
        workflowId,
        taskId: result.taskId,
        postAction: step.postAction,
        row,
        itemVariable,
        taskResult: previousStepOutput,
        targetContract: definition.metadata?.enrichment?.targetContract,
      });
    }
  }

  return {
    taskId: lastTaskId,
    status: "completed",
    result: previousStepOutput,
  };
}

/**
 * Finalize a loop with a stop reason and mark the workflow as completed.
 */
async function finalizeLoop(
  workflowId: string,
  loopState: LoopState,
  stopReason: LoopStopReason
): Promise<void> {
  loopState.status = "completed";
  loopState.stopReason = stopReason;
  loopState.completedAt = new Date().toISOString();
  loopState.totalDurationMs =
    Date.now() - new Date(loopState.startedAt).getTime();
  await updateLoopState(workflowId, loopState, "completed");
}
