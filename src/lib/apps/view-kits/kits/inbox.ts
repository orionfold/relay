import { createElement } from "react";
import yaml from "js-yaml";
import { InboxSplitView } from "@/components/apps/inbox-split-view";
import { ThroughputStrip, hasSentimentColumn } from "@/components/apps/throughput-strip";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import { detectTriggerSource } from "../detect-trigger-source";
import type {
  KitDefinition,
  KitProjection,
  ResolveInput,
  RuntimeState,
  TriggerSource,
  ViewModel,
} from "../types";
import { headerStatus } from "../header-status";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

interface InboxProjection extends KitProjection {
  queueTableId: string | undefined;
  draftBlueprintId: string | undefined;
  triggerSource: TriggerSource;
  hasSentiment: boolean;
  draftBlueprintVars: BlueprintVariable[] | null;
  manifestYaml: string;
}

/**
 * Inbox — queue + draft kit. Hero is the InboxSplitView (queue left, draft
 * right, URL-driven row selection). Header swaps Run Now for a trigger-source
 * chip when triggerSource.kind === "row-insert" — for those apps the engine
 * fires when rows arrive, so manual Run Now would be misleading.
 */
export const inboxKit: KitDefinition = {
  id: "inbox",

  resolve(input: ResolveInput): KitProjection {
    const m = input.manifest;
    const bindings = m.view?.bindings;

    const queueTableId =
      bindings?.hero && "table" in bindings.hero
        ? bindings.hero.table
        : m.tables[0]?.id;

    const draftBlueprintId =
      bindings?.runs && "blueprint" in bindings.runs
        ? bindings.runs.blueprint
        : m.blueprints[0]?.id;

    const triggerSource = detectTriggerSource(m, draftBlueprintId);

    const hasSentiment = hasSentimentColumn(input.columns);

    const blueprint = draftBlueprintId
      ? m.blueprints.find((b) => b.id === draftBlueprintId)
      : null;
    const draftBlueprintVars: BlueprintVariable[] | null =
      blueprint &&
      "variables" in blueprint &&
      Array.isArray((blueprint as { variables?: unknown }).variables)
        ? ((blueprint as unknown as { variables: BlueprintVariable[] }).variables)
        : null;

    const projection: InboxProjection = {
      queueTableId,
      draftBlueprintId,
      triggerSource,
      hasSentiment,
      draftBlueprintVars,
      manifestYaml: yaml.dump(m, { lineWidth: 100 }),
    };
    return projection;
  },

  buildModel(proj: KitProjection, runtime: RuntimeState): ViewModel {
    const projection = proj as InboxProjection;
    const { app } = runtime;

    const queue = (runtime.inboxQueueRows ?? []).map((row) => ({
      id: row.id,
      title: String(row.values?.summary ?? row.values?.title ?? row.id),
      subtitle:
        [row.values?.channel, row.values?.sentiment]
          .filter(Boolean)
          .join(" · ") || undefined,
    }));

    const hero = {
      kind: "inbox-split" as const,
      content: createElement(InboxSplitView, {
        queue,
        selectedRowId: runtime.inboxSelectedRowId ?? null,
        draft: runtime.inboxDraftDocument ?? null,
      }),
    };

    // Phase 4 ships throughput-strip with placeholder values; Wave 6's
    // loadInboxQueue will populate dailyDrafts and (eventually) sentiment buckets.
    const activity = {
      kind: "throughput-strip" as const,
      content: createElement(ThroughputStrip, {
        dailyDrafts: (runtime.inboxQueueRows ?? []).length
          ? Array.from({ length: 7 }, () => 0)
          : [],
        sentimentBuckets: projection.hasSentiment
          ? { positive: 0, neutral: 0, negative: 0 }
          : undefined,
      }),
    };

    const isRowInsert = projection.triggerSource.kind === "row-insert";

    return {
      header: {
        title: app.name,
        description: app.description ?? undefined,
        status: headerStatus(runtime),
        runNowBlueprintId: isRowInsert ? undefined : projection.draftBlueprintId,
        runNowVariables: projection.draftBlueprintVars,
        triggerSourceChip: projection.triggerSource,
      },
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
