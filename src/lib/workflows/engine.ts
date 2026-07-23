import { db } from "@/lib/db";
import { workflows, tasks, agentLogs, notifications } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { startTaskExecution } from "@/lib/agents/task-dispatch";
import { classifyTaskProfile } from "@/lib/agents/router";
import type { WorkflowDefinition, WorkflowState, StepState, LoopState } from "./types";
import { createInitialState } from "./types";
import { executeLoop } from "./loop-executor";
import { checkDelayStep } from "./delay";
import {
  buildParallelSynthesisPrompt,
  getParallelWorkflowStructure,
  PARALLEL_BRANCH_CONCURRENCY_LIMIT,
} from "./parallel";
import {
  buildSwarmRefineryPrompt,
  buildSwarmWorkerPrompt,
  getSwarmWorkflowStructure,
} from "./swarm";
import {
  openLearningSession,
  closeLearningSession,
} from "@/lib/agents/learning-session";
import {
  buildWorkflowDocumentContext,
  buildPoolDocumentContext,
} from "@/lib/documents/context-builder";
import { resolveStepBudget, estimateWorkflowCost } from "./cost-estimator";
import { isAgentRuntimeId } from "@/lib/agents/runtime/catalog";
import { updateExecutionStats } from "./execution-stats";
import { WorkflowTransitionError } from "./transition-errors";
import {
  classifyRecoverableRuntimeFailure,
  runtimeRecoveryMessage,
} from "./runtime-recovery";

/**
 * Execute a workflow by advancing through its steps according to the pattern.
 * Fire-and-forget — call this from the API route and don't await.
 */
export async function executeWorkflow(workflowId: string): Promise<void> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));

  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  const definition: WorkflowDefinition = JSON.parse(workflow.definition);
  const state = createInitialState(definition);

  // Extract parent task ID for document context propagation to child steps
  const parentTaskId: string | undefined = definition.sourceTaskId ?? undefined;

  // Pre-flight cost estimation — advisory, never blocks execution
  try {
    const costEstimate = await estimateWorkflowCost(workflowId);
    state.costEstimate = costEstimate;
    if (costEstimate.warnings.length > 0) {
      console.warn(`[workflow-engine] Cost warnings for ${workflowId}:`, costEstimate.warnings);
    }
  } catch (err) {
    console.error(`[workflow-engine] Cost estimation failed (non-blocking):`, err);
  }

  // Workflow-level runtime (stored on workflow row or system setting)
  const workflowRuntimeId = workflow.runtimeId ?? undefined;

  await updateWorkflowState(workflowId, state, "active");

  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId: null,
    agentType: "workflow-engine",
    event: "workflow_started",
    payload: JSON.stringify({
      workflowId,
      pattern: definition.pattern,
      runtimeId: workflowRuntimeId ?? "default",
      costEstimate: state.costEstimate,
    }),
    timestamp: new Date(),
  });

  // Open a learning session to buffer context proposals during execution.
  // Proposals are collected and presented as a single batch at workflow end.
  openLearningSession(workflowId);

  // Loop pattern manages its own lifecycle — delegate fully
  if (definition.pattern === "loop") {
    try {
      await executeLoop(workflowId, definition, workflowRuntimeId);

      const [settledWorkflow] = await db
        .select({ status: workflows.status, definition: workflows.definition })
        .from(workflows)
        .where(eq(workflows.id, workflowId));
      if (!settledWorkflow) {
        throw new WorkflowTransitionError(
          "WORKFLOW_NOT_FOUND",
          `Workflow ${workflowId} disappeared before loop finalization`
        );
      }

      const settledLoop = parseWorkflowState(settledWorkflow.definition).loopState;
      let terminalEvent: string;
      switch (settledWorkflow.status) {
        case "completed":
          terminalEvent = "workflow_completed";
          break;
        case "failed":
          terminalEvent = "workflow_failed";
          break;
        case "paused":
          terminalEvent = "workflow_paused";
          break;
        default:
          terminalEvent = "workflow_state_invalid";
      }
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId: null,
        agentType: "workflow-engine",
        event: terminalEvent,
        payload: JSON.stringify({
          workflowId,
          status: settledWorkflow.status,
          stopReason: settledLoop?.stopReason,
        }),
        timestamp: new Date(),
      });
    } catch (error) {
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId: null,
        agentType: "workflow-engine",
        event: "workflow_failed",
        payload: JSON.stringify({
          workflowId,
          error: error instanceof Error ? error.message : String(error),
        }),
        timestamp: new Date(),
      });
    } finally {
      // Update execution stats — fire-and-forget, never breaks execution
      updateExecutionStats(workflowId).catch((err) => {
        console.error("[workflow-engine] Stats update failed:", err);
      });
      // Close learning session — flush buffered proposals as batch notification
      await closeLearningSession(workflowId).catch((err) => {
        console.error("[workflow-engine] Failed to close learning session:", err);
      });
    }
    return;
  }

  try {
    switch (definition.pattern) {
      case "sequence":
        await executeSequence(workflowId, definition, state, parentTaskId, workflowRuntimeId);
        break;
      case "planner-executor":
        await executePlannerExecutor(workflowId, definition, state, parentTaskId, workflowRuntimeId);
        break;
      case "checkpoint":
        await executeCheckpoint(workflowId, definition, state, parentTaskId, workflowRuntimeId);
        break;
      case "parallel":
        await executeParallel(workflowId, definition, state, parentTaskId, workflowRuntimeId);
        break;
      case "swarm":
        await executeSwarm(workflowId, definition, state, parentTaskId, workflowRuntimeId);
        break;
    }

    // A delay or durable input gate may have paused the workflow. The pattern
    // executor already persisted the exact recovery state; log and return
    // without marking the workflow completed.
    if (state.status === "paused") {
      const waitingForInput = state.pendingInteraction?.kind === "input";
      const blockedRuntime = state.stepStates.some(
        (step) => step.status === "blocked_runtime",
      );
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId: null,
        agentType: "workflow-engine",
        event: waitingForInput
          ? "workflow_paused_for_input"
          : blockedRuntime
            ? "workflow_paused_for_runtime"
            : "workflow_paused_for_delay",
        payload: JSON.stringify({
          workflowId,
          stepIndex: state.currentStepIndex,
          notificationId: state.pendingInteraction?.notificationId,
          blockedRuntime,
        }),
        timestamp: new Date(),
      });
      return;
    }

    state.status = "completed";
    state.completedAt = new Date().toISOString();
    await updateWorkflowState(workflowId, state, "completed");

    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId: null,
      agentType: "workflow-engine",
      event: "workflow_completed",
      payload: JSON.stringify({ workflowId }),
      timestamp: new Date(),
    });
  } catch (error) {
    state.status = "failed";
    await updateWorkflowState(workflowId, state, "failed");

    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId: null,
      agentType: "workflow-engine",
      event: "workflow_failed",
      payload: JSON.stringify({
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      }),
      timestamp: new Date(),
    });
  } finally {
    // Update execution stats — fire-and-forget, never breaks execution
    updateExecutionStats(workflowId).catch((err) => {
      console.error("[workflow-engine] Stats update failed:", err);
    });
    // Close learning session — flush buffered proposals as batch notification
    await closeLearningSession(workflowId).catch((err) => {
      console.error("[workflow-engine] Failed to close learning session:", err);
    });
  }
}

/**
 * Sequence pattern: execute steps one after another, passing output forward.
 *
 * @param fromStepIndex  Start index for resuming after a delay. Defaults to 0
 *                       for fresh executions. resumeWorkflow passes the index
 *                       of the step after the one that was delayed.
 */
