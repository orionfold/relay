import { getProfile } from "@/lib/agents/profiles/registry";
import { profileSupportsRuntime } from "@/lib/agents/profiles/compatibility";
import type { AgentProfile } from "@/lib/agents/profiles/types";
import { suggestRuntime } from "@/lib/agents/router";
import {
  DEFAULT_AGENT_RUNTIME,
  getRuntimeCatalogEntry,
  getRuntimeFeatures,
  resolveAgentRuntime,
  type AgentRuntimeId,
} from "./catalog";
import { testRuntimeConnection } from "./index";
import { getRoutingSettings } from "@/lib/settings/routing";
import type { RoutingPreference } from "@/lib/constants/settings";
import { getRuntimeSetupStates, listConfiguredRuntimeIds } from "@/lib/settings/runtime-setup";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, getRuntimeForModel } from "@/lib/chat/types";
import { getSetting } from "@/lib/settings/helpers";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { resolvePreferredModel } from "./model-preference";
import { resolveOllamaModel } from "./ollama-model-resolver";
import {
  isOpenAICompatibleRuntimeId,
  resolveOpenAICompatibleModel,
} from "./openai-compatible";
import { getChatRuntimeContract } from "@/lib/chat/runtime-contract";
import { sanitizeProviderError } from "./provider-endpoint";
import {
  classifyRuntimeReadiness,
  readRuntimeReadiness,
  recordRuntimeReadiness,
} from "@/lib/settings/runtime-readiness";

const FILESYSTEM_TOOL_NAMES = new Set([
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Grep",
  "Glob",
]);

const CHAT_MODEL_FALLBACKS: Record<string, string[]> = {
  haiku: ["gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.4"],
  sonnet: ["gpt-5.3-codex", "gpt-5.4", "gpt-5.4-mini"],
  opus: ["gpt-5.4", "gpt-5.3-codex", "gpt-5.4-mini"],
  "gpt-5.4-mini": ["haiku", "sonnet", "opus"],
  "gpt-5.3-codex": ["sonnet", "haiku", "opus"],
  "gpt-5.4": ["opus", "sonnet", "haiku"],
};

export class RuntimeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeUnavailableError";
  }
}

export class RequestedModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestedModelUnavailableError";
  }
}

export class NoCompatibleRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoCompatibleRuntimeError";
  }
}

export class RuntimeCapabilityMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeCapabilityMismatchError";
  }
}

export class EmptyEligibleRuntimePoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyEligibleRuntimePoolError";
  }
}

export class NoEligibleRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoEligibleRuntimeError";
  }
}

export function buildNoCompatibleRuntimeError(input: {
  profileId: string | null | undefined;
  profile: AgentProfile | undefined;
  configuredRuntimeIds: AgentRuntimeId[];
  requirements?: RuntimeRequirements;
}): NoCompatibleRuntimeError {
  const configured =
    input.configuredRuntimeIds.length > 0
      ? `[${input.configuredRuntimeIds.join(", ")}]`
      : "(none)";

  if (!input.profile) {
    return new NoCompatibleRuntimeError(
      `No profile registered for id \`${input.profileId ?? "(unknown)"}\`. ` +
        `If this profile is referenced from an app manifest, ensure the app is ` +
        `installed; otherwise author the profile.yaml. Configured runtimes: ${configured}.`
    );
  }

  const requiredCapabilities = describeRequiredCapabilities(input.requirements);
  if (requiredCapabilities.length > 0 && input.configuredRuntimeIds.length > 0) {
    return new NoCompatibleRuntimeError(
      `Profile \`${input.profile.id}\` requires ${requiredCapabilities.join(" and ")}. ` +
        `Configured runtimes ${configured} do not provide a profile-compatible target with those capabilities. ` +
        `Choose a runtime with ${requiredCapabilities.join(" and ")} or update the profile.`
    );
  }

  return new NoCompatibleRuntimeError(
    `Profile \`${input.profile.id}\` expects ` +
      `[${input.profile.supportedRuntimes.join(", ")}]. ` +
      `You have ${configured} configured. ` +
      `Configure one of the expected runtimes or update the profile.`
  );
}

