import { describe, expect, it } from "vitest";
import { classifyRecoverableRuntimeFailure } from "../runtime-recovery";

describe("classifyRecoverableRuntimeFailure", () => {
  it.each([
    ["timeout", "request timed out", "timeout"],
    ["rate_limited", "429", "rate_limited"],
    ["sdk_error", "Provider unavailable", "runtime_unavailable"],
    ["sdk_error", "ECONNREFUSED 127.0.0.1", "runtime_unavailable"],
    [
      "sdk_error",
      "Ollama API error (503): synthetic transient staging failure",
      "runtime_unavailable",
    ],
  ])("classifies %s / %s as recoverable", (failureReason, message, expected) => {
    expect(
      classifyRecoverableRuntimeFailure({ failureReason, message }),
    ).toBe(expected);
  });

  it.each([
    ["auth_failed", "Token expired"],
    ["budget_exceeded", "Budget exhausted"],
    ["turn_limit_exceeded", "Turn limit reached"],
    ["aborted", "Operator cancelled"],
    ["sdk_error", "Malformed provider response"],
  ])("keeps %s terminal", (failureReason, message) => {
    expect(
      classifyRecoverableRuntimeFailure({ failureReason, message }),
    ).toBeNull();
  });
});
