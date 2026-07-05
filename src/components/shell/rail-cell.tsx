// FROZEN SCOPE (_SPECS/feature-cut-freeze.md Target 4 · _IDEAS/reprioritze.md §4)
// Frozen RailCell API; extend only to serve the Operations Receipt, not new
// live-host metrics. The telemetry rail's scope is locked at 10 cells.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/sparkline";

// One telemetry cell: a mono-uppercase key over a tabular value, with an
// optional sub-line and an optional trend sparkline beside the value. Mirrors
// `.hp-cell` from arena-shell.reference.css — fixed min-width, right hairline
// divider, top-aligned. `tone` paints the value: "accent" = cyan (the single
// most "live" figure in a cell), "danger" = red (a non-zero alarm count); both
// used sparingly. When `spark` is provided, a compact sparkline renders inline
// to the right of the value so the cell height stays within the rail's fixed
// band.

export function RailCell({
  label,
  icon,
  value,
  sub,
  tone,
  loading,
  spark,
  sparkColor = "var(--chart-1)",
  sparkLabel,
}: {
  label: string;
  icon?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** Value emphasis: "accent" = cyan (live), "danger" = red (alarm). */
  tone?: "accent" | "danger";
  loading?: boolean;
  /** Trend series; renders a compact sparkline inline beside the value. */
  spark?: number[];
  /** Stroke/fill color for the sparkline (semantic per cell). */
  sparkColor?: string;
  /** Accessible label for the sparkline. */
  sparkLabel?: string;
}) {
  return (
    <div className="flex min-w-[8.5rem] flex-none flex-col gap-0.5 border-r border-border px-4 py-2.5">
      <div className="flex items-center gap-1.5 font-mono text-[0.6rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {icon && (
          <span className="flex h-3 w-3 items-center justify-center text-muted-foreground [&_svg]:h-3 [&_svg]:w-3">
            {icon}
          </span>
        )}
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        {/* Value LEADS the cell (FEAT-9): text-base is the most-scanned figure,
            up from text-sm. The label above and sub below both recede. */}
        <div
          className={cn(
            "flex items-baseline gap-1.5 truncate font-mono text-base tabular-nums",
            tone === "accent" && "text-primary",
            tone === "danger" && "text-[var(--status-failed)]",
            !tone && "text-foreground",
            loading && "text-muted-foreground/50",
          )}
        >
          {loading ? "—" : value}
        </div>
        {!loading && spark && spark.length > 0 && (
          <Sparkline
            data={spark}
            width={48}
            height={16}
            color={sparkColor}
            label={sparkLabel ?? `${label} trend`}
            className="self-center opacity-90"
          />
        )}
      </div>
      {sub != null && (
        // Sub-line demoted: muted + looser tracking so it clearly recedes
        // beneath the now-larger value.
        <div className="truncate font-mono text-[0.65rem] tracking-[0.02em] text-muted-foreground/80">
          {sub}
        </div>
      )}
    </div>
  );
}

// Micros (USD * 1e6) → compact "$1.23" / "$1,234.56". Mirrors the cost
// dashboard's formatter; kept local to the rail so the presentation layer owns
// its own display rule.
export function formatMicros(micros: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: micros >= 1_000_000 ? 2 : 4,
  }).format(micros / 1_000_000);
}
