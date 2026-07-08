import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type FlagshipBadgeTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "muted";

const badgeToneClass: Record<FlagshipBadgeTone, string> = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  success: "border-status-completed/30 bg-status-completed/10 text-status-completed",
  warning: "border-status-warning/35 bg-status-warning/10 text-status-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted/50 text-muted-foreground",
};

export function FlagshipBadge({
  icon: Icon,
  tone = "muted",
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: FlagshipBadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-[11px]", badgeToneClass[tone], className)}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </Badge>
  );
}

export function FlagshipIconWell({
  icon: Icon,
  color,
  className,
}: {
  icon: LucideIcon;
  color?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/45",
        className
      )}
      style={
        color
          ? {
              color,
              backgroundColor: `color-mix(in oklch, ${color} 10%, var(--card))`,
              borderColor: `color-mix(in oklch, ${color} 24%, var(--border))`,
            }
          : undefined
      }
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function FlagshipCardActionRow({
  context,
  action,
  icon: Icon,
  className,
}: {
  context: React.ReactNode;
  action: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flagship-card-action-row relative mt-auto flex items-center justify-between gap-3 border-t border-border pt-3",
        className
      )}
    >
      <span className="min-w-0 text-[11px] text-muted-foreground">
        {context}
      </span>
      <div className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {action}
      </div>
    </div>
  );
}

export function FlagshipMetadataPill({
  icon: Icon,
  tone = "muted",
  children,
  className,
  title,
}: {
  icon?: LucideIcon;
  tone?: FlagshipBadgeTone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "flagship-metadata-pill inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        badgeToneClass[tone],
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </span>
  );
}
