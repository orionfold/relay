export class RelayHostError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, string | number | boolean | null>>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RelayHostError";
  }
}

export function hostError(
  error: unknown,
  fallbackCode = "HOST_INTERNAL_ERROR",
): RelayHostError {
  if (error instanceof RelayHostError) return error;
  return new RelayHostError(
    fallbackCode,
    error instanceof Error ? error.message : String(error),
    undefined,
    error instanceof Error ? { cause: error } : undefined,
  );
}