export interface ResolvedExecutionTarget {
  requestedRuntimeId: AgentRuntimeId | null;
  effectiveRuntimeId: AgentRuntimeId;
  requestedModelId: string | null;
  effectiveModelId: string | null;
  fallbackApplied: boolean;
  fallbackReason: string | null;
  selectionMode: "explicit" | "manual-default" | "automatic" | "resume" | "chat";
  selectionReason: string;
  routingPreference?: RoutingPreference | null;
  automaticFallbackEnabled?: boolean;
  consideredRuntimeIds?: AgentRuntimeId[];
  skippedRuntimes?: RuntimeSelectionSkip[];
}

export interface RuntimeSelectionSkip {
  runtimeId: AgentRuntimeId;
  reason: string;
}

type RuntimeRequirements = {
  requiresBash: boolean;
  requiresFilesystem: boolean;
};

type RuntimeAvailability = {
  available: boolean;
  reason: string | null;
};

function describeRequiredCapabilities(
  requirements?: RuntimeRequirements
): string[] {
  if (!requirements) return [];
  const capabilities: string[] = [];
  if (requirements.requiresBash) {
    capabilities.push("Bash");
  }
  if (requirements.requiresFilesystem) {
    capabilities.push("filesystem tools (Read, Write, or Edit)");
  }
  return capabilities;
}

