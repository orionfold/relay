"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Crown,
  DollarSign,
  Hand,
  RefreshCw,
  Save,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  RoutingPreference,
} from "@/lib/constants/settings";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import type {
  RoutingPolicyReadResult,
  RoutingPolicyV1,
} from "@/lib/settings/routing-policy";
import type { RuntimeRoutingStatus } from "@/lib/settings/runtime-routing-status";

export interface RoutingSettingsView extends RoutingPolicyReadResult {
  preference: RoutingPreference;
}

interface RuntimeRoutingControlProps {
  routing: RoutingSettingsView;
  statuses: RuntimeRoutingStatus[];
  onSaved: (routing: RoutingSettingsView) => void;
  onRefreshHealth: () => Promise<void>;
}

const ROUTING_OPTIONS: Array<{
  value: RoutingPreference;
  label: string;
  description: string;
  icon: typeof Zap;
}> = [
  {
    value: "latency",
    label: "Latency",
    description: "Use comparable generation-latency evidence when available; otherwise keep pool order.",
    icon: Zap,
  },
  {
    value: "cost",
    label: "Cost",
    description: "Prefer known comparable model prices. Unknown pricing is never treated as free.",
    icon: DollarSign,
  },
  {
    value: "quality",
    label: "Quality",
    description: "Honor profile and capability fit; unknown model quality stays tied in pool order.",
    icon: Crown,
  },
  {
    value: "manual",
    label: "Manual",
    description: "Use one strict default runtime without automatic fallback.",
    icon: Hand,
  },
];

const HEALTH_META = {
  healthy: { label: "Healthy", className: "bg-success/10 text-success" },
  unhealthy: { label: "Unavailable", className: "bg-destructive/10 text-destructive" },
  unconfigured: { label: "Not configured", className: "bg-muted text-muted-foreground" },
} as const;

function policyKey(preference: RoutingPreference, policy: RoutingPolicyV1): string {
  return JSON.stringify({ preference, policy });
}

function orderedStatuses(
  statuses: RuntimeRoutingStatus[],
  eligibleRuntimeIds: AgentRuntimeId[],
): RuntimeRoutingStatus[] {
  const byId = new Map(statuses.map((status) => [status.runtimeId, status]));
  const selected = eligibleRuntimeIds.flatMap((runtimeId) => {
    const status = byId.get(runtimeId);
    return status ? [status] : [];
  });
  const excluded = statuses.filter(
    (status) => !eligibleRuntimeIds.includes(status.runtimeId),
  );
  return [...selected, ...excluded];
}

function formatCostEvidence(value: number): string {
  return `$${(value / 1_000_000).toFixed(2)} combined input + output / 1M`;
}

