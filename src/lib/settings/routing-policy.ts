import {
  DEFAULT_AGENT_RUNTIME,
  SUPPORTED_AGENT_RUNTIMES,
  isAgentRuntimeId,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";

export const ROUTING_POLICY_VERSION = 1 as const;

export interface RoutingPolicyV1 {
  version: typeof ROUTING_POLICY_VERSION;
  eligibleRuntimeIds: AgentRuntimeId[];
  manualDefaultRuntimeId: AgentRuntimeId;
  automaticFallback: boolean;
}

export interface RoutingPolicyReadResult {
  policy: RoutingPolicyV1;
  source: "default" | "stored" | "repaired";
  needsPersistence: boolean;
  repairReason: string | null;
}

export function createDefaultRoutingPolicy(): RoutingPolicyV1 {
  return {
    version: ROUTING_POLICY_VERSION,
    eligibleRuntimeIds: [...SUPPORTED_AGENT_RUNTIMES],
    manualDefaultRuntimeId: DEFAULT_AGENT_RUNTIME,
    automaticFallback: true,
  };
}

function conservativeRepair(
  value: Record<string, unknown> | null,
  reasons: string[],
): RoutingPolicyReadResult {
  const rawIds = Array.isArray(value?.eligibleRuntimeIds)
    ? value.eligibleRuntimeIds
    : [];
  const eligibleRuntimeIds = Array.from(
    new Set(
      rawIds.filter(
        (runtimeId): runtimeId is AgentRuntimeId =>
          typeof runtimeId === "string" && isAgentRuntimeId(runtimeId),
      ),
    ),
  );
  const manualDefaultRuntimeId =
    typeof value?.manualDefaultRuntimeId === "string" &&
    isAgentRuntimeId(value.manualDefaultRuntimeId)
      ? value.manualDefaultRuntimeId
      : DEFAULT_AGENT_RUNTIME;

  return {
    policy: {
      version: ROUTING_POLICY_VERSION,
      eligibleRuntimeIds,
      manualDefaultRuntimeId,
      // A corrupt or future payload never silently enables fallback.
      automaticFallback: false,
    },
    source: "repaired",
    needsPersistence: true,
    repairReason: reasons.join(" "),
  };
}

export function readRoutingPolicy(raw: string | null): RoutingPolicyReadResult {
  if (raw === null) {
    return {
      policy: createDefaultRoutingPolicy(),
      source: "default",
      needsPersistence: true,
      repairReason: null,
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return conservativeRepair(null, [
      "The saved routing policy was not valid JSON; automatic routing is disabled until the policy is saved again.",
    ]);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return conservativeRepair(null, [
      "The saved routing policy had an invalid shape; automatic routing is disabled until the policy is saved again.",
    ]);
  }

  const record = value as Record<string, unknown>;
  if (record.version !== ROUTING_POLICY_VERSION) {
    return conservativeRepair(record, [
      `Routing policy version ${String(record.version)} is not supported; recognized choices were preserved and fallback was disabled.`,
    ]);
  }

  const reasons: string[] = [];
  const rawIds = record.eligibleRuntimeIds;
  if (!Array.isArray(rawIds)) {
    reasons.push("Eligible runtimes were missing or invalid.");
  }
  const recognized = Array.isArray(rawIds)
    ? rawIds.filter(
        (runtimeId): runtimeId is AgentRuntimeId =>
          typeof runtimeId === "string" && isAgentRuntimeId(runtimeId),
      )
    : [];
  const eligibleRuntimeIds = Array.from(new Set(recognized));
  if (
    Array.isArray(rawIds) &&
    (eligibleRuntimeIds.length !== rawIds.length ||
      rawIds.some((runtimeId) => typeof runtimeId !== "string"))
  ) {
    reasons.push("Unknown or duplicate eligible runtime ids were removed.");
  }

  const manualDefaultRuntimeId =
    typeof record.manualDefaultRuntimeId === "string" &&
    isAgentRuntimeId(record.manualDefaultRuntimeId)
      ? record.manualDefaultRuntimeId
      : DEFAULT_AGENT_RUNTIME;
  if (manualDefaultRuntimeId !== record.manualDefaultRuntimeId) {
    reasons.push("The Manual default was invalid and was reset to Claude Code.");
  }

  const automaticFallback =
    typeof record.automaticFallback === "boolean"
      ? record.automaticFallback
      : false;
  if (typeof record.automaticFallback !== "boolean") {
    reasons.push("Automatic fallback was invalid and was disabled.");
  }

  return {
    policy: {
      version: ROUTING_POLICY_VERSION,
      eligibleRuntimeIds,
      manualDefaultRuntimeId,
      automaticFallback,
    },
    source: reasons.length > 0 ? "repaired" : "stored",
    needsPersistence: reasons.length > 0,
    repairReason: reasons.length > 0 ? reasons.join(" ") : null,
  };
}

export function serializeRoutingPolicy(policy: RoutingPolicyV1): string {
  return JSON.stringify(policy);
}
