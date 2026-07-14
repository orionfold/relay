"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleAlert, PackageCheck, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BudgetPolicyStatusBadge } from "./budget-policy-status-badge";
import type {
  BudgetPolicyHealth,
  UsageBudgetPolicyView,
} from "@/lib/schedules/budget-policies";
import type { AppBudgetPolicyRecommendation } from "@/lib/apps/registry";

interface DraftPolicy {
  enabled: boolean;
  onExceed: "pause" | "notify";
  maxCostPerRunUsd: string;
  maxCostPerDayUsd: string;
  maxCostPerMonthUsd: string;
  sourceRecommendationId: string | null;
}

function toInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function policyDraft(
  policy: UsageBudgetPolicyView | null,
  recommendation?: AppBudgetPolicyRecommendation
): DraftPolicy {
  return {
    enabled: policy?.enabled ?? true,
    onExceed: policy?.onExceed ?? recommendation?.onExceed ?? "pause",
    maxCostPerRunUsd: toInput(
      policy?.maxCostPerRunUsd ?? recommendation?.maxCostPerRunUsd
    ),
    maxCostPerDayUsd: toInput(
      policy?.maxCostPerDayUsd ?? recommendation?.maxCostPerDayUsd
    ),
    maxCostPerMonthUsd: toInput(
      policy?.maxCostPerMonthUsd ?? recommendation?.maxCostPerMonthUsd
    ),
    sourceRecommendationId:
      policy?.sourceRecommendationId ?? recommendation?.id ?? null,
  };
}

function asNullableNumber(value: string) {
  if (value.trim() === "") return null;
  return Number(value);
}

function formatUsd(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 4,
      }).format(value);
}

export function BudgetPolicyControl({
  title,
  description,
  scopeType,
  scopeId,
  policy,
  recommendations,
  endpoint,
  requestMode,
  onSnapshot,
}: {
  title: string;
  description?: string;
  scopeType: "app" | "schedule";
  scopeId: string;
  policy: UsageBudgetPolicyView | null;
  recommendations: AppBudgetPolicyRecommendation[];
  endpoint: string;
  requestMode: "app" | "schedule";
  onSnapshot: (snapshot: unknown) => void;
}) {
  const [editing, setEditing] = useState(policy !== null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DraftPolicy>(() => policyDraft(policy));

  useEffect(() => {
    setDraft(policyDraft(policy));
    if (policy) setEditing(true);
  }, [policy]);

  const hasLimit = useMemo(
    () =>
      [
        draft.maxCostPerRunUsd,
        draft.maxCostPerDayUsd,
        draft.maxCostPerMonthUsd,
      ].some((value) => asNullableNumber(value) !== null),
    [draft]
  );

  async function save(nextDraft: DraftPolicy, successMessage: string) {
    const rawLimits = [
      ["Per-run", nextDraft.maxCostPerRunUsd],
      ["Daily", nextDraft.maxCostPerDayUsd],
      ["Monthly", nextDraft.maxCostPerMonthUsd],
    ] as const;
    for (const [label, raw] of rawLimits) {
      if (raw.trim() === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error(`${label} limit must be a positive number`);
        return;
      }
    }
    const policyPayload = {
      enabled: nextDraft.enabled,
      onExceed: nextDraft.onExceed,
      maxCostPerRunUsd: asNullableNumber(nextDraft.maxCostPerRunUsd),
      maxCostPerDayUsd: asNullableNumber(nextDraft.maxCostPerDayUsd),
      maxCostPerMonthUsd: asNullableNumber(nextDraft.maxCostPerMonthUsd),
      sourceRecommendationId: nextDraft.sourceRecommendationId,
    };
    if (
      policyPayload.maxCostPerRunUsd === null &&
      policyPayload.maxCostPerDayUsd === null &&
      policyPayload.maxCostPerMonthUsd === null
    ) {
      toast.error("Enter at least one cost limit");
      return;
    }
    setSaving(true);
    try {
      const body =
        requestMode === "app"
          ? { scopeType, scopeId, policy: policyPayload }
          : policyPayload;
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Budget policy update failed");
      onSnapshot(data);
      setEditing(true);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Budget policy update failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        ...(requestMode === "app"
          ? { body: JSON.stringify({ scopeType, scopeId }) }
          : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Budget policy removal failed");
      const refreshed = await fetch(endpoint);
      if (!refreshed.ok) throw new Error("Budget policy refresh failed");
      onSnapshot(await refreshed.json());
      setEditing(false);
      toast.success("Budget policy removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Budget policy removal failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            <BudgetPolicyStatusBadge health={policy?.health ?? "none"} />
            {policy?.sourceRecommendationId && (
              <Badge variant="outline" className="text-muted-foreground">
                <PackageCheck className="mr-1 h-3 w-3" />
                Pack recommendation accepted
              </Badge>
            )}
          </div>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Set custom limits
          </Button>
        )}
      </div>

      {policy && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Last run</span>
            <p className="font-medium">{formatUsd(policy.usage.lastRunUsd)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Today</span>
            <p className="font-medium">{formatUsd(policy.usage.dailyUsd)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">This month</span>
            <p className="font-medium">{formatUsd(policy.usage.monthlyUsd)}</p>
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Pack recommendations — inactive until you accept
          </p>
          {recommendations.map((recommendation) => (
            <div
              key={recommendation.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
            >
              <span>
                {recommendation.maxCostPerRunUsd
                  ? `${formatUsd(recommendation.maxCostPerRunUsd)} / run · `
                  : ""}
                {recommendation.maxCostPerDayUsd
                  ? `${formatUsd(recommendation.maxCostPerDayUsd)} / day · `
                  : ""}
                {recommendation.maxCostPerMonthUsd
                  ? `${formatUsd(recommendation.maxCostPerMonthUsd)} / month · `
                  : ""}
                {recommendation.onExceed === "pause" ? "pause" : "notify"} on breach
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={saving || policy?.sourceRecommendationId === recommendation.id}
                onClick={() => {
                  const accepted = policyDraft(null, recommendation);
                  setDraft(accepted);
                  void save(accepted, "Pack budget recommendation accepted");
                }}
              >
                {policy?.sourceRecommendationId === recommendation.id
                  ? "Accepted"
                  : "Accept"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["maxCostPerRunUsd", "Per run"],
                ["maxCostPerDayUsd", "Per day"],
                ["maxCostPerMonthUsd", "Per month"],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`${scopeId}-${field}`} className="text-xs">
                  {label} (USD)
                </Label>
                <Input
                  id={`${scopeId}-${field}`}
                  type="number"
                  min="0.000001"
                  step="0.01"
                  inputMode="decimal"
                  value={draft[field]}
                  placeholder="No limit"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field]: event.target.value,
                      sourceRecommendationId: null,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={(enabled) =>
                    setDraft((current) => ({ ...current, enabled }))
                  }
                />
                Policy enabled
              </label>
              <label className="flex items-center gap-2 text-xs">
                On breach
                <select
                  className="surface-control h-8 rounded-md border border-input px-2"
                  value={draft.onExceed}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      onExceed: event.target.value as "pause" | "notify",
                    }))
                  }
                >
                  <option value="pause">Pause schedule</option>
                  <option value="notify">Notify only</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              {policy && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={saving}
                  onClick={() => void remove()}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              )}
              <Button
                size="sm"
                disabled={saving || !hasLimit}
                onClick={() => void save(draft, "Budget policy saved")}
              >
                <WalletCards className="mr-1 h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save policy"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {policy?.lastBreach && (
        <div className="mt-3 flex gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
          <span>{policy.lastBreach.message}</span>
        </div>
      )}
    </section>
  );
}