async function executeSequence(
  workflowId: string,
  definition: WorkflowDefinition,
  state: WorkflowState,
  parentTaskId?: string,
  workflowRuntimeId?: string,
  fromStepIndex: number = 0,
): Promise<void> {
  let previousOutput = "";

  for (let i = fromStepIndex; i < definition.steps.length; i++) {
    const step = definition.steps[i];
    state.currentStepIndex = i;

    // Delay step: pause the workflow and return. The scheduler tick will call
    // resumeWorkflow when workflows.resume_at <= now(). See features/workflow-step-delays.md.
    const delayCheck = checkDelayStep(step, Date.now());
    if (delayCheck.type === "delay") {
      state.stepStates[i].status = "delayed";
      state.stepStates[i].startedAt = new Date().toISOString();
      state.status = "paused";
      await updateWorkflowState(workflowId, state, "paused");
      // Write resume_at to the indexed workflows column so the scheduler tick
      // can find this workflow efficiently via the partial index.
      await db
        .update(workflows)
        .set({ resumeAt: delayCheck.resumeAt, updatedAt: new Date() })
        .where(eq(workflows.id, workflowId));
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId: null,
        agentType: "workflow-engine",
        event: "step_delayed",
        payload: JSON.stringify({
          workflowId,
          stepId: step.id,
          stepName: step.name,
          delayDuration: step.delayDuration,
          resumeAt: delayCheck.resumeAt,
        }),
        timestamp: new Date(),
      });
      return;
    }

    // Build prompt with context from previous step
    const contextPrompt = previousOutput
      ? `Previous step output:\n${previousOutput}\n\n---\n\n${step.prompt}`
      : step.prompt;

    const result = await executeStep(
      workflowId,
      step.id,
      step.name,
      contextPrompt,
      state,
      step.assignedAgent,
      step.agentProfile,
      parentTaskId,
      step.budgetUsd,
      step.runtimeId,
      workflowRuntimeId,
      true,
    );

    if (result.status === "blocked_runtime") {
      return;
    }

    if (result.status === "failed") {
      throw new Error(`Step "${step.name}" failed: ${result.error}`);
    }

    previousOutput = result.result ?? "";
  }
}

/**
 * Planner-Executor pattern: first step generates a plan, subsequent steps execute it.
 */
async function executePlannerExecutor(
  workflowId: string,
  definition: WorkflowDefinition,
  state: WorkflowState,
  parentTaskId?: string,
  workflowRuntimeId?: string
): Promise<void> {
  if (definition.steps.length < 2) {
    throw new Error("Planner-Executor requires at least 2 steps (planner + executor)");
  }

  // Step 1: Planner
  const plannerStep = definition.steps[0];
  state.currentStepIndex = 0;
  const planResult = await executeStep(
    workflowId,
    plannerStep.id,
    plannerStep.name,
    plannerStep.prompt,
    state,
    plannerStep.assignedAgent,
    plannerStep.agentProfile,
    parentTaskId,
    plannerStep.budgetUsd,
    plannerStep.runtimeId,
    workflowRuntimeId
  );

  if (planResult.status === "failed") {
    throw new Error(`Planner step failed: ${planResult.error}`);
  }

  // Execute remaining steps with plan context
  for (let i = 1; i < definition.steps.length; i++) {
    const step = definition.steps[i];
    state.currentStepIndex = i;

    const contextPrompt = `Plan from planner:\n${planResult.result}\n\n---\n\n${step.prompt}`;
    const result = await executeStep(
      workflowId,
      step.id,
      step.name,
      contextPrompt,
      state,
      step.assignedAgent,
      step.agentProfile,
      parentTaskId,
      step.budgetUsd,
      step.runtimeId,
      workflowRuntimeId
    );

    if (result.status === "failed") {
      throw new Error(`Executor step "${step.name}" failed: ${result.error}`);
    }
  }
}

/**
 * Checkpoint pattern: execute steps with human approval gates between them.
 */
async function executeCheckpoint(
  workflowId: string,
  definition: WorkflowDefinition,
  state: WorkflowState,
  parentTaskId?: string,
  workflowRuntimeId?: string,
  fromStepIndex: number = 0,
  resumedInput?: { stepIndex: number; answer: string }
): Promise<void> {
  let previousOutput =
    fromStepIndex > 0
      ? state.stepStates[fromStepIndex - 1]?.result ?? ""
      : "";
  let userAnswer = "";

  for (let i = fromStepIndex; i < definition.steps.length; i++) {
    const step = definition.steps[i];
    state.currentStepIndex = i;

    // If step requires approval and we have previous output, wait for approval
    if (
      step.requiresApproval &&
      i > 0 &&
      resumedInput?.stepIndex !== i
    ) {
      state.stepStates[i].status = "waiting_approval";
      await updateWorkflowState(workflowId, state, "active");

      const approved = await waitForApproval(workflowId, step.name, previousOutput);
      if (!approved) {
        state.stepStates[i].status = "failed";
        state.stepStates[i].error = "Approval denied by user";
        throw new Error(`Step "${step.name}" was denied approval`);
      }
    }

    // If a step needs data, persist the exact workflow/step/notification
    // correlation and return while paused. The notification response route and
    // scheduler can resume this state after a process restart.
    userAnswer = "";
    if (step.requiresInput) {
      if (resumedInput?.stepIndex === i) {
        userAnswer = resumedInput.answer;
        state.pendingInteraction = undefined;
        state.status = "running";
        state.stepStates[i].status = "running";
        await updateWorkflowState(workflowId, state, "active");
      } else {
        const notificationId = await createWorkflowInputNotification(
          workflowId,
          step.name,
          step.inputPrompt ?? step.prompt
        );
        state.stepStates[i].status = "waiting_approval";
        state.status = "paused";
        state.pendingInteraction = {
          kind: "input",
          stepIndex: i,
          notificationId,
        };
        await updateWorkflowState(workflowId, state, "paused");
        return;
      }
    }

    const contextParts: string[] = [];
    if (previousOutput) {
      contextParts.push(`Previous step output:\n${previousOutput}`);
    }
    if (userAnswer.trim()) {
      contextParts.push(`User-provided input:\n${userAnswer}`);
    }
    const contextPrompt =
      contextParts.length > 0
        ? `${contextParts.join("\n\n---\n\n")}\n\n---\n\n${step.prompt}`
        : step.prompt;

    const result = await executeStep(
      workflowId,
      step.id,
      step.name,
      contextPrompt,
      state,
      step.assignedAgent,
      step.agentProfile,
      parentTaskId,
      step.budgetUsd,
      step.runtimeId,
      workflowRuntimeId
    );

    if (result.status === "failed") {
      throw new Error(`Step "${step.name}" failed: ${result.error}`);
    }

    previousOutput = result.result ?? "";

    // Halt-on-refusal: an agent can "complete" while producing no usable
    // artifact (e.g. it refused to fabricate and asked for missing data in
    // prose). Running dependent steps on top of that empty output cascades
    // refusals into a false `completed` with nothing on disk (the BUG-3
    // failure mode). If this step yielded no usable output and later steps
    // depend on it, stop loudly instead. We key on empty output — not brittle
    // prose matching — which is exactly the "no artifact" symptom observed.
    const hasDependents = i < definition.steps.length - 1;
    if (hasDependents && previousOutput.trim().length === 0) {
      state.stepStates[i].status = "failed";
      state.stepStates[i].error =
        "Step produced no usable output; halting dependent steps to avoid a false completion. " +
        "The agent may have refused for missing context — check its output and re-run with the needed input.";
      throw new Error(
        `Step "${step.name}" produced no usable output — halting workflow to avoid cascading refusals`
      );
    }
  }
}

/**
 * Parallel pattern: execute branch steps concurrently, then run a synthesis step.
 */
