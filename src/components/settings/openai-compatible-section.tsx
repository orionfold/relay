"use client";

import { useEffect, useState } from "react";
import { Loader2, Network, Server } from "lucide-react";
import { toast } from "sonner";
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

type RuntimeId = "litellm" | "lmstudio";
type ConnectionState = "idle" | "testing" | "connected" | "failed";

interface RuntimeSettings {
  runtimeId: RuntimeId;
  configured: boolean;
  baseUrl: string;
  defaultModel: string;
  allowInsecureRemote: boolean;
  hasApiKey: boolean;
  apiKeySource: "db" | "env" | "unknown";
}

const DEFINITIONS: Record<
  RuntimeId,
  {
    label: string;
    description: string;
    defaultUrl: string;
    apiKeyEnv: string;
    icon: typeof Network;
  }
> = {
  litellm: {
    label: "LiteLLM",
    description:
      "Connect Relay to a LiteLLM gateway. Routing, locality, privacy, and cost depend on the gateway's upstream configuration.",
    defaultUrl: "http://localhost:4000/v1",
    apiKeyEnv: "LITELLM_API_KEY",
    icon: Network,
  },
  lmstudio: {
    label: "LM Studio",
    description:
      "Connect Relay to an LM Studio server on this host or your network. Network serving and API-token policy are operator choices.",
    defaultUrl: "http://localhost:1234/v1",
    apiKeyEnv: "LMSTUDIO_API_KEY",
    icon: Server,
  },
};

function CompatibleRuntimeCard({ runtimeId }: { runtimeId: RuntimeId }) {
  const definition = DEFINITIONS[runtimeId];
  const Icon = definition.icon;
  const [baseUrl, setBaseUrl] = useState(definition.defaultUrl);
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [allowInsecureRemote, setAllowInsecureRemote] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeySource, setApiKeySource] = useState<RuntimeSettings["apiKeySource"]>("unknown");
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/settings/openai-compatible/${runtimeId}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to load settings");
        return payload as RuntimeSettings;
      })
      .then((settings) => {
        setBaseUrl(settings.baseUrl);
        setDefaultModel(settings.defaultModel);
        setAllowInsecureRemote(settings.allowInsecureRemote);
        setHasApiKey(settings.hasApiKey);
        setApiKeySource(settings.apiKeySource);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => setLoading(false));
  }, [runtimeId]);

  async function loadModels() {
    const response = await fetch(`/api/runtimes/openai-compatible/${runtimeId}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Model discovery failed");
    const discovered = (payload.models ?? []) as Array<{ id?: string }>;
    setModels(
      discovered
        .map((model) => model.id)
        .filter((id): id is string => typeof id === "string")
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/openai-compatible/${runtimeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          ...(apiKey ? { apiKey } : {}),
          defaultModel,
          allowInsecureRemote,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to save settings");
      setBaseUrl(payload.baseUrl);
      setHasApiKey(payload.hasApiKey);
      setApiKeySource(payload.apiKeySource);
      setApiKey("");
      setConnection("idle");
      toast.success(`${definition.label} settings saved`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setConnection("testing");
    setError(null);
    try {
      const response = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime: runtimeId }),
      });
      const payload = await response.json();
      if (!payload.connected) throw new Error(payload.error ?? "Connection failed");
      await loadModels();
      setConnection("connected");
    } catch (testError) {
      setModels([]);
      setConnection("failed");
      setError(testError instanceof Error ? testError.message : String(testError));
    }
  }

  async function handleClearKey() {
    try {
      const response = await fetch(`/api/settings/openai-compatible/${runtimeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to clear API key");
      setHasApiKey(payload.hasApiKey);
      setApiKeySource(payload.apiKeySource);
      toast.success(`${definition.label} saved API key cleared`);
    } catch (clearError) {
      toast.error(clearError instanceof Error ? clearError.message : String(clearError));
    }
  }

  return (
    <div className="surface-card space-y-5 rounded-xl border border-border/60 p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="font-medium">{definition.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{definition.description}</p>
        </div>
      </div>

      {loading ? (
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
              onChange={(event) => setBaseUrl(event.target.value)}
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
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  hasApiKey
                    ? `Configured via ${apiKeySource === "env" ? definition.apiKeyEnv : "saved setting"}`
                    : "Leave blank for an unauthenticated endpoint"
                }
              />
              {hasApiKey && apiKeySource !== "env" && (
                <Button type="button" variant="outline" size="sm" onClick={handleClearKey}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${runtimeId}-default-model`}>Default model or alias</Label>
            <Input
              id={`${runtimeId}-default-model`}
              value={defaultModel}
              onChange={(event) => setDefaultModel(event.target.value)}
              list={`${runtimeId}-models`}
              placeholder="Use the first discovered model"
              spellCheck={false}
            />
            <datalist id={`${runtimeId}-models`}>
              {models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3">
            <div>
              <Label htmlFor={`${runtimeId}-insecure-remote`}>
                Allow insecure remote HTTP
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Required only for a non-loopback http:// endpoint. Credentials and prompts can be read in transit; HTTPS is recommended.
              </p>
            </div>
            <Switch
              id={`${runtimeId}-insecure-remote`}
              checked={allowInsecureRemote}
              onCheckedChange={setAllowInsecureRemote}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={connection === "testing"}
            >
              {connection === "testing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test and discover models
            </Button>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {connection === "connected" && `Connected · ${models.length} model${models.length === 1 ? "" : "s"}`}
              {connection === "failed" && "Connection failed"}
              {connection === "idle" && (hasApiKey ? "API key configured" : "API key not configured")}
            </span>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function OpenAICompatibleSection() {
  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>OpenAI-compatible servers</CardTitle>
        <CardDescription>
          Configure each runtime explicitly. Relay preserves its identity in Chat, tasks, workflows, schedules, and usage receipts.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-2">
        <CompatibleRuntimeCard runtimeId="litellm" />
        <CompatibleRuntimeCard runtimeId="lmstudio" />
      </CardContent>
    </Card>
  );
}
