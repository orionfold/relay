import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/utils/crypto";
import { getClaudeOAuthCredentialsPath } from "@/lib/utils/ainative-paths";
import {
  probeClaudeCliAuth,
  type CliProbeStatus,
} from "@/lib/utils/provider-cli-discovery";
import { SETTINGS_KEYS, type AuthMethod, type ApiKeySource } from "@/lib/constants/settings";
import type { UpdateAuthSettingsInput } from "@/lib/validators/settings";
import { getSetting, setSetting } from "./helpers";
import { clearRuntimeReadiness } from "./runtime-readiness";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** True when the Claude credential file contains a token the SDK can use. */
export function hasClaudeOAuthCredentialFile(): boolean {
  try {
    const parsed = JSON.parse(readFileSync(getClaudeOAuthCredentialsPath(), "utf8")) as {
      claudeAiOauth?: {
        accessToken?: unknown;
        refreshToken?: unknown;
        expiresAt?: unknown;
      };
    };
    const oauth = parsed.claudeAiOauth;
    if (!oauth) return false;

    // A refresh token remains usable when the short-lived access token expires.
    if (isNonEmptyString(oauth.refreshToken)) return true;
    if (!isNonEmptyString(oauth.accessToken)) return false;

    // Older credential files may not carry an expiry. When they do, reject an
    // expired access-token-only file rather than painting a ghost green state.
    return typeof oauth.expiresAt !== "number" || oauth.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export interface AuthSettings {
  method: AuthMethod;
  hasKey: boolean;
  apiKeySource: ApiKeySource;
  oauthConnected: boolean;
  oauthDiscoveryStatus: CliProbeStatus | "different-auth";
  oauthDiscoverySource: "cli" | "environment" | "file" | "verified" | "none";
  oauthSubscriptionType: string | null;
}

export class ClaudeApiKeyNotConfiguredError extends Error {
  override name = "ClaudeApiKeyNotConfiguredError";

  constructor() {
    super(
      "Anthropic API key mode is selected, but no API key is configured. Add a key or switch to Claude Max/Pro.",
    );
  }
}

export class ClaudeApiKeyDecryptError extends Error {
  override name = "ClaudeApiKeyDecryptError";

  constructor() {
    super(
      "Relay could not read the saved Anthropic API key. Save the key again or switch authentication methods.",
    );
  }
}

/**
 * Get current auth settings. Never returns the raw API key.
 */
export async function getAuthSettings(): Promise<AuthSettings> {
  const [
    storedMethod,
    encryptedKey,
    storedSource,
    oauthVerifiedAt,
    cliAuth,
  ] = await Promise.all([
    getSetting(SETTINGS_KEYS.AUTH_METHOD) as Promise<AuthMethod | null>,
    getSetting(SETTINGS_KEYS.AUTH_API_KEY),
    getSetting(SETTINGS_KEYS.AUTH_API_KEY_SOURCE) as Promise<ApiKeySource | null>,
    getSetting(SETTINGS_KEYS.AUTH_OAUTH_VERIFIED_AT),
    probeClaudeCliAuth(),
  ]);

  const hasDbKey = encryptedKey !== null;
  const hasEnvKey = isNonEmptyString(process.env.ANTHROPIC_API_KEY);
  const hasInjectedOAuth = isNonEmptyString(process.env.CLAUDE_CODE_OAUTH_TOKEN);
  // Claude Code uses macOS Keychain, so a leftover dotfile there is not
  // authoritative. The file remains a compatibility path on Linux/Windows.
  const hasCompatibilityFile =
    process.platform !== "darwin" &&
    hasClaudeOAuthCredentialFile();
  const hasVerifiedSdkOAuth =
    storedSource === "oauth" && isNonEmptyString(oauthVerifiedAt);
  const hasCliSubscriptionOAuth =
    cliAuth.status === "connected" &&
    cliAuth.authMethod?.toLowerCase() === "claude.ai";
  const oauthConnected =
    hasCliSubscriptionOAuth ||
    hasInjectedOAuth ||
    hasCompatibilityFile ||
    hasVerifiedSdkOAuth;
  const method =
    storedMethod ??
    (oauthConnected ? "oauth" : hasDbKey || hasEnvKey ? "api_key" : "oauth");

  let apiKeySource: ApiKeySource;
  if (hasDbKey) {
    apiKeySource = "db";
  } else if (hasEnvKey) {
    apiKeySource = "env";
  } else if (
    method === "oauth" &&
    oauthConnected
  ) {
    apiKeySource = "oauth";
  } else {
    apiKeySource = "unknown";
  }

  let oauthDiscoverySource: AuthSettings["oauthDiscoverySource"] = "none";
  if (hasCliSubscriptionOAuth) {
    oauthDiscoverySource = "cli";
  } else if (hasInjectedOAuth) {
    oauthDiscoverySource = "environment";
  } else if (hasCompatibilityFile) {
    oauthDiscoverySource = "file";
  } else if (hasVerifiedSdkOAuth) {
    oauthDiscoverySource = "verified";
  }

  const oauthDiscoveryStatus: AuthSettings["oauthDiscoveryStatus"] =
    oauthConnected
      ? "connected"
      : cliAuth.status === "connected"
        ? "different-auth"
        : cliAuth.status;

  return {
    method,
    hasKey: hasDbKey || hasEnvKey,
    apiKeySource,
    oauthConnected,
    oauthDiscoveryStatus,
    oauthDiscoverySource,
    oauthSubscriptionType:
      hasCliSubscriptionOAuth ? cliAuth.subscriptionType : null,
  };
}

/**
 * Save auth settings. Encrypts API key before storing.
 *
 * All fields are optional — callers may supply any subset of
 * { method, apiKey, model } and only the provided fields are written.
 */
export async function setAuthSettings(input: UpdateAuthSettingsInput): Promise<void> {
  const changesConnection = input.method !== undefined || Boolean(input.apiKey);
  if (input.method !== undefined) {
    await setSetting(SETTINGS_KEYS.AUTH_METHOD, input.method);
  }

  if (input.apiKey) {
    await setSetting(SETTINGS_KEYS.AUTH_API_KEY, encrypt(input.apiKey));
    await setSetting(SETTINGS_KEYS.AUTH_API_KEY_SOURCE, "db");
  } else if (input.method === "oauth") {
    // Clear stored key when switching to OAuth
    const existingKey = await getSetting(SETTINGS_KEYS.AUTH_API_KEY);
    if (existingKey !== null) {
      await db.delete(settings)
        .where(eq(settings.key, SETTINGS_KEYS.AUTH_API_KEY));
    }
    // The method is a preference, not proof of a completed Claude login. Keep
    // the observed source unknown until the SDK confirms a real connection.
    await setSetting(SETTINGS_KEYS.AUTH_API_KEY_SOURCE, "unknown");
    await setSetting(SETTINGS_KEYS.AUTH_OAUTH_VERIFIED_AT, "");
  }

  if (input.model !== undefined) {
    await setSetting(SETTINGS_KEYS.ANTHROPIC_DIRECT_MODEL, input.model);
  }
  if (changesConnection) {
    await clearRuntimeReadiness("claude-code", "anthropic-direct");
  }
}

/**
 * Get the environment variables to pass to the Agent SDK.
 * Priority: DB-stored key > process.env > undefined (SDK falls back to OAuth).
 */
export async function getAuthEnv(): Promise<Record<string, string> | undefined> {
  const auth = await getAuthSettings();

  // If OAuth is selected, don't inject any key — let SDK handle it
  if (auth.method === "oauth") {
    return undefined;
  }

  // Try DB-stored key first
  const encryptedKey = await getSetting(SETTINGS_KEYS.AUTH_API_KEY);
  if (encryptedKey) {
    try {
      const key = decrypt(encryptedKey);
      return { ANTHROPIC_API_KEY: key };
    } catch {
      if (isNonEmptyString(process.env.ANTHROPIC_API_KEY)) {
        return { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
      }
      throw new ClaudeApiKeyDecryptError();
    }
  }

  // buildClaudeSdkEnv deliberately strips ambient ANTHROPIC_API_KEY. Inject
  // the selected environment key explicitly so API-key mode cannot
  // accidentally fall through to a cached Claude OAuth session.
  if (isNonEmptyString(process.env.ANTHROPIC_API_KEY)) {
    return { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  }

  throw new ClaudeApiKeyNotConfiguredError();
}

/**
 * Update the last-known API key source after a verified SDK result.
 */
export async function updateAuthStatus(source: ApiKeySource): Promise<void> {
  await setSetting(SETTINGS_KEYS.AUTH_API_KEY_SOURCE, source);
  await setSetting(
    SETTINGS_KEYS.AUTH_OAUTH_VERIFIED_AT,
    source === "oauth" ? new Date().toISOString() : "",
  );
}
