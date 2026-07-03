"use client";

import { useState } from "react";
import { Layout, Check, X, Sparkles, BarChart3, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ManifestKitId } from "@/lib/apps/registry";

const KIT_DESCRIPTIONS: Record<ManifestKitId, string> = {
  auto: "Auto-inferred from manifest shape",
  tracker: "Bento tiles for habit/finance trackers",
  coach: "Cadence-driven advisor surfaces",
  inbox: "Triage queue with cadence cards",
  research: "Knowledge-base layout with hero references",
  ledger: "Finance-leaning tile grid + KPIs",
  "workflow-hub": "Multi-blueprint dashboard with run history",
};

export type AppViewEditorChange =
  | { kind: "kit"; proposedKit: ManifestKitId }
  | {
      kind: "bindings";
      proposedBindingsSummary: string;
    }
  | {
      kind: "kpis";
      proposedKpiCount: number;
      proposedKpiSummary?: string;
    };

export interface AppViewEditorCardProps {
  appId: string;
  appName?: string;
  currentKit: ManifestKitId;
  change: AppViewEditorChange;
  /** 1-2 sentence justification rendered between the proposed change and the buttons. */
  rationale?: string;
  /**
   * Confirm callback. The card sets a `pending` state during the call so
   * the user cannot double-click. If the callback throws, the card stays
   * in a `failed` state with the error message inline.
   */
  onConfirm: () => void | Promise<void>;
  /** Cancel callback. Called synchronously; no pending state. */
  onCancel: () => void;
  /**
   * Visual status override — primarily for storybook-style inspection in tests.
   * When omitted, the card manages its own status.
   */
  statusOverride?: "idle" | "pending" | "applied" | "cancelled" | "failed";
  className?: string;
}

function ChangeIcon({ kind }: { kind: AppViewEditorChange["kind"] }) {
  if (kind === "kit") return <Layout className="h-4 w-4 text-primary" aria-hidden="true" />;
  if (kind === "bindings") return <Layers className="h-4 w-4 text-primary" aria-hidden="true" />;
  return <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />;
}

function describeChange(change: AppViewEditorChange): { headline: string; detail?: string } {
  switch (change.kind) {
    case "kit":
      return {
        headline: `Switch to "${change.proposedKit}" layout`,
        detail: KIT_DESCRIPTIONS[change.proposedKit],
      };
    case "bindings":
      return {
        headline: "Update view bindings",
        detail: change.proposedBindingsSummary,
      };
    case "kpis":
      return {
        headline: `${change.proposedKpiCount === 1 ? "Set 1 KPI tile" : `Set ${change.proposedKpiCount} KPI tiles`}`,
        detail: change.proposedKpiSummary,
      };
  }
}

/**
 * Inline chat card the LLM renders when it wants to propose a `view:`
 * mutation. Shows current kit, proposed change, optional rationale, and
 * confirm/cancel. Confirm calls back into the host (which will typically
 * invoke `set_app_view_kit` / `set_app_view_bindings` / `set_app_view_kpis`).
 *
 * Mirrors the visual language of `AppMaterializedCard` and
 * `ExtensionFallbackCard` so the chat stream stays consistent.
 */
export function AppViewEditorCard({
  appId,
  appName,
  currentKit,
  change,
  rationale,
  onConfirm,
  onCancel,
  statusOverride,
  className,
}: AppViewEditorCardProps) {
  const [internalStatus, setInternalStatus] = useState<
    "idle" | "pending" | "applied" | "cancelled" | "failed"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const status = statusOverride ?? internalStatus;

  const handleConfirm = async () => {
    if (status === "pending" || status === "applied") return;
    setInternalStatus("pending");
    setErrorMessage(null);
    try {
      await onConfirm();
      setInternalStatus("applied");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to apply change");
      setInternalStatus("failed");
    }
  };

  const handleCancel = () => {
    if (status === "pending") return;
    onCancel();
    setInternalStatus("cancelled");
  };

  const { headline, detail } = describeChange(change);
  const displayName = appName ?? appId;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 my-2 space-y-3",
        status === "applied" && "border-primary/50",
        status === "cancelled" && "opacity-60",
        status === "failed" && "border-destructive/50",
        className
      )}
      data-slot="app-view-editor-card"
      data-app-id={appId}
      data-status={status}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <ChangeIcon kind={change.kind} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="font-medium truncate">{displayName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">currently {currentKit}</span>
          </div>
          <p className="text-sm font-medium">{headline}</p>
          {detail && (
            <p className="text-xs text-muted-foreground">{detail}</p>
          )}
          {rationale && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground/90 pt-1">
              <Sparkles className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{rationale}</span>
            </p>
          )}
        </div>
      </div>

      {status !== "applied" && status !== "cancelled" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleConfirm}
            disabled={status === "pending"}
            aria-label={`Confirm view change for ${displayName}`}
          >
            <Check className="h-3 w-3 mr-1.5" aria-hidden="true" />
            {status === "pending" ? "Applying…" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            disabled={status === "pending"}
            aria-label={`Cancel view change for ${displayName}`}
          >
            <X className="h-3 w-3 mr-1.5" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      )}

      {status === "applied" && (
        <p className="text-xs text-primary flex items-center gap-1.5">
          <Check className="h-3 w-3" aria-hidden="true" />
          Applied
        </p>
      )}
      {status === "cancelled" && (
        <p className="text-xs text-muted-foreground">Cancelled. No changes written.</p>
      )}
      {status === "failed" && errorMessage && (
        <p className="text-xs text-destructive">Failed: {errorMessage}</p>
      )}
    </div>
  );
}