async function executeParallel(
  workflowId: string,
  definition: WorkflowDefinition,
  state: WorkflowState,
  parentTaskId?: string,
  workflowRuntimeId?: string
): Promise<void> {
  const structure = getParallelWorkflowStructure(definition);
  if (!structure) {
    throw new Error(
      "Parallel workflows require branch steps and exactly one synthesis step"
    );
  }

  const { branchSteps, synthesisStep } = structure;
  const synthesisIndex = definition.steps.findIndex(
    (step) => step.id === synthesisStep.id
  );

  if (synthesisIndex === -1) {
    throw new Error(`Synthesis step "${synthesisStep.id}" not found`);
  }

  let stateWriteQueue = Promise.resolve();
  const commitState = (
    mutate: (draft: WorkflowState) => void,
    status: "draft" | "active" | "paused" | "completed" = "active"
  ) => {
    stateWriteQueue = stateWriteQueue.then(async () => {
      mutate(state);
      await updateWorkflowState(workflowId, state, status);
    });
    return stateWriteQueue;
  };

  await commitState((draft) => {
    draft.currentStepIndex = 0;
    const joinState = draft.stepStates[synthesisIndex];
    joinState.status = "waiting_dependencies";
    joinState.error = undefined;
    joinState.result = undefined;
  });

  const branchResults = await mapWithConcurrency(
    branchSteps,
    PARALLEL_BRANCH_CONCURRENCY_LIMIT,
    async (step) => {
      const stepIndex = definition.steps.findIndex(
        (candidate) => candidate.id === step.id
      );
      if (stepIndex === -1) {
        throw new Error(`Parallel branch "${step.id}" not found`);
      }

      const startedAt = new Date().toISOString();
      await commitState((draft) => {
        const stepState = draft.stepStates[stepIndex];
        stepState.status = "running";
        stepState.startedAt = startedAt;
        stepState.completedAt = undefined;
        stepState.error = undefined;
        stepState.result = undefined;
      });

      let result: Awaited<ReturnType<typeof executeChildTask>>;
      try {
        const stepBudget = await resolveStepBudget(step);
        const stepRuntime = await resolveStepRuntime(
          step.runtimeId ?? step.assignedAgent,
          workflowRuntimeId
        );

        result = await executeChildTask(
          workflowId,
          step.name,
          step.prompt,
          step.assignedAgent,
          step.agentProfile,
          parentTaskId,
          step.id,
          stepBudget,
          stepRuntime
        );
      } catch (error) {
        result = {
          taskId: "",
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const completedAt = new Date().toISOString();
      await commitState((draft) => {
        const stepState = draft.stepStates[stepIndex];
        if (result.taskId) stepState.taskId = result.taskId;
        stepState.completedAt = completedAt;

        if (result.status === "completed") {
          stepState.status = "completed";
          stepState.result = result.result ?? "";
        } else {
          stepState.status = "failed";
          stepState.error =
            result.error ?? "Task did not complete successfully";
        }
      });

      return { step, result };
    }
  );

  await stateWriteQueue;

  const failedBranches = branchResults.filter(
    (branch) => branch.result.status !== "completed"
  );

  if (failedBranches.length > 0) {
    const failureSummary = failedBranches
      .map(
        (branch) =>
          `${branch.step.name}: ${
            branch.result.error ?? "Task did not complete successfully"
          }`
      )
      .join("; ");

    await commitState((draft) => {
      const joinState = draft.stepStates[synthesisIndex];
      joinState.status = "failed";
      joinState.error = `Blocked by failed branches: ${failureSummary}`;
    });
    await stateWriteQueue;

    throw new Error(`Parallel branches failed: ${failureSummary}`);
  }

  const synthesisStartedAt = new Date().toISOString();
  await commitState((draft) => {
    draft.currentStepIndex = synthesisIndex;
    const joinState = draft.stepStates[synthesisIndex];
    joinState.status = "running";
    joinState.startedAt = synthesisStartedAt;
    joinState.completedAt = undefined;
    joinState.error = undefined;
    joinState.result = undefined;
  });

  const synthesisPrompt = buildParallelSynthesisPrompt({
    branchOutputs: branchResults.map((branch) => ({
      stepName: branch.step.name,
      result: branch.result.result ?? "",
    })),
    synthesisPrompt: synthesisStep.prompt,
  });

  const synthesisBudget = await resolveStepBudget(synthesisStep);
  const synthesisRuntime = await resolveStepRuntime(
    synthesisStep.runtimeId ?? synthesisStep.assignedAgent,
    workflowRuntimeId
  );

  const synthesisResult = await executeChildTask(
    workflowId,
    synthesisStep.name,
    synthesisPrompt,
    synthesisStep.assignedAgent,
    synthesisStep.agentProfile,
    parentTaskId,
    synthesisStep.id,
    synthesisBudget,
    synthesisRuntime
  );

  await commitState((draft) => {
    const joinState = draft.stepStates[synthesisIndex];
    joinState.taskId = synthesisResult.taskId;
    joinState.completedAt = new Date().toISOString();

    if (synthesisResult.status === "completed") {
      joinState.status = "completed";
      joinState.result = synthesisResult.result ?? "";
    } else {
      joinState.status = "failed";
      joinState.error =
        synthesisResult.error ?? "Task did not complete successfully";
    }
  });
  await stateWriteQueue;

  if (synthesisResult.status !== "completed") {
    throw new Error(
      `Synthesis step "${synthesisStep.name}" failed: ${
        synthesisResult.error ?? "Task did not complete successfully"
      }`
    );
  }
}

/**
 * Swarm pattern: run a mayor planning step, execute worker steps in parallel,
 * then merge the results through a refinery step.
 */
async function executeSwarm(
  workflowId: string,
  definition: WorkflowDefinition,
  state: WorkflowState,
  parentTaskId?: string,
  workflowRuntimeId?: string
): Promise<void> {
  const structure = getSwarmWorkflowStructure(definition);
  if (!structure) {
    throw new Error(
      "Swarm workflows require a mayor step, 2-5 worker steps, and a refinery step"
    );
  }

  const { mayorStep, workerSteps, refineryStep, workerConcurrencyLimit } =
    structure;
  const refineryIndex = definition.steps.findIndex(
    (step) => step.id === refineryStep.id
  );

  if (refineryIndex === -1) {
    throw new Error(`Refinery step "${refineryStep.id}" not found`);
  }

  const mayorResult = await executeStep(
    workflowId,
    mayorStep.id,
    mayorStep.name,
    mayorStep.prompt,
    state,
    mayorStep.assignedAgent,
    mayorStep.agentProfile,
    parentTaskId,
    mayorStep.budgetUsd,
    mayorStep.runtimeId,
    workflowRuntimeId
  );

  if (mayorResult.status === "failed") {
    throw new Error(`Mayor step "${mayorStep.name}" failed: ${mayorResult.error}`);
  }

  let stateWriteQueue = Promise.resolve();
  const commitState = (
    mutate: (draft: WorkflowState) => void,
    status: "draft" | "active" | "paused" | "completed" = "active"
  ) => {
    stateWriteQueue = stateWriteQueue.then(async () => {
      mutate(state);
      await updateWorkflowState(workflowId, state, status);
    });
    return stateWriteQueue;
  };

  await commitState((draft) => {
    draft.currentStepIndex = 1;
    const refineryState = draft.stepStates[refineryIndex];
    refineryState.status = "waiting_dependencies";
    refineryState.error = undefined;
    refineryState.result = undefined;
    refineryState.startedAt = undefined;
    refineryState.completedAt = undefined;
  });

  const workerResults = await mapWithConcurrency(
    workerSteps,
    workerConcurrencyLimit,
    async (step) => {
      const stepIndex = definition.steps.findIndex(
        (candidate) => candidate.id === step.id
      );
      if (stepIndex === -1) {
        throw new Error(`Swarm worker "${step.id}" not found`);
      }

      const workerPrompt = buildSwarmWorkerPrompt({
        mayorName: mayorStep.name,
        mayorResult: mayorResult.result ?? "",
        workerName: step.name,
        workerPrompt: step.prompt,
      });

      const startedAt = new Date().toISOString();
      await commitState((draft) => {
        const stepState = draft.stepStates[stepIndex];
        stepState.status = "running";
        stepState.startedAt = startedAt;
        stepState.completedAt = undefined;
        stepState.error = undefined;
        stepState.result = undefined;
      });

      const workerBudget = await resolveStepBudget(step);
      const workerRuntime = await resolveStepRuntime(
        step.runtimeId ?? step.assignedAgent,
        workflowRuntimeId
      );

      const result = await executeChildTask(
        workflowId,
        step.name,
        workerPrompt,
        step.assignedAgent,
        step.agentProfile,
        parentTaskId,
        step.id,
        workerBudget,
        workerRuntime
      );

      const completedAt = new Date().toISOString();
      await commitState((draft) => {
        const stepState = draft.stepStates[stepIndex];
        stepState.taskId = result.taskId;
        stepState.completedAt = completedAt;

        if (result.status === "completed") {
          stepState.status = "completed";
          stepState.result = result.result ?? "";
        } else {
          stepState.status = "failed";
          stepState.error =
            result.error ?? "Task did not complete successfully";
        }
      });

      return { step, result };
    }
  );

  await stateWriteQueue;

  const failedWorkers = workerResults.filter(
    (worker) => worker.result.status !== "completed"
  );
  if (failedWorkers.length > 0) {
    const failureSummary = summarizeFailedWorkers(failedWorkers);

    await commitState((draft) => {
      const refineryState = draft.stepStates[refineryIndex];
      refineryState.status = "failed";
      refineryState.error = `Blocked by failed workers: ${failureSummary}`;
    });
    await stateWriteQueue;

    throw new Error(`Swarm workers failed: ${failureSummary}`);
  }

  await runSwarmRefinery({
    workflowId,
    state,
    mayorStep,
    mayorResult: mayorResult.result ?? "",
    refineryStep,
    refineryIndex,
    workerOutputs: workerResults.map((worker) => ({
      stepName: worker.step.name,
      result: worker.result.result ?? "",
    })),
    parentTaskId,
    workflowRuntimeId,
  });
}

function summarizeFailedWorkers(
  failedWorkers: Array<{
    step: { name: string };
    result: { error?: string };
  }>
): string {
  return failedWorkers
    .map(
      (worker) =>
        `${worker.step.name}: ${
          worker.result.error ?? "Task did not complete successfully"
        }`
    )
    .join("; ");
}

async function runSwarmRefinery(input: {
  workflowId: string;
  state: WorkflowState;
  mayorStep: { name: string };
  mayorResult: string;
  refineryStep: {
    id: string;
    name: string;
    prompt: string;
    assignedAgent?: string;
    agentProfile?: string;
    budgetUsd?: number;
    runtimeId?: string;
  };
  refineryIndex: number;
  workerOutputs: Array<{ stepName: string; result: string }>;
  parentTaskId?: string;
  workflowRuntimeId?: string;
}): Promise<void> {
  const {
    workflowId,
    state,
    mayorStep,
    mayorResult,
    refineryStep,
    refineryIndex,
    workerOutputs,
    parentTaskId,
    workflowRuntimeId,
  } = input;

  state.currentStepIndex = refineryIndex;
  const refineryState = state.stepStates[refineryIndex];
  refineryState.status = "running";
  refineryState.startedAt = new Date().toISOString();
  refineryState.completedAt = undefined;
  refineryState.error = undefined;
  refineryState.result = undefined;
  await updateWorkflowState(workflowId, state, "active");

  const refineryPrompt = buildSwarmRefineryPrompt({
    mayorName: mayorStep.name,
    mayorResult,
    workerOutputs,
    refineryPrompt: refineryStep.prompt,
  });

  const refineryBudget = await resolveStepBudget(refineryStep as import("./types").WorkflowStep);
  const refineryRuntime = await resolveStepRuntime(
    refineryStep.runtimeId ?? refineryStep.assignedAgent,
    workflowRuntimeId
  );

  const refineryResult = await executeChildTask(
    workflowId,
    refineryStep.name,
    refineryPrompt,
    refineryStep.assignedAgent,
    refineryStep.agentProfile,
    parentTaskId,
    refineryStep.id,
    refineryBudget,
    refineryRuntime
  );

  refineryState.taskId = refineryResult.taskId;
  refineryState.completedAt = new Date().toISOString();

  if (refineryResult.status === "completed") {
    refineryState.status = "completed";
    refineryState.result = refineryResult.result ?? "";
  } else {
    refineryState.status = "failed";
    refineryState.error =
      refineryResult.error ?? "Task did not complete successfully";
  }

  await updateWorkflowState(workflowId, state, "active");

  if (refineryResult.status !== "completed") {
    throw new Error(
      `Refinery step "${refineryStep.name}" failed: ${
        refineryResult.error ?? "Task did not complete successfully"
      }`
    );
  }
}

/**
 * Resolve the runtime for a workflow step.
 *
 * Precedence (highest wins):
 *   1. step.runtimeId (per-step override)
 *   2. legacy step.assignedAgent (passed as stepRuntimeId by callers)
 *   3. workflow.runtimeId (per-workflow)
 *   4. task resolver (Manual default or automatic routing)
 */
async function resolveStepRuntime(
  stepRuntimeId?: string,
  workflowRuntimeId?: string
): Promise<string | undefined> {
  const requestedRuntimeId = stepRuntimeId ?? workflowRuntimeId;
  if (!requestedRuntimeId) return undefined;
  if (!isAgentRuntimeId(requestedRuntimeId)) {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      `Unknown agent runtime "${requestedRuntimeId}" in workflow step`
    );
  }
  return requestedRuntimeId;
}

/**
 * Create and execute a child task, returning its result.
 * Shared by step-based patterns and the loop executor.
 */
export async function executeChildTask(
  workflowId: string,
  name: string,
  prompt: string,
  assignedAgent?: string,
  agentProfile?: string,
  parentTaskId?: string,
  stepId?: string,
  maxBudgetUsd?: number,
  runtimeId?: string
): Promise<{
  taskId: string;
  status: string;
  result?: string;
  error?: string;
  failureReason?: string | null;
}> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));

  // Extract dispatch lineage from the workflow definition. Row-triggered
  // workflows retain their source row; schedule-triggered workflows retain
  // schedule attribution and the operator's accepted per-run ceiling.
  let contextRowId: string | null = null;
  let scheduleId: string | null = null;
  let scheduleBudgetPerRunUsd: number | null = null;
  if (workflow?.definition) {
    try {
      const def = JSON.parse(workflow.definition) as {
        _contextRowId?: string;
        _scheduleId?: string;
        _scheduleBudgetPerRunUsd?: number;
      };
      if (typeof def._contextRowId === "string") {
        contextRowId = def._contextRowId;
      }
      if (typeof def._scheduleId === "string") {
        scheduleId = def._scheduleId;
      }
      if (
        typeof def._scheduleBudgetPerRunUsd === "number" &&
        Number.isFinite(def._scheduleBudgetPerRunUsd) &&
        def._scheduleBudgetPerRunUsd > 0
      ) {
        scheduleBudgetPerRunUsd = def._scheduleBudgetPerRunUsd;
      }
    } catch {
      // Malformed definition JSON — log and continue.
      console.warn(`[workflow-engine] workflow ${workflowId} has unparseable definition`);
    }
  }

  // Resolve "auto" profile via multi-agent router
  const requestedRuntimeId = runtimeId ?? assignedAgent ?? null;
  const resolvedProfile =
    !agentProfile || agentProfile === "auto"
      ? classifyTaskProfile(name, prompt, requestedRuntimeId)
      : agentProfile;

  // Inject parent task's document context into step prompt so file attachments
  // from the original task are visible to every workflow child step
  let enrichedPrompt = prompt;
  if (parentTaskId) {
    const docContext = await buildWorkflowDocumentContext(parentTaskId);
    if (docContext) {
      enrichedPrompt = `${docContext}\n\n${enrichedPrompt}`;
    }
  }

  // Inject pool document context from workflow_document_inputs junction table
  const poolContext = await buildPoolDocumentContext(workflowId, stepId);
  if (poolContext) {
    enrichedPrompt = `${poolContext}\n\n${enrichedPrompt}`;
  }

  const taskId = crypto.randomUUID();
  const effectiveMaxBudgetUsd =
    maxBudgetUsd !== undefined && scheduleBudgetPerRunUsd !== null
      ? Math.min(maxBudgetUsd, scheduleBudgetPerRunUsd)
      : maxBudgetUsd ?? scheduleBudgetPerRunUsd;
  await db.insert(tasks).values({
    id: taskId,
    projectId: workflow?.projectId ?? null,
    workflowId,
    scheduleId,
    title: `[Workflow] ${name}`,
    description: enrichedPrompt,
    status: "queued",
    priority: 1,
    assignedAgent: requestedRuntimeId,
    agentProfile: resolvedProfile ?? null,
    workflowRunNumber: workflow?.runNumber ?? null,
    successCriteriaSnapshot: workflow?.successCriteriaRunSnapshot ?? null,
    maxBudgetUsd: effectiveMaxBudgetUsd ?? null,
    contextRowId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db
    .update(tasks)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  try {
    await startTaskExecution(taskId, {
      requestedRuntimeId,
    });
  } catch (err) {
    console.error(`[workflow-engine] Runtime execution failed for task ${taskId}:`, err);
    // Mark task as failed in DB so the status check below correctly detects failure
    await db
      .update(tasks)
      .set({
        status: "failed",
        result: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }

  const [completedTask] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId));

  if (completedTask?.status === "completed") {
    return { taskId, status: "completed", result: completedTask.result ?? "" };
  }
  return {
    taskId,
    status: "failed",
    error: completedTask?.result ?? "Task did not complete successfully",
    failureReason: completedTask?.failureReason,
  };
}

/**
 * Execute a single workflow step by creating a task and waiting for completion.
 *
 * State write is deferred until after task creation succeeds (Feature 3 fix).
 * On failure, step state is explicitly rolled back to "failed".
 *
 * @param promptOverride — optional modified prompt (e.g., with context from previous step)
 */
async function executeStep(
  workflowId: string,
  stepId: string,
  stepName: string,
  prompt: string,
  state: WorkflowState,
  assignedAgent?: string,
  agentProfile?: string,
  parentTaskId?: string,
  stepBudgetUsd?: number,
  stepRuntimeId?: string,
  workflowRuntimeId?: string,
  allowTransientPause: boolean = false,
): Promise<StepState> {
  const stepState = state.stepStates.find((s) => s.stepId === stepId);
  if (!stepState) throw new Error(`Step ${stepId} not found in state`);

  // Set in-memory only — do NOT persist "running" until task exists (deferred write)
  stepState.status = "running";
  stepState.startedAt = new Date().toISOString();

  // Log step_started event for live execution dashboard
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId: null,
    agentType: "workflow-engine",
    event: "step_started",
    payload: JSON.stringify({ workflowId, stepId, stepName, stepIndex: state.currentStepIndex }),
    timestamp: new Date(),
  });

  try {
    // Resolve per-step budget and runtime
    const budgetUsd = await resolveStepBudget(
      stepBudgetUsd ? ({ budgetUsd: stepBudgetUsd } as import("./types").WorkflowStep) : undefined
    );
    const resolvedRuntime = await resolveStepRuntime(
      stepRuntimeId ?? assignedAgent,
      workflowRuntimeId
    );

    const result = await executeChildTask(
      workflowId,
      stepName,
      prompt,
      assignedAgent,
      agentProfile,
      parentTaskId,
      stepId,
      budgetUsd,
      resolvedRuntime
    );

    stepState.taskId = result.taskId;
    if (result.status === "completed") {
      stepState.status = "completed";
      stepState.result = result.result ?? "";
      stepState.completedAt = new Date().toISOString();
      stepState.recovery = undefined;

      // Log step_completed event for live execution dashboard
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId: result.taskId,
        agentType: "workflow-engine",
        event: "step_completed",
        payload: JSON.stringify({ workflowId, stepId, stepName, stepIndex: state.currentStepIndex }),
        timestamp: new Date(),
      });
    } else {
      const recoveryReason = allowTransientPause
        ? classifyRecoverableRuntimeFailure({
            failureReason: result.failureReason,
            message: result.error,
          })
        : null;
      const priorAttempts = stepState.recovery?.attempts ?? 0;
      const maxAttempts = stepState.recovery?.maxAttempts ?? 2;
      if (recoveryReason && priorAttempts < maxAttempts) {
        let lastHealthCheck: "available" | "unavailable" = "unavailable";
        let lastHealthMessage: string | undefined;
        try {
          const { resolveWorkflowExecutionTargets } = await import(
            "@/lib/workflows/execution-targets"
          );
          await resolveWorkflowExecutionTargets({
            definition: {
              pattern: "sequence",
              steps: [
                {
                  id: stepId,
                  name: stepName,
                  prompt,
                  assignedAgent,
                  agentProfile,
                  runtimeId: stepRuntimeId,
                },
              ],
            },
            workflowRuntimeId,
          });
          lastHealthCheck = "available";
        } catch (healthError) {
          lastHealthMessage =
            healthError instanceof Error
              ? healthError.message
              : String(healthError);
        }
        stepState.status = "blocked_runtime";
        stepState.error = runtimeRecoveryMessage(recoveryReason);
        stepState.recovery = {
          kind: "runtime_transient",
          reason: recoveryReason,
          attempts: priorAttempts,
          maxAttempts,
          blockedAt: new Date().toISOString(),
          lastHealthCheck,
          lastHealthMessage,
        };
        state.status = "paused";
      } else {
        stepState.status = "failed";
        stepState.error =
          recoveryReason && priorAttempts >= maxAttempts
            ? `Runtime recovery stopped after ${maxAttempts} attempts. ${
                result.error ?? "The task did not complete successfully."
              }`
            : result.error ?? "Task did not complete successfully";
        stepState.recovery = undefined;
      }

      // Log step_failed event for live execution dashboard
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId: result.taskId,
        agentType: "workflow-engine",
        event:
          stepState.status === "blocked_runtime"
            ? "step_runtime_blocked"
            : "step_failed",
        payload: JSON.stringify({
          workflowId,
          stepId,
          stepName,
          stepIndex: state.currentStepIndex,
          error: stepState.error,
          failureReason: result.failureReason,
          recovery: stepState.recovery,
        }),
        timestamp: new Date(),
      });
    }

    // Now safe to persist — task exists and has a final status
    await updateWorkflowState(
      workflowId,
      state,
      state.status === "paused" ? "paused" : "active",
    );
  } catch (err) {
    // Explicit rollback on failure — step state reflects the error
    stepState.status = "failed";
    stepState.error = err instanceof Error ? err.message : String(err);
    stepState.completedAt = new Date().toISOString();

    // Log step_failed event for live execution dashboard (catch path)
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId: stepState.taskId ?? null,
      agentType: "workflow-engine",
      event: "step_failed",
      payload: JSON.stringify({
        workflowId,
        stepId,
        stepName,
        stepIndex: state.currentStepIndex,
        error: err instanceof Error ? err.message : String(err),
      }),
      timestamp: new Date(),
    });

    await updateWorkflowState(workflowId, state, "active");
    throw err; // Propagate — don't swallow
  }

  return stepState;
}

