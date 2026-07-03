"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ChevronDown, ChevronUp, Undo2, FolderOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/shared/status-chip";
import { cn } from "@/lib/utils";

export interface AppMaterializedCardProps {
  appId: string;
  name: string;
  primitives: string[];
  files?: string[];
  status?: "running" | "undone" | "failed";
  canUndo?: boolean;
  onUndo?: () => void | Promise<void>;
  className?: string;
}

/**
 * Inline chat card rendered when the assistant composes a new app.
 *
 * Self-extension "accept" surface per TDR-037 — no modal, capability
 * display is informational, copy is present-tense ("is live") to
 * match Calm Ops + strategy §6.
 */
export function AppMaterializedCard({
  appId,
  name,
  primitives,
  files = [],
  status = "running",
  canUndo = true,
  onUndo,
  className,
}: AppMaterializedCardProps) {
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [undoPending, setUndoPending] = useState(false);

  const statusLabel =
    status === "running" ? "is live" :
    status === "undone" ? "was undone" :
    "failed to materialize";

  const handleUndo = async () => {
    if (!onUndo || undoPending) return;
    setUndoPending(true);
    try {
      await onUndo();
    } finally {
      setUndoPending(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 my-2 space-y-3",
        status === "undone" && "opacity-60",
        className
      )}
      data-slot="app-materialized-card"
      data-app-id={appId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{name}</span>
              <span className="text-sm text-muted-foreground">{statusLabel}</span>
              {status === "running" && <StatusChip status="running" size="sm" />}
            </div>
            {primitives.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {primitives.join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="default" disabled={status !== "running"}>
          <Link href={`/apps/${appId}`} aria-label={`Open ${name}`}>
            <ExternalLink className="h-3 w-3 mr-1.5" aria-hidden="true" />
            Open app
          </Link>
        </Button>
        {files.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFilesExpanded((v) => !v)}
            aria-expanded={filesExpanded}
          >
            <FolderOpen className="h-3 w-3 mr-1.5" aria-hidden="true" />
            View files
            {filesExpanded ? (
              <ChevronUp className="h-3 w-3 ml-1" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1" aria-hidden="true" />
            )}
          </Button>
        )}
        {canUndo && status === "running" && onUndo && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUndo}
            disabled={undoPending}
            aria-label={`Undo ${name}`}
          >
            <Undo2 className="h-3 w-3 mr-1.5" aria-hidden="true" />
            {undoPending ? "Undoing…" : "Undo"}
          </Button>
        )}
      </div>

      {filesExpanded && files.length > 0 && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            Files written ({files.length})
          </p>
          <ul className="space-y-0.5">
            {files.map((f) => (
              <li
                key={f}
                className="text-xs font-mono text-muted-foreground truncate"
                title={f}
              >
                {f}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground/60 pt-1">
            Informational. These files are written under your control. No approval required.
          </p>
        </div>
      )}
    </div>
  );
}
