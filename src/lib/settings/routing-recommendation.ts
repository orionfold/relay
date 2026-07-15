/**
 * Routing → provider recommendations.
 *
 * Pure function that maps a RoutingPreference to a per-provider recommendation
 * (auth method + default model) plus a chat-default model. Used by the Settings
 * UI cascade to configure both Anthropic and OpenAI in one click, with optional
 * optional Ollama preference for Cost only when the operator has explicitly
 * confirmed that the endpoint has no usage charge.
 *
 * All model IDs are resolved from the runtime catalog at call time — the catalog
 * owns the model inventory, so rotating a model ID there automatically flows
 * into the cascade. Tier aliases (`fast` / `balanced` / `quality`) map preferences
 * onto specific catalog entries.
 *
 * Manual returns null — caller should make no changes to provider config.
 */

import type { AuthMethod, RoutingPreference } from "@/lib/constants/settings";
import { getRuntimeCatalogEntry, type AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/chat/types";

export interface ProviderRec {
  auth: AuthMethod;
  model: string;
  runtimeId: AgentRuntimeId;
}

export interface RoutingRecommendation {
  anthropic: ProviderRec;
  openai: ProviderRec;
  chatModel: string;
  useOllama: boolean;
  ollamaModel?: string;
}

export interface RoutingContext {
  ollamaAvailable: boolean;
  ollamaDefaultModel?: string;
  ollamaNoUsageCostConfirmed?: boolean;
}

type Tier = "fast" | "balanced" | "quality";

/**
 * Resolve a runtime's model for a tier, falling back to the runtime's default
 * when the tier alias is missing. Guarantees a string model ID.
 */
function resolveTier(runtimeId: AgentRuntimeId, tier: Tier): string {
  const entry = getRuntimeCatalogEntry(runtimeId);
  return entry.models.tiers?.[tier] ?? entry.models.default;
}

/**
 * Pick the best chat-model ID for a tier and provider. Chat uses its own
 * short-name catalog (CHAT_MODELS) which differs from direct-API IDs. Falls
 * back to DEFAULT_CHAT_MODEL when no entry is found.
 */
function resolveChatModel(tier: Tier, provider: "anthropic" | "openai"): string {
  const tierLabel = tier === "fast" ? "Fast" : tier === "quality" ? "Best" : "Balanced";
  const match = CHAT_MODELS.find((m) => m.provider === provider && m.tier === tierLabel);
  return match?.id ?? DEFAULT_CHAT_MODEL;
}

export function recommendForRouting(
  pref: RoutingPreference,
  ctx: RoutingContext,
): RoutingRecommendation | null {
  if (pref === "manual") return null;

  if (pref === "quality") {
    return {
      anthropic: {
        auth: "oauth",
        runtimeId: "claude-code",
        model: resolveTier("claude-code", "quality"),
      },
      openai: {
        auth: "oauth",
        runtimeId: "openai-codex-app-server",
        model: resolveTier("openai-codex-app-server", "quality"),
      },
      chatModel: resolveChatModel("quality", "anthropic"),
      useOllama: false,
    };
  }

  // Latency and Cost both favour direct APIs with the fastest/cheapest model.
  // Cost may surface Ollama only with explicit operator confirmation; provider
  // identity and mere reachability do not prove that an endpoint is free.
  const base: RoutingRecommendation = {
    anthropic: {
      auth: "api_key",
      runtimeId: "anthropic-direct",
      model: resolveTier("anthropic-direct", "fast"),
    },
    openai: {
      auth: "api_key",
      runtimeId: "openai-direct",
      model: resolveTier("openai-direct", "fast"),
    },
    chatModel: resolveChatModel("fast", "anthropic"),
    useOllama: false,
  };

  if (
    pref === "cost" &&
    ctx.ollamaAvailable &&
    ctx.ollamaNoUsageCostConfirmed === true
  ) {
    return {
      ...base,
      useOllama: true,
      ollamaModel: ctx.ollamaDefaultModel ?? getRuntimeCatalogEntry("ollama").models.default,
    };
  }

  return base;
}