/**
 * Wait for human approval via the notifications system.
 */
async function waitForApproval(
  workflowId: string,
  stepName: string,
  previousOutput: string
): Promise<boolean> {
  const notificationId = crypto.randomUUID();

  await db.insert(notifications).values({
    id: notificationId,
    taskId: null,
    type: "permission_required",
    title: `Workflow checkpoint: ${stepName}`,
    body: `Previous step output:\n${previousOutput.slice(0, 500)}`,
    toolName: "WorkflowCheckpoint",
    toolInput: JSON.stringify({ workflowId, stepName }),
    createdAt: new Date(),
  });

  // Poll for response with 5-minute timeout for human approval
  const deadline = Date.now() + 5 * 60 * 1000;
  const pollInterval = 2000;

  while (Date.now() < deadline) {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId));

    if (notification?.response) {
      try {
        const parsed = JSON.parse(notification.response);
        return parsed.behavior === "allow";
      } catch {
        return false;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout — mark the notification as denied so it clears from pending list
  await db
    .update(notifications)
    .set({
      response: JSON.stringify({ behavior: "deny", message: "Timed out waiting for approval" }),
      respondedAt: new Date(),
      read: true,
    })
    .where(eq(notifications.id, notificationId));

  return false; // Timeout — treat as denied
}

/**
 * Persist a workflow question and return its durable notification identity.
 *
 * Reuses the existing `AskUserQuestion` answer-carrying loop that already backs
 * chat tasks: it writes a `permission_required` notification with
 * `toolName:"AskUserQuestion"`, which `PermissionResponseActions` renders as a
 * free-text/options prompt and `/api/tasks/[id]/respond` answers by writing
 * `response.updatedInput.answer`. The Inbox surfaces it (via
 * listPendingApprovalPayloads) deep-linked to the workflow page.
 *
 * The caller persists this ID in WorkflowState and returns while paused. The
 * notification response route attempts immediate recovery, while the scheduler
 * provides restart-safe reconciliation. There is no timeout: indefinite pause
 * remains the accepted BUG-3 policy.
 */
async function createWorkflowInputNotification(
  workflowId: string,
  stepName: string,
  question: string,
  options?: string[]
): Promise<string> {
  const notificationId = crypto.randomUUID();

  await db.insert(notifications).values({
    id: notificationId,
    taskId: null,
    type: "permission_required",
    title: `Workflow needs input: ${stepName}`,
    body: question.slice(0, 500),
    toolName: "AskUserQuestion",
    toolInput: JSON.stringify({ question, options, workflowId, stepName }),
    createdAt: new Date(),
  });

  return notificationId;
}


/**
 * Update workflow state in the database.
 */
async function ensureTerminalWorkflowReceipt(
  workflowId: string,
  runNumber: number,
): Promise<void> {
  try {
    const { ensureWorkflowReceipt } = await import(
      "@/lib/operations/receipts"
    );
    await ensureWorkflowReceipt(workflowId, runNumber);
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

export async function updateWorkflowState(
  workflowId: string,
  state: WorkflowState,
  status: "draft" | "active" | "paused" | "completed" | "failed"
): Promise<void> {
  // Store state in the definition field as a combined object
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));

  if (!workflow) throw new Error(`Workflow ${workflowId} not found — cannot update state`);

  // Defensive parse: a workflow row with a missing or corrupted definition
  // should not crash the engine. We still write the new _state on top, so a
  // recoverable run can continue even from a partially-written row.
  let definition: Record<string, unknown> = {};
  if (workflow.definition) {
    try {
      definition = JSON.parse(workflow.definition);
    } catch (err) {
      console.error(
        `[workflow-engine] Failed to parse definition for ${workflowId}, writing fresh state:`,
        err
      );
    }
  }
  const combined = { ...definition, _state: state };

  await db
    .update(workflows)
    .set({
      definition: JSON.stringify(combined),
      status,
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, workflowId));

  if (status === "completed" || status === "failed") {
    await ensureTerminalWorkflowReceipt(workflowId, workflow.runNumber);
  }
}

/**
 * Resume a workflow that was paused at a delay step.
 *
 * Called by the scheduler tick when workflows.resume_at <= now(), and also
 * by the manual POST /api/workflows/[id]/resume endpoint when the user clicks
 * "Resume Now". The status transition is atomic (UPDATE ... WHERE status='paused')
 * so a scheduler tick and a user click racing each other produces exactly one
 * resume — the loser sees zero affected rows and returns silently.
 *
 * Only supports sequence-pattern workflows — other patterns never enter the
 * paused state in the first place (delay steps are sequence-only per spec).
 */
export async function resumeWorkflow(workflowId: string): Promise<void> {
  const [candidate] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));

  if (!candidate || candidate.status !== "paused") return;

  // Validate the durable recovery token before consuming the paused claim. A
  // corrupt or mismatched row stays paused and inspectable instead of becoming
  // an unrecoverable active workflow with no runner.
  const parsed = parseWorkflowState(candidate.definition);
  if (!parsed.state) {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      `Workflow ${workflowId} is marked paused but has no persisted state to resume`
    );
  }
  if (parsed.definition.pattern !== "sequence") {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      `Workflow ${workflowId} has pattern "${parsed.definition.pattern}" — delay resume requires sequence`
    );
  }
  const candidateStep = parsed.state.stepStates[parsed.state.currentStepIndex];
  if (!candidateStep || candidateStep.status !== "delayed") {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      `Workflow ${workflowId} has no delayed step at its persisted resume index`
    );
  }

  // Atomic status transition: only one validated snapshot can proceed.
  const updated = await db
    .update(workflows)
    .set({ status: "active", resumeAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(workflows.id, workflowId),
        eq(workflows.status, "paused"),
        eq(workflows.definition, candidate.definition)
      )
    )
    .returning();

  if (updated.length === 0) {
    // Workflow is not paused — either already resumed (scheduler raced user,
    // or vice versa) or doesn't exist. Idempotent: no error, no action.
    return;
  }

  const workflow = updated[0];
  const { definition, state } = parsed;

  // Mark the delayed step as completed, advance to the next step.
  const delayedIdx = state.currentStepIndex;
  const delayedStepState = state.stepStates[delayedIdx];
  if (delayedStepState && delayedStepState.status === "delayed") {
    delayedStepState.status = "completed";
    delayedStepState.completedAt = new Date().toISOString();
  }
  state.status = "running";
  const resumeFromIndex = delayedIdx + 1;

  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId: null,
    agentType: "workflow-engine",
    event: "workflow_resumed",
    payload: JSON.stringify({ workflowId, resumeFromIndex }),
    timestamp: new Date(),
  });

  const parentTaskId = definition.sourceTaskId;
  const workflowRuntimeId = workflow.runtimeId ?? undefined;

  // Reopen the learning session for this resume. Context proposals gathered
  // during the pre-pause run were already flushed when the original execute
  // closed its session; resume starts a fresh batch.
  openLearningSession(workflowId);

  try {
    await executeSequence(
      workflowId,
      definition,
      state,
      parentTaskId,
      workflowRuntimeId,
      resumeFromIndex,
    );

    // Another delay step may have been encountered during resume. TS narrows
    // state.status to "running" at this point because of the assignment above,
    // but executeSequence mutates state.status to "paused" when it hits a delay
    // step — the `as` cast forces TS to forget the narrowing and evaluate the
    // comparison at runtime.
    if ((state.status as WorkflowState["status"]) === "paused") {
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId: null,
        agentType: "workflow-engine",
        event: "workflow_paused_for_delay",
        payload: JSON.stringify({
          workflowId,
          delayedStepIndex: state.currentStepIndex,
        }),
        timestamp: new Date(),
      });
      return;
    }

    state.status = "completed";
    state.completedAt = new Date().toISOString();
    await updateWorkflowState(workflowId, state, "completed");

    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId: null,
      agentType: "workflow-engine",
      event: "workflow_completed",
      payload: JSON.stringify({ workflowId }),
      timestamp: new Date(),
    });
  } catch (error) {
    state.status = "failed";
    await updateWorkflowState(workflowId, state, "failed");

    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId: null,
      agentType: "workflow-engine",
      event: "workflow_failed",
      payload: JSON.stringify({
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      }),
      timestamp: new Date(),
    });
  } finally {
    updateExecutionStats(workflowId).catch((err) => {
      console.error("[workflow-engine] Stats update failed:", err);
    });
    await closeLearningSession(workflowId).catch((err) => {
      console.error("[workflow-engine] Failed to close learning session:", err);
    });
  }
}

