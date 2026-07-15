"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, ShieldAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import type { BudgetPolicy, ClaudeOAuthPlan } from "@/lib/validators/settings";
import type { BudgetSnapshot, BudgetWindowStatus } from "@/lib/settings/budget-guardrails";
import type { RuntimeSetupState } from "@/lib/settings/runtime-setup";
import { PricingRegistryPanel } from "./pricing-registry-panel";

interface BudgetFormState {
  overallMonthlySpendCapUsd: string;
  runtimes: Record<
    AgentRuntimeId,
    {
      monthlySpendCapUsd: string;
      claudeOAuthPlan?: ClaudeOAuthPlan;
    }
  >;
}

function toInputValue(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function buildFormState(policy: BudgetPolicy): BudgetFormState {
  return {
    overallMonthlySpendCapUsd: toInputValue(policy.overall.monthlySpendCapUsd),
    runtimes: {
      "claude-code": {
        monthlySpendCapUsd: toInputValue(
          policy.runtimes["claude-code"].monthlySpendCapUsd
        ),
        claudeOAuthPlan: policy.runtimes["claude-code"].claudeOAuthPlan,
      },
      "openai-codex-app-server": {
        monthlySpendCapUsd: toInputValue(
          policy.runtimes["openai-codex-app-server"].monthlySpendCapUsd
        ),
      },
      "anthropic-direct": {
        monthlySpendCapUsd: toInputValue(
          policy.runtimes["anthropic-direct"].monthlySpendCapUsd
        ),
      },
      "openai-direct": {
        monthlySpendCapUsd: toInputValue(
          policy.runtimes["openai-direct"].monthlySpendCapUsd
        ),
      },
      ollama: {
        monthlySpendCapUsd: "", // Ollama is always $0
      },
      litellm: {
        monthlySpendCapUsd: toInputValue(
          policy.runtimes.litellm.monthlySpendCapUsd
        ),
      },
      lmstudio: {
        monthlySpendCapUsd: toInputValue(
          policy.runtimes.lmstudio.monthlySpendCapUsd
        ),
      },
    },
  };
}

function buildPayload(form: BudgetFormState): BudgetPolicy {
  return {
    overall: {
      monthlySpendCapUsd: toNullableNumber(form.overallMonthlySpendCapUsd),
    },
    runtimes: {
      "claude-code": {
        monthlySpendCapUsd: toNullableNumber(
          form.runtimes["claude-code"].monthlySpendCapUsd
        ),
        claudeOAuthPlan: form.runtimes["claude-code"].claudeOAuthPlan,
      },
      "openai-codex-app-server": {
        monthlySpendCapUsd: toNullableNumber(
          form.runtimes["openai-codex-app-server"].monthlySpendCapUsd
        ),
      },
      "anthropic-direct": {
        monthlySpendCapUsd: toNullableNumber(
          form.runtimes["anthropic-direct"].monthlySpendCapUsd
        ),
      },
      "openai-direct": {
        monthlySpendCapUsd: toNullableNumber(
          form.runtimes["openai-direct"].monthlySpendCapUsd
        ),
      },
      ollama: {
        monthlySpendCapUsd: null, // Ollama is always $0 — no budget needed
      },
      litellm: {
        monthlySpendCapUsd: toNullableNumber(
          form.runtimes.litellm.monthlySpendCapUsd
        ),
      },
      lmstudio: {
        monthlySpendCapUsd: toNullableNumber(
          form.runtimes.lmstudio.monthlySpendCapUsd
        ),
      },
    },
  };
}

function formatCurrencyUsd(value: number | null) {
  if (value == null) {
    return "Unlimited";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatMicrosAsUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 1_000_000 ? 2 : 4,
  }).format(value / 1_000_000);
}

