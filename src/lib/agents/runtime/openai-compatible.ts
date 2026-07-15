import "server-only";

import { SETTINGS_KEYS, type ApiKeySource } from "@/lib/constants/settings";
import { getSetting } from "@/lib/settings/helpers";
import type { AgentRuntimeId } from "./catalog";
import {
  buildProviderRequestInit,
  normalizeProviderBaseUrl,
  ProviderEndpointConfigurationError,
  readBoundedProviderError,
} from "./provider-endpoint";

export type OpenAICompatibleRuntimeId = Extract<
  AgentRuntimeId,
  "litellm" | "lmstudio"
>;

type CompatibleSettingKey =
  | typeof SETTINGS_KEYS.LITELLM_BASE_URL
  | typeof SETTINGS_KEYS.LITELLM_API_KEY
  | typeof SETTINGS_KEYS.LITELLM_DEFAULT_MODEL
  | typeof SETTINGS_KEYS.LITELLM_ALLOW_INSECURE_REMOTE
  | typeof SETTINGS_KEYS.LMSTUDIO_BASE_URL
  | typeof SETTINGS_KEYS.LMSTUDIO_API_KEY
  | typeof SETTINGS_KEYS.LMSTUDIO_DEFAULT_MODEL
  | typeof SETTINGS_KEYS.LMSTUDIO_ALLOW_INSECURE_REMOTE;

export interface OpenAICompatibleRuntimeDefinition {
  runtimeId: OpenAICompatibleRuntimeId;
  label: string;
  defaultBaseUrl: string;
  baseUrlSetting: CompatibleSettingKey;
  apiKeySetting: CompatibleSettingKey;
  defaultModelSetting: CompatibleSettingKey;
  allowInsecureRemoteSetting: CompatibleSettingKey;
  baseUrlEnv: "LITELLM_BASE_URL" | "LMSTUDIO_BASE_URL";
  apiKeyEnv: "LITELLM_API_KEY" | "LMSTUDIO_API_KEY";
}

export interface OpenAICompatibleRuntimeConfig {
  runtimeId: OpenAICompatibleRuntimeId;
  label: string;
  configured: boolean;
  baseUrl: string;
  apiKey: string | null;
  apiKeySource: ApiKeySource;
  defaultModel: string | null;
  allowInsecureRemote: boolean;
}

export interface CompatibleModel {
  id: string;
  ownedBy: string | null;
}

export interface CompatibleUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface CompatibleCompletionResult {
  text: string;
  modelId: string;
  usage: CompatibleUsage;
  reportedCostMicros: number | null;
  responseId: string | null;
}

export class CompatibleRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompatibleRuntimeConfigurationError";
  }
}

export class CompatibleRuntimeHttpError extends Error {
  readonly status: number;

  constructor(label: string, status: number, detail: string) {
    super(`${label} request failed (${status}): ${detail}`);
    this.name = "CompatibleRuntimeHttpError";
    this.status = status;
  }
}

export class CompatibleRuntimeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompatibleRuntimeProtocolError";
  }
}

export class CompatibleRuntimeCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompatibleRuntimeCapabilityError";
  }
}

export class CompatibleRuntimeTimeoutError extends Error {
  readonly timeoutSeconds: number;

  constructor(label: string, timeoutSeconds: number) {
    super(`${label} request timed out after ${timeoutSeconds} seconds`);
    this.name = "CompatibleRuntimeTimeoutError";
    this.timeoutSeconds = timeoutSeconds;
  }
}

export const OPENAI_COMPATIBLE_RUNTIME_DEFINITIONS: Record<
  OpenAICompatibleRuntimeId,
  OpenAICompatibleRuntimeDefinition