export type WorkflowInteractionResumeResult =
  | "resumed"
  | "denied"
  | "not_ready";

/**
 * Resume a checkpoint input from its persisted notification response.
 *
 * The workflow definition carries the exact step + notification correlation,
 * so this can be called both immediately by the response route and later by a
 * scheduler tick after process re-entry. The definition snapshot participates
 * in the paused-to-active claim, making duplicate callers harmless.
 */
export async function resumeWorkflowInteraction(
  workflowId: string,
  expectedNotificationId?: string
): Promise<WorkflowInteractionResumeResult> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  if (!workflow) {
    throw new WorkflowTransitionError(
      "WORKFLOW_NOT_FOUND",
      `Workflow ${workflowId} not found`
    );
  }
  if (workflow.status !== "paused" || workflow.resumeAt !== null) {
    return "not_ready";
  }

  const { definition, state } = parseWorkflowState(workflow.definition);
  const pending = state?.pendingInteraction;
  if (!state || !pending || pending.kind !== "input") return "not_ready";
  if (definition.pattern !== "checkpoint") {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      `Workflow ${workflowId} has a persisted input gate outside a checkpoint pattern`
    );
  }
  if (
    expectedNotificationId &&
    pending.notificationId !== expectedNotificationId
  ) {
    throw new WorkflowTransitionError(
      "WORKFLOW_TRANSITION_CONFLICT",
      "The answered notification is not the workflow's active input gate"
    );
  }

  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, pending.notificationId));
  if (!notification?.response) return "not_ready";

  let response: {
    behavior?: unknown;
    updatedInput?: { answer?: unknown };
  };
  try {
    const toolInput = JSON.parse(notification.toolInput ?? "{}");
    if (toolInput?.workflowId !== workflowId) {
      throw new Error("notification workflow identity does not match");
    }
    response = JSON.parse(notification.response);
  } catch (error) {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      `Workflow ${workflowId} has a malformed persisted input response`,
      409,
      { cause: error }
    );
  }

  const stepState = state.stepStates[pending.stepIndex];
  const step = definition.steps[pending.stepIndex];
  if (
    !step ||
    !stepState ||
    stepState.stepId !== step.id ||
    stepState.status !== "waiting_approval"
  ) {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      `Workflow ${workflowId} input gate does not match its persisted step`
    );
  }

  if (response.behavior === "deny") {
    state.pendingInteraction = undefined;
    state.status = "failed";
    state.completedAt = new Date().toISOString();
    stepState.status = "failed";
    stepState.error = "Input denied by user";
    stepState.completedAt = new Date().toISOString();
    const denied = await db
      .update(workflows)
      .set({
        definition: JSON.stringify({ ...definition, _state: state }),
        status: "failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.status, "paused"),
          eq(workflows.definition, workflow.definition)
        )
      )
      .returning();
    if (denied.length === 0) return "not_ready";
    await updateWorkflowState(workflowId, state, "failed");
    return "denied";
  }

  const answer = response.updatedInput?.answer;
  if (response.behavior !== "allow" || typeof answer !== "string") {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      `Workflow ${workflowId} input response does not contain an allowed answer`
    );
  }

  state.pendingInteraction = undefined;
  state.status = "running";
  stepState.status = "running";
  const claimedDefinition = JSON.stringify({ ...definition, _state: state });
  const claimed = await db
    .update(workflows)
    .set({
      definition: claimedDefinition,
      status: "active",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflows.id, workflowId),
        eq(workflows.status, "paused"),
        eq(workflows.definition, workflow.definition)
      )
    )
    .returning();
  if (claimed.length === 0) return "not_ready";

  openLearningSession(workflowId);
  try {
    await executeCheckpoint(
      workflowId,
      definition,
      state,
      definition.sourceTaskId,
      workflow.runtimeId ?? undefined,
      pending.stepIndex,
      { stepIndex: pending.stepIndex, answer }
    );

    if ((state.status as WorkflowState["status"]) === "paused") {
      return "resumed";
    }

    state.status = "completed";
    state.completedAt = new Date().toISOString();
    await updateWorkflowState(workflowId, state, "completed");
  } catch (error) {
    state.status = "failed";
    await updateWorkflowState(workflowId, state, "failed");
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId: null,
      agentType: "workflow-engine",
      event: "workflow_failed",
      payload: JSON.stringify({
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      }),
      timestamp: new Date(),
    });
  } finally {
    updateExecutionStats(workflowId).catch((error) => {
      console.error("[workflow-engine] Stats update failed:", error);
    });
    await closeLearningSession(workflowId).catch((error) => {
      console.error("[workflow-engine] Failed to close learning session:", error);
    });
  }

  return "resumed";
}

