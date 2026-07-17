export class RelayRecoveryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400, options?: ErrorOptions) {
    super(message, options);
    this.name = "RelayRecoveryError";
    this.code = code;
    this.status = status;
  }
}

export function recoveryError(error: unknown): RelayRecoveryError {
  if (error instanceof RelayRecoveryError) return error;
  if (error instanceof Error && error.name === "SnapshotIntegrityError" && "code" in error && typeof error.code === "string") {
    return new RelayRecoveryError(error.code, error.message, 400, { cause: error });
  }
  return new RelayRecoveryError(
    "RECOVERY_INTERNAL_ERROR",
    "Relay could not complete the recovery operation.",
    500,
    { cause: error },
  );
}
