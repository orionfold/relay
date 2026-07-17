import { getRuntimeCatalogEntry } from "./catalog";
import { InvalidRelayCellIdError } from "@/lib/config/env";
import {
  NoCompatibleRuntimeError,
  EmptyEligibleRuntimePoolError,
  NoEligibleRuntimeError,
  RequestedModelUnavailableError,
  RuntimeCapabilityMismatchError,
  RuntimeUnavailableError,
  type ResolvedExecutionTarget,
} from "./execution-target";
import type {
  ExecutionTargetErrorCode,
  ExecutionTargetPreviewItem,
} from "./execution-target-contract";

export function toExecutionTargetPreviewItem(input: {
  key: string;
  label: string;
  profileId?: string | null;
  target: ResolvedExecutionTarget;
}): ExecutionTargetPreviewItem {
  return {
    key: input.key,
    label: input.label,
    profileId: input.profileId ?? null,
    requestedRuntimeId: input.target.requestedRuntimeId,
    requestedRuntimeLabel: input.target.requestedRuntimeId
      ? getRuntimeCatalogEntry(input.target.requestedRuntimeId).label
      : null,
    effectiveRuntimeId: input.target.effectiveRuntimeId,
    effectiveRuntimeLabel: getRuntimeCatalogEntry(
      input.target.effectiveRuntimeId
    ).label,
    requestedModelId: input.target.requestedModelId,
    effectiveModelId: input.target.effectiveModelId,
    selectionMode: input.target.selectionMode,
    selectionReason: input.target.selectionReason,
    routingPreference: input.target.routingPreference ?? null,
    automaticFallbackEnabled:
      input.target.automaticFallbackEnabled ?? false,
    consideredRuntimeIds: input.target.consideredRuntimeIds ?? [],
    skippedRuntimes: input.target.skippedRuntimes ?? [],
  };
}

export function classifyExecutionTargetError(error: unknown): {
  code: ExecutionTargetErrorCode;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause ? error.cause : error;
  if (cause instanceof RuntimeCapabilityMismatchError) {
    return { code: "runtime_capability_mismatch", message };
  }
  if (cause instanceof RuntimeUnavailableError) {
    return { code: "runtime_unavailable", message };
  }
  if (cause instanceof RequestedModelUnavailableError) {
    return { code: "model_unavailable", message };
  }
  if (cause instanceof NoCompatibleRuntimeError) {
    return { code: "no_compatible_runtime", message };
  }
  if (cause instanceof EmptyEligibleRuntimePoolError) {
    return { code: "empty_eligible_runtime_pool", message };
  }
  if (cause instanceof NoEligibleRuntimeError) {
    return { code: "no_eligible_runtime", message };
  }
  if (
    cause instanceof Error &&
    cause.name === "OllamaModelNotConfiguredError"
  ) {
    return { code: "model_unavailable", message };
  }
  if (cause instanceof InvalidRelayCellIdError) {
    return { code: "cell_identity_invalid", message };
  }
  return { code: "target_resolution_failed", message };
}