/**
 * Get the current state of a workflow.
 */
export function parseWorkflowState(
  definitionJson: string
): { definition: WorkflowDefinition; state: WorkflowState | null; loopState: LoopState | null } {
  const parsed = JSON.parse(definitionJson);
  const { _state, _loopState, ...definition } = parsed;
  return { definition, state: _state ?? null, loopState: _loopState ?? null };
}

/**
 * Retry a failed step in a workflow.
 */
export async function retryWorkflowStep(
  workflowId: string,
  stepId: string
): Promise<void> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));

  if (!workflow) {
    throw new WorkflowTransitionError(
      "WORKFLOW_NOT_FOUND",
      `Workflow ${workflowId} not found`
    );
  }

  let definition: WorkflowDefinition;
  let state: WorkflowState | null;
  try {
    ({ definition, state } = parseWorkflowState(workflow.definition));
  } catch (error) {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      "Workflow execution state is malformed",
      409,
      { cause: error }
    );
  }
  if (!state) {
    throw new WorkflowTransitionError(
      "WORKFLOW_STATE_INVALID",
      "Workflow has no execution state"
    );
  }

  const stepIndex = state.stepStates.findIndex((s) => s.stepId === stepId);
  if (stepIndex === -1) {
    throw new WorkflowTransitionError(
      "WORKFLOW_STEP_NOT_FOUND",
      `Step ${stepId} not found`,
      404
    );
  }

  const stepState = state.stepStates[stepIndex];
  const isRuntimeRecovery = stepState.status === "blocked_runtime";
  if (stepState.status !== "failed" && !isRuntimeRecovery) {
    throw new WorkflowTransitionError(
      "WORKFLOW_TRANSITION_CONFLICT",
      `Step ${stepId} is not failed or blocked by a runtime`
    );
  }

  const expectedWorkflowStatus = isRuntimeRecovery ? "paused" : "failed";
  if (workflow.status !== expectedWorkflowStatus) {
    throw new WorkflowTransitionError(
      "WORKFLOW_TRANSITION_CONFLICT",
      `Cannot retry a step while workflow status is ${workflow.status}`
    );
  }

  if (definition.pattern !== "sequence" && definition.pattern !== "swarm") {
    throw new WorkflowTransitionError(
      "WORKFLOW_TRANSITION_CONFLICT",
      `Step retry is not supported for ${definition.pattern} workflows`
    );
  }

  let claimedRecovery = stepState.recovery;
  if (isRuntimeRecovery) {
    if (definition.pattern !== "sequence" || !claimedRecovery) {
      throw new WorkflowTransitionError(
        "WORKFLOW_STATE_INVALID",
        "Runtime recovery metadata is missing or unsupported for this workflow",
      );
    }
    if (claimedRecovery.attempts >= claimedRecovery.maxAttempts) {
      throw new WorkflowTransitionError(
        "WORKFLOW_TRANSITION_CONFLICT",
        `Runtime recovery has reached its ${claimedRecovery.maxAttempts}-attempt limit`,
      );
    }

    const targetStep = definition.steps[stepIndex];
    try {
      const { resolveWorkflowExecutionTargets } = await import(
        "@/lib/workflows/execution-targets"
      );
      await resolveWorkflowExecutionTargets({
        definition: { pattern: "sequence", steps: [targetStep] },
        workflowRuntimeId: workflow.runtimeId,
      });
    } catch (error) {
      const attempts = claimedRecovery.attempts + 1;
      const exhausted = attempts >= claimedRecovery.maxAttempts;
      const nextStepState: StepState = {
        ...stepState,
        status: exhausted ? "failed" : "blocked_runtime",
        error: exhausted
          ? `Runtime recovery stopped after ${claimedRecovery.maxAttempts} attempts.`
          : runtimeRecoveryMessage(claimedRecovery.reason),
        recovery: exhausted
          ? undefined
          : {
              ...claimedRecovery,
              attempts,
              lastHealthCheck: "unavailable",
              lastHealthMessage:
                error instanceof Error ? error.message : String(error),
            },
      };
      const nextState: WorkflowState = {
        ...state,
        status: exhausted ? "failed" : "paused",
        stepStates: state.stepStates.map((item, index) =>
          index === stepIndex ? nextStepState : item
        ),
      };
      const persisted = await db
        .update(workflows)
        .set({
          definition: JSON.stringify({ ...definition, _state: nextState }),
          status: exhausted ? "failed" : "paused",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.status, "paused"),
            eq(workflows.definition, workflow.definition)
          )
        )
        .returning();
      if (persisted.length === 0) {
        throw new WorkflowTransitionError(
          "WORKFLOW_TRANSITION_CONFLICT",
          "Workflow recovery state changed before the health check completed",
        );
      }
      if (exhausted) {
        await ensureTerminalWorkflowReceipt(workflowId, workflow.runNumber);
      }
      throw new WorkflowTransitionError(
        "WORKFLOW_TRANSITION_CONFLICT",
        exhausted
          ? `Runtime is still unavailable; recovery stopped after ${attempts} attempts`
          : `Runtime is still unavailable. Completed steps remain safe; ${claimedRecovery.maxAttempts - attempts} recovery attempt remains.`,
        409,
        { cause: error },
      );
    }
    claimedRecovery = {
      ...claimedRecovery,
      attempts: claimedRecovery.attempts + 1,
      lastHealthCheck: "available",
      lastHealthMessage: undefined,
    };
  }

  if (definition.pattern === "sequence") {
    resetStepState(stepState);
    stepState.recovery = claimedRecovery;
  }
  state.status = "running";
  state.currentStepIndex = stepIndex;
  state.completedAt = undefined;

  const claim = await db
    .update(workflows)
    .set({
      definition: JSON.stringify({ ...definition, _state: state }),
      status: "active",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflows.id, workflowId),
        eq(workflows.status, expectedWorkflowStatus),
        eq(workflows.definition, workflow.definition)
      )
    )
    .returning();
  if (claim.length === 0) {
    throw new WorkflowTransitionError(
      "WORKFLOW_TRANSITION_CONFLICT",
      "Workflow retry was already claimed"
    );
  }

  void runClaimedWorkflowStepRetry(
    workflowId,
    definition,
    state,
    stepIndex,
    workflow.runtimeId ?? undefined
  ).catch(async (error) => {
    state.status = "failed";
    const failedStep = state.stepStates[stepIndex];
    if (failedStep.status !== "failed") {
      failedStep.status = "failed";
      failedStep.error = error instanceof Error ? error.message : String(error);
      failedStep.completedAt = new Date().toISOString();
    }
    try {
      await updateWorkflowState(workflowId, state, "failed");
    } catch (persistError) {
      console.error(
        `[workflow-engine] Failed to persist retry failure for ${workflowId}:`,
        persistError
      );
    }
  });
}

