import { readFileSync } from "node:fs";
import { SETTINGS_KEYS, type ApiKeySource, type AuthMethod } from "@/lib/constants/settings";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import {
  getAinativeCodexAuthPath,
  getGlobalCodexAuthPath,
} from "@/lib/utils/ainative-paths";
import { getSetting, setSetting } from "./helpers";
import { clearRuntimeReadiness } from "./runtime-readiness";

export type OpenAIAccountType = "apiKey" | "chatgpt" | "chatgptAuthTokens";
export type OpenAIAuthMode = "apikey" | "chatgpt" | "chatgptAuthTokens" | null;

export interface OpenAIAccountInfo {
  type: OpenAIAccountType;
  email?: string | null;
  planType?: string | null;
}

export interface OpenAIRateLimitWindow {
  usedPercent: number | null;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface OpenAIRateLimitInfo {
  limitId: string | null;
  limitName: string | null;
  primary: OpenAIRateLimitWindow | null;
  secondary: OpenAIRateLimitWindow | null;
}

export interface OpenAIAuthSettings {
  method: AuthMethod;
  hasKey: boolean;
  apiKeySource: Exclude<ApiKeySource, "oauth">;
  oauthConnected: boolean;
  existingSessionAvailable: boolean;
  account: OpenAIAccountInfo | null;
  rateLimits: OpenAIRateLimitInfo | null;
}

export interface OpenAIAuthConfigInput {
  method?: AuthMethod;
  apiKey?: string;
  model?: string;
}

interface PersistedOpenAIAccountPayload {
  account: OpenAIAccountInfo | null;
  authMode?: OpenAIAuthMode;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isUsableCodexChatGPTAuthPayload(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as {
      auth_mode?: unknown;
      tokens?: {
        access_token?: unknown;
        refresh_token?: unknown;
        id_token?: unknown;
      } | null;
    };
    const tokens = parsed.tokens;
    if (!tokens) return false;
    const identifiesChatGPT =
      parsed.auth_mode === "chatgpt" ||
      isNonEmptyString(tokens.id_token);
    const canAuthenticate =
      isNonEmptyString(tokens.refresh_token) ||
      isNonEmptyString(tokens.access_token);
    return identifiesChatGPT && canAuthenticate;
  } catch {
    return false;
  }
}

export function isUsableCodexChatGPTAuthFile(path: string): boolean {
  try {
    return isUsableCodexChatGPTAuthPayload(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
}

export async function getOpenAIAuthSettings(): Promise<OpenAIAuthSettings> {
  const storedMethod = (await getSetting(
    SETTINGS_KEYS.OPENAI_AUTH_METHOD,
  )) as AuthMethod | null;
  const encryptedKey = await getSetting(SETTINGS_KEYS.OPENAI_AUTH_API_KEY);
  const storedSource = (await getSetting(
    SETTINGS_KEYS.OPENAI_AUTH_API_KEY_SOURCE
  )) as Exclude<ApiKeySource, "oauth"> | null;
  const storedOauthConnected = await getSetting(SETTINGS_KEYS.OPENAI_AUTH_OAUTH_CONNECTED);
  const storedAccount = parseJson<PersistedOpenAIAccountPayload>(
    await getSetting(SETTINGS_KEYS.OPENAI_AUTH_ACCOUNT)
  );
  const storedRateLimits = parseJson<OpenAIRateLimitInfo>(
    await getSetting(SETTINGS_KEYS.OPENAI_AUTH_RATE_LIMITS)
  );

  const hasDbKey = encryptedKey !== null;
  const hasEnvKey = !!process.env.OPENAI_API_KEY;

  let apiKeySource: Exclude<ApiKeySource, "oauth">;
  if (storedSource) {
    apiKeySource = storedSource;
  } else if (hasDbKey) {
    apiKeySource = "db";
  } else if (hasEnvKey) {
    apiKeySource = "env";
  } else {
    apiKeySource = "unknown";
  }

  const oauthConnected =
    storedOauthConnected === "true" ||
    (storedOauthConnected == null &&
      isUsableCodexChatGPTAuthFile(getAinativeCodexAuthPath()));
  const existingSessionAvailable =
    !oauthConnected &&
    isUsableCodexChatGPTAuthFile(getGlobalCodexAuthPath());
  const method =
    storedMethod ??
    (oauthConnected || existingSessionAvailable
      ? "oauth"
      : hasDbKey || hasEnvKey
        ? "api_key"
        : "oauth");

  return {
    method,
    hasKey: hasDbKey || hasEnvKey,
    apiKeySource,
    oauthConnected,
    existingSessionAvailable,
    account: storedAccount?.account ?? null,
    rateLimits: storedRateLimits,
  };
}

export async function setOpenAIAuthSettings(
  input: OpenAIAuthConfigInput
): Promise<void> {
  const changesConnection = input.method !== undefined || Boolean(input.apiKey);
  if (input.method !== undefined) {
    await setSetting(SETTINGS_KEYS.OPENAI_AUTH_METHOD, input.method);
  }

  if (input.apiKey) {
    await setSetting(
      SETTINGS_KEYS.OPENAI_AUTH_API_KEY,
      encrypt(input.apiKey)
    );
    await setSetting(SETTINGS_KEYS.OPENAI_AUTH_API_KEY_SOURCE, "db");
  }

  if (input.model !== undefined) {
    await setSetting(SETTINGS_KEYS.OPENAI_DIRECT_MODEL, input.model);
  }
  if (changesConnection) {
    await clearRuntimeReadiness(
      "openai-codex-app-server",
      "openai-direct",
    );
  }
}

export async function getOpenAIApiKey(): Promise<{
  apiKey: string | null;
  source: Extract<ApiKeySource, "db" | "env" | "unknown">;
}> {
  const encryptedKey = await getSetting(SETTINGS_KEYS.OPENAI_AUTH_API_KEY);
  if (encryptedKey) {
    try {
      return { apiKey: decrypt(encryptedKey), source: "db" };
    } catch {
      // Fall through to env lookup.
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return { apiKey: process.env.OPENAI_API_KEY, source: "env" };
  }

  return { apiKey: null, source: "unknown" };
}

export async function getOpenAIAuthEnv(): Promise<Record<string, string> | undefined> {
  const { apiKey } = await getOpenAIApiKey();
  if (!apiKey) return undefined;
  return { OPENAI_API_KEY: apiKey };
}

export async function updateOpenAIAuthStatus(
  source: Extract<ApiKeySource, "db" | "env" | "unknown">
): Promise<void> {
  await setSetting(SETTINGS_KEYS.OPENAI_AUTH_API_KEY_SOURCE, source);
}

export async function updateOpenAIOAuthStatus(input: {
  connected: boolean;
  account?: OpenAIAccountInfo | null;
  authMode?: OpenAIAuthMode;
  rateLimits?: OpenAIRateLimitInfo | null;
}): Promise<void> {
  await setSetting(
    SETTINGS_KEYS.OPENAI_AUTH_OAUTH_CONNECTED,
    input.connected ? "true" : "false"
  );
  await setSetting(
    SETTINGS_KEYS.OPENAI_AUTH_ACCOUNT,
    JSON.stringify({
      account: input.account ?? null,
      authMode: input.authMode ?? null,
    } satisfies PersistedOpenAIAccountPayload)
  );
  await setSetting(
    SETTINGS_KEYS.OPENAI_AUTH_RATE_LIMITS,
    JSON.stringify(input.rateLimits ?? null)
  );
}

export async function clearOpenAIOAuthStatus(): Promise<void> {
  await updateOpenAIOAuthStatus({
    connected: false,
    account: null,
    authMode: null,
    rateLimits: null,
  });
}
