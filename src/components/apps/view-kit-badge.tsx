"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { KitId, ViewKitHeaderMeta } from "@/lib/apps/view-kits/types";

const KIT_LABELS: Record<KitId, string> = {
  placeholder: "Basic",
  tracker: "Tracker",
  "workflow-hub": "Workflow Hub",
  coach: "Coach",
  ledger: "Ledger",
  inbox: "Inbox",
  research: "Research",
};

export function viewKitLabel(id: KitId): string {
  return `${KIT_LABELS[id]} view`;
}

export function ViewKitBadge({ resolution }: { resolution: ViewKitHeaderMeta }) {
  const label = viewKitLabel(resolution.id);
  const sourceLabel = resolution.source === "explicit" ? "selected by this app" : "inferred by Relay";
  const accessibleLabel = `${label}, ${sourceLabel}${resolution.diagnosticsHref ? ". Inspect selection" : ""}`;

  const badge = (
    <Badge
      variant="outline"
      className="mt-2 border-[var(--border-subtle)] bg-[var(--surface-2)] text-muted-foreground"
      aria-label={resolution.diagnosticsHref ? undefined : accessibleLabel}
    >
      {label}
      <span aria-hidden="true">·</span>
      <span>{resolution.source === "explicit" ? "Explicit" : "Inferred"}</span>
    </Badge>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {resolution.diagnosticsHref ? (
            <Link
              href={resolution.diagnosticsHref}
              aria-label={accessibleLabel}
              className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {badge}
            </Link>
          ) : (
            badge
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p>{resolution.explanation}</p>
          <p className="mt-1 opacity-80">
            {resolution.diagnosticsHref
              ? "Open the deterministic selection trace."
              : "Enable app view diagnostics in Settings to inspect the selection trace."}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