async function runClaimedWorkflowStepRetry(
  workflowId: string,
  definition: WorkflowDefinition,
  state: WorkflowState,
  stepIndex: number,
  workflowRtId?: string
): Promise<void> {
  if (definition.pattern === "swarm") {
    await retrySwarmStep(workflowId, definition, state, stepIndex);
    return;
  }

  // Re-execute from this step
  const step = definition.steps[stepIndex];
  const completedPrefixOutput =
    stepIndex > 0 &&
    state.stepStates[stepIndex - 1]?.status === "completed"
      ? state.stepStates[stepIndex - 1].result ?? ""
      : "";
  const resumedPrompt = completedPrefixOutput
    ? `Previous step output:\n${completedPrefixOutput}\n\n---\n\n${step.prompt}`
    : step.prompt;
  const result = await executeStep(
    workflowId,
    step.id,
    step.name,
    resumedPrompt,
    state,
    step.assignedAgent,
    step.agentProfile,
    definition.sourceTaskId,
    step.budgetUsd,
    step.runtimeId,
    workflowRtId,
    true,
  );

  if (result.status === "completed") {
    let previousOutput = result.result ?? "";
    for (let i = stepIndex + 1; i < definition.steps.length; i++) {
      const nextStep = definition.steps[i];
      state.currentStepIndex = i;
      const contextPrompt = `Previous step output:\n${previousOutput}\n\n---\n\n${nextStep.prompt}`;
      const nextResult = await executeStep(
        workflowId,
        nextStep.id,
        nextStep.name,
        contextPrompt,
        state,
        nextStep.assignedAgent,
        nextStep.agentProfile,
        undefined,
        nextStep.budgetUsd,
        nextStep.runtimeId,
        workflowRtId,
        true,
      );
      if (
        nextResult.status === "failed" ||
        nextResult.status === "blocked_runtime"
      ) {
        break;
      }
      previousOutput = nextResult.result ?? "";
    }
  }

  const allCompleted = state.stepStates.every((s) => s.status === "completed");
  const blockedRuntime = state.stepStates.some(
    (item) => item.status === "blocked_runtime",
  );
  state.status = allCompleted
    ? "completed"
    : blockedRuntime
      ? "paused"
      : "failed";
  state.completedAt = allCompleted ? new Date().toISOString() : undefined;
  await updateWorkflowState(
    workflowId,
    state,
    allCompleted ? "completed" : blockedRuntime ? "paused" : "failed",
  );
}