> = {
  litellm: {
    runtimeId: "litellm",
    label: "LiteLLM",
    defaultBaseUrl: "http://localhost:4000/v1",
    baseUrlSetting: SETTINGS_KEYS.LITELLM_BASE_URL,
    apiKeySetting: SETTINGS_KEYS.LITELLM_API_KEY,
    defaultModelSetting: SETTINGS_KEYS.LITELLM_DEFAULT_MODEL,
    allowInsecureRemoteSetting: SETTINGS_KEYS.LITELLM_ALLOW_INSECURE_REMOTE,
    baseUrlEnv: "LITELLM_BASE_URL",
    apiKeyEnv: "LITELLM_API_KEY",
  },
  lmstudio: {
    runtimeId: "lmstudio",
    label: "LM Studio",
    defaultBaseUrl: "http://localhost:1234/v1",
    baseUrlSetting: SETTINGS_KEYS.LMSTUDIO_BASE_URL,
    apiKeySetting: SETTINGS_KEYS.LMSTUDIO_API_KEY,
    defaultModelSetting: SETTINGS_KEYS.LMSTUDIO_DEFAULT_MODEL,
    allowInsecureRemoteSetting: SETTINGS_KEYS.LMSTUDIO_ALLOW_INSECURE_REMOTE,
    baseUrlEnv: "LMSTUDIO_BASE_URL",
    apiKeyEnv: "LMSTUDIO_API_KEY",
  },
};

export function isOpenAICompatibleRuntimeId(
  value: string
): value is OpenAICompatibleRuntimeId {
  return value === "litellm" || value === "lmstudio";
}

export function normalizeCompatibleBaseUrl(
  rawValue: string,
  options: { allowInsecureRemote: boolean; label: string }
): string {
  try {
    return normalizeProviderBaseUrl(rawValue, {
      ...options,
      defaultPath: "/v1",
    });
  } catch (error) {
    if (error instanceof ProviderEndpointConfigurationError) {
      throw new CompatibleRuntimeConfigurationError(error.message);
    }
    throw error;
  }
}

export async function getOpenAICompatibleRuntimeConfig(
  runtimeId: OpenAICompatibleRuntimeId
): Promise<OpenAICompatibleRuntimeConfig> {
  const definition = OPENAI_COMPATIBLE_RUNTIME_DEFINITIONS[runtimeId];
  const [savedBaseUrl, savedApiKey, defaultModel, allowInsecureRaw] =
    await Promise.all([
      getSetting(definition.baseUrlSetting),
      getSetting(definition.apiKeySetting),
      getSetting(definition.defaultModelSetting),
      getSetting(definition.allowInsecureRemoteSetting),
    ]);
  const envBaseUrl = process.env[definition.baseUrlEnv]?.trim() || null;
  const envApiKey = process.env[definition.apiKeyEnv]?.trim() || null;
  const allowInsecureRemote = allowInsecureRaw === "true";
  const configured = Boolean(envBaseUrl || savedBaseUrl);
  const baseUrl = normalizeCompatibleBaseUrl(
    envBaseUrl || savedBaseUrl || definition.defaultBaseUrl,
    { allowInsecureRemote, label: definition.label }
  );

  return {
    runtimeId,
    label: definition.label,
    configured,
    baseUrl,
    apiKey: envApiKey || savedApiKey || null,
    apiKeySource: envApiKey ? "env" : savedApiKey ? "db" : "unknown",
    defaultModel: defaultModel?.trim() || null,
    allowInsecureRemote,
  };
}

async function readErrorDetail(
  response: Response,
  apiKey: string | null
): Promise<string> {
  return readBoundedProviderError(response, 500, [apiKey]);
}

