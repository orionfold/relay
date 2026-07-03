"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChevronDown, AlertCircle } from "lucide-react";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import type { TaskStatus } from "@/lib/constants/task-status";
import type { RuntimeTaskSummary } from "@/lib/apps/view-kits/types";

interface LastRunSummary {
  id: string;
  status: TaskStatus;
  createdAt: number;
}

type CompactProps = {
  variant?: "compact";
  blueprintId: string;
  blueprintLabel: string;
  lastRun: LastRunSummary | null;
  runCount30d: number;
};

type HeroProps = {
  variant: "hero";
  task: RuntimeTaskSummary | null;
  previousRuns: RuntimeTaskSummary[];
  blueprintId?: string;
};

export type LastRunCardProps = CompactProps | HeroProps;

const statusVariant: Record<
  TaskStatus,
  "default" | "success" | "secondary" | "destructive" | "outline"
> = {
  running: "default",
  completed: "success",
  queued: "secondary",
  failed: "destructive",
  planned: "outline",
  cancelled: "outline",
};

/**
 * LastRunCard — two variants:
 *  - "compact" (default): one-line blueprint label + last status + run count.
 *    Used by Workflow Hub kit's `secondary` slot.
 *  - "hero": full markdown digest body + metadata footer + previous-runs
 *    disclosure. Used by Coach kit's hero slot.
 */
export function LastRunCard(props: LastRunCardProps) {
  if (props.variant === "hero") return <HeroVariant {...props} />;
  return <CompactVariant {...props} />;
}

function CompactVariant({ blueprintLabel, lastRun, runCount30d }: CompactProps) {
  return (
    <Card className="surface-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium truncate">
          {blueprintLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {lastRun ? (
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant[lastRun.status]}>
              {lastRun.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatAgo(lastRun.createdAt)}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">never run</p>
        )}
        <p className="text-xs text-muted-foreground">
          {runCount30d} {runCount30d === 1 ? "run" : "runs"} · last 30d
        </p>
      </CardContent>
    </Card>
  );
}

function HeroVariant({ task, previousRuns }: HeroProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!task) {
    return (
      <div className="surface-card rounded-xl p-6 text-center text-muted-foreground border">
        No digest yet. Click <strong>Run now</strong> to generate the first one.
      </div>
    );
  }

  if (task.status === "failed") {
    return (
      <div className="surface-card rounded-xl p-6 border border-destructive/50">
        <div className="flex items-center gap-2 text-destructive mb-2">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">Last run failed</span>
        </div>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
          {task.result ?? "(no error details)"}
        </pre>
        {previousRuns.length > 0 && (
          <PreviousRunsSheet
            runs={previousRuns}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
          />
        )}
      </div>
    );
  }

  return (
    <div className="surface-card rounded-xl p-6 space-y-4 border">
      <ErrorBoundary
        fallback={
          <pre className="text-xs whitespace-pre-wrap">{task.result}</pre>
        }
      >
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {task.result ?? ""}
          </ReactMarkdown>
        </div>
      </ErrorBoundary>
      <div className="flex items-center justify-between border-t pt-3">
        <Badge variant={statusVariant[task.status]}>{task.status}</Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(task.createdAt).toLocaleString()}
        </span>
      </div>
      {previousRuns.length > 0 && (
        <PreviousRunsSheet
          runs={previousRuns}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}
    </div>
  );
}

function PreviousRunsSheet({
  runs,
  open,
  onOpenChange,
}: {
  runs: RuntimeTaskSummary[];
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <ChevronDown className="h-3.5 w-3.5 mr-1" />
          Previous runs
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Previous runs</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-6 space-y-3 overflow-y-auto">
          {runs.map((r) => (
            <div key={r.id} className="surface-card rounded-lg p-3 border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{r.title}</span>
                <Badge variant="outline" className="text-xs">
                  {r.status}
                </Badge>
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                {r.result ?? "(no output)"}
              </pre>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatAgo(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}
