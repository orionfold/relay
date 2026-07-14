import { CheckCircle, XCircle, Loader2, Clock } from "lucide-react";
import type { TimelineRun } from "@/lib/apps/view-kits/types";
import { formatTimestamp } from "@/lib/utils/format-timestamp";

interface RunHistoryTimelineProps {
  runs: TimelineRun[];
  onSelect?: (runId: string) => void;
  emptyHint?: string;
}

const STATUS_ICON: Record<TimelineRun["status"], typeof CheckCircle> = {
  completed: CheckCircle,
  failed: XCircle,
  running: Loader2,
  queued: Clock,
};

const STATUS_COLOR: Record<TimelineRun["status"], string> = {
  completed: "text-status-completed",
  failed: "text-status-failed",
  running: "text-status-running",
  queued: "text-muted-foreground",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}


export function RunHistoryTimeline({
  runs,
  onSelect,
  emptyHint,
}: RunHistoryTimelineProps) {
  if (runs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-lg">
        {emptyHint ?? "No runs yet"}
      </div>
    );
  }

  return (
    <ol className="space-y-2" role="list">
      {runs.map((run) => {
        const Icon = STATUS_ICON[run.status];
        const colorClass = STATUS_COLOR[run.status];
        const inner = (
          <span className="flex items-center gap-3 w-full text-left">
            <Icon
              className={`h-4 w-4 shrink-0 ${colorClass} ${
                run.status === "running" ? "animate-spin" : ""
              }`}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">
              <span className="text-xs text-muted-foreground capitalize">
                {run.status}
              </span>
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatTimestamp(run.startedAt)}
            </span>
            {run.durationMs !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDuration(run.durationMs)}
              </span>
            )}
          </span>
        );

        return (
          <li
            key={run.id}
            role="listitem"
            className="border rounded-lg p-2"
            data-run-id={run.id}
            data-run-status={run.status}
          >
            {onSelect ? (
              <button
                type="button"
                data-interactive-surface=""
                data-interactive-outline="preserve"
                className="interactive-list-item w-full text-left focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                onClick={() => onSelect(run.id)}
              >
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}
