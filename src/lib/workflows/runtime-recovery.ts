import type { StepRuntimeRecovery } from "./types";

const UNAVAILABLE_MESSAGE =
  /\b(unavailable|connection|connect|econn\w*|socket|network|host|process exited|failed to start|service|50[234])\b/i;

export function classifyRecoverableRuntimeFailure(input: {
  failureReason?: string | null;
  message?: string | null;
}): StepRuntimeRecovery["reason"] | null {
  if (input.failureReason === "timeout") return "timeout";
  if (input.failureReason === "rate_limited") return "rate_limited";
  if (
    input.failureReason === "sdk_error" &&
    UNAVAILABLE_MESSAGE.test(input.message ?? "")
  ) {
    return "runtime_unavailable";
  }
  return null;
}

export function runtimeRecoveryMessage(
  reason: StepRuntimeRecovery["reason"],
): string {
  if (reason === "rate_limited") {
    return "The provider is rate-limiting requests. Your completed steps are safe.";
  }
  if (reason === "timeout") {
    return "The runtime timed out. Your completed steps are safe.";
  }
  return "The runtime is temporarily unreachable. Your completed steps are safe.";
}