export function RuntimeRoutingControl({
  routing,
  statuses,
  onSaved,
  onRefreshHealth,
}: RuntimeRoutingControlProps) {
  const routingKey = JSON.stringify(routing);
  const [preference, setPreference] = useState(routing.preference);
  const [policy, setPolicy] = useState<RoutingPolicyV1>(routing.policy);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreference(routing.preference);
    setPolicy(routing.policy);
    setError(null);
  }, [routingKey]);

  const dirty =
    routing.needsPersistence ||
    policyKey(preference, policy) !==
      policyKey(routing.preference, routing.policy);
  const rows = useMemo(
    () => orderedStatuses(statuses, policy.eligibleRuntimeIds),
    [statuses, policy.eligibleRuntimeIds],
  );
  const selectedStatuses = policy.eligibleRuntimeIds.flatMap((runtimeId) => {
    const status = statuses.find((candidate) => candidate.runtimeId === runtimeId);
    return status ? [status] : [];
  });
  const launchable = selectedStatuses.filter(
    (status) => status.configured && status.health === "healthy",
  );
  const previewOrder = [...launchable].sort((left, right) => {
    if (preference !== "cost") return 0;
    const leftKnown = left.comparableCostPerMillionMicros !== null;
    const rightKnown = right.comparableCostPerMillionMicros !== null;
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    if (leftKnown && rightKnown) {
      return (
        (left.comparableCostPerMillionMicros ?? 0) -
        (right.comparableCostPerMillionMicros ?? 0)
      );
    }
    return 0;
  });

  function toggleRuntime(runtimeId: AgentRuntimeId, selected: boolean) {
    setPolicy((current) => ({
      ...current,
      eligibleRuntimeIds: selected
        ? [...current.eligibleRuntimeIds, runtimeId]
        : current.eligibleRuntimeIds.filter((id) => id !== runtimeId),
    }));
  }

  function moveRuntime(runtimeId: AgentRuntimeId, direction: -1 | 1) {
    setPolicy((current) => {
      const next = [...current.eligibleRuntimeIds];
      const from = next.indexOf(runtimeId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= next.length) return current;
      [next[from], next[to]] = [next[to], next[from]];
      return { ...current, eligibleRuntimeIds: next };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preference, policy }),
      });
      const body = (await response.json().catch(() => ({}))) as
        | RoutingSettingsView
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : `Routing settings save failed (${response.status})`,
        );
      }
      onSaved(body as RoutingSettingsView);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Routing settings could not be saved",
      );
    } finally {
      setSaving(false);
    }
  }

  async function refreshHealth() {
    setRefreshing(true);
    setError(null);
    try {
      await onRefreshHealth();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Runtime health could not be refreshed",
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section aria-labelledby="task-routing-heading" className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div>
            <p
              id="task-routing-heading"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Task routing
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the selection policy separately from provider setup.
            </p>
          </div>
          <RadioGroup
            value={preference}
            onValueChange={(value) =>
              setPreference(value as RoutingPreference)
            }
            className="grid grid-cols-2 gap-2"
          >
            {ROUTING_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = option.value === preference;
              return (
                <Label
                  key={option.value}
                  htmlFor={`routing-${option.value}`}
                  className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 transition-colors hover:bg-accent/50 ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <RadioGroupItem
                    id={`routing-${option.value}`}
                    value={option.value}
                    className="sr-only"
                  />
                  <Icon
                    className={
                      selected
                        ? "h-4 w-4 shrink-0 text-primary"
                        : "h-4 w-4 shrink-0 text-muted-foreground"
                    }
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium">
                    {option.label}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            {
              ROUTING_OPTIONS.find((option) => option.value === preference)
                ?.description
            }
          </p>
        </div>

        <div className="surface-panel min-w-0 rounded-xl border border-border p-3 sm:p-4">
          {preference === "manual" ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Manual default</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tasks without an explicit runtime use this target strictly.
                  Relay will not substitute another runtime.
                </p>
              </div>
              <Label htmlFor="manual-default-runtime" className="text-xs">
                Default runtime
              </Label>
              <select
                id="manual-default-runtime"
                value={policy.manualDefaultRuntimeId}
                onChange={(event) =>
                  setPolicy((current) => ({
                    ...current,
                    manualDefaultRuntimeId: event.target
                      .value as AgentRuntimeId,
                  }))
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {statuses.map((status) => (
                  <option key={status.runtimeId} value={status.runtimeId}>
                    {status.label} — {HEALTH_META[status.health].label}
                  </option>
                ))}
              </select>
              {(() => {
                const selected = statuses.find(
                  (status) =>
                    status.runtimeId === policy.manualDefaultRuntimeId,
                );
                if (!selected) return null;
                return (
                  <RuntimeStatusDetail
                    status={selected}
                    selected={true}
                    position={null}
                  />
                );
              })()}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Eligible runtimes</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selected runtimes are considered in the saved order, then
                    filtered again for configuration, profile, capabilities,
                    and health at execution.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshHealth()}
                  disabled={refreshing}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {refreshing ? "Checking" : "Refresh health"}
                </Button>
              </div>

              <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  General-task preview
                </p>
                {policy.eligibleRuntimeIds.length === 0 ? (
                  <p className="mt-1 text-sm text-destructive" role="alert">
                    No eligible runtimes. Automatic tasks will fail visibly.
                  </p>
                ) : previewOrder.length === 0 ? (
                  <p className="mt-1 text-sm text-destructive" role="alert">
                    No selected runtime is currently configured and healthy.
                  </p>
                ) : (
                  <ol className="mt-1 space-y-1 text-sm">
                    {previewOrder.map((status, index) => (
                      <li key={status.runtimeId} className="flex min-w-0 gap-2">
                        <span className="w-4 shrink-0 tabular-nums text-muted-foreground">
                          {index + 1}.
                        </span>
                        <span className="min-w-0 truncate font-medium">
                          {status.label}
                        </span>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          {preference === "cost" &&
                          status.comparableCostPerMillionMicros !== null
                            ? formatCostEvidence(
                                status.comparableCostPerMillionMicros,
                              )
                            : preference === "cost"
                              ? "cost unknown"
                              : "pool order"}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {previewOrder.length > 0 && (
                  <p className="mt-2 text-xs font-medium">
                    {policy.automaticFallback
                      ? "Fallback on: Relay may advance through this order."
                      : "Fallback off: Relay will try only the first runtime."}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Profile affinity, task-named runtimes, required capabilities,
                  and current health can change the actual order. The run
                  receipt records the final reason and every skip.
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                {rows.map((status) => {
                  const selected = policy.eligibleRuntimeIds.includes(
                    status.runtimeId,
                  );
                  const position = selected
                    ? policy.eligibleRuntimeIds.indexOf(status.runtimeId)
                    : null;
                  return (
                    <div
                      key={status.runtimeId}
                      className="border-b border-border-subtle last:border-b-0"
                    >
                      <div className="interactive-list-item flex min-w-0 items-start gap-3 px-3 py-2.5 hover:bg-accent/50">
                        <Checkbox
                          id={`eligible-${status.runtimeId}`}
                          checked={selected}
                          onCheckedChange={(checked) =>
                            toggleRuntime(status.runtimeId, checked === true)
                          }
                          aria-label={`${selected ? "Exclude" : "Include"} ${status.label}`}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`eligible-${status.runtimeId}`}
                          className="min-w-0 flex-1"
                        >
                          <RuntimeStatusDetail
                            status={status}
                            selected={selected}
                            position={position}
                          />
                        </Label>
                        {selected && position !== null && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => moveRuntime(status.runtimeId, -1)}
                              disabled={position === 0}
                              aria-label={`Move ${status.label} earlier`}
                            >
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => moveRuntime(status.runtimeId, 1)}
                              disabled={
                                position === policy.eligibleRuntimeIds.length - 1
                              }
                              aria-label={`Move ${status.label} later`}
                            >
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Label className="flex items-start gap-2 rounded-lg border border-border px-3 py-2.5">
                <Checkbox
                  checked={policy.automaticFallback}
                  onCheckedChange={(checked) =>
                    setPolicy((current) => ({
                      ...current,
                      automaticFallback: checked === true,
                    }))
                  }
                  aria-label="Allow automatic fallback"
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">
                    Allow automatic fallback
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Try the next healthy compatible runtime in this pool. Never
                    applies to explicit or Manual targets.
                  </span>
                </span>
              </Label>

            </div>
          )}
        </div>
      </div>

      {(routing.repairReason || error) && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error ?? routing.repairReason}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Provider credentials and model defaults are never changed by this
          routing policy.
        </p>
        <Button type="button" onClick={() => void save()} disabled={!dirty || saving}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? "Saving routing" : "Save routing"}
        </Button>
      </div>
    </section>
  );
}

function RuntimeStatusDetail({
  status,
  selected,
  position,
}: {
  status: RuntimeRoutingStatus;
  selected: boolean;
  position: number | null;
}) {
  const health = HEALTH_META[status.health];
  return (
    <span className="block min-w-0">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-medium">{status.label}</span>
        {selected && position !== null && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            #{position + 1}
          </span>
        )}
        {!selected && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Excluded
          </span>
        )}
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${health.className}`}
        >
          {health.label}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
        {status.modelId ? `Model: ${status.modelId}` : "Model not selected"}
        {status.capabilitySummary.length > 0
          ? ` · ${status.capabilitySummary.join(", ")}`
          : ""}
        {status.checkedAt ? ` · Checked ${status.checkedAt.slice(11, 16)} UTC` : ""}
      </span>
      {(status.healthReason || status.capabilityLimits.length > 0) && (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {[status.healthReason, status.capabilityLimits.join(", ")]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </span>
  );
}
