"use client";

import { Sparkline } from "@/components/charts/sparkline";
import { presentActivity } from "@/lib/dashboard/activity";

export interface ActivityEntry {
  id: string;
  event: string;
  payload: string | null;
  timestamp: string;
  taskTitle?: string;
}

interface ActivityFeedProps {
  entries: ActivityEntry[];
  hourlyActivity?: number[];
}

const eventColors: Record<string, string> = {
  message_start: "bg-status-running",
  content_block_start: "bg-status-running",
  content_block_delta: "bg-status-completed/70",
  tool_start: "bg-status-running",
  content_start: "bg-status-completed",
  content_delta: "bg-status-completed/70",
  completed: "bg-status-completed",
  error: "bg-status-failed",
};

export function ActivityFeed({ entries, hourlyActivity }: ActivityFeedProps) {
  const hourlyTotal = hourlyActivity?.reduce((total, value) => total + value, 0) ?? 0;
  const peak = hourlyActivity?.length ? Math.max(...hourlyActivity) : 0;

  return (
    <div>
      {hourlyActivity && (
        <div className="surface-card-muted mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3 rounded-md border p-3">
          <div>
            <p className="text-2xl font-bold tabular-nums">{hourlyTotal}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Events · 24h
            </p>
          </div>
          <div className="min-w-0">
            <Sparkline
              data={hourlyActivity}
              width={240}
              height={42}
              label="Agent activity over last 24 hours"
              className="w-full"
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">
              Peak {peak}/hour
            </p>
          </div>
        </div>
      )}
        {entries.length === 0 ? (
          <p
            className="text-sm text-muted-foreground py-4 text-center"
            aria-live="polite"
          >
            No recent agent activity.
          </p>
        ) : (
          <div className="space-y-0.5" aria-live="polite">
            {entries.slice(0, 4).map((entry) => {
              const presentation = presentActivity(entry.event, entry.payload);
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2.5 border-b border-border/50 py-2 last:border-b-0"
                >
                  <div
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${eventColors[entry.event] ?? "bg-muted-foreground"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium">{presentation.label}</span>
                      {entry.taskTitle && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {entry.taskTitle}
                        </span>
                      )}
                    </p>
                    <p
                      className="truncate text-xs text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {new Date(entry.timestamp).toLocaleTimeString()}
                      {presentation.detail ? ` · ${presentation.detail}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
