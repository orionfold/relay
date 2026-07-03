"use client";

import {
  AreaChart,
  Area,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { formatKpi, type KpiFormat } from "@/lib/apps/view-kits/format-kpi";

export type TimeSeriesPoint = { date: string; value: number; label?: string };

export interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  format?: KpiFormat;
  height?: number;
  range?: "30d" | "90d" | "ytd" | "mtd";
}

export function TimeSeriesChart({
  data,
  format = "int",
  height = 240,
  range = "90d",
}: TimeSeriesChartProps) {
  // `range` is reserved for the consuming kit to prefilter data; the
  // component itself just renders what it's given. Referenced here so
  // future range-aware enhancements (e.g. axis tick density) keep the
  // prop in scope without an unused-var lint.
  void range;

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg"
        style={{ height }}
        data-chart-height={String(height)}
      >
        No data yet. Runs will populate this chart.
      </div>
    );
  }

  return (
    <div data-chart-height={String(height)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" className="text-xs" />
          <YAxis tickFormatter={(v) => formatKpi(v, format)} className="text-xs" />
          <Tooltip
            formatter={(v) => formatKpi(Number(v), format)}
            contentStyle={{ borderRadius: 8 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.15}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
