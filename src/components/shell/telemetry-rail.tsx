"use client";

// FROZEN SCOPE (_SPECS/2026-06-29-211534_feature-cut-freeze.md Target 4 · _IDEAS/reprioritze.md §4)
// 10 cells is the frozen surface; do not add cells or out-build Arena's machine
// monitor — Relay loses that fight on the same buyer's screen. Redirect telemetry
// energy to the Operations Receipt (outcome/SLA), not new live-host metrics.

import { useCallback, useEffect, useRef, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RailCell, formatMicros } from "./rail-cell";
import { useTelemetry } from "./use-telemetry";
import { useInstanceIdentity } from "./use-instance-identity";
import type { TelemetrySnapshot } from "./telemetry-types";

// The standing instrument cluster: a single dense horizontal row beneath the app
// bar (mirrors `.hp-rail`). A cockpit for a multi-agent harness — eight real
// cells: HOST (folder · cpu/mem) · RUNTIME (label · sdk version) · TASKS
// (running + 24h activity spark) · THROUGHPUT (completed today + 7d spark) ·
// FAILURES (failed + 7d spark, red) · REVIEW (pending) · SPEND TODAY · SPEND TO
// DATE — plus a live/error status foot. No fabricated data: while loading, cells
// show "—"; on a poll error the last good snapshot stays visible and the foot
// flips to an explicit error pip. Static identity (cwd/runtime) is compressed
// into sub-lines so the live throughput signal owns the foreground. The SPEND
// cells render real metered ledger sums; the budget cap and any flat plan price
// live in the sub-line, named as what they are — never presented as spend.

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

// Sub-line for SPEND TO DATE: name the flat plan price when billing is
// subscription (it sits on top of metered spend, it is not spend), else show
// the monthly budget cap as "budget", else the plain window label.
function spendToDateSub(data: TelemetrySnapshot | null): string {
  if (!data) return "—";
  if (data.planPricedMonthlyMicros != null) {
    return `+ plan ${formatMicros(data.planPricedMonthlyMicros)}/mo`;
  }
  if (data.budgetMonthlyCapMicros != null) {
    return `of ${formatMicros(data.budgetMonthlyCapMicros)} budget`;
  }
  return "monthly";
}

// Sub-line for the RUNTIME cell once the active MODEL leads as the value:
// fold the provider and (when known) the SDK version into "provider · sdk N".
// Falls back to "not configured" only once data has actually said so.
function runtimeSub(data: TelemetrySnapshot | null): string {
  if (!data) return "—";
  const parts: string[] = [];
  if (data.providerId) parts.push(data.providerId);
  if (data.runtimeSdkVersion) parts.push(`sdk ${data.runtimeSdkVersion}`);
  return parts.length > 0 ? parts.join(" · ") : "not configured";
}

const SCROLL_EPSILON = 2;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function scrollToAdjacentCard(
  element: HTMLDivElement,
  direction: "previous" | "next",
) {
  const viewport = element.getBoundingClientRect();
  const cards = Array.from(
    element.querySelectorAll<HTMLElement>("[data-telemetry-card]"),
  );
  const candidate =
    direction === "next"
      ? cards.find(
          (card) =>
            card.getBoundingClientRect().right >
            viewport.right + SCROLL_EPSILON,
        )
      : cards.findLast(
          (card) =>
            card.getBoundingClientRect().left <
            viewport.left - SCROLL_EPSILON,
        );

  let delta =
    direction === "next"
      ? element.clientWidth * 0.75
      : element.clientWidth * -0.75;
  if (candidate) {
    const card = candidate.getBoundingClientRect();
    delta = direction === "next" ? card.right - viewport.right : card.left - viewport.left;
  }

  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  const target = Math.min(maxScrollLeft, Math.max(0, element.scrollLeft + delta));
  const options: ScrollToOptions = {
    left: target,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  };

  if (typeof element.scrollTo === "function") {
    element.scrollTo(options);
  } else {
    element.scrollLeft = target;
  }
}

