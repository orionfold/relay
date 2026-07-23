"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Network,
  RefreshCw,
  Server,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  RuntimeReadinessObservation,
} from "@/lib/settings/runtime-readiness";
import { AuthStatusBadge } from "./auth-status-badge";

export type SetupRuntimeId = "ollama" | "litellm" | "lmstudio";

type AcquisitionKind = "pull" | "download" | "managed";
type Operation =
  | "idle"
  | "loading"
  | "saving"
  | "testing"
  | "discovering"
  | "acquiring";
type ConnectionState = "idle" | "connected" | "failed";

interface RuntimeSettings {
  runtimeId: SetupRuntimeId;
  configured: boolean;
  baseUrl: string;
  defaultModel: string;
  allowInsecureRemote: boolean;
  hasApiKey: boolean;
  apiKeySource: "db" | "env" | "unknown";
  readiness: RuntimeReadinessObservation;
}

interface ProviderModel {
  id: string;
  name: string;
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
  maxContextLength?: number | null;
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  inputCostPerToken?: number | null;
  outputCostPerToken?: number | null;
  mode?: string | null;
  loaded?: boolean;
  loadedInstanceCount?: number;
  vision?: boolean;
  trainedForToolUse?: boolean;
  contextLength?: number | null;
  modifiedAt?: string | null;
}

interface ProviderModelsResponse {
  runtimeId: SetupRuntimeId;
  models: ProviderModel[];
  excludedModelCount?: number;
  metadataWarning?: string;
}

interface DownloadStatus {
  jobId?: string | null;
  status?:
    | "downloading"
    | "paused"
    | "completed"
    | "failed"
    | "already_downloaded";
  totalSizeBytes?: number | null;
  downloadedBytes?: number | null;
}

interface ProviderDefinition {
  runtimeId: SetupRuntimeId;
  label: string;
  description: string;
  defaultUrl: string;
  apiKeyEnv: string;
  icon: LucideIcon;
  settingsEndpoint: string;
  modelsEndpoint: string;
  acquisition: AcquisitionKind;
}

export const PROVIDER_DEFINITIONS: Record<SetupRuntimeId, ProviderDefinition> = {
  ollama: {
    runtimeId: "ollama",
    label: "Ollama",
    description:
      "Connect Relay to an Ollama server or the Ollama cloud API. Privacy, cost, and authentication depend on that endpoint.",
    defaultUrl: "http://localhost:11434",
    apiKeyEnv: "OLLAMA_API_KEY",
    icon: Server,
    settingsEndpoint: "/api/settings/ollama",
    modelsEndpoint: "/api/runtimes/ollama",
    acquisition: "pull",
  },
  litellm: {
    runtimeId: "litellm",
    label: "LiteLLM",
    description:
      "Connect Relay to a LiteLLM gateway. Routing, locality, privacy, and cost depend on the gateway's upstream configuration.",
    defaultUrl: "http://localhost:4000/v1",
    apiKeyEnv: "LITELLM_API_KEY",
    icon: Network,
    settingsEndpoint: "/api/settings/openai-compatible/litellm",
    modelsEndpoint: "/api/runtimes/openai-compatible/litellm",
    acquisition: "managed",
  },
  lmstudio: {
    runtimeId: "lmstudio",
    label: "LM Studio",
    description:
      "Connect Relay to an LM Studio server on this host or your network. Serving and API-token policy are operator choices.",
    defaultUrl: "http://localhost:1234/v1",
    apiKeyEnv: "LMSTUDIO_API_KEY",
    icon: Server,
    settingsEndpoint: "/api/settings/openai-compatible/lmstudio",
    modelsEndpoint: "/api/runtimes/openai-compatible/lmstudio",
    acquisition: "download",
  },
};

