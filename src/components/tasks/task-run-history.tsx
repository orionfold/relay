"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, History, Radio } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatusChip } from "@/components/shared/status-chip";
import { formatCompactDateTime, formatTime } from "@/lib/utils/format-timestamp";
import type {
  TaskRunHistory as TaskRunHistoryData,
  TaskRunHistoryItem,
  TaskRunLog,
} from "@/lib/tasks/run-history";

interface TaskRunHistoryProps {
  taskId: string;
  history: TaskRunHistoryData;
  error?: string | null;
}

const ACTIVITY_LABELS: Record<string, string> = {
  current_run: "Current run",
  task_run: "Task run",
  task_resume: "Resumed run",
  workflow_step: "Workflow run",
  scheduled_firing: "Scheduled run",
  recorded_activity: "Recorded activity",
};

const EVENT_LABELS: Record<string, string> = {
  started: "Started",
  runtime_selected: "Runtime selected",
  resumed: "Resumed",
  session_resumed: "Session resumed",
  runtime_fallback: "Runtime fallback",
  runtime_launch_failed: "Launch failed",
  response_progress: "Response",
  tool_start: "Tool started",
  screenshot: "Screenshot",
  permission_pending: "Permission needed",
  permission_approved: "Permission approved",
  permission_denied: "Permission denied",
  permission_answered: "Permission answered",
  usage_accounting_partial: "Usage warning",
  completed: "Completed",
  failed: "Failed",
  error: "Error",
  cancelled: "Cancelled",
};

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "In progress";
  const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatTokens(tokens: number): string {
  return tokens >= 1_000 ? `${(tokens / 1_000).toFixed(1)}K tokens` : `${tokens} tokens`;
}

function payloadText(payload: string | null): { preview: string; detail: string | null } {
  if (!payload) return { preview: "", detail: null };
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const candidate =
      parsed.selectionReason ??
      parsed.error ??
      parsed.result ??
      parsed.text ??
      parsed.tool ??
      parsed.message ??
      parsed.title;
    const preview = typeof candidate === "string" ? candidate : payload;
    return {
      preview: preview.replace(/\s+/g, " ").slice(0, 120),
      detail: JSON.stringify(parsed, null, 2),
    };
  } catch {
    return {
      preview: payload.replace(/\s+/g, " ").slice(0, 120),
      detail: payload,
    };
  }
}

function RunLog({ log }: { log: TaskRunLog }) {
  const payload = payloadText(log.payload);
  return (
    <details className="group/log border-b border-border-subtle last:border-b-0">
      <summary
        data-interactive-surface=""
        data-interactive-outline="preserve"
        className="interactive-list-item grid list-none grid-cols-[4rem_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[4rem_8rem_minmax(0,1fr)_auto]"
        onKeyDown={(event) => {
          const details = event.currentTarget.parentElement as HTMLDetailsElement | null;
          if ((event.key === "Enter" || event.key === " ") && details) {
            event.preventDefault();
            details.open = !details.open;
          }
        }}
      >
        <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
          {formatTime(log.timestamp)}
        </span>
        <span className="min-w-0 truncate text-foreground" title={EVENT_LABELS[log.event] ?? log.event}>
          {EVENT_LABELS[log.event] ?? log.event.replaceAll("_", " ")}
          {(log.eventCount ?? 1) > 1 && (
            <span className="ml-1 text-muted-foreground">×{log.eventCount}</span>
          )}
          {log.payloadTruncated && (
            <span className="ml-1 text-status-warning">trimmed</span>
          )}
        </span>
        <span className="col-span-2 col-start-2 min-w-0 truncate text-muted-foreground sm:col-span-1 sm:col-start-auto">
          {payload.preview || log.agentType}
        </span>
        {payload.detail && (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/log:rotate-180" aria-hidden="true" />
        )}
      </summary>
      {payload.detail && (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap border-t border-border-subtle bg-[var(--surface-3)] px-3 py-2 text-xs text-muted-foreground">
          {payload.detail}
        </pre>
      )}
    </details>
  );
}

function RunAttempt({
  run,
  initiallyOpen,
}: {
  run: TaskRunHistoryItem;
  initiallyOpen: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && detailsRef.current) {
      detailsRef.current.open = initiallyOpen;
      initialized.current = true;
    }
  }, [initiallyOpen]);

  return (
    <details
      ref={detailsRef}
      className="group/run"
    >
      <summary
        data-interactive-surface=""
        data-interactive-outline="preserve"
        className="interactive-list-item flex list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && detailsRef.current) {
            event.preventDefault();
            detailsRef.current.open = !detailsRef.current.open;
          }
        }}
      >
        <StatusChip status={run.status} family="lifecycle" />
        <span className="text-sm font-medium">
          {ACTIVITY_LABELS[run.activityType] ?? "Task run"}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatCompactDateTime(run.startedAt)}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatDuration(run.startedAt, run.finishedAt)}
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
          {[run.runtimeId, run.modelId, run.totalTokens != null ? formatTokens(run.totalTokens) : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {!run.current && run.usageCompleteness !== "complete" && (
          <span className="text-xs font-medium text-status-warning">
            {run.usageCompleteness === "partial" ? "Partial usage" : "Usage unavailable"}
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/run:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border-subtle bg-[var(--surface-2)] p-3">
        {run.logs.length > 0 ? (
          <div className="surface-scroll overflow-hidden rounded-lg border border-border">
            {run.logs.map((log) => <RunLog key={log.id} log={log} />)}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            {run.current
              ? "Waiting for the first recorded event…"
              : "Detailed logs are unavailable and may have been pruned."}
          </p>
        )}
      </div>
    </details>
  );
}

export function TaskRunHistory({ taskId, history, error }: TaskRunHistoryProps) {
  const hasNoRuns = history.runs.length === 0;
  const hasCurrentRun = history.runs.some((run) => run.current);

  return (
    <section className="surface-card overflow-hidden rounded-xl" aria-labelledby="task-run-history-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <SectionHeading className="mb-1" >
            <span id="task-run-history-heading" className="inline-flex items-center gap-2">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Run history
            </span>
          </SectionHeading>
          <p className="text-xs text-muted-foreground">
            Semantic attempts and events. Monitor retains the raw diagnostic stream.
          </p>
        </div>
        <Link
          href={`/monitor?taskId=${encodeURIComponent(taskId)}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          {hasCurrentRun ? "Open live monitor" : "View Monitor logs"}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {error && (
        <p role="alert" className="border-b border-status-failed/30 bg-status-failed/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {hasNoRuns ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm font-medium">
            {history.historyUnavailable ? "Run history unavailable" : "No runs yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {history.historyUnavailable
              ? "This task reached a final state, but its execution records and logs are no longer available."
              : "Run this task to record its first execution attempt here."}
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border" aria-label="Task execution attempts">
          {history.runs.map((run, index) => (
            <li key={run.id}>
              <RunAttempt run={run} initiallyOpen={index === 0} />
            </li>
          ))}
        </ol>
      )}

      {(history.omittedRuns > 0 || history.logsTruncated) && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {history.omittedRuns > 0 && `${history.omittedRuns} older run${history.omittedRuns === 1 ? "" : "s"} omitted. `}
          {history.logsTruncated && "Only the most recent semantic events are shown; Monitor retains raw diagnostics."}
        </p>
      )}
    </section>
  );
}