async function request(
  config: OpenAICompatibleRuntimeConfig,
  path: "/models" | "/chat/completions",
  init?: RequestInit
): Promise<Response> {
  if (!config.configured) {
    throw new CompatibleRuntimeConfigurationError(
      `${config.label} is not configured. Save its endpoint in Settings first.`
    );
  }
  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}${path}`,
      buildProviderRequestInit(config.apiKey, init)
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new CompatibleRuntimeHttpError(config.label, 0, detail);
  }
  if (!response.ok) {
    throw new CompatibleRuntimeHttpError(
      config.label,
      response.status,
      await readErrorDetail(response, config.apiKey)
    );
  }
  return response;
}

async function createOperationSignal(callerSignal?: AbortSignal): Promise<{
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
  timeoutSeconds: number;
}> {
  const raw = await getSetting(SETTINGS_KEYS.SDK_TIMEOUT_SECONDS);
  const parsed = raw ? Number.parseInt(raw, 10) : 60;
  const timeoutSeconds =
    Number.isFinite(parsed) && parsed >= 10 && parsed <= 300 ? parsed : 60;
  const timeoutController = new AbortController();
  const timer = setTimeout(
    () => timeoutController.abort(),
    timeoutSeconds * 1_000
  );
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal;

  return {
    signal,
    timedOut: () => timeoutController.signal.aborted && !callerSignal?.aborted,
    cleanup: () => clearTimeout(timer),
    timeoutSeconds,
  };
}

export async function listOpenAICompatibleModels(
  runtimeId: OpenAICompatibleRuntimeId,
  signal?: AbortSignal
): Promise<CompatibleModel[]> {
  const config = await getOpenAICompatibleRuntimeConfig(runtimeId);
  const response = await request(config, "/models", { signal });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CompatibleRuntimeProtocolError(
      `${config.label} returned malformed JSON from /models`
    );
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { data?: unknown }).data)
  ) {
    throw new CompatibleRuntimeProtocolError(
      `${config.label} returned an invalid /models response`
    );
  }
  const models = (payload as { data: unknown[] }).data
    .map((entry): CompatibleModel | null => {
      if (!entry || typeof entry !== "object") return null;
      const id = (entry as { id?: unknown }).id;
      if (typeof id !== "string" || !id.trim()) return null;
      const ownedBy = (entry as { owned_by?: unknown }).owned_by;
      return {
        id: id.trim(),
        ownedBy: typeof ownedBy === "string" ? ownedBy : null,
      };
    })
    .filter((entry): entry is CompatibleModel => entry !== null);
  return Array.from(new Map(models.map((model) => [model.id, model])).values());
}

export async function resolveOpenAICompatibleModel(
  runtimeId: OpenAICompatibleRuntimeId,
  requestedModel?: string | null
): Promise<string> {
  const config = await getOpenAICompatibleRuntimeConfig(runtimeId);
  const prefix = `${runtimeId}:`;
  const requested = requestedModel?.startsWith(prefix)
    ? requestedModel.slice(prefix.length)
    : requestedModel;
  if (requested?.trim()) return requested.trim();
  if (config.defaultModel) return config.defaultModel;
  const models = await listOpenAICompatibleModels(runtimeId);
  if (models.length === 0) {
    throw new CompatibleRuntimeConfigurationError(
      `${config.label} reported no models. Load or configure a model before running.`
    );
  }
  return models.map((model) => model.id).sort()[0];
}

function finiteToken(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function parseUsage(value: unknown): CompatibleUsage {
  if (!value || typeof value !== "object") {
    return { inputTokens: null, outputTokens: null, totalTokens: null };
  }
  const usage = value as Record<string, unknown>;
  const inputTokens = finiteToken(usage.prompt_tokens);
  const outputTokens = finiteToken(usage.completion_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      finiteToken(usage.total_tokens) ??
      (inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : null),
  };
}

function parseReportedCostMicros(
  runtimeId: OpenAICompatibleRuntimeId,
  response: Response
): number | null {
  if (runtimeId !== "litellm") return null;
  const raw = response.headers.get("x-litellm-response-cost");
  if (!raw) return null;
  const dollars = Number(raw);
  return Number.isFinite(dollars) && dollars >= 0
    ? Math.round(dollars * 1_000_000)
    : null;
}

type CompatibleMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function extractNonStreamingCompletion(
  config: OpenAICompatibleRuntimeConfig,
  requestedModel: string,
  payload: unknown,
  response: Response
): CompatibleCompletionResult {
  if (!payload || typeof payload !== "object") {
    throw new CompatibleRuntimeProtocolError(
      `${config.label} returned an invalid chat completion`
    );
  }
  const record = payload as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new CompatibleRuntimeProtocolError(
      `${config.label} returned no chat completion choices`
    );
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    throw new CompatibleRuntimeProtocolError(
      `${config.label} returned a malformed chat completion choice`
    );
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    throw new CompatibleRuntimeProtocolError(
      `${config.label} returned no assistant message`
    );
  }
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    throw new CompatibleRuntimeCapabilityError(
      `${config.label} requested tool calls, but this Relay runtime does not support provider tool loops yet.`
    );
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || !content.trim()) {
    throw new CompatibleRuntimeProtocolError(
      `${config.label} returned an empty assistant response`
    );
  }
  return {
    text: content,
    modelId:
      typeof record.model === "string" && record.model.trim()
        ? record.model
        : requestedModel,
    usage: parseUsage(record.usage),
    reportedCostMicros: parseReportedCostMicros(config.runtimeId, response),
    responseId: typeof record.id === "string" ? record.id : null,
  };
}

export async function createOpenAICompatibleCompletion(input: {
  runtimeId: OpenAICompatibleRuntimeId;
  model: string;
  messages: CompatibleMessage[];
  signal?: AbortSignal;
}): Promise<CompatibleCompletionResult> {
  const config = await getOpenAICompatibleRuntimeConfig(input.runtimeId);
  const operation = await createOperationSignal(input.signal);
  try {
    const response = await request(config, "/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: false,
      }),
      signal: operation.signal,
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (operation.timedOut()) {
        throw new CompatibleRuntimeTimeoutError(
          config.label,
          operation.timeoutSeconds
        );
      }
      throw new CompatibleRuntimeProtocolError(
        `${config.label} returned malformed JSON from /chat/completions`
      );
    }
    return extractNonStreamingCompletion(config, input.model, payload, response);
  } catch (error) {
    if (operation.timedOut()) {
      throw new CompatibleRuntimeTimeoutError(
        config.label,
        operation.timeoutSeconds
      );
    }
    throw error;
  } finally {
    operation.cleanup();
  }
}

export async function streamOpenAICompatibleCompletion(input: {
  runtimeId: OpenAICompatibleRuntimeId;
  model: string;
  messages: CompatibleMessage[];
  signal?: AbortSignal;
  onDelta: (content: string) => void | Promise<void>;
}): Promise<CompatibleCompletionResult> {
  const config = await getOpenAICompatibleRuntimeConfig(input.runtimeId);
  const operation = await createOperationSignal(input.signal);
  try {
    const response = await request(config, "/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: operation.signal,
    });
    if (!response.body) {
      throw new CompatibleRuntimeProtocolError(
        `${config.label} returned no readable stream`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let modelId = input.model;
    let responseId: string | null = null;
    let usage: CompatibleUsage = {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    };
    let terminated = false;

    const processEvent = async (eventBlock: string) => {
      const data = eventBlock
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) return;
      if (data.trim() === "[DONE]") {
        terminated = true;
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new CompatibleRuntimeProtocolError(
          `${config.label} returned malformed streaming JSON`
        );
      }
      if (!parsed || typeof parsed !== "object") {
        throw new CompatibleRuntimeProtocolError(
          `${config.label} returned an invalid streaming event`
        );
      }
      const record = parsed as Record<string, unknown>;
      if (typeof record.model === "string" && record.model.trim()) {
        modelId = record.model;
      }
      if (typeof record.id === "string") responseId = record.id;
      if (record.usage != null) usage = parseUsage(record.usage);
      const choices = record.choices;
      if (!Array.isArray(choices)) return;
      for (const choice of choices) {
        if (!choice || typeof choice !== "object") continue;
        const delta = (choice as { delta?: unknown }).delta;
        if (!delta || typeof delta !== "object") continue;
        const toolCalls = (delta as { tool_calls?: unknown }).tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          throw new CompatibleRuntimeCapabilityError(
            `${config.label} requested tool calls, but this Relay Chat runtime does not support provider tool loops yet.`
          );
        }
        const content = (delta as { content?: unknown }).content;
        if (typeof content === "string" && content) {
          text += content;
          await input.onDelta(content);
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) await processEvent(event);
    }
    buffer += decoder.decode();
    if (buffer.trim()) await processEvent(buffer);

    if (!terminated) {
      throw new CompatibleRuntimeProtocolError(
        `${config.label} stream ended before the [DONE] marker`
      );
    }
    if (!text.trim()) {
      throw new CompatibleRuntimeProtocolError(
        `${config.label} returned an empty assistant stream`
      );
    }

    return {
      text,
      modelId,
      usage,
      reportedCostMicros: parseReportedCostMicros(input.runtimeId, response),
      responseId,
    };
  } catch (error) {
    if (operation.timedOut()) {
      throw new CompatibleRuntimeTimeoutError(
        config.label,
        operation.timeoutSeconds
      );
    }
    throw error;
  } finally {
    operation.cleanup();
  }
}
