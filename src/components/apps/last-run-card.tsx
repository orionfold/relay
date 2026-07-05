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
import { ChevronDown, AlertCircle, Sparkles, RefreshCw } from "lucide-react";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { RunNowButton } from "@/components/apps/run-now-button";
import { getWorkflowIconFromName } from "@/lib/constants/card-icons";
import type { TaskStatus } from "@/lib/constants/task-status";
import type { BlueprintCard, RuntimeTaskSummary } from "@/lib/apps/view-kits/types";

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
  const wfIcon = getWorkflowIconFromName(blueprintLabel, "sequence");
  return (
    <Card tone="blueprint" watermark={wfIcon.icon} watermarkColor={wfIcon.colors.icon}>
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

interface RunnableBlueprintCardProps {
  card: BlueprintCard;
  lastRun: LastRunSummary | null;
  runCount30d: number;
}

/**
 * FEAT-5/6: the runnable blueprint card on the app home. Renders the
 * blueprint's name + one-line description + last-run status + a Run action.
 * The "Start here" card is highlighted. Row-insert blueprints label their
 * automatic trigger instead of offering a manual Run that fights the contract.
 */
export function RunnableBlueprintCard({
  card,
  lastRun,
  runCount30d,
}: RunnableBlueprintCardProps) {
  const isRowInsert = card.trigger?.kind === "row-insert";

  // #31: an unresolved card is a husk — the registry had no definition for this
  // blueprint id, so `name` is the raw id and a Run button would fail downstream
  // at /instantiate. Surface the failure honestly (principle #1) rather than
  // rendering a fake action. `=== false` so a legacy card lacking the flag still
  // renders normally.
  if (card.resolved === false) {
    return (
      <Card className="surface-card border-destructive/30">
        <CardHeader className="pb-2 space-y-1.5">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {card.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px text-destructive" />
            <span>
              This workflow couldn&apos;t load. Its definition wasn&apos;t
              found. Reinstall the pack to restore it.
            </span>
          </p>
        </CardContent>
      </Card>
    );
  }

  // The card's own per-type glyph — resolved from the blueprint name — is used
  // as the top-right watermark (not a left icon chip), giving each card a
  // unique type identity behind its content.
  const wfIcon = getWorkflowIconFromName(card.name, "sequence");

  return (
    <Card
      tone="blueprint"
      emphasis={card.isPrimary ? "featured" : "none"}
      watermark={wfIcon.icon}
      watermarkColor={wfIcon.colors.icon}
    >
      <CardHeader className="pb-2 space-y-1.5">
        {card.isPrimary && (
          <Badge className="w-fit gap-1">
            <Sparkles className="h-3 w-3" />
            Start here
          </Badge>
        )}
        <CardTitle className="text-sm font-medium">{card.name}</CardTitle>
        {card.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {card.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {lastRun ? (
            <>
              <Badge variant={statusVariant[lastRun.status]}>
                {lastRun.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatAgo(lastRun.createdAt)}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">never run</span>
          )}
          <span className="text-xs text-muted-foreground">
            · {runCount30d} {runCount30d === 1 ? "run" : "runs"} · 30d
          </span>
        </div>
        {isRowInsert ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            Runs on its own when you add a row to the{" "}
            {card.trigger?.tableName ?? "linked"} table
          </p>
        ) : (
          <div className="space-y-1.5">
            <RunNowButton
              blueprintId={card.id}
              variables={card.variables}
              label="Run"
            />
            {/* CF-FEAT-5: name both verbs on EVERY card, not just the primary,
                so no card leaves the two buttons unexplained. The "Start here"
                card carries the fuller sentence (it may also mention the
                variable prompt); the rest carry a compact one-liner so the grid
                stays scannable (progressive disclosure). */}
            <p className="text-xs text-muted-foreground">
              {card.isPrimary
                ? card.variables.length > 0
                  ? "Run asks a few questions, then starts a workflow you can watch. Create workflow saves a draft to run later."
                  : "Run starts a workflow you can watch. Create workflow saves a draft to run later."
                : "Run starts it now. Create workflow saves a draft."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HeroVariant({ task, previousRuns }: HeroProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!task) {
    return (
      <div className="surface-card rounded-xl p-6 text-center text-muted-foreground border">
        No digest yet. Click <strong>Run</strong> to generate the first one.
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
