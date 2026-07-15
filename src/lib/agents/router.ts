import { listProfiles, getProfile } from "./profiles/registry";
import { profileSupportsRuntime } from "./profiles/compatibility";
import {
  DEFAULT_AGENT_RUNTIME,
  getRuntimeCatalogEntry,
  type AgentRuntimeId,
} from "./runtime/catalog";
import type { RoutingPreference } from "@/lib/constants/settings";
import { resumeTaskExecution, startTaskExecution } from "./task-dispatch";

const RUNTIME_NAME_SIGNALS: Record<AgentRuntimeId, string[]> = {
  "claude-code": ["claude code"],
  "openai-codex-app-server": ["codex app server", "openai codex"],
  "anthropic-direct": ["anthropic direct"],
  "openai-direct": ["openai direct"],
  ollama: ["ollama"],
  litellm: ["litellm", "lite llm"],
  lmstudio: ["lm studio", "lmstudio"],
};

// ── Core routing function ────────────────────────────────────────────

export interface RuntimeSuggestion {
  runtimeId: AgentRuntimeId;
  reason: string;
  orderedRuntimeIds: AgentRuntimeId[];
  evidence: "profile" | "runtime-name" | "known-cost" | "pool-order";
}

export interface RuntimeRoutingCandidate {
  runtimeId: AgentRuntimeId;
  /** Comparable combined input + output price in micros per million tokens. */
  comparableCostPerMillionMicros: number | null;
}

function normalizeCandidates(
  candidates: AgentRuntimeId[] | RuntimeRoutingCandidate[],
): RuntimeRoutingCandidate[] {
  return candidates.map((candidate) =>
    typeof candidate === "string"
      ? { runtimeId: candidate, comparableCostPerMillionMicros: null }
      : candidate,
  );
}

/**
 * Suggest the best runtime for a task based on content, profile
 * affinity, and user preferences.
 *
 * Candidates have already passed pool, configuration, profile, capability,
 * and temporary-availability filters. Provider identity is never used as a
 * proxy for cost, latency, quality, locality, or privacy.
 */
export function suggestRuntime(
  title: string,
  description: string | undefined | null,
  profileId: string | undefined | null,
  candidatesInput: AgentRuntimeId[] | RuntimeRoutingCandidate[],
  preference: RoutingPreference = "latency",
): RuntimeSuggestion {
  const candidates = normalizeCandidates(candidatesInput);
  const availableRuntimeIds = candidates.map((candidate) => candidate.runtimeId);
  if (preference === "manual" || candidates.length === 0) {
    return {
      runtimeId: DEFAULT_AGENT_RUNTIME,
      reason: "Manual routing — using default runtime",
      orderedRuntimeIds: availableRuntimeIds,
      evidence: "pool-order",
    };
  }

  if (profileId) {
    const profile = getProfile(profileId);
    if (profile?.preferredRuntime && availableRuntimeIds.includes(profile.preferredRuntime)) {
      const orderedRuntimeIds = [
        profile.preferredRuntime,
        ...availableRuntimeIds.filter((runtimeId) => runtimeId !== profile.preferredRuntime),
      ];
      return {
        runtimeId: profile.preferredRuntime,
        reason: `${profile.name} profile prefers this runtime`,
        orderedRuntimeIds,
        evidence: "profile",
      };
    }
  }

  const text = `${title} ${description ?? ""}`.toLowerCase();
  const namedRuntime = availableRuntimeIds.find((runtimeId) =>
    RUNTIME_NAME_SIGNALS[runtimeId].some((signal) => text.includes(signal)),
  );
  if (namedRuntime) {
    return {
      runtimeId: namedRuntime,
      orderedRuntimeIds: [
        namedRuntime,
        ...availableRuntimeIds.filter((runtimeId) => runtimeId !== namedRuntime),
      ],
      reason: `Task text names ${getRuntimeCatalogEntry(namedRuntime).label}`,
      evidence: "runtime-name",
    };
  }

  if (preference === "cost") {
    const ordered = candidates
      .map((candidate, index) => ({ ...candidate, index }))
      .sort((left, right) => {
        const leftKnown = left.comparableCostPerMillionMicros !== null;
        const rightKnown = right.comparableCostPerMillionMicros !== null;
        if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
        if (leftKnown && rightKnown) {
          const difference =
            (left.comparableCostPerMillionMicros ?? 0) -
            (right.comparableCostPerMillionMicros ?? 0);
          if (difference !== 0) return difference;
        }
        return left.index - right.index;
      });
    const best = ordered[0];
    const orderedRuntimeIds = ordered.map((candidate) => candidate.runtimeId);
    if (best.comparableCostPerMillionMicros !== null) {
      return {
        runtimeId: best.runtimeId,
        orderedRuntimeIds,
        reason: "Lowest comparable configured-model token price among eligible runtimes",
        evidence: "known-cost",
      };
    }
  }

  const evidenceLabel =
    preference === "cost"
      ? "No comparable cost evidence"
      : preference === "quality"
        ? "No comparable quality evidence"
        : "No comparable generation-latency evidence";
  return {
    runtimeId: availableRuntimeIds[0],
    orderedRuntimeIds: availableRuntimeIds,
    reason: `${evidenceLabel}; using eligible pool order`,
    evidence: "pool-order",
  };
}

// ── Existing functions ───────────────────────────────────────────────

/**
 * Classify a task into an agent profile based on keyword matching.
 * Scores each profile by keyword hits in title + description.
 * Returns the highest-scoring profile ID, or "general" if no strong match.
 */
export function classifyTaskProfile(
  title: string,
  description?: string | null,
  runtimeId: string | null | undefined = DEFAULT_AGENT_RUNTIME
): string {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  const profiles = listProfiles().filter((profile) =>
    profileSupportsRuntime(profile, runtimeId)
  );

  let bestProfile = "general";
  let bestScore = 0;

  for (const profile of profiles) {
    const profileId = profile.id;
    if (profileId === "general") continue;
    let score = 0;
    for (const tag of profile.tags) {
      if (text.includes(tag)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestProfile = profileId;
    }
  }

  // Require at least 2 keyword hits to avoid false positives
  return bestScore >= 2 ? bestProfile : "general";
}

export async function executeTaskWithAgent(
  taskId: string,
  agentType: string | null | undefined = null
): Promise<void> {
  return startTaskExecution(taskId, { requestedRuntimeId: agentType });
}

export async function resumeTaskWithAgent(
  taskId: string,
  agentType: string | null | undefined = null
): Promise<void> {
  return resumeTaskExecution(taskId, { requestedRuntimeId: agentType });
}
