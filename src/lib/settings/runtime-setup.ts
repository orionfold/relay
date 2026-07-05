import {
  getRuntimeCatalogEntry,
  DEFAULT_AGENT_RUNTIME,
  SUPPORTED_AGENT_RUNTIMES,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";
import { getAuthSettings } from "./auth";
import { getOpenAIAuthSettings } from "./openai-auth";
import type { ApiKeySource, AuthMethod } from "@/lib/constants/settings";

export type RuntimeBillingMode = "usage" | "subscription";
export type RuntimeSetupMethod = AuthMethod | "none";

export interface RuntimeSetupState {
  runtimeId: AgentRuntimeId;
  label: string;
  providerId: "anthropic" | "openai" | "ollama";
  configured: boolean;
  authMethod: RuntimeSetupMethod;
  apiKeySource: ApiKeySource;
  billingMode: RuntimeBillingMode;
}

export async function getRuntimeSetupStates(): Promise<
  Record<AgentRuntimeId, RuntimeSetupState>
> {
  const [claudeAuth, openAIAuth] = await Promise.all([
    getAuthSettings(),
    getOpenAIAuthSettings(),
  ]);

  const claudeRuntime = getRuntimeCatalogEntry("claude-code");
  const openAIRuntime = getRuntimeCatalogEntry("openai-codex-app-server");

  const claudeAuthMethod: RuntimeSetupMethod =
    claudeAuth.method === "oauth" || claudeAuth.apiKeySource === "oauth"
      ? "oauth"
      : claudeAuth.hasKey
        ? "api_key"
        : "none";
  const claudeConfigured =
    claudeAuth.hasKey || claudeAuth.apiKeySource === "oauth";

  const states = {
    "claude-code": {
      runtimeId: "claude-code",
      label: claudeRuntime.label,
      providerId: claudeRuntime.providerId,
      configured: claudeConfigured,
      authMethod: claudeAuthMethod,
      apiKeySource: claudeAuth.apiKeySource,
      billingMode: claudeAuthMethod === "oauth" ? "subscription" : "usage",
    },
    "openai-codex-app-server": {
      runtimeId: "openai-codex-app-server",
      label: openAIRuntime.label,
      providerId: openAIRuntime.providerId,
      configured:
        openAIAuth.method === "oauth" ? openAIAuth.oauthConnected : openAIAuth.hasKey,
      authMethod:
        openAIAuth.method === "oauth"
          ? "oauth"
          : openAIAuth.hasKey
            ? "api_key"
            : "none",
      apiKeySource:
        openAIAuth.method === "oauth" ? "oauth" : openAIAuth.apiKeySource,
      billingMode:
        openAIAuth.method === "oauth" && openAIAuth.oauthConnected
          ? "subscription"
          : "usage",
    },
    "anthropic-direct": {
      runtimeId: "anthropic-direct",
      label: getRuntimeCatalogEntry("anthropic-direct").label,
      providerId: "anthropic",
      configured: claudeAuth.hasKey, // Requires actual API key (OAuth alone is not enough)
      authMethod: claudeAuth.hasKey ? "api_key" : "none",
      apiKeySource: claudeAuth.hasKey ? claudeAuth.apiKeySource : "unknown",
      billingMode: "usage",
    },
    "openai-direct": {
      runtimeId: "openai-direct",
      label: getRuntimeCatalogEntry("openai-direct").label,
      providerId: "openai",
      configured: openAIAuth.hasKey, // Shares OpenAI API key
      authMethod: openAIAuth.hasKey ? "api_key" : "none",
      apiKeySource: openAIAuth.apiKeySource,
      billingMode: "usage",
    },
    ollama: {
      runtimeId: "ollama",
      label: getRuntimeCatalogEntry("ollama").label,
      providerId: "ollama",
      configured: true, // Ollama is always "configured" — availability checked at connection time
      authMethod: "none",
      apiKeySource: "unknown",
      billingMode: "usage", // $0 usage
    },
  } satisfies Record<AgentRuntimeId, RuntimeSetupState>;

  return states;
}

export function listConfiguredRuntimeIds(
  states: Record<AgentRuntimeId, RuntimeSetupState>
) {
  return SUPPORTED_AGENT_RUNTIMES.filter((runtimeId) => states[runtimeId].configured);
}

/**
 * Pick the runtime to surface as "active": the default (claude-code) if it is
 * configured, otherwise the first configured runtime in catalog order, and
 * failing that the default itself (so callers show the default's identity with
 * the understanding it is not yet set up, rather than nothing).
 *
 * Shared by the telemetry RUNTIME cell and the instance-identity endpoint's
 * active-model resolution — one definition of "which runtime is live".
 */
export function pickActiveRuntime(
  states: Record<AgentRuntimeId, RuntimeSetupState>
): {
  runtimeId: AgentRuntimeId;
  runtimeLabel: string | null;
  providerId: RuntimeSetupState["providerId"] | null;
} {
  const ordered: AgentRuntimeId[] = [
    DEFAULT_AGENT_RUNTIME,
    ...SUPPORTED_AGENT_RUNTIMES.filter((id) => id !== DEFAULT_AGENT_RUNTIME),
  ];
  const configured = ordered.find((id) => states[id]?.configured);
  const chosen = configured ?? DEFAULT_AGENT_RUNTIME;
  const state = states[chosen];
  if (!state) return { runtimeId: chosen, runtimeLabel: null, providerId: null };
  return {
    runtimeId: chosen,
    runtimeLabel: state.label,
    providerId: state.providerId,
  };
}
