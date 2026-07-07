import { createElement } from "react";
import yaml from "js-yaml";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import { TableSpreadsheet } from "@/components/tables/table-spreadsheet";
import { TableChartView } from "@/components/tables/table-chart-view";
import { FunnelFlowView } from "@/components/apps/kit-view/funnel-flow-view";
import { GalleryPreviewView } from "@/components/apps/kit-view/gallery-preview-view";
import { defaultTrackerKpis } from "../default-kpis";
import type { ViewConfig } from "@/lib/apps/registry";
import type {
  KitDefinition,
  KitProjection,
  ResolveInput,
  RuntimeState,
  ViewModel,
} from "../types";
import { headerStatus } from "../header-status";

type KpiSpec = NonNullable<ViewConfig["bindings"]["kpis"]>[number];
type ChartSpec = NonNullable<ViewConfig["bindings"]["charts"]>[number];
type GallerySpec = NonNullable<ViewConfig["bindings"]["galleries"]>[number];
type FunnelSpec = NonNullable<ViewConfig["bindings"]["funnel"]>;

interface TrackerProjection extends KitProjection {
  heroTableId: string | undefined;
  secondaryTableIds: string[];
  cadenceScheduleId: string | undefined;
  runsBlueprintId: string | undefined;
  kpiSpecs: KpiSpec[];
  chartSpecs: ChartSpec[];
  gallerySpecs: GallerySpec[];
  funnelSpec: FunnelSpec | undefined;
  manifestYaml: string;
}

/**
 * Tracker — table-as-hero kit for apps that log entries over time
 * (habit-tracker, reading-radar). The hero is the entries table; KPIs sit
 * above; a cadence chip shows when the next agent run will fire.
 *
 * Pure projection: no React state, no fetching. The hero table's columns
 * and rows come from `runtime.heroTable`, populated upstream in `data.ts`.
 *
 * Why first table for default heroTableId: the inference rule already
 * checks tables[0] for hasBoolean+hasDate. Manifests can override via
 * `view.bindings.hero.table`. Phase 5 may add smarter heuristics.
 */
export const trackerKit: KitDefinition = {
  id: "tracker",

  resolve(input: ResolveInput): KitProjection {
    const m = input.manifest;
    const view = m.view;
    const bindings = view?.bindings;

    const heroTableId =
      bindings?.hero && "table" in bindings.hero
        ? bindings.hero.table
        : m.tables[0]?.id;

    const secondaryTableIds =
      bindings?.secondary?.flatMap((b) =>
        "table" in b ? [b.table] : []
      ) ?? [];

    const cadenceScheduleId =
      bindings?.cadence && "schedule" in bindings.cadence
        ? bindings.cadence.schedule
        : m.schedules[0]?.id;

    const runsBlueprintId =
      bindings?.runs && "blueprint" in bindings.runs
        ? bindings.runs.blueprint
        : m.blueprints[0]?.id;

    const heroCols = heroTableId
      ? input.columns.find((c) => c.tableId === heroTableId)?.columns ?? []
      : [];

    const kpiSpecs = bindings?.kpis ?? defaultTrackerKpis(heroTableId, heroCols);

    const projection: TrackerProjection = {
      heroTableId,
      secondaryTableIds,
      cadenceScheduleId,
      runsBlueprintId,
      kpiSpecs,
      chartSpecs: bindings?.charts ?? [],
      gallerySpecs: bindings?.galleries ?? [],
      funnelSpec: bindings?.funnel,
      manifestYaml: yaml.dump(m, { lineWidth: 100 }),
    };
    return projection;
  },

  buildModel(proj: KitProjection, runtime: RuntimeState): ViewModel {
    const projection = proj as TrackerProjection;
    const { app } = runtime;

    const hero = runtime.heroTable
      ? {
          kind: "table" as const,
          // createElement (not function-call) so the client component's hooks
          // aren't invoked at projection time — React mounts it during request
          // render. Function-call works for hookless server components like
          // ManifestPaneBody but not for client components with useState.
          content: createElement(TableSpreadsheet, {
            tableId: runtime.heroTable.tableId,
            columns: runtime.heroTable.columns,
            initialRows: runtime.heroTable.rows,
          }),
        }
      : undefined;

    // Funnel band-flow (if declared) leads the secondary grid — it's the app's
    // analytics header. Full-width by convention (its own slot). Mounted via
    // createElement to match the chart/hero client-component pattern.
    const funnelSlot = runtime.funnelData
      ? [
          {
            id: "funnel-flow",
            title: runtime.funnelData.title ?? undefined,
            content: createElement(FunnelFlowView, {
              bands: runtime.funnelData.bands,
            }),
          },
        ]
      : [];

    // Wave-1 resurface: render each manifest-declared chart as a promoted
    // secondary slot (off the buried Charts tab). TableChartView is a client
    // component, so mount it via createElement like the hero spreadsheet.
    const chartSlots = (runtime.chartData ?? []).map((chart) => ({
      id: `chart-${chart.spec.id}`,
      title: chart.spec.title,
      // The slot renders the title; pass "" to TableChartView so its internal
      // <h3> doesn't duplicate it.
      content: createElement(TableChartView, {
        config: {
          type: chart.spec.type,
          xColumn: chart.spec.xColumn,
          yColumn: chart.spec.yColumn,
          aggregation: chart.spec.aggregation,
        },
        title: "",
        rows: chart.rows,
      }),
    }));

    const gallerySlots = (runtime.galleryData ?? []).map((gallery) => ({
      id: `gallery-${gallery.spec.id}`,
      title: gallery.spec.title,
      fullWidth: true,
      content: createElement(GalleryPreviewView, { gallery }),
    }));

    // Funnel first (analytics header), then gallery previews, then charts.
    const secondary = [...funnelSlot, ...gallerySlots, ...chartSlots];

    return {
      header: {
        title: app.name,
        description: app.description ?? undefined,
        status: headerStatus(runtime),
        cadenceChip: runtime.cadence ?? undefined,
        runNowBlueprintId: projection.runsBlueprintId,
      },
      kpis: runtime.evaluatedKpis ?? [],
      hero,
      secondary: secondary.length > 0 ? secondary : undefined,
      footer: {
        appId: app.id,
        appName: app.name,
        manifestYaml: projection.manifestYaml,
        body: ManifestPaneBody({
          manifest: app.manifest,
          files: app.files,
          manifestYaml: projection.manifestYaml,
        }),
      },
    };
  },
};
