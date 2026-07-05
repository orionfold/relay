import { createElement } from "react";
import yaml from "js-yaml";
import { LastRunCard } from "@/components/apps/last-run-card";
import { RunCadenceHeatmap } from "@/components/charts/run-cadence-heatmap";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import type {
  KitDefinition,
  KitProjection,
  ResolveInput,
  RuntimeState,
  ViewModel,
} from "../types";
import { headerStatus } from "../header-status";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

interface CoachProjection extends KitProjection {
  runsBlueprintId: string | undefined;
  cadenceScheduleId: string | undefined;
  secondaryTableIds: string[];
  runsBlueprintVars: BlueprintVariable[] | null;
  manifestYaml: string;
}

/**
 * Coach — digest hero kit for `*-coach` profile + schedule apps.
 * Hero is the latest completed task as full markdown via LastRunCard
 * variant="hero". Run cadence chip + Run Now in header.
 */
export const coachKit: KitDefinition = {
  id: "coach",

  resolve(input: ResolveInput): KitProjection {
    const m = input.manifest;
    const bindings = m.view?.bindings;

    const runsBlueprintId =
      bindings?.runs && "blueprint" in bindings.runs
        ? bindings.runs.blueprint
        : m.blueprints[0]?.id;

    const cadenceScheduleId =
      bindings?.cadence && "schedule" in bindings.cadence
        ? bindings.cadence.schedule
        : m.schedules[0]?.id;

    const secondaryTableIds =
      bindings?.secondary?.flatMap((b) => ("table" in b ? [b.table] : [])) ?? [];

    const blueprint = runsBlueprintId
      ? m.blueprints.find((b) => b.id === runsBlueprintId)
      : null;
    const runsBlueprintVars: BlueprintVariable[] | null =
      blueprint &&
      "variables" in blueprint &&
      Array.isArray((blueprint as { variables?: unknown }).variables)
        ? ((blueprint as unknown as { variables: BlueprintVariable[] }).variables)
        : null;

    const projection: CoachProjection = {
      runsBlueprintId,
      cadenceScheduleId,
      secondaryTableIds,
      runsBlueprintVars,
      manifestYaml: yaml.dump(m, { lineWidth: 100 }),
    };
    return projection;
  },

  buildModel(proj: KitProjection, runtime: RuntimeState): ViewModel {
    const projection = proj as CoachProjection;
    const { app } = runtime;

    const hero = {
      kind: "custom" as const,
      content: createElement(LastRunCard, {
        variant: "hero",
        task: runtime.coachLatestTask ?? null,
        previousRuns: runtime.coachPreviousRuns ?? [],
        blueprintId: projection.runsBlueprintId,
      }),
    };

    // Wave-1 resurface: the coach runtime already loads `coachCadenceCells`
    // (see view-kits/data.ts); render the tested RunCadenceHeatmap in a
    // secondary slot instead of leaving the data dangling. Empty cells still
    // render an empty grid, so the slot is always present for the coach kit.
    const secondary = [
      {
        id: "cadence",
        title: "Run cadence",
        content: createElement(RunCadenceHeatmap, {
          cells: runtime.coachCadenceCells ?? [],
        }),
      },
    ];

    return {
      header: {
        title: app.name,
        description: app.description ?? undefined,
        status: headerStatus(runtime),
        cadenceChip: runtime.cadence ?? undefined,
        runNowBlueprintId: projection.runsBlueprintId,
        runNowVariables: projection.runsBlueprintVars,
      },
      kpis: runtime.evaluatedKpis ?? [],
      hero,
      secondary,
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
