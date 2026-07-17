import type { RelayExecutionContext } from "@/lib/instance/cell-boundary";

export type ExecutionTargetPreviewKind = "task" | "workflow";

export type ExecutionTargetSelectionMode =
  | "explicit"
  | "manual-default"
  | "automatic"
  | "resume"
  | "chat";

export type ExecutionTargetErrorCode =
  | "runtime_capability_mismatch"
  | "runtime_unavailable"
  | "model_unavailable"
  | "no_compatible_runtime"
  | "empty_eligible_runtime_pool"
  | "no_eligible_runtime"
  | "target_resolution_failed";

export interface ExecutionTargetPreviewItem {
  key: string;
  label: string;
  profileId: string | null;
  requestedRuntimeId: string | null;
  requestedRuntimeLabel: string | null;
  effectiveRuntimeId: string;
  effectiveRuntimeLabel: string;
  requestedModelId: string | null;
  effectiveModelId: string | null;
  selectionMode: ExecutionTargetSelectionMode;
  selectionReason: string;
  routingPreference: string | null;
  automaticFallbackEnabled: boolean;
  consideredRuntimeIds: string[];
  skippedRuntimes: Array<{ runtimeId: string; reason: string }>;
}

export interface ExecutionTargetPreviewResponse {
  kind: ExecutionTargetPreviewKind;
  ready: boolean;
  targets: ExecutionTargetPreviewItem[];
  context: RelayExecutionContext | null;
  error: {
    code: ExecutionTargetErrorCode;
    message: string;
    targetLabel?: string;
  } | null;
}
