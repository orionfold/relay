import { createElement } from "react";
import yaml from "js-yaml";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import { RunnableBlueprintCard } from "@/components/apps/last-run-card";
import { ErrorTimeline } from "@/components/workflows/error-timeline";
import { FunnelFlowView } from "@/components/apps/kit-view/funnel-flow-view";
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
type FunnelSpec = NonNullable<ViewConfig["bindings"]["funnel"]>;

interface WorkflowHubProjection extends KitProjection {
  blueprintIds: string[];
  scheduleIds: string[];
  kpiSpecs: KpiSpec[];
  funnelSpec?: FunnelSpec;
  primaryBlueprintId?: string;
  manifestYaml: string;
}

/**
 * FEAT-5/6: pick the "Start here" blueprint for the card home. The recommended
 * first click is the most rewarding manually-runnable workflow. We rank by:
 *   1. NOT row-insert-triggered — those fire on their own, so a manual Run
 *      fights the contract.
 *   2. NOT the target of a schedule — a schedule-driven job (e.g. month-end
 *      close) runs itself on cadence and is a poor, often empty, first click
 *      (the walkthrough's BUG-2 dead end).
 * First blueprint clearing both filters wins; then any manual blueprint; then
 * the first blueprint. `manifest` is read directly here because `resolve()` has
 * no registry access (that lives on the server-only data layer) — trigger +
 * schedule shape from the manifest is enough to choose.
 */
function pickPrimaryBlueprintId(input: ResolveInput): string | undefined {
  const bps = input.manifest.blueprints;
  const scheduled = new Set(
    input.manifest.schedules
      .map((s) => s.runs)
      .filter((r): r is string => typeof r === "string")
  );
  const manual = bps.filter((b) => b.trigger?.kind !== "row-insert");
  const unscheduledManual = manual.filter((b) => !scheduled.has(b.id));
  return unscheduledManual[0]?.id ?? manual[0]?.id ?? bps[0]?.id;
}

/**
 * Workflow Hub — the catch-all kit. Renders for any composed app that
 * doesn't match a more specific archetype (≥2 blueprints OR no clear hero
 * table per the inference table). Hero is intentionally absent; the value
 * is in KPIs (run-rate, success %, cost) + per-blueprint LastRunCard +
 * recent failures.
 *
 * Pure projection: no React state, no fetching. Runtime aggregates are
 * loaded by `loadRuntimeState`.
 */
export const workflowHubKit: KitDefinition = {
  id: "workflow-hub",

  resolve(input: ResolveInput): KitProjection {
    // Carry through manifest-declared KPIs so loadRuntimeState's
    // `loadEvaluatedKpis(projection.kpiSpecs)` finds them. Without this,
    // even a manifest with view.bindings.kpis renders no tiles. Workflow
    // Hub deliberately does NOT synthesize defaults — apps that pick this
    // kit are typically multi-blueprint hubs where auto-inferring KPIs
    // from a single hero table is meaningless.
    const projection: WorkflowHubProjection = {
      blueprintIds: input.manifest.blueprints.map((b) => b.id),
      scheduleIds: input.manifest.schedules.map((s) => s.id),
      kpiSpecs: input.manifest.view?.bindings?.kpis ?? [],
      funnelSpec: input.manifest.view?.bindings?.funnel,
      primaryBlueprintId: pickPrimaryBlueprintId(input),
      manifestYaml: yaml.dump(input.manifest, { lineWidth: 100 }),
    };
    return projection;
  },

  buildModel(proj: KitProjection, runtime: RuntimeState): ViewModel {
    const projection = proj as WorkflowHubProjection;
    const { app } = runtime;

    const lastRuns = runtime.blueprintLastRuns ?? {};
    const counts = runtime.blueprintRunCounts ?? {};

    // FEAT-5/6: runnable blueprint cards. Prefer the enriched cards (name +
    // description + variables + trigger) resolved by the data layer; fall back
    // to bare ids so the home never renders empty if enrichment failed. The
    // "Start here" card sorts first.
    const cards = runtime.blueprintCards ?? [];
    const ordered = [...cards].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary)
    );
    const cardSlots = ordered.map((card) => ({
      id: `blueprint-${card.id}`,
      primitiveKind: "workflow" as const,
      content: createElement(RunnableBlueprintCard, {
        card,
        lastRun: lastRuns[card.id] ?? null,
        runCount30d: counts[card.id] ?? 0,
      }),
    }));

    // The funnel band-flow (if declared) leads the secondary grid as the app's
    // analytics header, above the runnable blueprint cards. This is the primary
    // consumer of the funnel-flow primitive — the merged Marketing app maps its
    // leads lifecycle + channel reach onto Attract → Capture → Nurture →
    // Convert.
    const funnelSlot = runtime.funnelData
      ? [
          {
            id: "funnel-flow",
            title: runtime.funnelData.title ?? undefined,
            primitiveKind: "funnel" as const,
            fullWidth: true,
            content: createElement(FunnelFlowView, {
              bands: runtime.funnelData.bands,
            }),
          },
        ]
      : [];
    const secondary = [...funnelSlot, ...cardSlots];

    const failed = runtime.failedTasks ?? [];
    const activity =
      failed.length > 0
        ? {
            content: createElement(ErrorTimeline, {
              events: failed.map((t) => ({
                timestamp: new Date(t.createdAt).toISOString(),
                event: "task_failed",
                severity: "error" as const,
                details: t.result?.slice(0, 240) ?? t.title,
              })),
            }),
          }
        : undefined;

    return {
      header: {
        title: app.name,
        description: app.description ?? "Composed app",
        status: headerStatus(runtime),
        cadenceChip: runtime.cadence ?? undefined,
      },
      kpis: runtime.evaluatedKpis ?? [],
      // FEAT-7: the blueprint-vs-workflow one-liner. Only render it when there
      // are CARDS to explain (not merely a funnel slot), so an empty hub — or
      // one showing just the funnel — doesn't show a dangling "each card below"
      // lead pointing at no cards.
      secondaryLead:
        cardSlots.length > 0
          ? "Each card below is a workflow this app can run."
          : undefined,
      // CF-FEAT-6: the 1-2-3 activation flow. Gives a first-time user the
      // sequence from "installed" to "something ran" that flat prose can't.
      // Step 3 signposts Monitor, matching the post-run toast (CF-FEAT-8).
      secondarySteps:
        cardSlots.length > 0
          ? [
              { n: 1, text: "Pick a workflow below." },
              { n: 2, text: "Click Run to start it." },
              { n: 3, text: "Watch it finish in Monitor." },
            ]
          : undefined,
      secondary,
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
