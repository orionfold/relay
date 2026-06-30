"use client";

// FROZEN SCOPE (_SPECS/feature-cut-freeze.md Target 4 · _IDEAS/reprioritze.md §4)
// 10 cells is the frozen surface; do not add cells or out-build Arena's machine
// monitor — Relay loses that fight on the same buyer's screen. Redirect telemetry
// energy to the Operations Receipt (outcome/SLA), not new live-host metrics.

import {
  Server,
  Cpu,
  ListChecks,
  CheckCircle2,
  XCircle,
  ShieldQuestion,
  FolderKanban,
  Workflow,
  Coins,
  Wallet,
  CircleAlert,
} from "lucide-react";
import { RailCell, formatMicros } from "./rail-cell";
import { useTelemetry } from "./use-telemetry";

// The standing instrument cluster: a single dense horizontal row beneath the app
// bar (mirrors `.hp-rail`). A cockpit for a multi-agent harness — eight real
// cells: HOST (folder · cpu/mem) · RUNTIME (label · sdk version) · TASKS
// (running + 24h activity spark) · THROUGHPUT (completed today + 7d spark) ·
// FAILURES (failed + 7d spark, red) · REVIEW (pending) · COST TODAY · COST TO
// DATE — plus a live/error status foot. No fabricated data: while loading, cells
// show "—"; on a poll error the last good snapshot stays visible and the foot
// flips to an explicit error pip. Static identity (cwd/runtime) is compressed
// into sub-lines so the live throughput signal owns the foreground.

// Compose the HOST sub-line from whatever live metrics the platform reports;
// falls back to git branch so the cell is never empty.
function hostSub(
  cpuLoadPct: number | null | undefined,
  memUsedPct: number | null | undefined,
  branch: string | null | undefined,
): string {
  const parts: string[] = [];
  if (cpuLoadPct != null) parts.push(`cpu ${cpuLoadPct}%`);
  if (memUsedPct != null) parts.push(`mem ${memUsedPct}%`);
  if (parts.length > 0) return parts.join(" · ");
  return branch ? `git:${branch}` : "no git";
}

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
        sub={hostSub(data?.host.cpuLoadPct, data?.host.memUsedPct, branch)}
      />
      <RailCell
        label="Runtime"
        icon={<Cpu aria-hidden />}
        loading={loading}
        value={data?.runtimeLabel ?? "—"}
        sub={
          data?.runtimeSdkVersion
            ? `sdk ${data.runtimeSdkVersion}`
            : data?.providerId ?? "not configured"
        }
      />
      <RailCell
        label="Tasks"
        icon={<ListChecks aria-hidden />}
        loading={loading}
        tone={(data?.tasksRunning ?? 0) > 0 ? "accent" : undefined}
        value={data?.tasksRunning ?? 0}
        sub="running"
        spark={data?.trends.agentActivity24h}
        sparkLabel="Agent activity, last 24h"
      />
      <RailCell
        label="Throughput"
        icon={<CheckCircle2 aria-hidden />}
        loading={loading}
        value={data?.completedToday ?? 0}
        sub="done today"
        spark={data?.trends.completions7d}
        sparkLabel="Completions, last 7 days"
      />
      <RailCell
        label="Failures"
        icon={<XCircle aria-hidden />}
        loading={loading}
        tone={(data?.tasksFailed ?? 0) > 0 ? "danger" : undefined}
        value={data?.tasksFailed ?? 0}
        sub="failed"
        spark={data?.trends.failures7d}
        sparkColor="var(--status-failed)"
        sparkLabel="Failures, last 7 days"
      />
      <RailCell
        label="Review"
        icon={<ShieldQuestion aria-hidden />}
        loading={loading}
        tone={(data?.reviewPending ?? 0) > 0 ? "accent" : undefined}
        value={data?.reviewPending ?? 0}
        sub="pending"
      />
      <RailCell
        label="Projects"
        icon={<FolderKanban aria-hidden />}
        loading={loading}
        value={data?.activeProjects ?? 0}
        sub="active"
      />
      <RailCell
        label="Workflows"
        icon={<Workflow aria-hidden />}
        loading={loading}
        value={data?.activeWorkflows ?? 0}
        sub="active"
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
