import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { getBlueprint } from "./registry";
import { resolveTemplate, evaluateCondition } from "./template";
import type { BlueprintVariable } from "./types";
import type { WorkflowStep } from "../types";

interface InstantiateResult {
  workflowId: string;
  name: string;
  stepsCount: number;
  skippedSteps: string[];
}

export interface PreparedBlueprintInstantiation extends InstantiateResult {
  projectId: string | null;
  definition: string;
  createdAt: Date;
}

/**
 * Instantiate a blueprint into a concrete draft workflow.
 *
 * 1. Validate all required variables
 * 2. Resolve {{variable}} in prompt templates
 * 3. Process {{#if}} conditional blocks
 * 4. Evaluate step conditions, filter skipped steps
 * 5. Create workflow with blueprintId lineage
 */
export async function instantiateBlueprint(
  blueprintId: string,
  variables: Record<string, unknown>,
  projectId?: string,
  metadata?: {
    _contextRowId?: string;
    _scheduleId?: string;
    _scheduleBudgetPerRunUsd?: number;
  }
): Promise<InstantiateResult> {
  const prepared = prepareBlueprintInstantiation(
    blueprintId,
    variables,
    projectId,
    metadata,
  );

  await db.insert(workflows).values({
    id: prepared.workflowId,
    projectId: prepared.projectId,
    name: prepared.name.slice(0, 100),
    definition: prepared.definition,
    status: "draft",
    createdAt: prepared.createdAt,
    updatedAt: prepared.createdAt,
  });

  return {
    workflowId: prepared.workflowId,
    name: prepared.name,
    stepsCount: prepared.stepsCount,
    skippedSteps: prepared.skippedSteps,
  };
}

/**
 * Resolve and validate a blueprint without mutating the database.
 *
 * Readiness and atomic Start use this exact preparation path so their
 * preflight inspects the same prompts, conditions and profiles that would be
 * persisted. Draft-only creation calls it immediately before insertion.
 */
export function prepareBlueprintInstantiation(
  blueprintId: string,
  variables: Record<string, unknown>,
  projectId?: string,
  metadata?: {
    _contextRowId?: string;
    _scheduleId?: string;
    _scheduleBudgetPerRunUsd?: number;
  },
  workflowId?: string,
): PreparedBlueprintInstantiation {
  const resolvedWorkflowId = workflowId ?? crypto.randomUUID();
  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) {
    throw new Error(`Blueprint "${blueprintId}" not found`);
  }

  // Validate required variables
  validateVariables(blueprint.variables, variables);

  // Apply defaults for unset optional variables
  const resolvedVars = applyDefaults(blueprint.variables, variables);

  // Process steps: resolve templates, evaluate conditions
  const resolvedSteps: WorkflowStep[] = [];
  const skippedSteps: string[] = [];

  for (const step of blueprint.steps) {
    // Check condition — skip if evaluates to falsy
    if (step.condition && !evaluateCondition(step.condition, resolvedVars)) {
      skippedSteps.push(step.name);
      continue;
    }

    // Delay step: a pure time wait with no prompt/profile. Blueprint validation
    // enforces that delayDuration and profileId+promptTemplate are mutually
    // exclusive (XOR), so branching here is safe.
    if (step.delayDuration) {
      resolvedSteps.push({
        id: workflowId
          ? `${resolvedWorkflowId}:step:${resolvedSteps.length}`
          : crypto.randomUUID(),
        name: step.name,
        prompt: "",
        requiresApproval: step.requiresApproval,
        delayDuration: step.delayDuration,
      });
      continue;
    }

    // Task step: profileId + promptTemplate must be present (XOR contract).
    if (!step.promptTemplate) {
      throw new Error(
        `Blueprint step "${step.name}" has no promptTemplate — blueprint validation should have caught this.`,
      );
    }

    const resolvedPrompt = resolveTemplate(step.promptTemplate, resolvedVars);

    resolvedSteps.push({
      id: workflowId
        ? `${resolvedWorkflowId}:step:${resolvedSteps.length}`
        : crypto.randomUUID(),
      name: step.name,
      prompt: resolvedPrompt,
      requiresApproval: step.requiresApproval,
      agentProfile: step.profileId,
    });
  }

  if (resolvedSteps.length === 0) {
    throw new Error("All steps were skipped by conditions — at least one step must remain");
  }

  const now = new Date();
  const workflowName = resolveTemplate(
    `${blueprint.name}: {{${blueprint.variables[0]?.id ?? "topic"}}}`,
    resolvedVars
  ) || blueprint.name;

  const definition: Record<string, unknown> = {
    pattern: blueprint.pattern,
    steps: resolvedSteps,
    _blueprintId: blueprintId,
  };
  if (metadata?._contextRowId) {
    definition._contextRowId = metadata._contextRowId;
  }
  if (metadata?._scheduleId) {
    definition._scheduleId = metadata._scheduleId;
  }
  if (metadata?._scheduleBudgetPerRunUsd !== undefined) {
    definition._scheduleBudgetPerRunUsd = metadata._scheduleBudgetPerRunUsd;
  }

  return {
    workflowId: resolvedWorkflowId,
    name: workflowName,
    stepsCount: resolvedSteps.length,
    skippedSteps,
    projectId: projectId ?? null,
    definition: JSON.stringify(definition),
    createdAt: now,
  };
}

function validateVariables(
  definitions: BlueprintVariable[],
  provided: Record<string, unknown>
): void {
  const errors: string[] = [];

  for (const def of definitions) {
    if (def.required) {
      const value = provided[def.id];
      if (value === undefined || value === null || value === "") {
        errors.push(`"${def.label}" is required`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Missing required variables: ${errors.join(", ")}`);
  }
}

function applyDefaults(
  definitions: BlueprintVariable[],
  provided: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...provided };

  for (const def of definitions) {
    if (result[def.id] === undefined && def.default !== undefined) {
      result[def.id] = def.default;
    }
  }

  return result;
}
