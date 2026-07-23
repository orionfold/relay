import { resolveTaskExecutionTarget } from "@/lib/agents/runtime/execution-target";
import {
  classifyExecutionTargetError,
  toExecutionTargetPreviewItem,
} from "@/lib/agents/runtime/execution-target-preview";
import type { ExecutionTargetErrorCode } from "@/lib/agents/runtime/execution-target-contract";
import { getBlueprint } from "./registry";

export type BlueprintReadiness =
  | {
      ready: true;
      checkedAt: string;
      stepName: string;
      target: ReturnType<typeof toExecutionTargetPreviewItem>;
    }
  | {
      ready: false;
      checkedAt: string;
      code: ExecutionTargetErrorCode | "blueprint_not_found" | "no_executable_step";
      message: string;
      settingsHref: string;
    };

/**
 * Probe the first task-bearing step without creating a workflow.
 *
 * Variable-dependent conditions are authoring-time branches, so this probe
 * intentionally checks the first declared task candidate. Start performs the
 * authoritative preflight against every resolved, non-skipped task.
 */
export async function getBlueprintReadiness(
  blueprintId: string,
): Promise<BlueprintReadiness> {
  const checkedAt = new Date().toISOString();
  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) {
    return {
      ready: false,
      checkedAt,
      code: "blueprint_not_found",
      message: "This blueprint is no longer available.",
      settingsHref: "/blueprints",
    };
  }

  const step = blueprint.steps.find(
    (candidate) => !candidate.delayDuration && candidate.promptTemplate,
  );
  if (!step) {
    return {
      ready: false,
      checkedAt,
      code: "no_executable_step",
      message: "This blueprint has no executable task step.",
      settingsHref: `/blueprints/${blueprintId}`,
    };
  }

  try {
    const target = await resolveTaskExecutionTarget({
      title: step.name,
      description: step.promptTemplate ?? step.name,
      profileId: step.profileId ?? null,
      availabilityMode: "observed",
    });
    return {
      ready: true,
      checkedAt,
      stepName: step.name,
      target: toExecutionTargetPreviewItem({
        key: `${blueprintId}:first-executable-step`,
        label: step.name,
        profileId: step.profileId ?? null,
        target,
      }),
    };
  } catch (error) {
    const classified = classifyExecutionTargetError(error);
    return {
      ready: false,
      checkedAt,
      code: classified.code,
      message: classified.message,
      settingsHref: "/settings#settings-providers-runtimes",
    };
  }
}
