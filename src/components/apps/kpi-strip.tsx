import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardVariants } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import type {
  KpiDirection,
  KpiFavorability,
  KpiTile,
} from "@/lib/apps/view-kits/types";

interface KPIStripProps {
  tiles: KpiTile[];
}

const trendGlyph: Record<KpiDirection, typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const signalColor: Record<KpiFavorability, string> = {
  favorable: "text-status-completed",
  unfavorable: "text-status-failed",
  neutral: "text-muted-foreground",
};

const watermarkColor: Record<KpiFavorability, string> = {
  favorable: "text-status-completed/[0.08]",
  unfavorable: "text-status-failed/[0.08]",
  neutral: "text-foreground/[0.07]",
};

const sparkColor: Record<KpiFavorability, string> = {
  favorable: "var(--status-completed)",
  unfavorable: "var(--status-failed)",
  neutral: "var(--muted-foreground)",
};

const favorabilityLabel: Record<KpiFavorability, string> = {
  favorable: "Favorable",
  unfavorable: "Unfavorable",
  neutral: "Neutral",
};

/**
 * Generic 1-6 tile horizontal strip used by composed-app view kits. Pure
 * presentation — no DB, no state. The view-model author (a kit) is
 * responsible for evaluating KpiSpecs into KpiTile values; this component
 * just renders them.
 *
 * F5: each tile follows the orionfold.com "THE PROOF" stat recipe — a
 * mono/tracked eyebrow, an oversized hero value, and (when the kit provides
 * them) an explicit endpoint comparison, latest-momentum label, and sparkline.
 * Color expresses favorability rather than arithmetic direction. A large faint
 * trend watermark appears only when endpoint and latest signals agree in both
 * direction and favorability, so rebounds, reversals, and zero-crossing
 * conflicts are never flattened into one verdict.
 *
 * Why clip at 6: the responsive grid (lg:grid-cols-6) wraps awkwardly past
 * 6, and 6 is the design ceiling per the spec. Authors needing 7+ should
 * compose two strips.
 */
export function KPIStrip({ tiles }: KPIStripProps) {
  if (tiles.length === 0) return null;
  const visible = tiles.slice(0, 6);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {visible.map((tile) => {
        const trend = tile.trend;
        const readyTrend = trend?.state === "ready" ? trend : null;
        const Watermark = readyTrend?.watermark
          ? trendGlyph[readyTrend.watermark]
          : null;
        return (
          <div
            key={tile.id}
            className={cn(
              cardVariants({ tone: "metric" }),
              "gap-1.5 overflow-hidden p-3 py-3 @container/card"
            )}
            data-kit-primitive="kpi-tile"
            data-trend-state={trend?.state ?? "none"}
            data-comparison-direction={readyTrend?.comparison.direction}
            data-momentum-direction={readyTrend?.momentum.direction}
            data-favorability={readyTrend?.comparison.favorability}
            data-watermark={readyTrend?.watermark ?? "none"}
            role={trend ? "group" : undefined}
            aria-label={trend?.summary}
          >
            {Watermark && readyTrend && (
              <Watermark
                aria-hidden
                data-kpi-watermark={readyTrend.watermark}
                className={cn(
                  "pointer-events-none absolute right-3 top-3 h-[clamp(3.25rem,25cqw,6.5rem)] w-[clamp(3.25rem,25cqw,6.5rem)] select-none",
                  watermarkColor[readyTrend.comparison.favorability]
                )}
              />
            )}
            <div className="relative font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </div>
            <div className="relative flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight">
                {tile.value}
              </span>
            </div>
            {trend?.state === "sparse" && (
              <div className="relative text-[10px] leading-tight text-muted-foreground">
                {trend.label}
              </div>
            )}
            {readyTrend && (
              <>
                <div
                  className={cn(
                    "relative flex items-start gap-1 text-[10px] leading-tight",
                    signalColor[readyTrend.comparison.favorability]
                  )}
                >
                  {(() => {
                    const ComparisonIcon = trendGlyph[readyTrend.comparison.direction];
                    return (
                      <ComparisonIcon
                        className="mt-px h-3 w-3 shrink-0"
                        aria-hidden
                      />
                    );
                  })()}
                  <span>
                    {readyTrend.comparison.label} ·{" "}
                    {favorabilityLabel[readyTrend.comparison.favorability]}
                  </span>
                </div>
                {tile.spark && tile.spark.length >= 2 && (
                  <Sparkline
                    data={tile.spark}
                    width={100}
                    height={20}
                    color={sparkColor[readyTrend.momentum.favorability]}
                    className="relative w-full"
                    label={`${tile.label}: ${readyTrend.momentum.label.toLowerCase()}`}
                  />
                )}
                <div
                  className={cn(
                    "relative text-[10px] leading-tight",
                    signalColor[readyTrend.momentum.favorability]
                  )}
                >
                  {readyTrend.momentum.label} ·{" "}
                  {favorabilityLabel[readyTrend.momentum.favorability]}
                </div>
              </>
            )}
            {tile.hint && (
              <div className="relative text-[11px] text-muted-foreground">
                {tile.hint}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
