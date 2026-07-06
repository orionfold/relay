import type { FunnelBand } from "@/lib/apps/view-kits/funnel-compute";

interface FunnelFlowViewProps {
  bands: FunnelBand[];
}

/**
 * The funnel band-flow primitive's render — Attract → Capture → Nurture →
 * Convert as horizontal band cards with a conversion connector between each.
 *
 * Deliberately hand-rolled HTML + CSS, no D3/Sankey: the marketing north-star
 * declined a charting dependency as YAGNI (`_SPECS/2026-06-29-crm-funnel-flow-
 * panels.md` §2), and this Core primitive mirrors that. The band ramp uses the
 * app's `--chart-*` tokens so it reads as one system in light and dark.
 *
 * A band whose count is 0 still renders (an honest empty funnel, not a hidden
 * one); a `null` conversion renders a muted gap-marker rather than a misleading
 * number — reach and contacts are different denominators (§5.3).
 *
 * Server-safe (no hooks/state); mounted by the Tracker + Workflow Hub kits via
 * `createElement` into a secondary slot.
 */
const BAND_ACCENT: Record<FunnelBand["key"], string> = {
  attract: "bg-chart-2",
  capture: "bg-chart-1",
  nurture: "bg-chart-4",
  convert: "bg-chart-5",
};

const numberFmt = new Intl.NumberFormat("en-US");

export function FunnelFlowView({ bands }: FunnelFlowViewProps) {
  if (bands.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No funnel data.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      {bands.map((band, i) => (
        <div key={band.key} className="flex flex-1 items-stretch gap-2">
          <div className="flex flex-1 flex-col rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${BAND_ACCENT[band.key]}`}
                aria-hidden
              />
              <span className="text-xs font-medium text-muted-foreground">
                {band.label}
              </span>
            </div>
            <span className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {numberFmt.format(band.count)}
            </span>
            {band.detail ? (
              <span className="mt-0.5 text-[11px] text-muted-foreground">
                {band.detail}
              </span>
            ) : null}
            {band.sub.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {band.sub.slice(0, 4).map(([label, count]) => (
                  <span
                    key={label}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {label} {numberFmt.format(count)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {i < bands.length - 1 ? (
            <FunnelConnector conversion={bands[i + 1].conversion} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * The connector between two bands. Carries the downstream band's conversion %
 * when known, or a muted "·" gap-marker where the junction has no comparable
 * denominator (Attract → Capture). The arrow points in the flow direction.
 */
function FunnelConnector({ conversion }: { conversion: number | null }) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center px-0.5"
      aria-hidden
    >
      {conversion != null ? (
        <span className="font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
          {conversion}%
        </span>
      ) : (
        <span
          className="text-[11px] text-muted-foreground/50"
          title="Reach and contacts are not directly comparable"
        >
          ·
        </span>
      )}
      <span className="text-muted-foreground/60">→</span>
    </div>
  );
}
