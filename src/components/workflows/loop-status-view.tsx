"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandableResult } from "./shared/step-result";
import {
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
  Pause,
  Play,
  Clock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { LoopState, LoopConfig, LoopStopReason } from "@/lib/workflows/types";

interface LoopStatusViewProps {
  workflowId: string;
  workflowStatus: string;
  loopConfig: LoopConfig;
  loopState: LoopState | null;
  onRefresh: () => void;
}

const iterationStatusIcons: Record<string, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 text-status-running animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-status-completed" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
};

const stopReasonLabels: Record<LoopStopReason, string> = {
  max_iterations: "Max iterations reached",
  time_budget: "Time budget exhausted",
  agent_signaled: "Agent signaled completion",
  human_cancel: "Cancelled by user",
  human_pause: "Paused by user",
  error: "Error",
};

const stopReasonVariant: Record<LoopStopReason, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  max_iterations: "secondary",
  time_budget: "secondary",
  agent_signaled: "success",
  human_cancel: "outline",
  human_pause: "outline",
  error: "destructive",
};

export function LoopStatusView({
  workflowId,
  workflowStatus,
  loopConfig,
  loopState,
  onRefresh,
}: LoopStatusViewProps) {
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set());

  const currentIteration = loopState?.currentIteration ?? 0;
  const maxIterations = loopConfig.maxIterations;
  const progressPercent = Math.round((currentIteration / maxIterations) * 100);

  const isActive = workflowStatus === "active";
  const isPaused = workflowStatus === "paused";
  const isDraft = workflowStatus === "draft";

  async function handlePause() {
    setPausing(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      if (res.ok) {
        toast.success("Loop paused");
        onRefresh();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to pause");
      }
    } finally {
      setPausing(false);
    }
  }

  async function handleResume() {
    setResuming(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Loop resumed");
        onRefresh();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to resume");
      }
    } finally {
      setResuming(false);
    }
  }

  function toggleIteration(iteration: number) {
    setExpandedIterations((prev) => {
      const next = new Set(prev);
      if (next.has(iteration)) {
        next.delete(iteration);
      } else {
        next.add(iteration);
      }
      return next;
    });
  }

  // Time budget display
  let timeDisplay: React.ReactNode = null;
  if (loopConfig.timeBudgetMs && loopState) {
    const startTime = new Date(loopState.startedAt).getTime();
    const elapsed = loopState.completedAt
      ? new Date(loopState.completedAt).getTime() - startTime
      : Date.now() - startTime;
    const remaining = Math.max(0, loopConfig.timeBudgetMs - elapsed);
    timeDisplay = (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>
          {formatDuration(elapsed)} elapsed
          {remaining > 0 && isActive ? ` / ${formatDuration(remaining)} remaining` : ""}
        </span>
      </div>
    );
  }

  const iterations = loopState?.iterations ?? [];
  const reversedIterations = [...iterations].reverse();

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2">
        {isActive && (
          <Button size="sm" variant="outline" onClick={handlePause} disabled={pausing}>
            <Pause className="h-3 w-3 mr-1" />
            {pausing ? "Pausing..." : "Pause"}
          </Button>
        )}
        {(isPaused || isDraft) && (
          <Button size="sm" onClick={handleResume} disabled={resuming}>
            <Play className="h-3 w-3 mr-1" />
            {resuming ? "Resuming..." : isPaused ? "Resume" : "Execute"}
          </Button>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-mono text-xs">
            {currentIteration} / {maxIterations} iterations ({progressPercent}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {timeDisplay}
      </div>

      {/* Stop reason */}
      {loopState?.stopReason && (
        <Badge variant={stopReasonVariant[loopState.stopReason]}>
          {stopReasonLabels[loopState.stopReason]}
        </Badge>
      )}

      {/* Total duration */}
      {loopState?.totalDurationMs && (
        <p className="text-xs text-muted-foreground">
          Total duration: {formatDuration(loopState.totalDurationMs)}
        </p>
      )}

      {/* Iteration timeline */}
      {reversedIterations.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Iterations</p>
          <div className="space-y-1" aria-live="polite">
            {reversedIterations.map((iter) => {
              const isExpanded = expandedIterations.has(iter.iteration);
              return (
                <div key={iter.iteration} className="border rounded-lg">
                  <button
                    type="button"
                    data-interactive-surface=""
                    data-interactive-outline="preserve"
                    className="interactive-list-item w-full flex items-center gap-3 p-2.5 text-left rounded-lg"
                    onClick={() => toggleIteration(iter.iteration)}
                  >
                    <div className="flex-shrink-0">
                      {iterationStatusIcons[iter.status] ?? iterationStatusIcons.pending}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-sm font-medium">
                        Iteration {iter.iteration}
                      </span>
                      {iter.durationMs && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {formatDuration(iter.durationMs)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-2.5 pb-2.5 pt-0 space-y-1.5">
                      {iter.error && (
                        <p className="text-xs text-destructive">{iter.error}</p>
                      )}
                      {iter.result && (
                        <ExpandableResult result={iter.result} />
                      )}
                      {iter.taskId && (
                        <a
                          href={`/monitor?taskId=${iter.taskId}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View task logs
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
