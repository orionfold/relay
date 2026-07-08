import type * as React from "react";

import { StatusChip } from "@/components/shared/status-chip";
import type { StatusFamily } from "@/lib/constants/status-families";
import { cn } from "@/lib/utils";

type CardStatusToolbarTone =
  | "neutral"
  | "running"
  | "completed"
  | "failed"
  | "warning"
  | "primary";

const toneClass: Record<CardStatusToolbarTone, string> = {
  neutral: "bg-muted/70 border-t-border/60 dark:bg-muted dark:border-t-border",
  running: "bg-status-running/8 border-t-status-running/15",
  completed: "bg-status-completed/10 border-t-status-completed/20",
  failed: "bg-status-failed/10 border-t-status-failed/20",
  warning: "bg-status-warning/10 border-t-status-warning/20",
  primary: "bg-primary/8 border-t-primary/15",
};

const lifecycleTone: Record<string, CardStatusToolbarTone> = {
  active: "running",
  running: "running",
  completed: "completed",
  failed: "failed",
  waiting: "warning",
  paused: "warning",
  queued: "warning",
  locked: "warning",
  pending_approval: "warning",
  needs_input: "warning",
  stalled: "neutral",
  cancelled: "neutral",
  draft: "neutral",
  planned: "neutral",
  ready: "neutral",
  installed: "completed",
};

interface CardStatusToolbarProps {
  status?: string;
  family?: StatusFamily;
  tone?: CardStatusToolbarTone;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  metaClassName?: string;
  actionsClassName?: string;
}

export function getCardStatusToolbarTone(status?: string): CardStatusToolbarTone {
  return status ? lifecycleTone[status] ?? "neutral" : "neutral";
}

export function CardStatusToolbar({
  status,
  family = "lifecycle",
  tone,
  meta,
  actions,
  children,
  className,
  contentClassName,
  metaClassName,
  actionsClassName,
}: CardStatusToolbarProps) {
  const resolvedTone = tone ?? getCardStatusToolbarTone(status);

  return (
    <div
      data-slot="card-status-toolbar"
      className={cn(
        "mt-auto flex h-9 items-center overflow-hidden border-t px-3 py-1 transition-colors",
        toneClass[resolvedTone],
        className
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[11px] font-medium text-muted-foreground",
          contentClassName
        )}
      >
        {status && (
          <StatusChip
            status={status}
            family={family}
            className="h-5 shrink-0 text-[11px] font-medium"
          />
        )}
        {meta && (
          <div
            className={cn(
              "flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap",
              metaClassName
            )}
          >
            {meta}
          </div>
        )}
        {children}
      </div>
      {actions && (
        <div className={cn("ml-2 flex shrink-0 items-center gap-1", actionsClassName)}>
          {actions}
        </div>
      )}
    </div>
  );
}
