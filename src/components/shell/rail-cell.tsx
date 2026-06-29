import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// One telemetry cell: a mono-uppercase key over a tabular value, with an
// optional sub-line. Mirrors `.hp-cell` from arena-shell.reference.css —
// fixed min-width, right hairline divider, top-aligned. `strong` paints the
// value cyan (used sparingly, for the single most "live" figure in a cell).

export function RailCell({
  label,
  icon,
  value,
  sub,
  strong,
  loading,
}: {
  label: string;
  icon?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  strong?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-[8.5rem] flex-none flex-col gap-0.5 border-r border-border px-4 pt-2.5">
      <div className="flex items-center gap-1.5 font-mono text-[0.58rem] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        {icon && (
          <span className="flex h-3 w-3 items-center justify-center text-muted-foreground/70 [&_svg]:h-3 [&_svg]:w-3">
            {icon}
          </span>
        )}
        {label}
      </div>
      <div
        className={cn(
          "flex items-baseline gap-1.5 font-mono text-sm tabular-nums",
          strong ? "text-primary" : "text-foreground",
          loading && "text-muted-foreground/50",
        )}
      >
        {loading ? "—" : value}
      </div>
      {sub != null && (
        <div className="truncate font-mono text-[0.65rem] text-muted-foreground/60">
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
