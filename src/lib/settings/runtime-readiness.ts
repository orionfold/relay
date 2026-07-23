import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import type { ApiKeySource } from "@/lib/constants/settings";
import { getSetting, setSetting } from "./helpers";

export type RuntimeReadinessPhase =
  | "not-configured"
  | "saved-unverified"
  | "verified"
  | "auth-rejected"
  | "unreachable"
  | "model-required"
  | "invalid-response";

export interface RuntimeReadinessObservation {
  phase: RuntimeReadinessPhase;
  ready: boolean;
  checkedAt: string | null;
  credentialSource: ApiKeySource;
  endpointReachable: boolean | null;
  reason: string | null;
}

const KEY_PREFIX = "runtime.readiness.";

function keyFor(runtimeId: AgentRuntimeId): string {
  return `${KEY_PREFIX}${runtimeId}`;
}

function isPhase(value: unknown): value is RuntimeReadinessPhase {
  return [
    "not-configured",
    "saved-unverified",
    "verified",
    "auth-rejected",
    "unreachable",
    "model-required",
    "invalid-response",
  ].includes(String(value));
}

export function unverifiedRuntimeReadiness(
  credentialSource: ApiKeySource,
): RuntimeReadinessObservation {
  return {
    phase: "saved-unverified",
    ready: false,
    checkedAt: null,
    credentialSource,
    endpointReachable: null,
    reason: "Saved, not verified",
  };
}

export function classifyRuntimeReadiness(input: {
  connected: boolean;
  error?: string | null;
  checkedAt?: string;
  credentialSource: ApiKeySource;
}): RuntimeReadinessObservation {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  if (input.connected) {
    return {
      phase: "verified",
      ready: true,
      checkedAt,
      credentialSource: input.credentialSource,
      endpointReachable: true,
      reason: null,
    };
  }

  const reason = input.error?.trim() || "Connection check failed";
  const normalized = reason.toLowerCase();
  const modelRequired =
    normalized.includes("no ollama model is configured") ||
    normalized.includes("reported no models") ||
    normalized.includes("no generation model") ||
    normalized.includes("load or configure a model");
  if (modelRequired) {
    return {
      phase: "model-required",
      ready: false,
      checkedAt,
      credentialSource: input.credentialSource,
      endpointReachable: true,
      reason,
    };
  }

  const authRejected =
    /\b(401|403)\b/.test(normalized) ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("invalid api key") ||
    normalized.includes("incorrect api key") ||
    normalized.includes("authentication failed") ||
    normalized.includes("auth rejected") ||
    normalized.includes("sign-in is not configured") ||
    normalized.includes("not authenticated");
  if (authRejected) {
    return {
      phase: "auth-rejected",
      ready: false,
      checkedAt,
      credentialSource: input.credentialSource,
      endpointReachable: true,
      reason,
    };
  }

  const invalidResponse =
    normalized.includes("invalid json") ||
    normalized.includes("non-json") ||
    normalized.includes("empty response") ||
    normalized.includes("invalid model") ||
    normalized.includes("invalid response") ||
    normalized.includes("malformed");
  if (invalidResponse) {
    return {
      phase: "invalid-response",
      ready: false,
      checkedAt,
      credentialSource: input.credentialSource,
      endpointReachable: true,
      reason,
    };
  }

  return {
    phase: "unreachable",
    ready: false,
    checkedAt,
    credentialSource: input.credentialSource,
    endpointReachable: false,
    reason,
  };
}

export async function readRuntimeReadiness(
  runtimeId: AgentRuntimeId,
  credentialSource: ApiKeySource,
): Promise<RuntimeReadinessObservation> {
  const raw = await getSetting(keyFor(runtimeId));
  if (!raw) return unverifiedRuntimeReadiness(credentialSource);
  try {
    const value = JSON.parse(raw) as Partial<RuntimeReadinessObservation>;
    if (!isPhase(value.phase)) {
      return unverifiedRuntimeReadiness(credentialSource);
    }
    return {
      phase: value.phase,
      ready: value.phase === "verified" && value.ready === true,
      checkedAt:
        typeof value.checkedAt === "string" ? value.checkedAt : null,
      credentialSource,
      endpointReachable:
        typeof value.endpointReachable === "boolean"
          ? value.endpointReachable
          : null,
      reason: typeof value.reason === "string" ? value.reason : null,
    };
  } catch {
    return unverifiedRuntimeReadiness(credentialSource);
  }
}

export async function recordRuntimeReadiness(
  runtimeId: AgentRuntimeId,
  observation: RuntimeReadinessObservation,
): Promise<void> {
  await setSetting(keyFor(runtimeId), JSON.stringify(observation));
}

export async function clearRuntimeReadiness(
  ...runtimeIds: AgentRuntimeId[]
): Promise<void> {
  await Promise.all(runtimeIds.map((runtimeId) => setSetting(keyFor(runtimeId), "")));
}
