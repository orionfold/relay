import "server-only";

import {
  CompatibleRuntimeHttpError,
  getOpenAICompatibleRuntimeConfig,
  listOpenAICompatibleModels,
  type OpenAICompatibleRuntimeConfig,
  type OpenAICompatibleRuntimeId,
} from "./openai-compatible";
import {
  buildProviderRequestInit,
  readBoundedProviderError,
} from "./provider-endpoint";

export type SetupRuntimeId = "ollama" | OpenAICompatibleRuntimeId;

export interface ProviderModelDetails {
  id: string;
  name: string;
  provider: SetupRuntimeId;
  ownedBy?: string | null;
  upstreamModel?: string | null;
  type?: string | null;
  family?: string | null;
  publisher?: string | null;
  architecture?: string | null;
  format?: string | null;
  parameterSize?: string | null;
  quantization?: string | null;
  sizeBytes?: number | null;
  modifiedAt?: string | null;
  maxContextLength?: number | null;
  contextLength?: number | null;
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  inputCostPerToken?: number | null;
  outputCostPerToken?: number | null;
  mode?: string | null;
  loaded?: boolean;
  loadedInstanceCount?: number;
  vision?: boolean;
  trainedForToolUse?: boolean;
}

export interface ProviderModelsResult {
  runtimeId: SetupRuntimeId;
  models: ProviderModelDetails[];
  excludedModelCount?: number;
  metadataWarning?: string;
}

export interface LMStudioDownloadStatus {
  jobId: string | null;
  status:
    | "downloading"
    | "paused"
    | "completed"
    | "failed"
    | "already_downloaded";
  totalSizeBytes: number | null;
  downloadedBytes: number | null;
  bytesPerSecond: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function isGenerationCapableProviderModel(
  model: {
    id: string;
    name?: string | null;
    type?: string | null;
    mode?: string | null;
  },
): boolean {
  const kind = `${model.type ?? ""} ${model.mode ?? ""}`.trim().toLowerCase();
  const unsupportedKinds = [
    "embedding",
    "embed",
    "rerank",
    "reranker",
    "classifier",
    "classification",
    "tts",
    "speech",
    "audio",
    "image",
  ];
  if (kind) {
    return !unsupportedKinds.some((unsupported) => kind.includes(unsupported));
  }
  const identifier = `${model.id} ${model.name ?? ""}`.toLowerCase();
  return !/(^|[\/_. -])(embed(ding)?|rerank(er)?)([\/_. -]|$)/.test(
    identifier,
  );
}

function compatibleManagementRoot(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
}

async function requestCompatibleUrl(
  config: OpenAICompatibleRuntimeConfig,
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(
      url,
      buildProviderRequestInit(config.apiKey, init, timeoutMs)
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CompatibleRuntimeHttpError(config.label, 0, detail);
  }
  if (!response.ok) {
    throw new CompatibleRuntimeHttpError(
      config.label,
      response.status,
      await readBoundedProviderError(response, 500, [config.apiKey])
    );
  }
  return response;
}

async function discoverLiteLLMDetails(
  config: OpenAICompatibleRuntimeConfig,
  basicModels: ProviderModelDetails[]
): Promise<ProviderModelDetails[]> {
  const response = await requestCompatibleUrl(
    config,
    `${config.baseUrl}/model/info`
  );
  const payload = (await response.json()) as unknown;
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("LiteLLM returned invalid model metadata");
  }
  const details = new Map<string, ProviderModelDetails>();
  for (const entry of payload.data) {
    if (!isRecord(entry)) continue;
    const modelName = stringOrNull(entry.model_name);
    if (!modelName) continue;
    const modelInfo = isRecord(entry.model_info) ? entry.model_info : {};
    const params = isRecord(entry.litellm_params) ? entry.litellm_params : {};
    const existing = basicModels.find((model) => model.id === modelName);
    details.set(modelName, {
      id: modelName,
      name: modelName,
      provider: "litellm",
      ownedBy: existing?.ownedBy ?? null,
      upstreamModel: stringOrNull(params.model),
      maxInputTokens: finiteNumberOrNull(modelInfo.max_input_tokens),
      maxOutputTokens: finiteNumberOrNull(modelInfo.max_output_tokens),
      inputCostPerToken: finiteNumberOrNull(modelInfo.input_cost_per_token),
      outputCostPerToken: finiteNumberOrNull(modelInfo.output_cost_per_token),
      mode: stringOrNull(modelInfo.mode),
      publisher: stringOrNull(modelInfo.litellm_provider),
    });
  }
  return basicModels.map((model) => details.get(model.id) ?? model);
}

