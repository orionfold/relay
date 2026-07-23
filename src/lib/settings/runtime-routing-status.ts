import {
  DEFAULT_AGENT_RUNTIME,
  SUPPORTED_AGENT_RUNTIMES,
  getRuntimeCatalogEntry,
  getRuntimeFeatures,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";
import { testRuntimeConnection } from "@/lib/agents/runtime";
import { resolvePreferredModel } from "@/lib/agents/runtime/model-preference";
import { getOllamaRuntimeConfig } from "@/lib/agents/runtime/ollama-config";
import { resolveOllamaModel } from "@/lib/agents/runtime/ollama-model-resolver";
import {
  resolveOpenAICompatibleModel,
} from "@/lib/agents/runtime/openai-compatible";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { getSetting } from "./helpers";
import {
  getRuntimeSetupStates,
  type RuntimeSetupState,
} from "./runtime-setup";
import { getComparableRuntimeCost } from "./runtime-routing-evidence";
import { sanitizeProviderError } from "@/lib/agents/runtime/provider-endpoint";
import {
  classifyRuntimeReadiness,
  recordRuntimeReadiness,
  type RuntimeReadinessPhase,
} from "./runtime-readiness";

const STATUS_TTL_MS = 15_000;
const PROBE_TIMEOUT_MS = 8_000;

export type RuntimeHealthState =
  | "healthy"
  | "unhealthy"
  | "unconfigured";

export interface RuntimeRoutingStatus {
  runtimeId: AgentRuntimeId;
  label: string;
  configured: boolean;
  health: RuntimeHealthState;
  healthReason: string | null;
  checkedAt: string | null;
  readiness: RuntimeReadinessPhase;
  ready: boolean;
  credentialSource: RuntimeSetupState["apiKeySource"];
  endpointReachable: boolean | null;
  modelId: string | null;
  comparableCostPerMillionMicros: number | null;
  capabilitySummary: string[];
  capabilityLimits: string[];
}

let cache:
  | { expiresAt: number; statuses: RuntimeRoutingStatus[] }
  | null = null;
let cacheGeneration = 0;
let inFlight:
  | {
      generation: number;
      promise: Promise<RuntimeRoutingStatus[]>;
    }
  | null = null;

export function clearRuntimeRoutingStatusCache(): void {
  cacheGeneration += 1;
  cache = null;
  inFlight = null;
}

export function pickReadyRuntime(
  statuses: RuntimeRoutingStatus[],
): RuntimeRoutingStatus | null {
  const ordered = [
    DEFAULT_AGENT_RUNTIME,
    ...SUPPORTED_AGENT_RUNTIMES.filter(
      (runtimeId) => runtimeId !== DEFAULT_AGENT_RUNTIME,
    ),
  ];
  return (
    ordered
      .map((runtimeId) =>
        statuses.find((status) => status.runtimeId === runtimeId),
      )
      .find((status) => status?.ready) ?? null
  );
}

function describeCapabilities(runtimeId: AgentRuntimeId): {
  capabilitySummary: string[];
  capabilityLimits: string[];
} {
  const entry = getRuntimeCatalogEntry(runtimeId);
  const features = getRuntimeFeatures(runtimeId);
  const capabilitySummary: string[] = [];
  const capabilityLimits: string[] = [];

  if (features.hasFilesystemTools) capabilitySummary.push("Filesystem");
  else capabilityLimits.push("No filesystem tools");
  if (features.hasBash) capabilitySummary.push("Bash");
  else capabilityLimits.push("No Bash");
  if (entry.capabilities.approvals) capabilitySummary.push("Approvals");
  else capabilityLimits.push("No approval bridge");
  if (entry.capabilities.resume) capabilitySummary.push("Resume");
  else capabilityLimits.push("No resume");
  if (features.supportsPluginMcpServers) capabilitySummary.push("Plugin MCP");
  else capabilityLimits.push("No plugin MCP");

  return { capabilitySummary, capabilityLimits };
}

async function modelForRuntime(runtimeId: AgentRuntimeId): Promise<string | null> {
  if (runtimeId === "ollama") {
    const config = await getOllamaRuntimeConfig();
    return resolveOllamaModel(
      { baseUrl: config.baseUrl, apiKey: config.apiKey },
      null,
      config.defaultModel,
    );
  }
  if (runtimeId === "litellm" || runtimeId === "lmstudio") {
    return resolveOpenAICompatibleModel(runtimeId);
  }
  if (runtimeId === "anthropic-direct") {
    return (
      (await getSetting(SETTINGS_KEYS.ANTHROPIC_DIRECT_MODEL)) ||
      (await resolvePreferredModel(runtimeId)).modelId
    );
  }
  if (runtimeId === "openai-direct") {
    return (
      (await getSetting(SETTINGS_KEYS.OPENAI_DIRECT_MODEL)) ||
      (await resolvePreferredModel(runtimeId)).modelId
    );
  }
  return (await resolvePreferredModel(runtimeId)).modelId || null;
}

async function probeRuntime(
  runtimeId: AgentRuntimeId,
): Promise<{ connected: boolean; reason: string | null }> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: { connected: boolean; reason: string | null }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          connected: false,
          reason: `${getRuntimeCatalogEntry(runtimeId).label} health check timed out`,
        }),
      PROBE_TIMEOUT_MS,
    );
    void testRuntimeConnection(runtimeId)
      .then((connection) =>
        finish({
          connected: connection.connected,
          reason: connection.error
            ? sanitizeProviderError(connection.error)
            : null,
        }),
      )
      .catch((error) =>
        finish({
          connected: false,
          reason: sanitizeProviderError(
            error instanceof Error ? error.message : String(error),
          ),
        }),
      );
  });
}

