import { resolveTaskExecutionTarget } from "@/lib/agents/runtime/execution-target";
import { toExecutionTargetPreviewItem } from "@/lib/agents/runtime/execution-target-preview";
import type { ExecutionTargetPreviewItem } from "@/lib/agents/runtime/execution-target-contract";
import type { WorkflowDefinition, WorkflowStep } from "./types";

export function getWorkflowStepRequestedRuntime(input: {
  step: WorkflowStep;
  workflowRuntimeId?: string | null;
  loopAssignedAgent?: string | null;
}): string | null {
  return (
    input.step.runtimeId ??
    input.step.assignedAgent ??
    input.loopAssignedAgent ??
    input.workflowRuntimeId ??
    null
  );
}

export async function resolveWorkflowExecutionTargets(input: {
  definition: WorkflowDefinition;
  workflowRuntimeId?: string | null;
}): Promise<ExecutionTargetPreviewItem[]> {
  const loopAssignedAgent =
    input.definition.pattern === "loop"
      ? input.definition.loopConfig?.assignedAgent ?? null
      : null;
  const loopAgentProfile =
    input.definition.pattern === "loop"
      ? input.definition.loopConfig?.agentProfile ?? null
      : null;

  const executableSteps = input.definition.steps.filter(
    (step) => !step.delayDuration
  );
  const targets: ExecutionTargetPreviewItem[] = [];

  for (const step of executableSteps) {
    const profileId = loopAgentProfile ?? step.agentProfile ?? null;
    try {
      const target = await resolveTaskExecutionTarget({
        title: step.name,
        description: step.prompt,
        requestedRuntimeId: getWorkflowStepRequestedRuntime({
          step,
          workflowRuntimeId: input.workflowRuntimeId,
          loopAssignedAgent,
        }),
        profileId,
      });
      targets.push(
        toExecutionTargetPreviewItem({
          key: step.id,
          label: step.name,
          profileId,
          target,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Step \`${step.name}\` cannot run: ${message}`, {
        cause: error,
      });
    }
  }

  return targets;
}
