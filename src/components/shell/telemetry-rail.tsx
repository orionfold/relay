"use client";

import {
  Server,
  Cpu,
  ListChecks,
  ShieldQuestion,
  Coins,
  Wallet,
  CircleAlert,
} from "lucide-react";
import { RailCell, formatMicros } from "./rail-cell";
import { useTelemetry } from "./use-telemetry";

// The standing instrument cluster: a single dense horizontal row beneath the app
// bar (mirrors `.hp-rail`). Six real cells — HOST · RUNTIME · TASKS · REVIEW ·
// COST TODAY · COST TO DATE — plus a live/error status foot at the far right.
// No fabricated data: while loading, cells show "—"; on a poll error the last
// good snapshot stays visible and the foot flips to an explicit error pip.

export function TelemetryRail() {
  const telemetry = useTelemetry();
  const data = telemetry.data;
  const loading = telemetry.status === "loading";
  const errored = telemetry.status === "error";

  const branch = data?.host.branch ?? null;

  return (
    <div
      className="sticky top-16 z-20 flex h-[78px] flex-none items-stretch overflow-x-auto border-b border-border bg-[var(--surface-1)]"
      aria-label="Telemetry"
    >
      <RailCell
        label="Host"
        icon={<Server aria-hidden />}
        loading={loading}
        value={data?.host.folderName ?? "—"}
        sub={branch ? `git:${branch}` : "no git"}
      />
      <RailCell
        label="Runtime"
        icon={<Cpu aria-hidden />}
        loading={loading}
        value={data?.runtimeLabel ?? "—"}
        sub={data?.providerId ?? "not configured"}
      />
      <RailCell
        label="Tasks"
        icon={<ListChecks aria-hidden />}
        loading={loading}
        strong={(data?.tasksRunning ?? 0) > 0}
        value={data?.tasksRunning ?? 0}
        sub="running"
      />
      <RailCell
        label="Review"
        icon={<ShieldQuestion aria-hidden />}
        loading={loading}
        strong={(data?.reviewPending ?? 0) > 0}
        value={data?.reviewPending ?? 0}
        sub="pending"
      />
      <RailCell
        label="Cost Today"
        icon={<Coins aria-hidden />}
        loading={loading}
        value={data ? formatMicros(data.costTodayMicros) : "—"}
        sub="daily"
      />
      <RailCell
        label="Cost To Date"
        icon={<Wallet aria-hidden />}
        loading={loading}
        value={data ? formatMicros(data.costToDateMicros) : "—"}
        sub="monthly"
      />
      <div className="ml-auto flex items-center gap-2 px-4 font-mono text-xs text-muted-foreground/60">
        {errored ? (
          <>
            <CircleAlert
              className="h-3.5 w-3.5 text-[var(--status-failed)]"
              aria-hidden
            />
            <span className="text-[var(--status-failed)]">stale</span>
          </>
        ) : (
          <>
            <span
              className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--status-completed)]"
              aria-hidden
            />
            <span>{loading ? "syncing" : "live"}</span>
          </>
        )}
      </div>
    </div>
  );
}
