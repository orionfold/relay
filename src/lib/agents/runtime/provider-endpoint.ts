/**
 * Shared endpoint policy for operator-configured runtime providers.
 *
 * This module is deliberately import-free so runtime adapters, API routes, and
 * settings validation can share the exact same URL and request semantics
 * without pulling the runtime registry into their module graph.
 */

export class ProviderEndpointConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderEndpointConfigurationError";
  }
}

export interface NormalizeProviderBaseUrlOptions {
  label: string;
  allowInsecureRemote: boolean;
  defaultPath: "" | "/v1";
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

export function normalizeProviderBaseUrl(
  rawValue: string,
  options: NormalizeProviderBaseUrlOptions
): string {
  const value = rawValue.trim();
  if (!value) {
    throw new ProviderEndpointConfigurationError(
      `${options.label} base URL is required`
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderEndpointConfigurationError(
      `${options.label} base URL is not a valid URL`
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderEndpointConfigurationError(
      `${options.label} base URL must use http or https`
    );
  }
  if (url.username || url.password) {
    throw new ProviderEndpointConfigurationError(
      `${options.label} base URL must not contain credentials`
    );
  }
  if (url.search || url.hash) {
    throw new ProviderEndpointConfigurationError(
      `${options.label} base URL must not contain a query string or fragment`
    );
  }
  if (
    url.protocol === "http:" &&
    !isLoopbackHostname(url.hostname) &&
    !options.allowInsecureRemote
  ) {
    throw new ProviderEndpointConfigurationError(
      `${options.label} remote HTTP is insecure. Use HTTPS or explicitly allow insecure remote HTTP.`
    );
  }

  const trimmedPath = url.pathname.replace(/\/+$/, "");
  if (!trimmedPath || trimmedPath === "/") {
    url.pathname = options.defaultPath || "/";
  } else {
    url.pathname = trimmedPath;
  }
  return url.toString().replace(/\/$/, "");
}

export function buildProviderHeaders(
  apiKey: string | null,
  headers?: HeadersInit
): Record<string, string> {
  const source = new Headers(headers);
  const result = Object.fromEntries(source.entries());
  if (!source.has("Content-Type")) result["Content-Type"] = "application/json";
  if (apiKey && !source.has("Authorization")) {
    result.Authorization = `Bearer ${apiKey}`;
  }
  return result;
}

export function buildProviderRequestInit(
  apiKey: string | null,
  init: RequestInit = {},
  timeoutMs = 10_000
): RequestInit {
  return {
    ...init,
    headers: buildProviderHeaders(apiKey, init.headers),
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    // Never forward prompts or credentials to a provider-selected redirect.
    redirect: "manual",
  };
}

export function joinProviderPath(baseUrl: string, path: `/${string}`): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function readBoundedResponseText(
  response: Response,
  maxLength: number
): Promise<string> {
  if (!response.body || maxLength <= 0) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  try {
    while (result.length < maxLength) {
      const { done, value } = await reader.read();
      if (done) {
        result += decoder.decode();
        break;
      }
      result += decoder.decode(value, { stream: true });
      if (result.length >= maxLength) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } catch {
    return result.slice(0, maxLength);
  }
  return result.slice(0, maxLength);
}

function redactProviderSecrets(
  value: string,
  secrets: readonly (string | null | undefined)[]
): string {
  let redacted = value;
  for (const secret of secrets) {
    const normalized = secret?.trim();
    if (normalized) redacted = redacted.replaceAll(normalized, "[redacted]");
  }
  return redacted;
}

export async function readBoundedProviderError(
  response: Response,
  maxLength = 500,
  secrets: readonly (string | null | undefined)[] = []
): Promise<string> {
  const raw = await readBoundedResponseText(response, maxLength);
  if (!raw) {
    return redactProviderSecrets(
      response.statusText || "Unknown error",
      secrets
    ).slice(0, maxLength);
  }
  let detail = raw;
  try {
    const parsed = JSON.parse(raw) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof parsed.error === "string") detail = parsed.error;
    if (
      parsed.error &&
      typeof parsed.error === "object" &&
      typeof parsed.error.message === "string"
    ) {
      detail = parsed.error.message;
    }
    if (typeof parsed.message === "string") {
      detail = parsed.message;
    }
  } catch {
    // Preserve a bounded plain-text provider error.
  }
  return redactProviderSecrets(detail, secrets).slice(0, maxLength);
}
