import "server-only";

import { SETTINGS_KEYS, type ApiKeySource } from "@/lib/constants/settings";
import { getSetting } from "@/lib/settings/helpers";
import {
  buildProviderRequestInit,
  joinProviderPath,
  normalizeProviderBaseUrl,
  ProviderEndpointConfigurationError,
} from "./provider-endpoint";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

export interface OllamaRuntimeConfig {
  runtimeId: "ollama";
  label: "Ollama";
  configured: true;
  baseUrl: string;
  apiKey: string | null;
  apiKeySource: ApiKeySource;
  defaultModel: string | null;
  allowInsecureRemote: boolean;
}

export class OllamaConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaConfigurationError";
  }
}

export function normalizeOllamaBaseUrl(
  rawValue: string,
  allowInsecureRemote: boolean
): string {
  try {
    return normalizeProviderBaseUrl(rawValue, {
      label: "Ollama",
      allowInsecureRemote,
      defaultPath: "",
    });
  } catch (error) {
    if (error instanceof ProviderEndpointConfigurationError) {
      throw new OllamaConfigurationError(error.message);
    }
    throw error;
  }
}

export async function getOllamaRuntimeConfig(): Promise<OllamaRuntimeConfig> {
  const [savedBaseUrl, savedApiKey, savedDefaultModel, allowInsecureRaw] =
    await Promise.all([
      getSetting(SETTINGS_KEYS.OLLAMA_BASE_URL),
      getSetting(SETTINGS_KEYS.OLLAMA_API_KEY),
      getSetting(SETTINGS_KEYS.OLLAMA_DEFAULT_MODEL),
      getSetting(SETTINGS_KEYS.OLLAMA_ALLOW_INSECURE_REMOTE),
    ]);
  const envApiKey = process.env.OLLAMA_API_KEY?.trim() || null;
  const allowInsecureRemote = allowInsecureRaw === "true";

  return {
    runtimeId: "ollama",
    label: "Ollama",
    configured: true,
    baseUrl: normalizeOllamaBaseUrl(
      savedBaseUrl || DEFAULT_OLLAMA_BASE_URL,
      allowInsecureRemote
    ),
    apiKey: envApiKey || savedApiKey || null,
    apiKeySource: envApiKey ? "env" : savedApiKey ? "db" : "unknown",
    defaultModel: savedDefaultModel?.trim() || null,
    allowInsecureRemote,
  };
}

export function buildOllamaRequest(
  config: OllamaRuntimeConfig,
  path: `/${string}`,
  init: RequestInit = {},
  timeoutMs = 10_000
): { url: string; init: RequestInit } {
  return {
    url: joinProviderPath(config.baseUrl, path),
    init: buildProviderRequestInit(config.apiKey, init, timeoutMs),
  };
}

export async function fetchOllama(
  config: OllamaRuntimeConfig,
  path: `/${string}`,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const request = buildOllamaRequest(config, path, init, timeoutMs);
  return fetch(request.url, request.init);
}
