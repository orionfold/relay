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
}

export interface ExecutionTargetPreviewResponse {
  kind: ExecutionTargetPreviewKind;
  ready: boolean;
  targets: ExecutionTargetPreviewItem[];
  error: {
    code: ExecutionTargetErrorCode;
    message: string;
    targetLabel?: string;
  } | null;
}
