export type WorkshopErrorCode =
  | "edition_unsupported"
  | "relay_version_incompatible"
  | "integrity_failed"
  | "signature_failed"
  | "runtime_unavailable"
  | "data_dir_unavailable"
  | "install_conflict"
  | "checkpoint_failed"
  | "rubric_unavailable"
  | "evidence_unavailable"
  | "redaction_failed"
  | "run_not_found"
  | "invalid_transition";

export class WorkshopError extends Error {
  readonly code: WorkshopErrorCode;
  readonly recovery: string;

  constructor(
    code: WorkshopErrorCode,
    message: string,
    recovery: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "WorkshopError";
    this.code = code;
    this.recovery = recovery;
  }
}

export function workshopErrorPayload(error: unknown) {
  if (error instanceof WorkshopError) {
    return {
      error: error.message,
      code: error.code,
      recovery: error.recovery,
    };
  }
  console.error("[workshop] unexpected error:", error);
  return {
    error: "Workshop operation failed unexpectedly.",
    code: "invalid_transition" as const,
    recovery: "Retry the operation. If it repeats, keep the run and inspect Relay logs.",
  };
}
