"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Network,
  Zap,
  DollarSign,
  Crown,
  Hand,
  Key,
  Shield,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  recommendForRouting,
  type RoutingRecommendation,
} from "@/lib/settings/routing-recommendation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AuthMethodSelector } from "./auth-method-selector";
import { ApiKeyForm } from "./api-key-form";
import { AuthStatusBadge } from "./auth-status-badge";
import { ConnectionTestControl } from "./connection-test-control";
import { OpenAIChatGPTAuthControl } from "./openai-chatgpt-auth-control";
import type { AuthMethod, ApiKeySource, RoutingPreference } from "@/lib/constants/settings";
import type { RuntimeSetupState } from "@/lib/settings/runtime-setup";
import type { OpenAIAccountInfo, OpenAIRateLimitInfo } from "@/lib/settings/openai-auth";
import type { OpenAILoginState } from "@/lib/settings/openai-login-manager";

// ── Types ────────────────────────────────────────────────────────────

interface ProviderState {
  configured: boolean;
  authMethod?: AuthMethod;
  hasKey: boolean;
  apiKeySource: ApiKeySource;
  oauthConnected?: boolean;
  account?: OpenAIAccountInfo | null;
  rateLimits?: OpenAIRateLimitInfo | null;
  login?: OpenAILoginState;
  dualBilling: boolean;
  directModel?: string | null;
  runtimes: RuntimeSetupState[];
}

interface OllamaState {
  configured: boolean;
  connected: boolean;
  baseUrl: string;
  defaultModel: string;
}

interface ProvidersPayload {
  providers: {
    anthropic: ProviderState;
    openai: ProviderState;
  };
  ollama?: OllamaState;
  chatDefaultModel?: string | null;
  routingPreference: RoutingPreference;
  configuredProviderCount: number;
}

// ── Routing preference metadata ──────────────────────────────────────

const ROUTING_OPTIONS: {
  value: RoutingPreference;
  label: string;
  description: string;
  icon: typeof Zap;
}[] = [
  {
    value: "latency",
    label: "Latency",
    description: "Fastest response via direct APIs.",
    icon: Zap,
  },
  {
    value: "cost",
    label: "Cost",
    description: "Lowest per-token spend.",
    icon: DollarSign,
  },
  {
    value: "quality",
    label: "Quality",
    description: "Richest tool use via SDKs.",
    icon: Crown,
  },
  {
    value: "manual",
    label: "Manual",
    description: "Stay on the default runtime.",
    icon: Hand,
  },
];

// ── Recommendation chip metadata ────────────────────────────────────

const AUTH_CHIP_META: Record<AuthMethod, { icon: typeof Key; label: string }> = {
  api_key: { icon: Key, label: "API key" },
  oauth: { icon: Shield, label: "Subscription" },
};

// ── Provider row ─────────────────────────────────────────────────────

const RUNTIME_DESCRIPTIONS: Record<string, string> = {
  "claude-code": "Full tool suite, MCP, file access",
  "anthropic-direct": "Fast API calls, prompt caching, extended thinking",
  "openai-codex-app-server": "Sandboxed workspace execution",
  "openai-direct": "Fast API calls, code interpreter, web search",
  ollama: "Local model execution, free, no API key",
};

const BILLING_LABELS: Record<string, string> = {
  subscription: "Subscription",
  usage: "Pay-as-you-go",
};

