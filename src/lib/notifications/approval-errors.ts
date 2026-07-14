export type ApprovalResolutionErrorCode =
  | "APPROVAL_NOT_FOUND"
  | "APPROVAL_ALREADY_RESOLVED"
  | "APPROVAL_TYPE_MISMATCH"
  | "APPROVAL_PAYLOAD_MISMATCH"
  | "APPROVAL_PAYLOAD_MALFORMED"
  | "APPROVAL_PERSISTENCE_FAILED";

export class ApprovalResolutionError extends Error {
  constructor(
    public readonly code: ApprovalResolutionErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ApprovalResolutionError";
  }
}

export function approvalErrorStatus(error: ApprovalResolutionError): number {
  switch (error.code) {
    case "APPROVAL_NOT_FOUND":
      return 404;
    case "APPROVAL_ALREADY_RESOLVED":
      return 409;
    case "APPROVAL_TYPE_MISMATCH":
    case "APPROVAL_PAYLOAD_MISMATCH":
    case "APPROVAL_PAYLOAD_MALFORMED":
      return 400;
    case "APPROVAL_PERSISTENCE_FAILED":
      return 500;
  }
}

export function approvalErrorResponse(error: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  if (error instanceof ApprovalResolutionError) {
    return {
      status: approvalErrorStatus(error),
      body: { error: error.message, code: error.code },
    };
  }

  return {
    status: 500,
    body: {
      error: "The approval could not be saved. It is still pending; retry the action.",
      code: "APPROVAL_PERSISTENCE_FAILED",
    },
  };
}