async function statusForRuntime(
  runtimeId: AgentRuntimeId,
  setup: RuntimeSetupState,
): Promise<RuntimeRoutingStatus> {
  const capabilities = describeCapabilities(runtimeId);
  if (!setup.configured) {
    return {
      runtimeId,
      label: getRuntimeCatalogEntry(runtimeId).label,
      configured: false,
      health: "unconfigured",
      healthReason: "Not configured",
      checkedAt: null,
      readiness: "not-configured",
      ready: false,
      credentialSource: setup.apiKeySource ?? "unknown",
      endpointReachable: null,
      modelId: null,
      comparableCostPerMillionMicros: null,
      ...capabilities,
    };
  }

  const checkedAt = new Date().toISOString();
  const [probe, modelResult] = await Promise.all([
    probeRuntime(runtimeId),
    modelForRuntime(runtimeId)
      .then((modelId) => ({ modelId, error: null }))
      .catch((error) => ({
        modelId: null,
        error: sanitizeProviderError(
          error instanceof Error ? error.message : String(error),
        ),
      })),
  ]);
  const modelFailure =
    probe.connected && !modelResult.modelId
      ? modelResult.error ?? "No generation model is available"
      : null;
  const effectiveProbe = modelFailure
    ? { connected: false, reason: modelFailure }
    : probe;
  const readiness = classifyRuntimeReadiness({
    connected: effectiveProbe.connected,
    error: effectiveProbe.reason,
    checkedAt,
    credentialSource: setup.apiKeySource ?? "unknown",
  });
  await recordRuntimeReadiness(runtimeId, readiness).catch(() => undefined);
  const modelId = modelResult.modelId;
  const comparableCostPerMillionMicros = await getComparableRuntimeCost({
    runtimeId,
    modelId,
  }).catch(() => null);
  return {
    runtimeId,
    label: getRuntimeCatalogEntry(runtimeId).label,
    configured: true,
    health: effectiveProbe.connected ? "healthy" : "unhealthy",
    healthReason: effectiveProbe.connected
      ? null
      : effectiveProbe.reason ?? "Health check failed",
    checkedAt,
    readiness: readiness.phase,
    ready: readiness.ready,
    credentialSource: readiness.credentialSource,
    endpointReachable: readiness.endpointReachable,
    modelId,
    comparableCostPerMillionMicros,
    ...capabilities,
  };
}

export async function getRuntimeRoutingStatuses(options?: {
  force?: boolean;
}): Promise<RuntimeRoutingStatus[]> {
  const now = Date.now();
  if (!options?.force && cache && cache.expiresAt > now) {
    return cache.statuses;
  }
  if (
    !options?.force &&
    inFlight &&
    inFlight.generation === cacheGeneration
  ) {
    return inFlight.promise;
  }

  const generation = cacheGeneration;
  const promise = (async () => {
    const setup = await getRuntimeSetupStates();
    const settled = await Promise.allSettled(
      SUPPORTED_AGENT_RUNTIMES.map((runtimeId) =>
        statusForRuntime(runtimeId, setup[runtimeId]),
      ),
    );
    const statuses = settled.map((result, index): RuntimeRoutingStatus => {
      if (result.status === "fulfilled") return result.value;
      const runtimeId = SUPPORTED_AGENT_RUNTIMES[index];
      return {
        runtimeId,
        label: getRuntimeCatalogEntry(runtimeId).label,
        configured: setup[runtimeId].configured,
        health: setup[runtimeId].configured ? "unhealthy" : "unconfigured",
        healthReason:
          result.reason instanceof Error
            ? sanitizeProviderError(result.reason.message)
            : sanitizeProviderError(String(result.reason)),
        checkedAt: setup[runtimeId].configured ? new Date().toISOString() : null,
        readiness: setup[runtimeId].configured
          ? "unreachable"
          : "not-configured",
        ready: false,
        credentialSource: setup[runtimeId].apiKeySource ?? "unknown",
        endpointReachable: setup[runtimeId].configured ? false : null,
        modelId: null,
        comparableCostPerMillionMicros: null,
        ...describeCapabilities(runtimeId),
      };
    });
    if (generation === cacheGeneration) {
      cache = { expiresAt: Date.now() + STATUS_TTL_MS, statuses };
    }
    return statuses;
  })();

  if (!options?.force) {
    inFlight = { generation, promise };
  }
  try {
    return await promise;
  } finally {
    if (inFlight?.promise === promise) inFlight = null;
  }
}