function formatBytes(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 1_000_000_000) return `${Math.round(value / 1_000_000)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

function modelFacts(model: ProviderModel): string[] {
  return [
    model.upstreamModel ? `Upstream ${model.upstreamModel}` : null,
    model.publisher ?? model.ownedBy ?? null,
    model.architecture ?? model.family ?? null,
    model.parameterSize ?? null,
    model.quantization ?? null,
    model.format ?? null,
    formatBytes(model.sizeBytes),
    typeof model.contextLength === "number"
      ? `${model.contextLength.toLocaleString()} loaded context`
      : null,
    typeof model.maxContextLength === "number"
      ? `${model.maxContextLength.toLocaleString()} max context`
      : null,
    typeof model.maxInputTokens === "number"
      ? `${model.maxInputTokens.toLocaleString()} input tokens`
      : null,
    typeof model.maxOutputTokens === "number"
      ? `${model.maxOutputTokens.toLocaleString()} output tokens`
      : null,
    typeof model.inputCostPerToken === "number"
      ? `$${model.inputCostPerToken.toPrecision(4)} / input token`
      : null,
    typeof model.outputCostPerToken === "number"
      ? `$${model.outputCostPerToken.toPrecision(4)} / output token`
      : null,
    typeof model.loadedInstanceCount === "number"
      ? `${model.loadedInstanceCount.toLocaleString()} loaded instance${model.loadedInstanceCount === 1 ? "" : "s"}`
      : null,
    model.modifiedAt ? `Updated ${model.modifiedAt}` : null,
    model.mode ?? model.type ?? null,
  ].filter((value): value is string => Boolean(value));
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function messageFrom(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : fallback;
}

export function ProviderSetupCard({
  runtimeId,
  compact = false,
}: {
  runtimeId: SetupRuntimeId;
  compact?: boolean;
}) {
  const definition = PROVIDER_DEFINITIONS[runtimeId];
  const Icon = definition.icon;
  const mounted = useRef(true);
  const actionInFlight = useRef(false);
  const [snapshot, setSnapshot] = useState<RuntimeSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState(definition.defaultUrl);
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [allowInsecureRemote, setAllowInsecureRemote] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeySource, setApiKeySource] = useState<RuntimeSettings["apiKeySource"]>("unknown");
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [modelsDiscovered, setModelsDiscovered] = useState(false);
  const [metadataWarning, setMetadataWarning] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation>("loading");
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [error, setError] = useState<{ phase: string; message: string } | null>(null);
  const [acquisitionModel, setAcquisitionModel] = useState("");
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const applySettings = useCallback((settings: RuntimeSettings) => {
    const readiness = settings.readiness ?? {
      phase: "saved-unverified",
      ready: false,
      checkedAt: null,
      credentialSource: settings.apiKeySource,
      endpointReachable: null,
      reason: "Saved, not verified",
    };
    setSnapshot({ ...settings, readiness });
    setBaseUrl(settings.baseUrl);
    setDefaultModel(settings.defaultModel);
    setAllowInsecureRemote(settings.allowInsecureRemote);
    setHasApiKey(settings.hasApiKey);
    setApiKeySource(settings.apiKeySource);
    setApiKey("");
    setConnection(readiness.ready ? "connected" : "idle");
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setOperation("loading");
      try {
        const response = await fetch(definition.settingsEndpoint);
        const payload = await readPayload(response);
        if (!response.ok) throw new Error(messageFrom(payload, "Failed to load settings"));
        if (active) applySettings(payload as unknown as RuntimeSettings);
      } catch (loadError) {
        if (active) {
          setExpanded(true);
          setError({
            phase: "Loading settings",
            message: loadError instanceof Error ? loadError.message : String(loadError),
          });
        }
      } finally {
        if (active) setOperation("idle");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [applySettings, definition.settingsEndpoint]);

  const dirty = useMemo(
    () =>
      Boolean(
        snapshot &&
          (baseUrl !== snapshot.baseUrl ||
            defaultModel !== snapshot.defaultModel ||
            allowInsecureRemote !== snapshot.allowInsecureRemote ||
            apiKey.trim())
      ),
    [allowInsecureRemote, apiKey, baseUrl, defaultModel, snapshot]
  );

  function markEdited() {
    setConnection("idle");
    setError(null);
  }

  const saveSettings = useCallback(
    async (announce: boolean): Promise<boolean> => {
      setOperation("saving");
      setError(null);
      try {
        const response = await fetch(definition.settingsEndpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl,
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
            defaultModel,
            allowInsecureRemote,
          }),
        });
        const payload = await readPayload(response);
        if (!response.ok) throw new Error(messageFrom(payload, "Failed to save settings"));
        applySettings(payload as unknown as RuntimeSettings);
        if (announce) toast.success(`${definition.label} settings saved`);
        return true;
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : String(saveError);
        setError({ phase: "Saving settings", message });
        toast.error(message);
        return false;
      } finally {
        if (mounted.current) setOperation("idle");
      }
    }, [allowInsecureRemote, apiKey, applySettings, baseUrl, defaultModel, definition]
  );

  const discoverModels = useCallback(async (): Promise<boolean> => {
    setOperation("discovering");
    try {
      const response = await fetch(definition.modelsEndpoint);
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(messageFrom(payload, "Model discovery failed"));
      }
      const discovered = payload as unknown as ProviderModelsResponse;
      setModels(Array.isArray(discovered.models) ? discovered.models : []);
      setModelsDiscovered(true);
      setMetadataWarning(
        discovered.metadataWarning ??
          (discovered.excludedModelCount
            ? `${discovered.excludedModelCount} non-generation model${
                discovered.excludedModelCount === 1 ? " was" : "s were"
              } excluded from routing.`
            : null),
      );
      setConnection("connected");
      window.dispatchEvent(
        new CustomEvent("relay:runtime-readiness-changed"),
      );
      return true;
    } catch (discoverError) {
      setModels([]);
      setConnection("failed");
      window.dispatchEvent(
        new CustomEvent("relay:runtime-readiness-changed"),
      );
      setError({
        phase: "Discovering models",
        message: discoverError instanceof Error ? discoverError.message : String(discoverError),
      });
      return false;
    } finally {
      if (mounted.current) setOperation("idle");
    }
  }, [definition.modelsEndpoint]);

  async function handleTest() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    try {
      setError(null);
      if (
        (dirty || snapshot?.configured !== true) &&
        !(await saveSettings(false))
      ) {
        return;
      }
      setOperation("testing");
      const response = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime: runtimeId }),
      });
      const payload = await readPayload(response);
      if (!response.ok || payload.connected !== true) {
        if (payload.readiness && typeof payload.readiness === "object") {
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  readiness:
                    payload.readiness as unknown as RuntimeReadinessObservation,
                }
              : current,
          );
        }
        throw new Error(messageFrom(payload, "Connection failed"));
      }
      if (payload.readiness && typeof payload.readiness === "object") {
        setSnapshot((current) =>
          current
            ? {
                ...current,
                readiness:
                  payload.readiness as unknown as RuntimeReadinessObservation,
              }
            : current,
        );
      }
      await discoverModels();
    } catch (testError) {
      setModels([]);
      setConnection("failed");
      setError({
        phase: "Testing connection",
        message: testError instanceof Error ? testError.message : String(testError),
      });
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setOperation("idle");
    }
  }

  async function handleClearKey() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setOperation("saving");
    setError(null);
    try {
      const response = await fetch(definition.settingsEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearApiKey: true }),
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(messageFrom(payload, "Failed to clear API key"));
      applySettings(payload as unknown as RuntimeSettings);
      setConnection("idle");
      toast.success(`${definition.label} saved API key cleared`);
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : String(clearError);
      setError({ phase: "Clearing API key", message });
      toast.error(message);
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setOperation("idle");
    }
  }

  async function handleSave() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    try {
      await saveSettings(true);
    } finally {
      actionInFlight.current = false;
    }
  }

  async function handleRefresh() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    try {
      setError(null);
      await discoverModels();
    } finally {
      actionInFlight.current = false;
    }
  }

  async function pollDownload(jobId: string): Promise<void> {
    for (let attempt = 0; attempt < 120 && mounted.current; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      if (!mounted.current) return;
      const response = await fetch(
        `${definition.modelsEndpoint}?downloadJobId=${encodeURIComponent(jobId)}`
      );
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(messageFrom(payload, "Download status failed"));
      const status = payload as DownloadStatus;
      const progress =
        typeof status.downloadedBytes === "number" && typeof status.totalSizeBytes === "number"
          ? ` · ${formatBytes(status.downloadedBytes)} of ${formatBytes(status.totalSizeBytes)}`
          : "";
      setDownloadStatus(`${status.status ?? "downloading"}${progress}`);
      if (status.status === "completed" || status.status === "already_downloaded") return;
      if (status.status === "failed") throw new Error("LM Studio model download failed");
    }
    if (!mounted.current) return;
    throw new Error("LM Studio download did not finish before Relay stopped polling");
  }

  async function handleAcquire() {
    if (actionInFlight.current) return;
    const model = acquisitionModel.trim();
    if (!model || definition.acquisition === "managed") return;
    actionInFlight.current = true;
    setOperation("acquiring");
    setError(null);
    setDownloadStatus(null);
    try {
      const response = await fetch(definition.modelsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: definition.acquisition,
          model,
        }),
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(messageFrom(payload, "Model acquisition failed"));
      if (definition.acquisition === "download") {
        const status = payload as DownloadStatus;
        setDownloadStatus(status.status ?? "download started");
        if (status.status === "downloading" && status.jobId) {
          await pollDownload(status.jobId);
          if (!mounted.current) return;
        } else if (status.status === "failed") {
          throw new Error("LM Studio model download failed");
        }
      }
      setAcquisitionModel("");
      toast.success(
        definition.acquisition === "pull"
          ? `${definition.label} model pulled`
          : `${definition.label} model download completed`
      );
      await discoverModels();
    } catch (acquisitionError) {
      if (!mounted.current) return;
      const message =
        acquisitionError instanceof Error ? acquisitionError.message : String(acquisitionError);
      setError({ phase: "Acquiring model", message });
      toast.error(message);
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setOperation("idle");
    }
  }

  const busy = operation !== "idle";
  const savedDefaultMissing = Boolean(
    defaultModel && models.length > 0 && !models.some((model) => model.id === defaultModel)
  );

  return (
    <Card id={`settings-${runtimeId}`} className="surface-card scroll-mt-4">
      <CardHeader className={compact ? "p-0" : undefined}>
        {compact ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            data-interactive-surface=""
            data-interactive-outline="preserve"
            aria-expanded={expanded}
            aria-controls={`${runtimeId}-provider-setup-controls`}
            className="interactive-list-item flex w-full items-center gap-3 rounded-xl p-4 text-left"
          >
            <Icon className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle role="heading" aria-level={3}>
                  {definition.label}
                </CardTitle>
                {snapshot ? (
                  <AuthStatusBadge
                    connected={snapshot.readiness.ready}
                    readiness={snapshot.readiness.phase}
                    apiKeySource={snapshot.apiKeySource}
                  />
                ) : (
                  <Badge variant="outline">Loading</Badge>
                )}
              </div>
              <CardDescription className="mt-1 truncate">
                {snapshot
                  ? `${snapshot.baseUrl} · ${
                      snapshot.defaultModel || "Model auto-select"
                    }`
                  : definition.description}
              </CardDescription>
            </div>
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        ) : (
          <>
            <CardTitle className="flex items-center gap-2" role="heading" aria-level={3}>
              <Icon className="h-5 w-5" />
              {definition.label}
            </CardTitle>
            <CardDescription>{definition.description}</CardDescription>
          </>
        )}
      </CardHeader>
      {expanded ? (
        <CardContent
          id={`${runtimeId}-provider-setup-controls`}
          className={
            compact
              ? "space-y-5 border-t border-border/60 pt-5"
              : "space-y-5"
          }
        >
        {operation === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading settings...
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${runtimeId}-base-url`}>Server base URL</Label>
              <Input
                id={`${runtimeId}-base-url`}
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  markEdited();
                }}
                placeholder={definition.defaultUrl}
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Requests originate from the Relay server, not from this browser.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${runtimeId}-api-key`}>API key (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id={`${runtimeId}-api-key`}
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    markEdited();
                  }}
                  placeholder={
                    hasApiKey
                      ? `Configured via ${apiKeySource === "env" ? definition.apiKeyEnv : "saved setting"}`
                      : "Leave blank for an endpoint that does not require authentication"
                  }
                />
                {hasApiKey && apiKeySource !== "env" ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleClearKey} disabled={busy}>
                    Clear
                  </Button>
                ) : null}
              </div>
              {runtimeId === "ollama" ? (
                <p className="text-xs text-muted-foreground">
                  Local Ollama commonly needs no key; direct ollama.com access requires a Bearer API key.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${runtimeId}-default-model`}>Default model or alias</Label>
              <Input
                id={`${runtimeId}-default-model`}
                value={defaultModel}
                onChange={(event) => {
                  setDefaultModel(event.target.value);
                  markEdited();
                }}
                list={`${runtimeId}-models`}
                placeholder="Use the first discovered model"
                spellCheck={false}
              />
              <datalist id={`${runtimeId}-models`}>
                {models.map((model) => <option key={model.id} value={model.id} />)}
              </datalist>
              {savedDefaultMissing ? (
                <p className="text-xs text-status-warning">
                  Saved default is not in the models returned by this endpoint.
                </p>
              ) : null}
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3">
              <div>
                <Label htmlFor={`${runtimeId}-insecure-remote`}>Allow insecure remote HTTP</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Required only for a non-loopback http:// endpoint. Credentials and prompts can be read in transit; HTTPS is recommended.
                </p>
              </div>
              <Switch
                id={`${runtimeId}-insecure-remote`}
                checked={allowInsecureRemote}
                onCheckedChange={(checked) => {
                  setAllowInsecureRemote(checked);
                  markEdited();
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => void handleSave()} disabled={busy || !dirty}>
                {operation === "saving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void handleTest()} disabled={busy}>
                {operation === "testing" || operation === "discovering" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Test and discover models
              </Button>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {connection === "connected" &&
                  (modelsDiscovered
                    ? `Connected · ${models.length} model${models.length === 1 ? "" : "s"}`
                    : "Verified")}
                {connection === "failed" && "Connection failed"}
                {connection === "idle" &&
                  (dirty
                    ? "Unsaved changes"
                    : snapshot?.readiness.phase === "auth-rejected"
                      ? "Authentication rejected"
                      : snapshot?.readiness.phase === "unreachable"
                        ? "Server unreachable"
                        : snapshot?.readiness.phase === "model-required"
                          ? "Load or select a generation model"
                        : snapshot?.readiness.phase === "invalid-response"
                          ? "Invalid provider response"
                          : snapshot?.readiness.phase === "saved-unverified"
                            ? "Saved · not verified"
                            : hasApiKey
                              ? "API key saved · not verified"
                              : "Not verified")}
              </span>
            </div>

            {definition.acquisition === "managed" ? (
              <div className="surface-card-muted space-y-3 rounded-lg border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">Gateway-managed models</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add or change upstream models in the LiteLLM administrator interface, then refresh Relay's model list.
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => void handleRefresh()} disabled={busy}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh models
                </Button>
              </div>
            ) : (
              <div className="surface-card-muted space-y-2 rounded-lg border border-border/60 p-3">
                <Label htmlFor={`${runtimeId}-acquire-model`}>
                  {definition.acquisition === "pull" ? "Pull a model" : "Download a model"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`${runtimeId}-acquire-model`}
                    value={acquisitionModel}
                    onChange={(event) => setAcquisitionModel(event.target.value)}
                    placeholder={definition.acquisition === "pull" ? "e.g. llama3.2" : "e.g. publisher/model"}
                    spellCheck={false}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !busy) void handleAcquire();
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleAcquire()} disabled={busy || !acquisitionModel.trim()}>
                    {operation === "acquiring" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {definition.acquisition === "pull" ? "Pull" : "Download"}
                  </Button>
                </div>
                {downloadStatus ? <p className="text-xs text-muted-foreground" aria-live="polite">Download: {downloadStatus}</p> : null}
              </div>
            )}

            {error ? (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                <p className="font-medium">{error.phase}</p>
                <p>{error.message}</p>
              </div>
            ) : null}

            {metadataWarning ? (
              <p className="rounded-lg bg-status-warning/10 px-3 py-2 text-sm text-status-warning" role="status">
                {metadataWarning}
              </p>
            ) : null}

            {models.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Available models</p>
                <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {models.map((model) => {
                    const facts = modelFacts(model);
                    return (
                      <div key={model.id} className="space-y-2 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{model.name || model.id}</span>
                          {model.name && model.name !== model.id ? <code className="text-xs text-muted-foreground">{model.id}</code> : null}
                          {typeof model.loaded === "boolean" ? (
                            <Badge variant={model.loaded ? "success" : "secondary"}>
                              {model.loaded ? "Loaded" : "Not loaded"}
                            </Badge>
                          ) : null}
                          {typeof model.vision === "boolean" ? (
                            <Badge variant="outline">{model.vision ? "Vision" : "No vision"}</Badge>
                          ) : null}
                          {typeof model.trainedForToolUse === "boolean" ? (
                            <Badge variant="outline">
                              {model.trainedForToolUse ? "Tools" : "No tool training"}
                            </Badge>
                          ) : null}
                        </div>
                        {facts.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {facts.map((fact) => <Badge key={fact} variant="secondary">{fact}</Badge>)}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
        </CardContent>
      ) : null}
    </Card>
  );
}