async function discoverLMStudioDetails(
  config: OpenAICompatibleRuntimeConfig
): Promise<ProviderModelDetails[]> {
  const response = await requestCompatibleUrl(
    config,
    `${compatibleManagementRoot(config.baseUrl)}/api/v1/models`
  );
  const payload = (await response.json()) as unknown;
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    throw new Error("LM Studio returned invalid native model metadata");
  }
  return payload.models.flatMap((entry): ProviderModelDetails[] => {
    if (!isRecord(entry)) return [];
    const id = stringOrNull(entry.key);
    if (!id) return [];
    const quantization = isRecord(entry.quantization)
      ? stringOrNull(entry.quantization.name)
      : null;
    const loadedInstances = Array.isArray(entry.loaded_instances)
      ? entry.loaded_instances.filter(isRecord)
      : [];
    const firstConfig = isRecord(loadedInstances[0]?.config)
      ? loadedInstances[0].config
      : {};
    const capabilities = isRecord(entry.capabilities) ? entry.capabilities : {};
    return [
      {
        id,
        name: stringOrNull(entry.display_name) ?? id,
        provider: "lmstudio",
        type: stringOrNull(entry.type),
        publisher: stringOrNull(entry.publisher),
        architecture: stringOrNull(entry.architecture),
        format: stringOrNull(entry.format),
        parameterSize: stringOrNull(entry.params_string),
        quantization,
        sizeBytes: finiteNumberOrNull(entry.size_bytes),
        maxContextLength: finiteNumberOrNull(entry.max_context_length),
        contextLength: finiteNumberOrNull(firstConfig.context_length),
        loaded: loadedInstances.length > 0,
        loadedInstanceCount: loadedInstances.length,
        vision: booleanOrUndefined(capabilities.vision),
        trainedForToolUse: booleanOrUndefined(
          capabilities.trained_for_tool_use
        ),
      },
    ];
  });
}

export async function discoverOpenAICompatibleProviderModels(
  runtimeId: OpenAICompatibleRuntimeId
): Promise<ProviderModelsResult> {
  const basic = (await listOpenAICompatibleModels(runtimeId)).map((model) => ({
    id: model.id,
    name: model.id,
    provider: runtimeId,
    ownedBy: model.ownedBy,
  } satisfies ProviderModelDetails));
  const config = await getOpenAICompatibleRuntimeConfig(runtimeId);
  try {
    const models =
      runtimeId === "litellm"
        ? await discoverLiteLLMDetails(config, basic)
        : await discoverLMStudioDetails(config);
    const normalized = models.length > 0 ? models : basic;
    const generationModels = normalized.filter(
      isGenerationCapableProviderModel,
    );
    return {
      runtimeId,
      models: generationModels,
      ...(normalized.length > generationModels.length
        ? { excludedModelCount: normalized.length - generationModels.length }
        : {}),
    };
  } catch (error) {
    const generationModels = basic.filter(isGenerationCapableProviderModel);
    return {
      runtimeId,
      models: generationModels,
      ...(basic.length > generationModels.length
        ? { excludedModelCount: basic.length - generationModels.length }
        : {}),
      metadataWarning:
        error instanceof Error
          ? `${config.label} model details unavailable: ${error.message}`
          : `${config.label} model details unavailable`,
    };
  }
}

function parseDownloadStatus(payload: unknown): LMStudioDownloadStatus {
  if (!isRecord(payload)) {
    throw new Error("LM Studio returned invalid download status");
  }
  const status = stringOrNull(payload.status);
  if (
    !status ||
    ![
      "downloading",
      "paused",
      "completed",
      "failed",
      "already_downloaded",
    ].includes(status)
  ) {
    throw new Error("LM Studio returned an unknown download status");
  }
  return {
    jobId: stringOrNull(payload.job_id),
    status: status as LMStudioDownloadStatus["status"],
    totalSizeBytes: finiteNumberOrNull(payload.total_size_bytes),
    downloadedBytes: finiteNumberOrNull(payload.downloaded_bytes),
    bytesPerSecond: finiteNumberOrNull(payload.bytes_per_second),
    startedAt: stringOrNull(payload.started_at),
    completedAt: stringOrNull(payload.completed_at),
  };
}

export async function startLMStudioModelDownload(
  model: string,
  quantization?: string
): Promise<LMStudioDownloadStatus> {
  const config = await getOpenAICompatibleRuntimeConfig("lmstudio");
  const response = await requestCompatibleUrl(
    config,
    `${compatibleManagementRoot(config.baseUrl)}/api/v1/models/download`,
    {
      method: "POST",
      body: JSON.stringify({
        model,
        ...(quantization ? { quantization } : {}),
      }),
    }
  );
  return parseDownloadStatus(await response.json());
}

export async function getLMStudioModelDownloadStatus(
  jobId: string
): Promise<LMStudioDownloadStatus> {
  const config = await getOpenAICompatibleRuntimeConfig("lmstudio");
  const response = await requestCompatibleUrl(
    config,
    `${compatibleManagementRoot(config.baseUrl)}/api/v1/models/download/status/${encodeURIComponent(jobId)}`
  );
  return parseDownloadStatus(await response.json());
}