function ProviderRow({
  name,
  oauthLabel,
  provider,
  defaultOpen,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  name: string;
  oauthLabel?: string;
  provider: ProviderState;
  defaultOpen: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const activeRuntimes = provider.runtimes.filter((r) => r.configured);
  const activeCount = activeRuntimes.length;
  const activeLabels = activeRuntimes.map((r) => r.label).join(", ");
  const openAIOAuthPending = provider.authMethod === "oauth" && provider.oauthConnected === false;
  const openAILoginPending = provider.login?.phase === "pending";

  let statusLine: string;
  if (!provider.configured) {
    statusLine =
      provider.authMethod === "oauth"
        ? "Sign in with ChatGPT to enable Codex App Server"
        : "Add an API key to enable runtimes";
  } else if (openAIOAuthPending && activeCount > 0) {
    statusLine = openAILoginPending
      ? `Waiting for ${oauthLabel ?? "OAuth"} sign-in. ${activeLabels} remains active.`
      : `Codex App Server needs ${oauthLabel ?? "OAuth"} sign-in. ${activeLabels} remains active.`;
  } else if (activeCount === 2) {
    statusLine = `2 runtimes active: ${activeLabels}`;
  } else if (activeCount === 1) {
    statusLine = `1 runtime active: ${activeLabels}`;
  } else {
    statusLine = "Connected";
  }

  return (
    <div className="surface-panel rounded-2xl border border-border/60">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/30 transition-colors rounded-2xl"
      >
        <div
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            provider.configured
              ? "bg-success"
              : "border-2 border-muted-foreground/40"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{name}</span>
            <AuthStatusBadge
              connected={provider.configured}
              apiKeySource={provider.apiKeySource}
              authMethod={provider.authMethod}
              oauthLabel={oauthLabel}
              oauthConnected={provider.oauthConnected}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{statusLine}</p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          <Separator />
          {children}

          {/* Dual-billing note for Anthropic OAuth + API key */}
          {provider.dualBilling && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Two billing modes active.</span>{" "}
                {name === "Anthropic"
                  ? "Claude Code uses your Max/Pro subscription. Anthropic Direct API uses pay-as-you-go API billing."
                  : "Codex App Server uses your ChatGPT plan. OpenAI Direct uses pay-as-you-go API billing."}{" "}
                Budget guardrails track each separately.
              </p>
            </div>
          )}

          {/* Runtimes enabled */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Runtimes
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {provider.runtimes.map((runtime) => {
                const isActive = runtime.configured;
                const inactiveDescription = runtime.runtimeId.includes("direct")
                  ? "Requires API key"
                  : runtime.runtimeId === "openai-codex-app-server" &&
                      provider.authMethod === "oauth"
                    ? provider.login?.phase === "pending"
                      ? "Waiting for ChatGPT sign-in"
                      : "Sign in with ChatGPT"
                    : "Requires CLI or API key";
                return (
                  <div
                    key={runtime.runtimeId}
                    className={`rounded-xl border px-3 py-2 ${
                      isActive
                        ? "border-border/60 bg-background/40"
                        : "border-border/30 bg-muted/20 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{runtime.label}</p>
                      {isActive && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {BILLING_LABELS[runtime.billingMode] ?? runtime.billingMode}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isActive
                        ? (RUNTIME_DESCRIPTIONS[runtime.runtimeId] ?? "Active")
                        : inactiveDescription}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main section ─────────────────────────────────────────────────────

export function ProvidersAndRuntimesSection() {
  const [data, setData] = useState<ProvidersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anthropicOpen, setAnthropicOpen] = useState(false);
  const [openAIOpen, setOpenAIOpen] = useState(false);
  const [openAILoginState, setOpenAILoginState] = useState<OpenAILoginState | null>(null);
  const anthropicRowRef = useRef<HTMLDivElement | null>(null);
  const openaiRowRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async (): Promise<ProvidersPayload | null> => {
    try {
      const res = await fetch("/api/settings/providers");
      if (res.ok) {
        const json = (await res.json()) as ProvidersPayload;
        setData(json);
        setError(null);
        return json;
      }
      // A non-OK response left the section spinning forever (issue #9): the
      // render guard is `loading || !data`, so `data` staying null on error
      // meant a permanent "Loading…" card with no visible failure. Surface it.
      setError(`Failed to load provider configuration (HTTP ${res.status}).`);
      return null;
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to load provider configuration: ${err.message}`
          : "Failed to load provider configuration.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Reverse cascade: detect divergence from the active recommendation ──
  // Called AFTER any user-initiated change that could shift auth or model away
  // from the current routing's recommendation. If the state no longer matches,
  // flip the routing radio to Manual silently — the two-way cause-effect.
  const maybeSwitchToManualIfDiverged = useCallback(
    async (fresh: ProvidersPayload) => {
      if (fresh.routingPreference === "manual") return;
      const rec = recommendForRouting(fresh.routingPreference, {
        ollamaAvailable: fresh.ollama?.connected ?? false,
        ollamaDefaultModel: fresh.ollama?.defaultModel,
      });
      if (!rec) return;

      const anthAuthOK =
        (fresh.providers.anthropic.authMethod ?? "api_key") === rec.anthropic.auth;
      const openaiAuthOK =
        (fresh.providers.openai.authMethod ?? "api_key") === rec.openai.auth;

      // Direct-model settings are only consumed by *-direct runtimes. For
      // Quality (claude-code / codex-app-server), the direct-model setting
      // value is irrelevant to the recommendation.
      const anthModelOK =
        rec.anthropic.runtimeId !== "anthropic-direct" ||
        fresh.providers.anthropic.directModel == null ||
        fresh.providers.anthropic.directModel === rec.anthropic.model;
      const openaiModelOK =
        rec.openai.runtimeId !== "openai-direct" ||
        fresh.providers.openai.directModel == null ||
        fresh.providers.openai.directModel === rec.openai.model;

      // Chat default: null means "use DEFAULT_CHAT_MODEL". If the user never
      // ran a cascade, chat.defaultModel may still be null — that's fine as
      // long as the recommendation's chatModel matches what null resolves to.
      const chatModelOK =
        fresh.chatDefaultModel == null ||
        fresh.chatDefaultModel === rec.chatModel;

      const diverges =
        !anthAuthOK || !openaiAuthOK || !anthModelOK || !openaiModelOK || !chatModelOK;

      if (diverges) {
        await fetch("/api/settings/routing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preference: "manual" }),
        });
        setData((prev) => (prev ? { ...prev, routingPreference: "manual" } : prev));
      }
    },
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync initial open state when data loads
  useEffect(() => {
    if (data) {
      const none = data.configuredProviderCount === 0;
      if (none || !data.providers.anthropic.configured) {
        setAnthropicOpen(true);
      }
      const openai = data.providers.openai;
      const openaiNeedsAttention =
        none ||
        !openai.configured ||
        ((openai.authMethod ?? "api_key") === "oauth" &&
          !(openai.oauthConnected ?? false));
      if (openaiNeedsAttention) {
        setOpenAIOpen(true);
      }
      setOpenAILoginState(openai.login ?? null);
    }
  }, [
    data?.configuredProviderCount,
    data?.providers.anthropic.configured,
    data?.providers.openai.configured,
    data?.providers.openai.authMethod,
    data?.providers.openai.oauthConnected,
  ]);

  // ── Anthropic auth handlers ──────────────────────────────────────

  async function handleAnthropicMethodChange(method: AuthMethod) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });
    if (res.ok) {
      const fresh = await fetchData();
      if (fresh) await maybeSwitchToManualIfDiverged(fresh);
    }
  }

  async function handleAnthropicSaveKey(apiKey: string) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "api_key", apiKey }),
    });
    if (res.ok) {
      const fresh = await fetchData();
      if (fresh) await maybeSwitchToManualIfDiverged(fresh);
    }
  }

  async function handleAnthropicTest() {
    const res = await fetch("/api/settings/test", { method: "POST" });
    const result = await res.json();
    fetchData();
    return result;
  }

  // ── OpenAI auth handlers ─────────────────────────────────────────

  async function handleOpenAISaveKey(apiKey: string) {
    const res = await fetch("/api/settings/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "api_key", apiKey }),
    });
    if (res.ok) {
      const fresh = await fetchData();
      if (fresh) await maybeSwitchToManualIfDiverged(fresh);
    }
  }

  async function handleOpenAIMethodChange(method: AuthMethod) {
    const res = await fetch("/api/settings/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });
    if (res.ok) {
      const fresh = await fetchData();
      if (fresh) await maybeSwitchToManualIfDiverged(fresh);
    }
  }

  async function handleOpenAITest() {
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "openai-codex-app-server" }),
    });
    const result = await res.json();
    fetchData();
    return result;
  }

  async function handleOpenAIDirectTest() {
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "openai-direct" }),
    });
    const result = await res.json();
    fetchData();
    return result;
  }

  // ── Routing preference handler (cascade) ─────────────────────────

  async function handleRoutingChange(value: RoutingPreference) {
    const routingRes = await fetch("/api/settings/routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preference: value }),
    });
    if (!routingRes.ok) {
      toast.error("Could not save routing preference");
      return;
    }
    setData((prev) => (prev ? { ...prev, routingPreference: value } : prev));

    const ollama = data?.ollama;
    const rec = recommendForRouting(value, {
      ollamaAvailable: ollama?.connected ?? false,
      ollamaDefaultModel: ollama?.defaultModel,
    });

    if (!rec) {
      toast.success("Manual routing. Provider configuration unchanged");
      return;
    }

    // Expand provider rows so users see the effect
    setAnthropicOpen(true);
    setOpenAIOpen(true);

    const currentAnthropic = data?.providers.anthropic;
    const currentOpenai = data?.providers.openai;

    const anthropicBody: Record<string, string> = {};
    if ((currentAnthropic?.authMethod ?? "api_key") !== rec.anthropic.auth) {
      anthropicBody.method = rec.anthropic.auth;
    }
    // Only stamp anthropic_direct_model when the recommendation's runtime is
    // actually anthropic-direct (the only consumer of that setting). For Quality
    // which picks claude-code, the SDK uses its own model resolution.
    if (
      rec.anthropic.runtimeId === "anthropic-direct" &&
      (currentAnthropic?.directModel ?? null) !== rec.anthropic.model
    ) {
      anthropicBody.model = rec.anthropic.model;
    }

    const openaiBody: Record<string, string> = {};
    if ((currentOpenai?.authMethod ?? "api_key") !== rec.openai.auth) {
      openaiBody.method = rec.openai.auth;
    }
    // Same gating: openai_direct_model is only consumed by openai-direct.
    if (
      rec.openai.runtimeId === "openai-direct" &&
      (currentOpenai?.directModel ?? null) !== rec.openai.model
    ) {
      openaiBody.model = rec.openai.model;
    }

    const tasks: Array<{ label: string; promise: Promise<Response> }> = [];

    if (Object.keys(anthropicBody).length > 0) {
      tasks.push({
        label: "Anthropic",
        promise: fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(anthropicBody),
        }),
      });
    }

    if (Object.keys(openaiBody).length > 0) {
      tasks.push({
        label: "OpenAI",
        promise: fetch("/api/settings/openai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(openaiBody),
        }),
      });
    }

    if (rec.useOllama && rec.ollamaModel && rec.ollamaModel !== ollama?.defaultModel) {
      tasks.push({
        label: "Ollama",
        promise: fetch("/api/settings/ollama", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultModel: rec.ollamaModel }),
        }),
      });
    }

    if (rec.chatModel && rec.chatModel !== (data?.chatDefaultModel ?? null)) {
      tasks.push({
        label: "Chat default",
        promise: fetch("/api/settings/chat", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultModel: rec.chatModel }),
        }),
      });
    }

    if (tasks.length === 0) {
      toast.success(`Routing set to ${value}. Already matches the recommendation`);
      fetchData();
      return;
    }

    const results = await Promise.allSettled(tasks.map((t) => t.promise));
    const failed: string[] = [];
    const succeededLabels: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected" || !r.value.ok) {
        failed.push(tasks[i].label);
      } else {
        succeededLabels.push(tasks[i].label);
      }
    });

    // Notify listeners (ChatSessionProvider) that the chat default changed,
    // so the chat dropdown updates without waiting for a page reload.
    if (rec.chatModel && succeededLabels.includes("Chat default")) {
      window.dispatchEvent(
        new CustomEvent("ainative.chat.default-model-changed", {
          detail: { modelId: rec.chatModel },
        }),
      );
    }

    if (failed.length === 0) {
      toast.success(`Routing set to ${value}. Updated ${tasks.map((t) => t.label).join(", ")}`);
    } else if (failed.length === tasks.length) {
      toast.error(`Could not update provider configuration (${failed.join(", ")})`);
    } else {
      toast.warning(`Updated with errors. Failed: ${failed.join(", ")}`);
    }

    fetchData();
  }

  function jumpToProvider(target: "anthropic" | "openai" | "ollama" | "chat") {
    if (target === "anthropic") {
      setAnthropicOpen(true);
      anthropicRowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (target === "openai") {
      setOpenAIOpen(true);
      openaiRowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // External sections — Ollama and Chat settings live as sibling sections
    // on the settings page, so we scroll by id rather than via refs.
    const id = target === "ollama" ? "settings-ollama" : "settings-chat";
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Providers &amp; Runtimes
          </CardTitle>
          <CardDescription>Loading provider configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Fetch finished but produced no data (non-OK response or thrown error).
  // Show an actionable error with a retry instead of an endless spinner —
  // the previous `loading || !data` guard silently hung here (issue #9).
  if (!data) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Providers &amp; Runtimes
          </CardTitle>
          <CardDescription>
            {error ?? "Failed to load provider configuration."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              void fetchData();
            }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const { providers, routingPreference, configuredProviderCount } = data;
  const openAIProvider: ProviderState = {
    ...providers.openai,
    login: openAILoginState ?? providers.openai.login,
  };
  const noneConfigured = configuredProviderCount === 0;
  const ollamaState = data.ollama;
  const liveRecommendation: RoutingRecommendation | null = recommendForRouting(
    routingPreference,
    {
      ollamaAvailable: ollamaState?.connected ?? false,
      ollamaDefaultModel: ollamaState?.defaultModel,
    },
  );
  const recommendedAuth = liveRecommendation?.anthropic.auth ?? null;

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5" />
          Providers &amp; Runtimes
        </CardTitle>
        <CardDescription>
          {noneConfigured
            ? "Get started by connecting at least one AI provider."
            : `${configuredProviderCount} provider${configuredProviderCount > 1 ? "s" : ""} connected. ${
                Object.values(providers)
                  .flatMap((p) => p.runtimes)
                  .filter((r) => r.configured).length
              } runtimes available`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Task routing — bento: radios left (2x2 at lg), banner right.
            Fixed min-height so radios and banner don't resize between
            preferences. Value covers the tallest state (Cost+Ollama connected). */}
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-stretch lg:min-h-[180px]">
          <div className="flex flex-col gap-3 lg:h-full">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Task routing
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground" title="Pick how Orionfold Relay selects a runtime per task">
                Pick how Orionfold Relay picks a runtime.
              </p>
            </div>

            <RadioGroup
              value={routingPreference}
              onValueChange={(v) => handleRoutingChange(v as RoutingPreference)}
              className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2"
            >
              {ROUTING_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = routingPreference === option.value;
                return (
                  <Label
                    key={option.value}
                    htmlFor={`routing-${option.value}`}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 transition-all hover:bg-accent/30 ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border/40"
                    }`}
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`routing-${option.value}`}
                      className="sr-only"
                    />
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isSelected ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <span
                      className={`truncate text-sm font-medium ${
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {option.label}
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>

            <p
              className="truncate text-xs text-muted-foreground"
              title={ROUTING_OPTIONS.find((o) => o.value === routingPreference)?.description}
            >
              {ROUTING_OPTIONS.find((o) => o.value === routingPreference)?.description}
            </p>
          </div>

          <div className="min-w-0">
            <RecommendationBanner
              preference={routingPreference}
              recommendation={liveRecommendation}
              ollama={ollamaState ?? null}
              onConfigure={jumpToProvider}
            />
          </div>
        </div>

        <Separator />

        {/* Anthropic provider — controlled open state */}
        <div ref={anthropicRowRef}>
        <ProviderRow
          name="Anthropic"
          oauthLabel="Claude Max/Pro"
          provider={providers.anthropic}
          defaultOpen={false}
          open={anthropicOpen}
          onOpenChange={setAnthropicOpen}
        >
          <AuthMethodSelector
            value={providers.anthropic.authMethod ?? "api_key"}
            onChange={handleAnthropicMethodChange}
            recommendedMethod={recommendedAuth}
          />

          {(providers.anthropic.authMethod ?? "api_key") === "api_key" && (
            <ApiKeyForm
              hasKey={providers.anthropic.hasKey}
              onSave={handleAnthropicSaveKey}
              onTest={handleAnthropicTest}
            />
          )}

          {(providers.anthropic.authMethod ?? "api_key") === "oauth" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                OAuth mode uses the Claude Agent SDK&apos;s built-in authentication.
                Requires an active Claude Max or Pro subscription.
              </p>
              <ConnectionTestControl onTest={handleAnthropicTest} />
            </div>
          )}

          {providers.anthropic.apiKeySource === "env" && (
            <p className="text-xs text-muted-foreground">
              Currently using API key from environment variable (ANTHROPIC_API_KEY).
            </p>
          )}
        </ProviderRow>
        </div>

        {/* OpenAI provider — controlled open state */}
        <div ref={openaiRowRef}>
        <ProviderRow
          name="OpenAI"
          oauthLabel="ChatGPT"
          provider={openAIProvider}
          defaultOpen={
            noneConfigured ||
            !openAIProvider.configured ||
            ((openAIProvider.authMethod ?? "api_key") === "oauth" &&
              !(openAIProvider.oauthConnected ?? false))
          }
          open={openAIOpen}
          onOpenChange={setOpenAIOpen}
        >
          <AuthMethodSelector
            value={openAIProvider.authMethod ?? "api_key"}
            onChange={handleOpenAIMethodChange}
            recommendedMethod={recommendedAuth}
            label="Codex App Server Authentication"
            options={[
              {
                id: "api_key",
                icon: Zap,
                title: "API Key",
                description: "Use an OpenAI API key for Codex App Server",
              },
              {
                id: "oauth",
                icon: Crown,
                title: "ChatGPT",
                description: "Use your ChatGPT plan with browser sign-in",
              },
            ]}
          />

          {(openAIProvider.authMethod ?? "api_key") === "oauth" ? (
            <OpenAIChatGPTAuthControl
              connected={openAIProvider.oauthConnected ?? false}
              account={openAIProvider.account ?? null}
              rateLimits={openAIProvider.rateLimits ?? null}
              initialLoginState={
                openAIProvider.login ?? {
                  phase: "idle",
                  loginId: null,
                  authUrl: null,
                  account: null,
                  rateLimits: null,
                  error: null,
                  startedAt: null,
                  updatedAt: new Date().toISOString(),
                }
              }
              onChanged={async () => {
                await fetchData();
              }}
              onLoginStateChange={setOpenAILoginState}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              API key mode authenticates Codex App Server directly and also powers OpenAI Direct.
            </p>
          )}

          <Separator />

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">OpenAI Direct API Key</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Used by the OpenAI Direct runtime. If Codex App Server is in API key mode, it shares this key.
              </p>
            </div>
            <ApiKeyForm
              hasKey={providers.openai.hasKey}
              onSave={handleOpenAISaveKey}
              onTest={handleOpenAIDirectTest}
              keyPrefix="sk-"
              placeholder="sk-..."
              maskedPrefix="sk-••••••"
              envVarName="OPENAI_API_KEY"
              testButtonLabel="Test OpenAI Direct"
            />
          </div>
        </ProviderRow>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Recommendation banner ──────────────────────────────────────────

function RecommendationBanner({
  preference,
  recommendation,
  ollama,
  onConfigure,
}: {
  preference: RoutingPreference;
  recommendation: RoutingRecommendation | null;
  ollama: OllamaState | null;
  onConfigure: (target: "anthropic" | "openai" | "ollama" | "chat") => void;
}) {
  if (!recommendation) {
    return (
      <div className="h-full rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Manual routing.</span>{" "}
          provider configuration stays as is. Pick a preference to get per-provider recommendations.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="routing-recommendation"
      className="h-full rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 space-y-2"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recommended for{" "}
        <span className="text-foreground normal-case">&quot;{preference}&quot;</span>
      </p>

      {recommendation.useOllama && recommendation.ollamaModel && ollama?.connected && (
        <RecommendationRow
          name="Ollama"
          badge={
            <span className="inline-flex min-w-0 max-w-[260px] shrink items-center gap-1 truncate rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs">
              <Cpu className="h-3 w-3 shrink-0" />
              <span className="truncate">{recommendation.ollamaModel} · local</span>
            </span>
          }
          hint="connected"
          configureLabel="Configure"
          onConfigure={() => onConfigure("ollama")}
        />
      )}

      <RecommendationRow
        name="Anthropic"
        badge={<AuthModelPair auth={recommendation.anthropic.auth} model={recommendation.anthropic.model} />}
        hint={null}
        configureLabel="Configure"
        onConfigure={() => onConfigure("anthropic")}
      />

      <RecommendationRow
        name="OpenAI"
        badge={<AuthModelPair auth={recommendation.openai.auth} model={recommendation.openai.model} />}
        hint={null}
        configureLabel="Configure"
        onConfigure={() => onConfigure("openai")}
      />

      <RecommendationRow
        name="Chat default"
        badge={
          <Badge
            variant="outline"
            className="min-w-0 max-w-[220px] truncate font-mono text-[11px] font-normal"
            title={recommendation.chatModel}
          >
            {recommendation.chatModel}
          </Badge>
        }
        hint="chat pane"
        configureLabel="Configure"
        onConfigure={() => onConfigure("chat")}
      />

      <p className="text-xs text-muted-foreground">You can override any of these in the provider rows or chat model selector.</p>
    </div>
  );
}

function RecommendationRow({
  name,
  badge,
  hint,
  configureLabel,
  onConfigure,
}: {
  name: string;
  badge: React.ReactNode;
  hint: string | null;
  configureLabel: string | null;
  onConfigure: (() => void) | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="w-24 shrink-0 truncate font-medium">{name}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {badge}
        {hint && (
          <span className="shrink-0 text-xs text-muted-foreground">· {hint}</span>
        )}
      </div>
      {configureLabel && onConfigure && (
        <button
          type="button"
          onClick={onConfigure}
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {configureLabel}
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function AuthModelPair({ auth, model }: { auth: AuthMethod; model: string }) {
  const meta = AUTH_CHIP_META[auth];
  const AuthIcon = meta.icon;
  return (
    <>
      <Badge variant="outline" className="shrink-0 gap-1 font-normal">
        <AuthIcon className="h-3 w-3" />
        {meta.label}
      </Badge>
      <Badge
        variant="outline"
        className="min-w-0 max-w-[220px] truncate font-mono text-[11px] font-normal"
        title={model}
      >
        {model}
      </Badge>
    </>
  );
}
