import { TimeSeriesChart, type TimeSeriesPoint } from "@/components/charts/time-series-chart";

interface CategoryDatum {
  label: string;
  value: number;
}

interface LedgerHeroPanelProps {
  series: TimeSeriesPoint[];
  categories: CategoryDatum[];
  period: "mtd" | "qtd" | "ytd";
}

export function LedgerHeroPanel({ series, categories, period }: LedgerHeroPanelProps) {
  if (series.length === 0 && categories.length === 0) {
    return (
      <div className="surface-card rounded-xl p-12 text-center text-muted-foreground border">
        No data yet. Click <strong>Run</strong> to start this app&apos;s workflow.
        Results show up here once it finishes.
      </div>
    );
  }

  const rangeLabel = period.toUpperCase();
  // TimeSeriesChart's `range` prop currently supports mtd/ytd/30d/90d.
  // Map qtd → 90d (closest equivalent) so we stay within the prop's union
  // without expanding the chart primitive's surface.
  const chartRange = period === "qtd" ? "90d" : period;
  const total = categories.reduce((sum, c) => sum + Math.abs(c.value), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 surface-card rounded-xl p-4 border">
        <h3 className="text-sm font-medium mb-2">Trend ({rangeLabel})</h3>
        <TimeSeriesChart data={series} format="currency" range={chartRange} height={240} />
      </div>
      <div className="surface-card rounded-xl p-4 border">
        <h3 className="text-sm font-medium mb-2">By category ({rangeLabel})</h3>
        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">No category data</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((c) => {
              const pct = total > 0 ? (Math.abs(c.value) / total) * 100 : 0;
              return (
                <li key={c.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{c.label}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {c.value.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${pct}%` }}
                      data-category-bar={c.label}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
