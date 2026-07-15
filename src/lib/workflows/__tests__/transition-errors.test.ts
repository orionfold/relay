/** @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import {
  WorkflowTransitionError,
  workflowTransitionErrorResponse,
} from "../transition-errors";

describe("workflow transition error boundary", () => {
  it("preserves named transition details", () => {
    expect(
      workflowTransitionErrorResponse(
        new WorkflowTransitionError(
          "WORKFLOW_TRANSITION_CONFLICT",
          "Retry was already claimed"
        )
      )
    ).toEqual({
      status: 409,
      body: {
        error: "Retry was already claimed",
        code: "WORKFLOW_TRANSITION_CONFLICT",
      },
    });
  });

  it("logs unexpected failures without exposing internal details", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      workflowTransitionErrorResponse(
        new Error("SQLITE_BUSY at /private/operator/path")
      )
    ).toEqual({
      status: 500,
      body: {
        error: "Workflow transition failed",
        code: "WORKFLOW_TRANSITION_FAILED",
      },
    });
    expect(consoleError).toHaveBeenCalledOnce();

    consoleError.mockRestore();
  });
});