export function TelemetryRail() {
  const telemetry = useTelemetry();
  const identity = useInstanceIdentity();
  const data = telemetry.data;
  const loading = telemetry.status === "loading";
  const errored = telemetry.status === "error";
  const railRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    overflow: false,
    canPrevious: false,
    canNext: false,
  });

  const updateScrollState = useCallback(() => {
    const rail = railRef.current;
    const element = scrollRef.current;
    if (!rail || !element) return;
    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    setScrollState((current) => {
      const next = {
        // Measure overflow against the whole rail, not the viewport after its
        // control gutters mount. Otherwise the gutters can keep themselves
        // alive after a resize that would fit all content without controls.
        overflow: element.scrollWidth > rail.clientWidth + SCROLL_EPSILON,
        canPrevious: element.scrollLeft > SCROLL_EPSILON,
        canNext: element.scrollLeft < maxScrollLeft - SCROLL_EPSILON,
      };
      return current.overflow === next.overflow &&
        current.canPrevious === next.canPrevious &&
        current.canNext === next.canNext
        ? current
        : next;
    });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    const element = scrollRef.current;
    if (!rail || !element) return;

    updateScrollState();
    window.addEventListener("resize", updateScrollState);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", updateScrollState);
    }

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(rail);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState]);

  const move = useCallback(
    (direction: "previous" | "next") => {
      const element = scrollRef.current;
      if (!element) return;
      scrollToAdjacentCard(element, direction);
      window.requestAnimationFrame(updateScrollState);
    },
    [updateScrollState],
  );

  const branch = data?.host.branch ?? null;

  // The active model leads the RUNTIME cell (FEAT-10). Falls back to the
  // runtime LABEL when the model hasn't resolved, so the cell is never blank —
  // a mis-configured runtime shows something, never nothing.
  const activeModel = identity.status === "loading" ? null : identity.activeModel;
  const runtimeValue = activeModel ?? data?.runtimeLabel ?? "—";

  return (
    <div
      ref={railRef}
      data-testid="telemetry-rail"
      // Sticky offset tracks the REAL two-tier header height (--chrome-header,
      // 100px) — the old top-16 (64px) let the rail slide 36px UNDER the header
      // on scroll. z below the header so the bar always wins. The rail is a
      // TRANSLUCENT chrome surface over the gridded canvas (WS2, 2026-07-05):
      // --rail-surface = a tint of --surface-2 that lets both the canvas grid and
      // the rail's own ::before grid read through faintly, so the sparkline
      // "graphs" pop on a drafting field while cell values stay legible. It is
      // chrome (bottom of the s-1 → s-2 → translucent-s-2 bar stack), NOT the
      // content plane. A faint teal top-glow (--rail-glow inset) marks the
      // chrome↔canvas seam and ties the rail to the accent system.
      className="rail-instrument sticky top-[var(--chrome-header)] z-[var(--z-rail)] flex flex-none items-stretch border-b border-border"
    >
      {scrollState.overflow && (
        <div
          data-testid="telemetry-previous-gutter"
          className="w-9 flex-none self-stretch"
        >
          {scrollState.canPrevious && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Previous telemetry cards"
              aria-controls="telemetry-scroll-region"
              onClick={() => move("previous")}
              className="h-full w-full rounded-none border-r border-border px-0 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground motion-reduce:transition-none"
            >
              <ChevronLeft aria-hidden />
            </Button>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        id="telemetry-scroll-region"
        data-testid="telemetry-scroll-region"
        className="telemetry-scroll-region flex min-w-0 flex-1 items-stretch overflow-x-auto"
        aria-label="Telemetry"
        role="region"
        onScroll={updateScrollState}
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
          value={runtimeValue}
          sub={runtimeSub(data)}
          href="/settings#settings-providers"
          ariaLabel="Open runtime settings"
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
          href="/tasks?status=running"
          ariaLabel="Open running tasks"
        />
        <RailCell
          label="Throughput"
          icon={<CheckCircle2 aria-hidden />}
          loading={loading}
          value={data?.completedToday ?? 0}
          sub="done today"
          spark={data?.trends.completions7d}
          sparkLabel="Completions, last 7 days"
          href="/tasks?status=completed"
          ariaLabel="Open completed tasks"
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
          href="/tasks?status=failed"
          ariaLabel="Open failed tasks"
        />
        <RailCell
          label="Review"
          icon={<ShieldQuestion aria-hidden />}
          loading={loading}
          tone={(data?.reviewPending ?? 0) > 0 ? "accent" : undefined}
          value={data?.reviewPending ?? 0}
          sub="pending"
          href="/inbox"
          ariaLabel="Open pending reviews"
        />
        <RailCell
          label="Projects"
          icon={<FolderKanban aria-hidden />}
          loading={loading}
          value={data?.activeProjects ?? 0}
          sub="active"
          href="/projects"
          ariaLabel="Open active projects"
        />
        <RailCell
          label="Workflows"
          icon={<Workflow aria-hidden />}
          loading={loading}
          value={data?.activeWorkflows ?? 0}
          sub="active"
          href="/workflows"
          ariaLabel="Open active workflows"
        />
        <RailCell
          label="Spend Today"
          icon={<Coins aria-hidden />}
          loading={loading}
          value={data ? formatMicros(data.costTodayMicros) : "—"}
          sub="metered"
          href="/costs"
          ariaLabel="Open cost dashboard"
        />
        <RailCell
          label="Spend To Date"
          icon={<Wallet aria-hidden />}
          loading={loading}
          value={data ? formatMicros(data.costToDateMicros) : "—"}
          sub={spendToDateSub(data)}
          href="/costs"
          ariaLabel="Open cost dashboard"
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
              {/* Rail data dot is CYAN (--status-running) for "live-data
                  freshness" — distinct from the bar's GREEN connectivity dot in
                  the shared status-dot legend (FEAT-12). Both are labeled. */}
              <span
                className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--status-running)]"
                aria-hidden
              />
              <span>{loading ? "syncing" : "live"}</span>
            </>
          )}
        </div>
      </div>
      {scrollState.overflow && (
        <div
          data-testid="telemetry-next-gutter"
          className="w-9 flex-none self-stretch"
        >
          {scrollState.canNext && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Next telemetry cards"
              aria-controls="telemetry-scroll-region"
              onClick={() => move("next")}
              className="h-full w-full rounded-none border-l border-border px-0 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground motion-reduce:transition-none"
            >
              <ChevronRight aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
