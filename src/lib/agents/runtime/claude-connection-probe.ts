import type { ApiKeySource } from "@/lib/constants/settings";
import type { RuntimeConnectionResult } from "./types";

type ClaudeProbeMessage = Record<string, unknown> & {
  type?: string;
  subtype?: string;
  api_key_source?: string;
  is_error?: boolean;
  result?: unknown;
  errors?: unknown;
};

const API_KEY_SOURCES = new Set<ApiKeySource>(["db", "env", "oauth", "unknown"]);

function coerceApiKeySource(value: unknown, fallback: ApiKeySource): ApiKeySource {
  return typeof value === "string" && API_KEY_SOURCES.has(value as ApiKeySource)
    ? (value as ApiKeySource)
    : fallback;
}

function probeError(message: ClaudeProbeMessage): string {
  if (Array.isArray(message.errors)) {
    const errors = message.errors.filter((item): item is string => typeof item === "string");
    if (errors.length > 0) return errors.join("; ");
  }
  return typeof message.result === "string" && message.result.length > 0
    ? message.result
    : "Claude connection test failed.";
}

/**
 * A system/init event only proves that the SDK process started. Authentication
 * is verified only when the probe reaches a successful terminal result.
 */
export async function readClaudeConnectionProbe(
  response: AsyncIterable<Record<string, unknown>>,
  fallbackSource: ApiKeySource,
): Promise<RuntimeConnectionResult> {
  let observedSource = fallbackSource;

  for await (const raw of response) {
    const message = raw as ClaudeProbeMessage;
    if (message.type === "system" && message.subtype === "init") {
      observedSource = coerceApiKeySource(message.api_key_source, observedSource);
      continue;
    }

    if (message.type === "result") {
      if (message.is_error) {
        return { connected: false, error: probeError(message) };
      }
      return { connected: true, apiKeySource: observedSource };
    }
  }

  return {
    connected: false,
    error: "Claude connection ended before authentication was verified.",
  };
}