function formatResetAt(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SectionEyebrow({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}

function getStatus(
  statuses: BudgetWindowStatus[],
  scopeId: string,
  window: "daily" | "monthly"
) {
  return statuses.find(
    (status) => status.scopeId === scopeId && status.window === window
  );
}

function roundUsd(value: number) {
  return Math.round(value * 100) / 100;
}

function deriveClaudeAllocation(form: BudgetFormState) {
  const overall = toNullableNumber(form.overallMonthlySpendCapUsd);
  const claude = toNullableNumber(form.runtimes["claude-code"].monthlySpendCapUsd);
  const openai = toNullableNumber(
    form.runtimes["openai-codex-app-server"].monthlySpendCapUsd
  );

  if (overall == null || overall <= 0) {
    return 50;
  }

  const total = (claude ?? 0) + (openai ?? 0);
  if (total <= 0) {
    return 50;
  }

  return Math.round(((claude ?? 0) / total) * 100);
}

function applyBudgetSplit(
  current: BudgetFormState,
  overallMonthlySpendCapUsd: string,
  activeRuntimeIds: AgentRuntimeId[],
  anthropicPercent = deriveClaudeAllocation(current)
): BudgetFormState {
  const overall = toNullableNumber(overallMonthlySpendCapUsd);
  const next: BudgetFormState = {
    overallMonthlySpendCapUsd,
    runtimes: {
      ...current.runtimes,
      "claude-code": { ...current.runtimes["claude-code"] },
      "openai-codex-app-server": {
        ...current.runtimes["openai-codex-app-server"],
      },
      "anthropic-direct": { ...current.runtimes["anthropic-direct"] },
      "openai-direct": { ...current.runtimes["openai-direct"] },
    },
  };

  if (overall == null || activeRuntimeIds.length === 0) {
    for (const runtimeId of Object.keys(next.runtimes) as AgentRuntimeId[]) {
      next.runtimes[runtimeId].monthlySpendCapUsd = "";
    }
    return next;
  }

  // Compatible runtimes use the overall cap unless a future allocation UI
  // explicitly assigns them a share. Do not silently double-count the budget.
  next.runtimes.litellm.monthlySpendCapUsd = "";
  next.runtimes.lmstudio.monthlySpendCapUsd = "";

  // Determine which providers have active runtimes
  const hasAnthropic = activeRuntimeIds.some(
    (id) => id === "claude-code" || id === "anthropic-direct"
  );
  const hasOpenAI = activeRuntimeIds.some(
    (id) => id === "openai-codex-app-server" || id === "openai-direct"
  );

  if (!hasAnthropic && !hasOpenAI) {
    return next;
  }

  if (hasAnthropic && !hasOpenAI) {
    // Single provider: Anthropic gets 100%
    const cap = String(overall);
    next.runtimes["claude-code"].monthlySpendCapUsd = cap;
    next.runtimes["anthropic-direct"].monthlySpendCapUsd = cap;
    next.runtimes["openai-codex-app-server"].monthlySpendCapUsd = "";
    next.runtimes["openai-direct"].monthlySpendCapUsd = "";
    return next;
  }

  if (hasOpenAI && !hasAnthropic) {
    // Single provider: OpenAI gets 100%
    const cap = String(overall);
    next.runtimes["openai-codex-app-server"].monthlySpendCapUsd = cap;
    next.runtimes["openai-direct"].monthlySpendCapUsd = cap;
    next.runtimes["claude-code"].monthlySpendCapUsd = "";
    next.runtimes["anthropic-direct"].monthlySpendCapUsd = "";
    return next;
  }

  // Both providers: split by anthropicPercent
  const anthropicCap = roundUsd(overall * (anthropicPercent / 100));
  const openAICap = roundUsd(Math.max(overall - anthropicCap, 0));

  // Both runtimes under a provider share the provider's allocation
  next.runtimes["claude-code"].monthlySpendCapUsd = String(anthropicCap);
  next.runtimes["anthropic-direct"].monthlySpendCapUsd = String(anthropicCap);
  next.runtimes["openai-codex-app-server"].monthlySpendCapUsd = String(openAICap);
  next.runtimes["openai-direct"].monthlySpendCapUsd = String(openAICap);
  return next;
}

const CLAUDE_PLAN_LABELS: Record<ClaudeOAuthPlan, string> = {
  pro: "Pro",
  max_5x: "Max 5x",
  max_20x: "Max 20x",
};

export function BudgetGuardrailsSection() {
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [form, setForm] = useState<BudgetFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchSnapshot() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/budgets");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.formErrors?.[0] ?? "Failed to load budget settings");
      }

      const parsed = data as BudgetSnapshot;
      setSnapshot(parsed);
      setForm(buildFormState(parsed.policy));
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load budget settings"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSnapshot();
  }, []);

  async function handleSave() {
    if (!form) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.formErrors?.[0] ?? "Failed to save budget settings");
      }

      const parsed = data as BudgetSnapshot;
      setSnapshot(parsed);
      setForm(buildFormState(parsed.policy));
      toast.success("Budget guardrails updated");
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Failed to save budget settings";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const activeRuntimes = useMemo(() => {
    if (!snapshot) {
      return [] as RuntimeSetupState[];
    }
    return Object.values(snapshot.runtimeStates).filter((runtime) => runtime.configured);
  }, [snapshot]);

  if (loading || !snapshot || !form) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Cost &amp; Usage Guardrails</CardTitle>
          <CardDescription>Loading budget policy, runtime setup, and pricing data.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const overallDaily = getStatus(snapshot.statuses, "overall", "daily");
  const overallMonthly = getStatus(snapshot.statuses, "overall", "monthly");
  const blocked = snapshot.statuses.filter((status) => status.health === "blocked");
  const warnings = snapshot.statuses.filter((status) => status.health === "warning");
  const anthropicAllocation = deriveClaudeAllocation(form);
  const claudeRuntime = snapshot.runtimeStates["claude-code"];
  // Show split slider when both providers have active runtimes
  const hasAnthropicRuntimes = activeRuntimes.some(
    (r) => r.providerId === "anthropic"
  );
  const hasOpenAIRuntimes = activeRuntimes.some(
    (r) => r.providerId === "openai"
  );
  const showSplitSlider = hasAnthropicRuntimes && hasOpenAIRuntimes;
  const activeProviderIds = new Set(
    activeRuntimes.map((runtime) => runtime.providerId)
  );
  const providerCapLabel =
    activeProviderIds.size === 1
      ? activeRuntimes[0]?.label ?? "Configured runtime"
      : "All configured runtimes";
  const usageAccountingIncomplete =
    snapshot.meteredSpend.dailyCompleteness !== "complete" ||
    snapshot.meteredSpend.monthlyCompleteness !== "complete";

  return (
    <Card className="surface-card">
      <CardHeader className="space-y-4">
        <div className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Cost &amp; Usage Guardrails
          </CardTitle>
          <CardDescription>
            Set one monthly budget, let Orionfold Relay derive daily pacing, and keep provider spend
            splits aligned with the runtimes you actually have configured.
          </CardDescription>
        </div>

        {usageAccountingIncomplete && (
          <div className="surface-card-muted rounded-xl border border-status-warning/25 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-status-warning" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Usage accounting is partial</p>
                <p className="text-sm text-muted-foreground">
                  Budget pacing uses the known minimum and may understate actual spend until every runtime reports complete delegated usage.
                </p>
              </div>
            </div>
          </div>
        )}

        {blocked.length > 0 ? (
          <div className="surface-card-muted rounded-2xl border border-destructive/20 bg-destructive/8 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Spend is currently blocked</p>
                <p className="text-sm text-muted-foreground">
                  {blocked[0]?.scopeLabel} hit its {blocked[0]?.window} cap. New paid work stays
                  blocked until the next reset.
                </p>
              </div>
            </div>
          </div>
        ) : warnings.length > 0 ? (
          <div className="surface-card-muted rounded-2xl border border-status-warning/25 bg-status-warning/8 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-status-warning" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Spend is approaching a cap</p>
                <p className="text-sm text-muted-foreground">
                  {warnings[0]?.scopeLabel} is close to its {warnings[0]?.window} spend limit.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        {activeRuntimes.length === 0 ? (
          <div className="surface-panel rounded-2xl p-4 text-sm text-muted-foreground">
            Configure Claude and/or OpenAI first. Guardrails adapt to the runtimes that are
            currently set up.
          </div>
        ) : (
          <>
            <div className="surface-panel rounded-2xl p-4">
              <div className="space-y-3">
                <div>
                  <SectionEyebrow icon={Wallet} label="Monthly Budget" />
                  <h3 className="mt-1 text-sm font-semibold">Overall spend cap</h3>
                  <p className="text-xs text-muted-foreground">
                    Leave blank to keep spend unlimited. Daily pacing is derived automatically.
                  </p>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Monthly spend cap (USD)</span>
                  <Input
                    className="surface-control"
                    inputMode="decimal"
                    placeholder="Unlimited"
                    value={form.overallMonthlySpendCapUsd}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? applyBudgetSplit(
                              current,
                              event.target.value,
                              activeRuntimes.map((runtime) => runtime.runtimeId)
                            )
                          : current
                      )
                    }
                  />
                </label>
              </div>
            </div>

            {showSplitSlider ? (
              <div className="surface-panel rounded-2xl p-4">
                <div className="space-y-4">
                  <div>
                    <SectionEyebrow icon={ArrowRight} label="Provider Allocation" />
                    <h3 className="mt-1 text-sm font-semibold">Split the monthly cap</h3>
                    <p className="text-xs text-muted-foreground">
                      Adjust one slider. Orionfold Relay writes the provider cap figures for you.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">Anthropic</span>
                      <span className="text-muted-foreground">{anthropicAllocation}%</span>
                    </div>
                    <Slider
                      value={[anthropicAllocation]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(value) =>
                        setForm((current) =>
                          current
                            ? applyBudgetSplit(
                                current,
                                current.overallMonthlySpendCapUsd,
                                activeRuntimes.map((runtime) => runtime.runtimeId),
                                value[0] ?? 50
                              )
                            : current
                        )
                      }
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                        <p className="text-sm font-medium">Anthropic</p>
                        <p className="mt-1 text-lg font-semibold">
                          {formatCurrencyUsd(
                            toNullableNumber(form.runtimes["claude-code"].monthlySpendCapUsd)
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {anthropicAllocation}% — shared by Claude Code &amp; Anthropic Direct
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                        <p className="text-sm font-medium">OpenAI</p>
                        <p className="mt-1 text-lg font-semibold">
                          {formatCurrencyUsd(
                            toNullableNumber(form.runtimes["openai-codex-app-server"].monthlySpendCapUsd)
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {100 - anthropicAllocation}% — shared by Codex &amp; OpenAI Direct
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="surface-panel rounded-2xl p-4">
                <SectionEyebrow icon={Wallet} label="Provider Cap" />
                <h3 className="mt-1 text-sm font-semibold">
                  {providerCapLabel}
                </h3>
                <p className="mt-2 text-lg font-semibold">
                  {formatCurrencyUsd(
                    toNullableNumber(form.overallMonthlySpendCapUsd)
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Full monthly cap — single provider with{" "}
                  {activeRuntimes.length} runtime{activeRuntimes.length > 1 ? "s" : ""}.
                </p>
              </div>
            )}

            {claudeRuntime.configured && claudeRuntime.billingMode === "subscription" ? (
              <div className="surface-panel rounded-2xl p-4">
                <div className="space-y-3">
                  <div>
                    <SectionEyebrow icon={CalendarClock} label="Claude Plan" />
                    <h3 className="mt-1 text-sm font-semibold">Claude OAuth billing</h3>
                    <p className="text-xs text-muted-foreground">
                      Claude OAuth uses fixed monthly subscription pricing for budgeting instead
                      of token-priced usage.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_1fr]">
                    <Select
                      value={form.runtimes["claude-code"].claudeOAuthPlan ?? "pro"}
                      onValueChange={(value: ClaudeOAuthPlan) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                runtimes: {
                                  ...current.runtimes,
                                  "claude-code": {
                                    ...current.runtimes["claude-code"],
                                    claudeOAuthPlan: value,
                                  },
                                },
                              }
                            : current
                        )
                      }
                    >
                      <SelectTrigger className="surface-control">
                        <SelectValue placeholder="Select Claude plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CLAUDE_PLAN_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                      <p className="text-sm font-medium">Budget basis</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Dashboard pacing and guardrail enforcement use the selected plan price as
                        Claude&apos;s monthly cost basis. Activity and tokens still appear in audit
                        views.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <PricingRegistryPanel
              initialSnapshot={snapshot.pricing}
              showClaudePlans={claudeRuntime.billingMode === "subscription"}
            />

            <div className="surface-panel rounded-2xl p-4">
              <div className="space-y-3">
                <div>
                  <SectionEyebrow icon={ArrowRight} label="Live Status" />
                  <h3 className="mt-1 text-sm font-semibold">Current spend pacing</h3>
                  <p className="text-xs text-muted-foreground">
                    Derived daily pacing is recalculated from the monthly cap using the current
                    calendar month.
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Overall monthly spend
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {overallMonthly
                        ? `${formatMicrosAsUsd(overallMonthly.currentValue)} / ${overallMonthly.limitValue == null ? "Unlimited" : formatMicrosAsUsd(overallMonthly.limitValue)}`
                        : "Unavailable"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Resets {formatResetAt(snapshot.monthlyResetAtIso)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Today pace vs derived daily cap
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {overallDaily
                        ? `${formatMicrosAsUsd(overallDaily.currentValue)} / ${overallDaily.limitValue == null ? "Unlimited" : formatMicrosAsUsd(overallDaily.limitValue)}`
                        : "Unavailable"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Resets {formatResetAt(snapshot.dailyResetAtIso)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {activeRuntimes.map((runtime) => {
                    const monthlyStatus = getStatus(snapshot.statuses, runtime.runtimeId, "monthly");
                    const dailyStatus = getStatus(snapshot.statuses, runtime.runtimeId, "daily");

                    return (
                      <div
                        key={runtime.runtimeId}
                        className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{runtime.label}</p>
                            <Badge variant="outline">
                              {runtime.billingMode === "subscription" ? "Plan priced" : "Usage priced"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Monthly {monthlyStatus ? formatMicrosAsUsd(monthlyStatus.currentValue) : "Unavailable"}
                            {monthlyStatus?.limitValue != null
                              ? ` of ${formatMicrosAsUsd(monthlyStatus.limitValue)}`
                              : " of Unlimited"}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Today {dailyStatus ? formatMicrosAsUsd(dailyStatus.currentValue) : "Unavailable"}
                          {dailyStatus?.limitValue != null
                            ? ` / ${formatMicrosAsUsd(dailyStatus.limitValue)}`
                            : " / Unlimited"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Warning notifications fire once per window after 80% of a configured cap is reached.
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save guardrails"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
