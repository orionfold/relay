import { describe, expect, it } from "vitest";
import { trackerKit } from "../kits/tracker";
import type { AppDetail, AppManifest, ViewConfig } from "@/lib/apps/registry";
import type { ColumnSchemaRef, RuntimeState } from "../types";

function makeApp(over: Partial<AppManifest> = {}, view?: ViewConfig): AppDetail {
  const m = {
    id: "demo",
    name: "Demo",
    description: "demo",
    profiles: [],
    blueprints: [],
    tables: [],
    schedules: [],
    view,
    ...over,
  } as AppManifest;
  return {
    id: "demo",
    name: "Demo",
    description: "demo",
    rootDir: "/tmp",
    primitivesSummary: "",
    profileCount: 0,
    blueprintCount: m.blueprints.length,
    tableCount: m.tables.length,
    scheduleCount: m.schedules.length,
    scheduleHuman: null,
    createdAt: 0,
    files: [],
    manifest: m,
  };
}

describe("trackerKit.resolve — defaults from manifest when bindings absent", () => {
  it("defaults heroTableId to manifest.tables[0]?.id", () => {
    const app = makeApp({
      tables: [{ id: "logs" }, { id: "habits" }],
      blueprints: [{ id: "review" }],
      schedules: [{ id: "sch-1", cron: "0 8 * * *" }],
    });
    const cols: ColumnSchemaRef[] = [
      { tableId: "logs", columns: [{ name: "active", type: "boolean" }] },
    ];
    const proj = trackerKit.resolve({
      manifest: app.manifest,
      columns: cols,
    }) as Record<string, unknown>;
    expect(proj.heroTableId).toBe("logs");
    expect(proj.cadenceScheduleId).toBe("sch-1");
    expect(proj.runsBlueprintId).toBe("review");
    expect(Array.isArray(proj.kpiSpecs)).toBe(true);
    expect((proj.kpiSpecs as unknown[]).length).toBeGreaterThan(0);
  });

  it("returns undefined heroTableId when manifest has no tables", () => {
    const app = makeApp({});
    const proj = trackerKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    expect(proj.heroTableId).toBeUndefined();
  });
});

describe("trackerKit.resolve — explicit bindings override defaults", () => {
  it("uses bindings.hero.table when declared", () => {
    const app = makeApp(
      {
        tables: [{ id: "tbl-a" }, { id: "tbl-b" }],
        blueprints: [{ id: "bp-1" }],
        schedules: [{ id: "sch-1" }],
      },
      {
        kit: "tracker",
        hideManifestPane: false,
        bindings: { hero: { table: "tbl-b" } },
      }
    );
    const proj = trackerKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    expect(proj.heroTableId).toBe("tbl-b");
  });

  it("threads bindings.charts into the projection", () => {
    const app = makeApp(
      {
        tables: [{ id: "txns" }],
      },
      {
        kit: "tracker",
        hideManifestPane: false,
        bindings: {
          charts: [
            { id: "spend", table: "txns", type: "bar", xColumn: "category", yColumn: "amount", aggregation: "sum" },
          ],
        },
      }
    );
    const proj = trackerKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    const charts = proj.chartSpecs as Array<{ id: string; type: string }>;
    expect(charts).toHaveLength(1);
    expect(charts[0].id).toBe("spend");
    expect(charts[0].type).toBe("bar");
  });

  it("defaults chartSpecs to [] when no charts declared", () => {
    const app = makeApp({ tables: [{ id: "logs" }] });
    const proj = trackerKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    expect(proj.chartSpecs).toEqual([]);
  });

  it("uses bindings.kpis verbatim when declared (no synthesis)", () => {
    const app = makeApp(
      {
        tables: [{ id: "tbl-1" }],
        blueprints: [{ id: "bp-1" }],
        schedules: [{ id: "sch-1" }],
      },
      {
        kit: "tracker",
        hideManifestPane: false,
        bindings: {
          kpis: [
            {
              id: "custom",
              label: "Custom",
              source: { kind: "tableCount", table: "tbl-1" },
              format: "int",
            },
          ],
        },
      }
    );
    const proj = trackerKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    const specs = proj.kpiSpecs as Array<{ id: string }>;
    expect(specs[0].id).toBe("custom");
    expect(specs).toHaveLength(1);
  });
});

describe("trackerKit.buildModel", () => {
  it("renders header with title + cadence chip + run-now blueprint", () => {
    const app = makeApp({
      tables: [{ id: "logs" }],
      blueprints: [{ id: "bp-1" }],
      schedules: [{ id: "sch-1", cron: "0 8 * * *" }],
    });
    const proj = trackerKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      cadence: { humanLabel: "daily 8am", nextFireMs: null },
    };
    const model = trackerKit.buildModel(proj, runtime);
    expect(model.header.title).toBe("Demo");
    expect(model.header.cadenceChip?.humanLabel).toBe("daily 8am");
    expect(model.header.runNowBlueprintId).toBe("bp-1");
  });

  it("renders kpis from runtime.evaluatedKpis when present", () => {
    const app = makeApp({
      tables: [{ id: "logs" }],
    });
    const proj = trackerKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      evaluatedKpis: [{ id: "k1", label: "Total", value: "5" }],
    };
    const model = trackerKit.buildModel(proj, runtime);
    expect(model.kpis).toHaveLength(1);
  });

  it("renders hero with table-spreadsheet content when runtime.heroTable is present", () => {
    const app = makeApp({
      tables: [{ id: "logs" }],
    });
    const proj = trackerKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      heroTable: { tableId: "logs", columns: [], rows: [] },
    };
    const model = trackerKit.buildModel(proj, runtime);
    expect(model.hero).toBeDefined();
    expect(model.hero?.kind).toBe("table");
  });

  it("renders a secondary chart slot for each runtime.chartData entry", () => {
    const app = makeApp({ tables: [{ id: "txns" }] });
    const proj = trackerKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      chartData: [
        {
          spec: { id: "spend", title: "Spend by category", table: "txns", type: "bar", xColumn: "category", yColumn: "amount", aggregation: "sum" },
          rows: [{ data: { category: "food", amount: 12 } }],
        },
      ],
    };
    const model = trackerKit.buildModel(proj, runtime);
    const slot = model.secondary?.find((s) => s.id === "chart-spend");
    expect(slot).toBeDefined();
    expect(slot?.title).toBe("Spend by category");
    expect(slot?.primitiveKind).toBe("chart");
    // The chart element carries the resolved rows + typed config.
    expect((slot!.content as any).props.rows).toHaveLength(1);
    expect((slot!.content as any).props.config.type).toBe("bar");
    // The slot owns the title; the chart's own <h3> is suppressed to avoid a
    // duplicate heading (verified in the dev-server smoke).
    expect((slot!.content as any).props.title).toBe("");
  });

  it("leaves secondary undefined when no charts are declared", () => {
    const app = makeApp({ tables: [{ id: "logs" }] });
    const proj = trackerKit.resolve({ manifest: app.manifest, columns: [] });
    const model = trackerKit.buildModel(proj, { app, chartData: [] });
    expect(model.secondary).toBeUndefined();
  });
});
