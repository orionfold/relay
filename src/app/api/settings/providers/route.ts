import { NextResponse } from "next/server";
import { readCodexAuthState } from "@/lib/agents/runtime/openai-codex-auth";
import { getRuntimeSetupStates } from "@/lib/settings/runtime-setup";
import { getRoutingSettings } from "@/lib/settings/routing";
import { getAuthSettings } from "@/lib/settings/auth";
import { getOpenAIAuthSettings } from "@/lib/settings/openai-auth";
import { getOpenAILoginState } from "@/lib/settings/openai-login-manager";
import { getSetting } from "@/lib/settings/helpers";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { getOllamaRuntimeConfig } from "@/lib/agents/runtime/ollama-config";
import { getRuntimeRoutingStatuses } from "@/lib/settings/runtime-routing-status";

export async function GET(request?: Request) {
  const forceHealth = request
    ? new URL(request.url).searchParams.get("refreshRuntimeHealth") === "1"
    : false;
  const [
    routing,
    anthropicAuth,
    initialOpenaiAuth,
    ollamaConfig,
    anthropicDirectModelRaw,
    openaiDirectModelRaw,
    chatDefaultModelRaw,
  ] = await Promise.all([
    getRoutingSettings(),
    getAuthSettings(),
    getOpenAIAuthSettings(),
    getOllamaRuntimeConfig(),
    getSetting(SETTINGS_KEYS.ANTHROPIC_DIRECT_MODEL),
    getSetting(SETTINGS_KEYS.OPENAI_DIRECT_MODEL),
    getSetting("chat.defaultModel"),
  ]);

  let openaiAuth = initialOpenaiAuth;
  if (openaiAuth.method === "oauth") {
    try {
      const current = await readCodexAuthState({ refreshToken: true });
      openaiAuth = {
        ...openaiAuth,
        oauthConnected: current.connected,
        account: current.account,
        rateLimits: current.rateLimits,
      };
    } catch {
      openaiAuth = {
        ...openaiAuth,
        oauthConnected: false,
        account: null,
        rateLimits: null,
      };
    }
  }

  const runtimeStates = await getRuntimeSetupStates();
  const runtimeRoutingStatuses = await getRuntimeRoutingStatuses({
    force: forceHealth,
  });

  const anthropicConfigured =
    runtimeStates["claude-code"].configured ||
    runtimeStates["anthropic-direct"].configured;
  const openaiConfigured =
    runtimeStates["openai-codex-app-server"].configured ||
    runtimeStates["openai-direct"].configured;

  // Detect dual-billing: user has OAuth (subscription) for Claude Code
  // AND an API key (pay-as-you-go) for Anthropic Direct
  const anthropicHasOAuth =
    anthropicAuth.method === "oauth" || anthropicAuth.apiKeySource === "oauth";
  const anthropicHasApiKey = anthropicAuth.hasKey;
  const anthropicDualBilling = anthropicHasOAuth && anthropicHasApiKey;

  const ollamaConnected =
    runtimeRoutingStatuses.find((status) => status.runtimeId === "ollama")
      ?.health === "healthy";
  const ollamaConfigured = runtimeStates["ollama"].configured;

  return NextResponse.json({
    providers: {
      anthropic: {
        configured: anthropicConfigured,
        authMethod: anthropicAuth.method,
        hasKey: anthropicAuth.hasKey,
        apiKeySource: anthropicAuth.apiKeySource,
        dualBilling: anthropicDualBilling,
        directModel: anthropicDirectModelRaw ?? null,
        runtimes: [
          runtimeStates["claude-code"],
          runtimeStates["anthropic-direct"],
        ],
      },
      openai: {
        configured: openaiConfigured,
        authMethod: openaiAuth.method,
        hasKey: openaiAuth.hasKey,
        apiKeySource: openaiAuth.apiKeySource,
        oauthConnected: openaiAuth.oauthConnected,
        account: openaiAuth.account,
        rateLimits: openaiAuth.rateLimits,
        login: getOpenAILoginState(),
        dualBilling: openaiAuth.oauthConnected && openaiAuth.hasKey,
        directModel: openaiDirectModelRaw ?? null,
        runtimes: [
          runtimeStates["openai-codex-app-server"],
          runtimeStates["openai-direct"],
        ],
      },
    },
    ollama: {
      configured: ollamaConfigured,
      connected: ollamaConnected,
      baseUrl: ollamaConfig.baseUrl,
      defaultModel: ollamaConfig.defaultModel || "",
      hasApiKey: Boolean(ollamaConfig.apiKey),
      apiKeySource: ollamaConfig.apiKeySource,
      allowInsecureRemote: ollamaConfig.allowInsecureRemote,
    },
    compatibleRuntimes: [runtimeStates.litellm, runtimeStates.lmstudio],
    chatDefaultModel: chatDefaultModelRaw ?? null,
    routingPreference: routing.preference,
    routing,
    runtimeRoutingStatuses,
    configuredProviderCount:
      Number(anthropicConfigured) +
      Number(openaiConfigured) +
      Number(runtimeStates.litellm.configured) +
      Number(runtimeStates.lmstudio.configured),
  });
}
