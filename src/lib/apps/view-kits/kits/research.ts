import { createElement } from "react";
import yaml from "js-yaml";
import { ResearchSplitView } from "@/components/apps/research-split-view";
import { RunHistoryTimeline } from "@/components/apps/run-history-timeline";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import type {
  KitDefinition,
  KitProjection,
  KpiTile,
  ResolveInput,
  RuntimeState,
  ViewModel,
} from "../types";
import { headerStatus } from "../header-status";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

interface ResearchProjection extends KitProjection {
  sourcesTableId: string | undefined;
  synthesisBlueprintId: string | undefined;
  cadenceScheduleId: string | undefined;
  synthesisBlueprintVars: BlueprintVariable[] | null;
  manifestYaml: string;
}

/**
 * Research — sources + synthesis kit. Hero pairs a sources DataTable with
 * a markdown synthesis body and citation chips that highlight matching
 * source rows in place. Activity is a vertical run timeline.
 */
export const researchKit: KitDefinition = {
  id: "research",

  resolve(input: ResolveInput): KitProjection {
    const m = input.manifest;
    const bindings = m.view?.bindings;

    const sourcesTableId =
      bindings?.hero && "table" in bindings.hero
        ? bindings.hero.table
        : m.tables[0]?.id;

    const synthesisBlueprintId =
      bindings?.runs && "blueprint" in bindings.runs
        ? bindings.runs.blueprint
        : m.blueprints[0]?.id;

    const cadenceScheduleId =
      bindings?.cadence && "schedule" in bindings.cadence
        ? bindings.cadence.schedule
        : m.schedules[0]?.id;

    const blueprint = synthesisBlueprintId
      ? m.blueprints.find((b) => b.id === synthesisBlueprintId)
      : null;
    const synthesisBlueprintVars: BlueprintVariable[] | null =
      blueprint &&
      "variables" in blueprint &&
      Array.isArray((blueprint as { variables?: unknown }).variables)
        ? ((blueprint as unknown as { variables: BlueprintVariable[] }).variables)
        : null;

    const projection: ResearchProjection = {
      sourcesTableId,
      synthesisBlueprintId,
      cadenceScheduleId,
      synthesisBlueprintVars,
      manifestYaml: yaml.dump(m, { lineWidth: 100 }),
    };
    return projection;
  },

  buildModel(proj: KitProjection, runtime: RuntimeState): ViewModel {
    const projection = proj as ResearchProjection;
    const { app } = runtime;

    const kpis: KpiTile[] = [
      {
        id: "sources-count",
        label: "Sources",
        value: String(runtime.researchSourcesCount ?? (runtime.researchSources ?? []).length),
      },
      {
        id: "last-synth-age",
        label: "Last synth",
        value: runtime.researchLastSynthAge ?? "—",
      },
    ];

    const hero = {
      kind: "research-split" as const,
      content: createElement(ResearchSplitView, {
        sources: runtime.researchSources ?? [],
        synthesis: runtime.researchSynthesisContent ?? null,
        citations: runtime.researchCitations ?? [],
      }),
    };

    const activity = {
      kind: "run-history-timeline" as const,
      content: createElement(RunHistoryTimeline, {
        runs: runtime.researchRecentRuns ?? [],
        emptyHint: "Synthesis hasn't run yet",
      }),
    };

    return {
      header: {
        title: app.name,
        description: app.description ?? undefined,
        status: headerStatus(runtime),
        cadenceChip: runtime.cadence ?? undefined,
        runNowBlueprintId: projection.synthesisBlueprintId,
        runNowVariables: projection.synthesisBlueprintVars,
      },
      kpis,
      hero,
      activity,
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