function resetStepState(stepState: StepState): void {
  stepState.status = "pending";
  stepState.error = undefined;
  stepState.result = undefined;
  stepState.taskId = undefined;
  stepState.startedAt = undefined;
  stepState.completedAt = undefined;
  stepState.recovery = undefined;
}

async function retrySwarmStep(
  workflowId: string,
  definition: WorkflowDefinition,
  state: WorkflowState,
  stepIndex: number
): Promise<void> {
  const structure = getSwarmWorkflowStructure(definition);
  if (!structure) {
    throw new Error(
      "Swarm workflows require a mayor step, 2-5 worker steps, and a refinery step"
    );
  }

  const { mayorStep, workerSteps, refineryStep } = structure;
  const refineryIndex = definition.steps.length - 1;
  const mayorState = state.stepStates[0];
  const refineryState = state.stepStates[refineryIndex];
  const targetStep = definition.steps[stepIndex];
  const targetState = state.stepStates[stepIndex];

  if (stepIndex === 0) {
    for (const currentStepState of state.stepStates) {
      resetStepState(currentStepState);
    }

    state.status = "running";
    state.currentStepIndex = 0;
    state.completedAt = undefined;
    await updateWorkflowState(workflowId, state, "active");
    await executeSwarm(workflowId, definition, state);
    return;
  }

  if (mayorState.status !== "completed" || !mayorState.result) {
    throw new Error("Swarm mayor output must complete before retrying downstream steps");
  }

  if (stepIndex === refineryIndex) {
    const incompleteWorkers = workerSteps.filter((_, workerIndex) => {
      const workerState = state.stepStates[workerIndex + 1];
      return workerState.status !== "completed" || !workerState.result;
    });

    if (incompleteWorkers.length > 0) {
      throw new Error("All swarm workers must complete before retrying the refinery");
    }

    resetStepState(refineryState);
    state.status = "running";
    state.currentStepIndex = refineryIndex;
    state.completedAt = undefined;
    await updateWorkflowState(workflowId, state, "active");

    await runSwarmRefinery({
      workflowId,
      state,
      mayorStep,
      mayorResult: mayorState.result,
      refineryStep,
      refineryIndex,
      workerOutputs: workerSteps.map((worker, workerIndex) => ({
        stepName: worker.name,
        result: state.stepStates[workerIndex + 1].result ?? "",
      })),
    });

    state.status = "completed";
    state.completedAt = new Date().toISOString();
    await updateWorkflowState(workflowId, state, "completed");
    return;
  }

  resetStepState(targetState);
  resetStepState(refineryState);
  refineryState.status = "waiting_dependencies";
  state.status = "running";
  state.currentStepIndex = stepIndex;
  state.completedAt = undefined;
  await updateWorkflowState(workflowId, state, "active");

  const retriedWorker = await executeStep(
    workflowId,
    targetStep.id,
    targetStep.name,
    buildSwarmWorkerPrompt({
      mayorName: mayorStep.name,
      mayorResult: mayorState.result,
      workerName: targetStep.name,
      workerPrompt: targetStep.prompt,
    }),
    state,
    targetStep.assignedAgent,
    targetStep.agentProfile,
    undefined,
    targetStep.budgetUsd,
    targetStep.runtimeId
  );

  if (retriedWorker.status !== "completed") {
    state.status = "failed";
    await updateWorkflowState(workflowId, state, "failed");
    throw new Error(
      `Swarm worker "${targetStep.name}" failed: ${
        retriedWorker.error ?? "Task did not complete successfully"
      }`
    );
  }

  const failedWorkers = workerSteps
    .map((worker, workerIndex) => ({
      step: worker,
      result: state.stepStates[workerIndex + 1],
    }))
    .filter((worker) => worker.result.status !== "completed");

  if (failedWorkers.length > 0) {
    refineryState.status = "failed";
    refineryState.error = `Blocked by failed workers: ${summarizeFailedWorkers(
      failedWorkers.map((worker) => ({
        step: worker.step,
        result: { error: worker.result.error },
      }))
    )}`;
    state.status = "failed";
    await updateWorkflowState(workflowId, state, "failed");
    return;
  }

  await runSwarmRefinery({
    workflowId,
    state,
    mayorStep,
    mayorResult: mayorState.result,
    refineryStep,
    refineryIndex,
    workerOutputs: workerSteps.map((worker, workerIndex) => ({
      stepName: worker.name,
      result: state.stepStates[workerIndex + 1].result ?? "",
    })),
  });

  state.status = "completed";
  state.completedAt = new Date().toISOString();
  await updateWorkflowState(workflowId, state, "completed");
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    })
  );

  return results;
}
