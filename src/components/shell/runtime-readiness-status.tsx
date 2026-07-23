"use client";

import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettingsGlance } from "./use-settings-glance";

type PresentationState = "checking" | "ready" | "degraded" | "setup-needed";

const META: Record<
  PresentationState,
  { dot: string; fallbackLabel: string }
> = {
  checking: {
    dot: "bg-muted-foreground/40",
    fallbackLabel: "Checking runtimes",
  },
  ready: { dot: "bg-success", fallbackLabel: "Runtime ready" },
  degraded: { dot: "bg-warning", fallbackLabel: "Runtime degraded" },
  "setup-needed": {
    dot: "bg-status-failed",
    fallbackLabel: "Runtime setup needed",
  },
};

export function RuntimeReadinessStatus() {
  const glance = useSettingsGlance();
  const summary = glance.data?.runtimeReadiness ?? null;
  const state: PresentationState = summary
    ? summary.state
    : glance.status === "loading"
      ? "checking"
      : "degraded";
  const meta = META[state];
  const label =
    summary?.label ??
    (glance.status === "error"
      ? "Runtime status unavailable"
      : meta.fallbackLabel);
  const detail =
    summary?.detail ??
    (glance.status === "error"
      ? `Runtime readiness could not be refreshed: ${glance.error}`
      : "Checking the eligible runtime pool.");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/settings#settings-providers"
          className="flex items-center gap-1.5"
          aria-label={`${label}. Open Providers and runtimes settings`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${meta.dot}`}
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="max-w-72 text-xs">{detail}</p>
      </TooltipContent>
    </Tooltip>
  );
}
