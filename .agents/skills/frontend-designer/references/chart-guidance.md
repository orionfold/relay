# Chart Type Guidance

When a deliverable includes data visualization, recommend chart types by data pattern:

| Chart Type | Data Pattern | Library |
|------------|-------------|---------|
| Bar (vertical) | Category comparison | Recharts |
| Bar (horizontal) | Long-label comparison | Recharts |
| Line | Trend over time | Recharts |
| Area | Volume over time | Recharts |
| Pie/Donut | Part-to-whole (≤5 slices) | Recharts |
| Heatmap | Density across 2D | Nivo |
| Sparkline | Inline trend indicator | Tremor |
| KPI card | Single metric + delta | Tremor |
| Funnel | Conversion stages | Nivo |
| Treemap | Hierarchical proportions | Nivo |
| Gauge/Radial | Progress toward target | Recharts |

**ainative note:** The project uses custom SVG chart components (Sparkline, DonutRing, MiniBar) in `src/components/charts/` rather than external libraries. Prefer these existing components when possible.

**Anti-patterns:** Never use 3D charts. Prefer small multiples over dual-axis. Avoid pie charts with >5 slices (use horizontal bar instead).
