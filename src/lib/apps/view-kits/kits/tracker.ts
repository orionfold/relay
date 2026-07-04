import { createElement } from "react";
import yaml from "js-yaml";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import { TableSpreadsheet } from "@/components/tables/table-spreadsheet";
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

interface TrackerProjection extends KitProjection {
  heroTableId: string | undefined;
  secondaryTableIds: string[];
  cadenceScheduleId: string | undefined;
  runsBlueprintId: string | undefined;
  kpiSpecs: KpiSpec[];
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
