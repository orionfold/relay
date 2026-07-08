import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardVariants } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import type { KpiTile } from "@/lib/apps/view-kits/types";

interface KPIStripProps {
  tiles: KpiTile[];
}

const trendGlyph = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

const trendColor = {
  up: "text-status-completed",
  down: "text-status-failed",
  flat: "text-muted-foreground",
} as const;

/**
 * Generic 1-6 tile horizontal strip used by composed-app view kits. Pure
 * presentation — no DB, no state. The view-model author (a kit) is
 * responsible for evaluating KpiSpecs into KpiTile values; this component
 * just renders them.
 *
 * F5: each tile follows the orionfold.com "THE PROOF" stat recipe — a
 * mono/tracked eyebrow, an oversized hero value, and (when the kit provides
 * them) a trend arrow + faint sparkline. A large faint trend watermark sits
 * behind the content for depth. Falls back gracefully when trend/spark are
 * absent (the common case today).
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
        const Watermark = trend ? trendGlyph[trend] : null;
        return (
          <div
            key={tile.id}
            className={cn(
              cardVariants({ tone: "metric" }),
              "gap-1.5 overflow-hidden p-3 py-3 @container/card"
            )}
            data-kit-primitive="kpi-tile"
          >
            {Watermark && (
              <Watermark
                aria-hidden
                className="pointer-events-none absolute right-3 top-3 h-[clamp(3.25rem,25cqw,6.5rem)] w-[clamp(3.25rem,25cqw,6.5rem)] select-none text-foreground/[0.07]"
              />
            )}
            <div className="relative font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </div>
            <div className="relative flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight">
                {tile.value}
              </span>
              {trend && (
                <span className={cn("shrink-0", trendColor[trend])}>
                  {(() => {
                    const T = trendGlyph[trend];
                    return <T className="h-4 w-4" aria-hidden />;
                  })()}
                </span>
              )}
            </div>
            {tile.spark && tile.spark.length >= 2 && (
              <Sparkline
                data={tile.spark}
                width={100}
                height={20}
                className="relative w-full"
                label={`${tile.label} trend`}
              />
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