function getMissingRuntimeCapabilities(
  runtimeId: AgentRuntimeId,
  requirements: RuntimeRequirements
): string[] {
  const features = getRuntimeFeatures(runtimeId);
  const missing: string[] = [];
  if (requirements.requiresBash && !features.hasBash) {
    missing.push("Bash");
  }
  if (requirements.requiresFilesystem && !features.hasFilesystemTools) {
    missing.push("filesystem tools (Read, Write, or Edit)");
  }
  return missing;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function getRuntimeLabel(runtimeId: AgentRuntimeId): string {
  return getRuntimeCatalogEntry(runtimeId).label;
}

function detectRuntimeRequirements(profileId?: string | null): RuntimeRequirements {
  const profile = profileId ? getProfile(profileId) : undefined;
  const allowedTools = profile?.allowedTools ?? [];

  const requiresBash = allowedTools.some(
    (tool) => tool === "Bash" || tool.startsWith("Bash(")
  );
  const requiresFilesystem =
    requiresBash ||
    allowedTools.some((tool) => FILESYSTEM_TOOL_NAMES.has(tool));

  return { requiresBash, requiresFilesystem };
}

function runtimeMeetsRequirements(
  runtimeId: AgentRuntimeId,
  requirements: RuntimeRequirements
): boolean {
  const features = getRuntimeFeatures(runtimeId);
  if (requirements.requiresBash && !features.hasBash) {
    return false;
  }
  if (requirements.requiresFilesystem && !features.hasFilesystemTools) {
    return false;
  }
  return true;
}

function buildRuntimeCapabilityMismatchError(input: {
  runtimeId: AgentRuntimeId;
  profileId?: string | null;
  requirements: RuntimeRequirements;
}): RuntimeCapabilityMismatchError {
  const profile = input.profileId ? getProfile(input.profileId) : undefined;
  const runtime = getRuntimeCatalogEntry(input.runtimeId);

  if (profile && !profileSupportsRuntime(profile, input.runtimeId)) {
    return new RuntimeCapabilityMismatchError(
      `Profile \`${profile.id}\` does not support ${runtime.label}. ` +
        `Supported runtimes: [${profile.supportedRuntimes.join(", ")}]. ` +
        `Edit the task or workflow step and explicitly choose a supported runtime.`
    );
  }

  const missing = getMissingRuntimeCapabilities(
    input.runtimeId,
    input.requirements
  );
  return new RuntimeCapabilityMismatchError(
    `${runtime.label} cannot run profile \`${profile?.id ?? input.profileId ?? "auto"}\` ` +
      `because it lacks ${missing.join(" and ") || "required capabilities"}. ` +
      `Edit the task or workflow step and explicitly choose a compatible runtime.`
  );
}

function getProfileModelPin(
  profileId: string | null | undefined,
  runtimeId: AgentRuntimeId
): string | null {
  const profile = profileId ? getProfile(profileId) : undefined;
  return profile?.capabilityOverrides?.[runtimeId]?.modelId ?? null;
}

async function resolveTaskModel(
  runtimeId: AgentRuntimeId,
  profileId?: string | null
): Promise<{ requestedModelId: string | null; effectiveModelId: string | null }> {
  const requestedModelId = getProfileModelPin(profileId, runtimeId);

  if (runtimeId === "openai-codex-app-server") {
    return { requestedModelId, effectiveModelId: requestedModelId };
  }

  if (runtimeId === "ollama") {
    const { getOllamaRuntimeConfig } = await import("./ollama-config");
    const config = await getOllamaRuntimeConfig();
    const effectiveModelId = await resolveOllamaModel(
      config,
      requestedModelId,
      config.defaultModel
    );
    return { requestedModelId, effectiveModelId };
  }

  if (isOpenAICompatibleRuntimeId(runtimeId)) {
    const effectiveModelId = await resolveOpenAICompatibleModel(
      runtimeId,
      requestedModelId
    );
    return { requestedModelId, effectiveModelId };
  }

  const configuredModel =
    runtimeId === "anthropic-direct"
      ? await getSetting(SETTINGS_KEYS.ANTHROPIC_DIRECT_MODEL)
      : runtimeId === "openai-direct"
        ? await getSetting(SETTINGS_KEYS.OPENAI_DIRECT_MODEL)
        : null;
  const effectiveModelId =
    requestedModelId ??
    configuredModel ??
    (await resolvePreferredModel(runtimeId)).modelId;
  return { requestedModelId, effectiveModelId };
}

async function buildResolvedTaskTarget(input: {
  runtimeId: AgentRuntimeId;
  profileId?: string | null;
  selectionMode: "explicit" | "manual-default" | "automatic";
  selectionReason: string;
  routingPreference: RoutingPreference;
  automaticFallbackEnabled: boolean;
  consideredRuntimeIds: AgentRuntimeId[];
  skippedRuntimes: RuntimeSelectionSkip[];
  fallbackReason?: string | null;
}): Promise<ResolvedExecutionTarget> {
  const model = await resolveTaskModel(input.runtimeId, input.profileId);
  return {
    requestedRuntimeId:
      input.selectionMode === "explicit" ? input.runtimeId : null,
    effectiveRuntimeId: input.runtimeId,
    requestedModelId: model.requestedModelId,
    effectiveModelId: model.effectiveModelId,
    fallbackApplied: Boolean(input.fallbackReason),
    fallbackReason: input.fallbackReason ?? null,
    selectionMode: input.selectionMode,
    selectionReason: input.selectionReason,
    routingPreference: input.routingPreference,
    automaticFallbackEnabled: input.automaticFallbackEnabled,
    consideredRuntimeIds: input.consideredRuntimeIds,
    skippedRuntimes: input.skippedRuntimes,
  };
}

async function checkRuntimeAvailability(
  runtimeId: AgentRuntimeId,
  setupStates?: Awaited<ReturnType<typeof getRuntimeSetupStates>>,
  mode: "live" | "observed" = "live",
): Promise<RuntimeAvailability> {
  const states = setupStates ?? (await getRuntimeSetupStates());
  if (!states[runtimeId]?.configured) {
    return {
      available: false,
      reason: `${getRuntimeLabel(runtimeId)} is not configured`,
    };
  }

  if (mode === "observed") {
    const observation = await readRuntimeReadiness(
      runtimeId,
      states[runtimeId].apiKeySource ?? "unknown",
    );
    return {
      available: observation.ready,
      reason:
        observation.reason ??
        (observation.ready
          ? null
          : `${getRuntimeLabel(runtimeId)} has not been verified`),
    };
  }

  try {
    const connection = await testRuntimeConnection(runtimeId);
    const reason = connection.error
      ? sanitizeProviderError(connection.error)
      : null;
    await recordRuntimeReadiness(
      runtimeId,
      classifyRuntimeReadiness({
        connected: connection.connected,
        error: reason,
        credentialSource: states[runtimeId].apiKeySource ?? "unknown",
      }),
    ).catch(() => undefined);
    if (connection.connected) {
      return { available: true, reason: null };
    }
    return {
      available: false,
      reason:
        reason ??
        `${getRuntimeLabel(runtimeId)} is unavailable`,
    };
  } catch (error) {
    const reason = sanitizeProviderError(
      error instanceof Error ? error.message : String(error),
    );
    await recordRuntimeReadiness(
      runtimeId,
      classifyRuntimeReadiness({
        connected: false,
        error: reason,
        credentialSource: states[runtimeId].apiKeySource ?? "unknown",
      }),
    ).catch(() => undefined);
    return {
      available: false,
      reason,
    };
  }
}

async function getComparableRoutingCost(
  runtimeId: AgentRuntimeId,
  profileId?: string | null,
): Promise<number | null> {
  const { getComparableRuntimeCost } = await import(
    "@/lib/settings/runtime-routing-evidence"
  );
  return getComparableRuntimeCost({
    runtimeId,
    modelId: getProfileModelPin(profileId, runtimeId),
  });
}

export async function resolveTaskExecutionTarget(input: {
  title: string;
  description?: string | null;
  requestedRuntimeId?: string | null;
  profileId?: string | null;
  unavailableRuntimeIds?: string[];
  unavailableReasons?: Record<string, string>;
  availabilityMode?: "live" | "observed";
}): Promise<ResolvedExecutionTarget> {
  const requestedRuntimeId = input.requestedRuntimeId
    ? resolveAgentRuntime(input.requestedRuntimeId)
    : null;
  const requirements = detectRuntimeRequirements(input.profileId);
  const unavailableRuntimeIds = new Set(
    (input.unavailableRuntimeIds ?? []).map((runtimeId) =>
      resolveAgentRuntime(runtimeId)
    )
  );
  const states = await getRuntimeSetupStates();
  const configuredRuntimeIds = listConfiguredRuntimeIds(states) as AgentRuntimeId[];
  const routing = await getRoutingSettings();

  if (requestedRuntimeId) {
    const profile = input.profileId ? getProfile(input.profileId) : undefined;
    if (input.profileId && !profile) {
      throw buildNoCompatibleRuntimeError({
        profileId: input.profileId,
        profile,
        configuredRuntimeIds,
        requirements,
      });
    }
    if (
      (profile && !profileSupportsRuntime(profile, requestedRuntimeId)) ||
      !runtimeMeetsRequirements(requestedRuntimeId, requirements)
    ) {
      throw buildRuntimeCapabilityMismatchError({
        runtimeId: requestedRuntimeId,
        profileId: input.profileId,
        requirements,
      });
    }

    const availability = unavailableRuntimeIds.has(requestedRuntimeId)
      ? {
          available: false,
          reason:
            (input.unavailableReasons?.[requestedRuntimeId]
              ? sanitizeProviderError(
                  input.unavailableReasons[requestedRuntimeId],
                )
              : null) ??
            `${getRuntimeLabel(requestedRuntimeId)} is temporarily unavailable`,
        }
      : await checkRuntimeAvailability(
          requestedRuntimeId,
          states,
          input.availabilityMode,
        );
    if (!availability.available) {
      throw new RuntimeUnavailableError(
        `${availability.reason ?? `${getRuntimeLabel(requestedRuntimeId)} is unavailable`}. ` +
          `The explicit target was not changed. Configure it or explicitly choose another runtime.`
      );
    }

    return buildResolvedTaskTarget({
      runtimeId: requestedRuntimeId,
      profileId: input.profileId,
      selectionMode: "explicit",
      selectionReason: "Explicit runtime override",
      routingPreference: routing.preference,
      automaticFallbackEnabled: false,
      consideredRuntimeIds: [requestedRuntimeId],
      skippedRuntimes: [],
    });
  }

  const profile = input.profileId ? getProfile(input.profileId) : undefined;
  if (input.profileId && !profile) {
    throw buildNoCompatibleRuntimeError({
      profileId: input.profileId,
      profile,
      configuredRuntimeIds,
      requirements,
    });
  }

  const routingPreference = routing.preference;
  if (routingPreference === "manual") {
    const defaultRuntimeId = routing.policy.manualDefaultRuntimeId;
    if (
      (profile && !profileSupportsRuntime(profile, defaultRuntimeId)) ||
      !runtimeMeetsRequirements(defaultRuntimeId, requirements)
    ) {
      throw buildRuntimeCapabilityMismatchError({
        runtimeId: defaultRuntimeId,
        profileId: input.profileId,
        requirements,
      });
    }
    const availability = await checkRuntimeAvailability(
      defaultRuntimeId,
      states,
      input.availabilityMode,
    );
    if (!availability.available) {
      throw new RuntimeUnavailableError(
        `${availability.reason ?? `${getRuntimeLabel(defaultRuntimeId)} is unavailable`}. ` +
          `Manual routing disables auto-routing and uses the default runtime; configure it or explicitly choose another runtime.`
      );
    }
    return buildResolvedTaskTarget({
      runtimeId: defaultRuntimeId,
      profileId: input.profileId,
      selectionMode: "manual-default",
      selectionReason: `Manual routing is strict; using ${getRuntimeLabel(defaultRuntimeId)}`,
      routingPreference,
      automaticFallbackEnabled: false,
      consideredRuntimeIds: [defaultRuntimeId],
      skippedRuntimes: [],
    });
  }

  if (routing.policy.eligibleRuntimeIds.length === 0) {
    throw new EmptyEligibleRuntimePoolError(
      "Automatic routing has no eligible runtimes. Select at least one runtime in Settings or use an explicit task target.",
    );
  }

  const skippedRuntimes: RuntimeSelectionSkip[] = [];
  const launchableCandidates: AgentRuntimeId[] = [];
  for (const runtimeId of routing.policy.eligibleRuntimeIds) {
    if (!states[runtimeId]?.configured) {
      skippedRuntimes.push({
        runtimeId,
        reason: `${getRuntimeLabel(runtimeId)} is not configured`,
      });
      continue;
    }
    if (profile && !profileSupportsRuntime(profile, runtimeId)) {
      skippedRuntimes.push({
        runtimeId,
        reason: `Profile \`${profile.id}\` does not support ${getRuntimeLabel(runtimeId)}`,
      });
      continue;
    }
    const missing = getMissingRuntimeCapabilities(runtimeId, requirements);
    if (missing.length > 0) {
      skippedRuntimes.push({
        runtimeId,
        reason: `${getRuntimeLabel(runtimeId)} lacks ${missing.join(" and ")}`,
      });
      continue;
    }
    if (unavailableRuntimeIds.has(runtimeId)) {
      skippedRuntimes.push({
        runtimeId,
        reason:
          (input.unavailableReasons?.[runtimeId]
            ? sanitizeProviderError(input.unavailableReasons[runtimeId])
            : null) ??
          `${getRuntimeLabel(runtimeId)} is temporarily unavailable`,
      });
      continue;
    }
    launchableCandidates.push(runtimeId);
  }

  if (launchableCandidates.length === 0) {
    const detail = skippedRuntimes.map((skip) => skip.reason).join("; ");
    throw new NoEligibleRuntimeError(
      detail
        ? `No eligible runtime can execute this task. ${detail}`
        : "No eligible runtime can execute this task.",
    );
  }

  const routingCandidates = await Promise.all(
    launchableCandidates.map(async (runtimeId) => ({
      runtimeId,
      comparableCostPerMillionMicros: await getComparableRoutingCost(
        runtimeId,
        input.profileId,
      ),
    })),
  );
  const suggestion = suggestRuntime(
    input.title,
    input.description,
    input.profileId,
    routingCandidates,
    routingPreference
  );
  const suggested = suggestion.runtimeId;
  const autoOrder = unique(suggestion.orderedRuntimeIds);
  const probeOrder = routing.policy.automaticFallback
    ? autoOrder
    : autoOrder.slice(0, 1);

  for (const candidate of probeOrder) {
    const availability = await checkRuntimeAvailability(
      candidate,
      states,
      input.availabilityMode,
    );
    if (availability.available) {
      const fallbackReason =
        suggested === candidate
          ? null
          : `${getRuntimeLabel(suggested)} was unavailable; selected ${getRuntimeLabel(candidate)} from the eligible pool`;
      return buildResolvedTaskTarget({
        runtimeId: candidate,
        profileId: input.profileId,
        selectionMode: "automatic",
        selectionReason: fallbackReason ?? suggestion.reason,
        routingPreference,
        automaticFallbackEnabled: routing.policy.automaticFallback,
        consideredRuntimeIds: autoOrder,
        skippedRuntimes,
        fallbackReason,
      });
    }
    skippedRuntimes.push({
      runtimeId: candidate,
      reason:
        availability.reason ?? `${getRuntimeLabel(candidate)} is unavailable`,
    });
  }

  throw new RuntimeUnavailableError(
    routing.policy.automaticFallback
      ? `No healthy runtime is currently available in the eligible pool. ${skippedRuntimes.map((skip) => skip.reason).join("; ")}`
      : `${skippedRuntimes.at(-1)?.reason ?? `${getRuntimeLabel(suggested)} is unavailable`}. Automatic fallback is disabled.`,
  );
}

export async function resolveResumeExecutionTarget(input: {
  requestedRuntimeId?: string | null;
  effectiveRuntimeId?: string | null;
}): Promise<ResolvedExecutionTarget> {
  const requestedRuntimeId = input.requestedRuntimeId
    ? resolveAgentRuntime(input.requestedRuntimeId)
    : null;
  const resumeRuntimeId = input.effectiveRuntimeId
    ? resolveAgentRuntime(input.effectiveRuntimeId)
    : requestedRuntimeId ?? DEFAULT_AGENT_RUNTIME;
  const availability = await checkRuntimeAvailability(resumeRuntimeId);

  if (!availability.available) {
    throw new RuntimeUnavailableError(
      availability.reason ??
        `${getRuntimeLabel(resumeRuntimeId)} is unavailable for resume. Use Retry for a fresh execution.`
    );
  }

  return {
    requestedRuntimeId,
    effectiveRuntimeId: resumeRuntimeId,
    requestedModelId: null,
    effectiveModelId: null,
    fallbackApplied: false,
    fallbackReason: null,
    selectionMode: "resume",
    selectionReason: "Resume keeps the previous effective runtime",
  };
}

function buildChatFallbackOrder(requestedModelId: string): string[] {
  const fallbacks = CHAT_MODEL_FALLBACKS[requestedModelId] ?? [];
  return unique([requestedModelId, ...fallbacks]);
}

function buildChatFallbackReason(input: {
  requestedRuntimeId: AgentRuntimeId;
  effectiveRuntimeId: AgentRuntimeId;
  requestedModelId: string;
  effectiveModelId: string;
  unavailableReason: string | null;
}): string | null {
  if (
    input.requestedRuntimeId === input.effectiveRuntimeId &&
    input.requestedModelId === input.effectiveModelId
  ) {
    return null;
  }

  const requestedLabel = `${input.requestedModelId} on ${getRuntimeLabel(input.requestedRuntimeId)}`;
  const effectiveLabel = `${input.effectiveModelId} on ${getRuntimeLabel(input.effectiveRuntimeId)}`;
  const reason = input.unavailableReason ?? `${requestedLabel} is unavailable`;
  return `${reason}. Using ${effectiveLabel} for this turn.`;
}

function isRecognizedChatModelId(modelId: string): boolean {
  if (CHAT_MODELS.some((m) => m.id === modelId)) return true;
  if (modelId.startsWith("ollama:")) return true;
  if (modelId.startsWith("litellm:")) return true;
  if (modelId.startsWith("lmstudio:")) return true;
  return false;
}

export async function resolveChatExecutionTarget(input: {
  requestedRuntimeId?: string | null;
  requestedModelId?: string | null;
}): Promise<ResolvedExecutionTarget> {
  const rawRequestedModelId =
    input.requestedModelId ??
    (input.requestedRuntimeId
      ? getRuntimeCatalogEntry(resolveAgentRuntime(input.requestedRuntimeId)).models.default
      : DEFAULT_CHAT_MODEL);

  const explicitRuntimeId = input.requestedRuntimeId
    ? resolveAgentRuntime(input.requestedRuntimeId)
    : null;
  if (explicitRuntimeId) {
    const chatContract = getChatRuntimeContract(explicitRuntimeId);
    if (!chatContract.supported) {
      throw new RuntimeCapabilityMismatchError(chatContract.reason);
    }
  }
  const prefixedRuntimeId = rawRequestedModelId.startsWith("litellm:")
    ? "litellm"
    : rawRequestedModelId.startsWith("lmstudio:")
      ? "lmstudio"
      : null;
  if (
    explicitRuntimeId &&
    prefixedRuntimeId &&
    explicitRuntimeId !== prefixedRuntimeId
  ) {
    throw new RequestedModelUnavailableError(
      `${rawRequestedModelId} belongs to ${getRuntimeLabel(prefixedRuntimeId)}, not ${getRuntimeLabel(explicitRuntimeId)}.`
    );
  }
  const compatibleRuntimeId =
    explicitRuntimeId && isOpenAICompatibleRuntimeId(explicitRuntimeId)
      ? explicitRuntimeId
      : prefixedRuntimeId;

  if (compatibleRuntimeId) {
    if (prefixedRuntimeId && prefixedRuntimeId !== compatibleRuntimeId) {
      throw new RequestedModelUnavailableError(
        `${rawRequestedModelId} belongs to ${getRuntimeLabel(prefixedRuntimeId)}, not ${getRuntimeLabel(compatibleRuntimeId)}.`
      );
    }
    const availability = await checkRuntimeAvailability(compatibleRuntimeId);
    if (!availability.available) {
      throw new RequestedModelUnavailableError(
        `${availability.reason ?? `${getRuntimeLabel(compatibleRuntimeId)} is unavailable`}. The explicit target was not changed.`
      );
    }
    const effectiveModelId = await resolveOpenAICompatibleModel(
      compatibleRuntimeId,
      rawRequestedModelId || null
    );
    return {
      requestedRuntimeId: compatibleRuntimeId,
      effectiveRuntimeId: compatibleRuntimeId,
      requestedModelId: rawRequestedModelId || null,
      effectiveModelId,
      fallbackApplied: false,
      fallbackReason: null,
      selectionMode: "chat",
      selectionReason: "Explicit OpenAI-compatible Chat model selection",
    };
  }

  // If the requested model isn't a recognized alias (e.g. a stale raw ID
  // like "claude-sonnet-4-5-20250514" left over from a deprecated SDK
  // version), substitute the default and let the fallback-reason chip
  // surface the swap to the user. Without this guard, the loop below
  // would happily return the raw ID and the SDK call would fail with
  // "model may not exist" — bypassing the fallback machinery entirely.
  const modelRecognized = isRecognizedChatModelId(rawRequestedModelId);
  const requestedModelId = modelRecognized ? rawRequestedModelId : DEFAULT_CHAT_MODEL;
  const unknownModelReason = modelRecognized
    ? null
    : `${rawRequestedModelId} is not a recognized model`;

  const requestedRuntimeId = resolveAgentRuntime(
    input.requestedRuntimeId ?? getRuntimeForModel(requestedModelId)
  );

  const modelOrder = buildChatFallbackOrder(requestedModelId);
  let requestedAvailability: RuntimeAvailability | null = unknownModelReason
    ? { available: false, reason: unknownModelReason }
    : null;

  for (const candidateModelId of modelOrder) {
    const candidateRuntimeId = resolveAgentRuntime(
      getRuntimeForModel(candidateModelId)
    );
    if (
      candidateRuntimeId !== "claude-code" &&
      candidateRuntimeId !== "openai-codex-app-server" &&
      candidateRuntimeId !== "ollama" &&
      candidateRuntimeId !== "litellm" &&
      candidateRuntimeId !== "lmstudio"
    ) {
      continue;
    }

    const availability = await checkRuntimeAvailability(candidateRuntimeId);
    if (
      candidateRuntimeId === requestedRuntimeId &&
      requestedAvailability === null
    ) {
      requestedAvailability = availability;
    }
    if (!availability.available) {
      continue;
    }

    // Surface the original raw model ID in the fallback chip when we
    // substituted an unrecognized one above. requestedModelId already
    // points at the substituted alias for fallback-order purposes.
    const reportedRequestedModelId = unknownModelReason
      ? rawRequestedModelId
      : requestedModelId;
    return {
      requestedRuntimeId,
      effectiveRuntimeId: candidateRuntimeId,
      requestedModelId: reportedRequestedModelId,
      effectiveModelId: candidateModelId,
      fallbackApplied:
        unknownModelReason !== null ||
        candidateRuntimeId !== requestedRuntimeId ||
        candidateModelId !== requestedModelId,
      fallbackReason: buildChatFallbackReason({
        requestedRuntimeId,
        effectiveRuntimeId: candidateRuntimeId,
        requestedModelId: reportedRequestedModelId,
        effectiveModelId: candidateModelId,
        unavailableReason: requestedAvailability?.reason ?? null,
      }),
      selectionMode: "chat",
      selectionReason: "Chat model selection",
    };
  }

  throw new RequestedModelUnavailableError(
    requestedAvailability?.reason ??
      `No healthy runtime is available for ${requestedModelId}.`
  );
}
