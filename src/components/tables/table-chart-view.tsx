"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ChartConfig {
  type: "bar" | "line" | "pie" | "scatter";
  xColumn: string;
  yColumn?: string;
  aggregation?: "sum" | "avg" | "count" | "min" | "max";
}

interface TableChartViewProps {
  config: ChartConfig;
  title: string;
  rows: Array<{ data: Record<string, unknown> }>;
}

const CHART_COLORS = [
  "oklch(0.65 0.18 250)",
  "oklch(0.70 0.16 180)",
  "oklch(0.68 0.17 320)",
  "oklch(0.72 0.14 80)",
  "oklch(0.60 0.20 30)",
  "oklch(0.75 0.12 140)",
];

export function TableChartView({ config, title, rows }: TableChartViewProps) {
  const chartData = useMemo(() => {
    if (config.type === "pie" || config.aggregation === "count") {
      // Aggregate by xColumn values
      const counts = new Map<string, number>();
      for (const row of rows) {
        const key = String(row.data[config.xColumn] ?? "Unknown");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
    }

    if (config.aggregation && config.yColumn) {
      // Group by xColumn, aggregate yColumn
      const groups = new Map<string, number[]>();
      for (const row of rows) {
        const key = String(row.data[config.xColumn] ?? "Unknown");
        const val = Number(row.data[config.yColumn]);
        if (!isNaN(val)) {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(val);
        }
      }

      return Array.from(groups.entries()).map(([name, values]) => {
        let value: number;
        switch (config.aggregation) {
          case "sum": value = values.reduce((a, b) => a + b, 0); break;
          case "avg": value = values.reduce((a, b) => a + b, 0) / values.length; break;
          case "min": value = Math.min(...values); break;
          case "max": value = Math.max(...values); break;
          default: value = values.length;
        }
        return { name, value: Math.round(value * 100) / 100 };
      });
    }

    // Raw x/y mapping
    return rows.map((row) => ({
      name: String(row.data[config.xColumn] ?? ""),
      value: config.yColumn ? Number(row.data[config.yColumn]) || 0 : 1,
    }));
  }, [config, rows]);

  if (chartData.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No data to chart.</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 800, height: 300 }}
        >
          {config.type === "bar" ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name={config.yColumn ?? config.aggregation ?? "value"} fill="oklch(0.65 0.18 250)" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : config.type === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" name={config.yColumn ?? config.aggregation ?? "value"} stroke="oklch(0.65 0.18 250)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          ) : config.type === "pie" ? (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} name={config.xColumn} />
              <YAxis dataKey="value" tick={{ fontSize: 12 }} name={config.yColumn ?? "value"} />
              <Tooltip />
              <Scatter data={chartData} fill="oklch(0.65 0.18 250)" />
            </ScatterChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
