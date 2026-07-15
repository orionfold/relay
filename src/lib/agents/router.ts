import { listProfiles, getProfile } from "./profiles/registry";
import { profileSupportsRuntime } from "./profiles/compatibility";
import {
  DEFAULT_AGENT_RUNTIME,
  SUPPORTED_AGENT_RUNTIMES,
  type AgentRuntimeId,
} from "./runtime/catalog";
import type { RoutingPreference } from "@/lib/constants/settings";
import { resumeTaskExecution, startTaskExecution } from "./task-dispatch";

// ── Keyword signal maps for runtime scoring ──────────────────────────

const RUNTIME_KEYWORD_SIGNALS: Record<string, AgentRuntimeId> = {
  // File/code operations → claude-code (needs filesystem)
  edit: "claude-code",
  file: "claude-code",
  refactor: "claude-code",
  debug: "claude-code",
  commit: "claude-code",
  deploy: "claude-code",
  build: "claude-code",
  compile: "claude-code",
  test: "claude-code",
  lint: "claude-code",
  // Research/knowledge → anthropic-direct (fast, no overhead)
  research: "anthropic-direct",
  search: "anthropic-direct",
  investigate: "anthropic-direct",
  explain: "anthropic-direct",
  summarize: "anthropic-direct",
  translate: "anthropic-direct",
  // Document creation → anthropic-direct (extended thinking, caching)
  write: "anthropic-direct",
  draft: "anthropic-direct",
  report: "anthropic-direct",
  document: "anthropic-direct",
  outline: "anthropic-direct",
  review: "anthropic-direct",
  // Data/compute → openai-direct (code interpreter, server tools)
  analyze: "openai-direct",
  compute: "openai-direct",
  chart: "openai-direct",
  data: "openai-direct",
  calculate: "openai-direct",
  statistics: "openai-direct",
  visualize: "openai-direct",
  // Image/visual → openai-direct (image generation)
  image: "openai-direct",
  visual: "openai-direct",
  design: "openai-direct",
  diagram: "openai-direct",
  // Sandbox → openai-codex (isolated execution)
  sandbox: "openai-codex-app-server",
  isolated: "openai-codex-app-server",
  // Provider-specific intent may select Ollama. Locality, privacy, and cost
  // cannot be inferred without inspecting the operator-configured endpoint.
  ollama: "ollama",
};

// ── Preference-based tiebreaker scoring ──────────────────────────────

const LATENCY_SCORE: Record<AgentRuntimeId, number> = {
  "anthropic-direct": 3, // Fastest (in-process, no subprocess)
  "openai-direct": 3,
  "claude-code": 1, // Subprocess spawn overhead
  "openai-codex-app-server": 1,
  ollama: 1, // Endpoint-dependent; do not infer a local network path
  litellm: 2, // Operator-configured gateway; latency depends on its upstream
  lmstudio: 2, // Operator-configured server; no locality assumption
};

const COST_SCORE: Record<AgentRuntimeId, number> = {
  "anthropic-direct": 3, // Direct API, no middleman
  "openai-direct": 3,
  "claude-code": 1, // SDK overhead + potential OAuth subscription
  "openai-codex-app-server": 1,
  ollama: 1, // Endpoint-dependent; Ollama cloud and hosted servers may cost money
  litellm: 1, // Unknown until the gateway reports cost
  lmstudio: 1, // Unknown; do not infer zero cost from product identity
};

const QUALITY_SCORE: Record<AgentRuntimeId, number> = {
  "claude-code": 3, // Battle-tested, full tool suite
  "openai-codex-app-server": 2,
  "anthropic-direct": 2,
  "openai-direct": 2,
  ollama: 1, // Model-dependent; no quality inference from provider identity
  litellm: 1, // Model-dependent; no quality inference from gateway identity
  lmstudio: 1, // Model-dependent; no quality inference from server identity
};

// ── Core routing function ────────────────────────────────────────────

export interface RuntimeSuggestion {
  runtimeId: AgentRuntimeId;
  reason: string;
}

/**
 * Suggest the best runtime for a task based on content, profile
 * affinity, and user preferences.
 *
 * Selection layers:
 * 1. Manual preference → skip auto-routing
 * 2. Profile affinity → use profile's preferredRuntime if available
 * 3. Keyword scoring → match task text against keyword signals
 * 4. Preference tiebreaker → cost/latency/quality scoring
 * 5. Credential filter → only suggest runtimes with valid keys
 */
export function suggestRuntime(
  title: string,
  description: string | undefined | null,
  profileId: string | undefined | null,
  availableRuntimeIds: AgentRuntimeId[],
  preference: RoutingPreference = "latency",
): RuntimeSuggestion {
  // Layer 1: Manual → return default
  if (preference === "manual" || availableRuntimeIds.length === 0) {
    return {
      runtimeId: DEFAULT_AGENT_RUNTIME,
      reason: "Manual routing — using default runtime",
    };
  }

  // Layer 2: Profile affinity
  if (profileId) {
    const profile = getProfile(profileId);
    if (profile?.preferredRuntime && availableRuntimeIds.includes(profile.preferredRuntime)) {
      return {
        runtimeId: profile.preferredRuntime,
        reason: `${profile.name} profile prefers this runtime`,
      };
    }
  }

  // Layer 3: Keyword scoring
  const text = `${title} ${description ?? ""}`.toLowerCase();
  const scores = new Map<AgentRuntimeId, number>();

  for (const runtimeId of availableRuntimeIds) {
    scores.set(runtimeId, 0);
  }

  for (const [keyword, targetRuntime] of Object.entries(RUNTIME_KEYWORD_SIGNALS)) {
    if (text.includes(keyword) && availableRuntimeIds.includes(targetRuntime)) {
      scores.set(targetRuntime, (scores.get(targetRuntime) ?? 0) + 1);
    }
  }

  // Layer 4: Preference tiebreaker
  const preferenceScores =
    preference === "cost" ? COST_SCORE :
    preference === "quality" ? QUALITY_SCORE :
    LATENCY_SCORE; // default: latency

  let bestRuntime = availableRuntimeIds[0];
  let bestScore = -1;

  for (const runtimeId of availableRuntimeIds) {
    const keywordScore = scores.get(runtimeId) ?? 0;
    const prefScore = preferenceScores[runtimeId] ?? 0;
    // Weight: keyword signals (×3) + preference (×1)
    const totalScore = keywordScore * 3 + prefScore;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestRuntime = runtimeId;
    }
  }

  // Build reason
  const keywordHits = scores.get(bestRuntime) ?? 0;
  const reason = keywordHits > 0
    ? `Best match for task content (${keywordHits} keyword signals), optimizing for ${preference}`
    : `Optimizing for ${preference}`;

  return { runtimeId: bestRuntime, reason };
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
  agentType: string | null | undefined = DEFAULT_AGENT_RUNTIME
): Promise<void> {
  return startTaskExecution(taskId, { requestedRuntimeId: agentType });
}

export async function resumeTaskWithAgent(
  taskId: string,
  agentType: string | null | undefined = DEFAULT_AGENT_RUNTIME
): Promise<void> {
  return resumeTaskExecution(taskId, { requestedRuntimeId: agentType });
}
