export type WorkflowTransitionErrorCode =
  | "WORKFLOW_NOT_FOUND"
  | "WORKFLOW_STATE_INVALID"
  | "WORKFLOW_STEP_NOT_FOUND"
  | "WORKFLOW_TRANSITION_CONFLICT"
  | "WORKFLOW_CANCELLATION_FAILED";

export class WorkflowTransitionError extends Error {
  readonly code: WorkflowTransitionErrorCode;
  readonly status: 404 | 409;

  constructor(
    code: WorkflowTransitionErrorCode,
    message: string,
    status: 404 | 409 = code === "WORKFLOW_NOT_FOUND" ? 404 : 409,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "WorkflowTransitionError";
    this.code = code;
    this.status = status;
  }
}

export function workflowTransitionErrorResponse(error: unknown): {
  status: 404 | 409 | 500;
  body: { error: string; code: string };
} {
  if (error instanceof WorkflowTransitionError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code },
    };
  }
  console.error("[workflow-transition] Unhandled transition failure:", error);
  return {
    status: 500,
    body: {
      error: "Workflow transition failed",
      code: "WORKFLOW_TRANSITION_FAILED",
    },
  };
}
