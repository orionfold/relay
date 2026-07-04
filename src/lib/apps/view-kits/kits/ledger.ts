import { createElement } from "react";
import yaml from "js-yaml";
import { LedgerHeroPanel } from "@/components/apps/ledger-hero-panel";
import { TransactionsTable } from "@/components/apps/transactions-table";
import { MonthlyCloseSummary } from "@/components/apps/monthly-close-summary";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import { defaultLedgerKpis } from "../default-kpis";
import type { ViewConfig } from "@/lib/apps/registry";
import type {
  KitDefinition,
  KitProjection,
  ResolveInput,
  RuntimeState,
  ViewModel,
} from "../types";
import { headerStatus } from "../header-status";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

type KpiSpec = NonNullable<ViewConfig["bindings"]["kpis"]>[number];

interface LedgerProjection extends KitProjection {
  heroTableId: string | undefined;
  runsBlueprintId: string | undefined;
  period: "mtd" | "qtd" | "ytd";
  amountColumn: string | undefined;
  categoryColumn: string | undefined;
  /**
   * Name of the JSON column to use as each transaction row's display date.
   * The transaction's user-meaningful date lives inside the row payload (e.g.
   * `date: "2026-05-01"`); the row's `createdAt` is the insertion time, which
   * is wrong for ledger semantics.
   */
  dateColumn: string | undefined;
  kpiSpecs: KpiSpec[];
  runsBlueprintVars: BlueprintVariable[] | null;
  manifestYaml: string;
}

/**
 * Ledger — finance/transactions kit. Hero pairs TimeSeriesChart + category
 * breakdown. KPIs span Net / Inflow / Outflow / Run-rate, all period-scoped.
 * Period flows from URL → page → projection at request time.
 */
export const ledgerKit: KitDefinition = {
  id: "ledger",

  resolve(input: ResolveInput): KitProjection {
    const m = input.manifest;
    const bindings = m.view?.bindings;
    const period = input.period ?? "mtd";

    const heroTableId =
      bindings?.hero && "table" in bindings.hero
        ? bindings.hero.table
        : m.tables[0]?.id;

    const runsBlueprintId =
      bindings?.runs && "blueprint" in bindings.runs
        ? bindings.runs.blueprint
        : m.blueprints[0]?.id;

    const heroCols = heroTableId
      ? input.columns.find((c) => c.tableId === heroTableId)?.columns ?? []
      : [];

    const amountColumn = heroCols.find(
      (c) => c.semantic === "currency" || /amount|balance|value/i.test(c.name)
    )?.name;
    const categoryColumn = heroCols.find((c) => /category|tag|group/i.test(c.name))?.name;
    const dateColumn =
      heroCols.find((c) => c.type === "date" || c.semantic === "date")?.name ??
      heroCols.find((c) => /^(date|.*_date|posted|occurred|billing|transaction)/i.test(c.name))?.name;

    const kpiSpecs = bindings?.kpis ?? defaultLedgerKpis(
      heroTableId ?? "",
      heroCols,
      period,
      runsBlueprintId
    );

    const blueprint = runsBlueprintId
      ? m.blueprints.find((b) => b.id === runsBlueprintId)
      : null;
    const runsBlueprintVars: BlueprintVariable[] | null =
      blueprint && "variables" in blueprint && Array.isArray((blueprint as { variables?: unknown }).variables)
        ? ((blueprint as unknown as { variables: BlueprintVariable[] }).variables)
        : null;

    const projection: LedgerProjection = {
      heroTableId,
      runsBlueprintId,
      period,
      amountColumn,
      categoryColumn,
      dateColumn,
      kpiSpecs,
      runsBlueprintVars,
      manifestYaml: yaml.dump(m, { lineWidth: 100 }),
    };
    return projection;
  },

  buildModel(proj: KitProjection, runtime: RuntimeState): ViewModel {
    const projection = proj as LedgerProjection;
    const { app } = runtime;

    const hero = {
      kind: "custom" as const,
      content: createElement(LedgerHeroPanel, {
        series: runtime.ledgerSeries ?? [],
        categories: runtime.ledgerCategories ?? [],
        period: projection.period,
      }),
    };

    const transactionRows = runtime.ledgerTransactions ?? [];
    const secondary = [
      {
        id: "transactions",
        title: "Recent transactions",
        content: createElement(TransactionsTable, {
          rows: transactionRows,
          format: "currency" as const,
        }),
      },
    ];

    const activity = {
      content: createElement(MonthlyCloseSummary, {
        task: runtime.ledgerMonthlyClose ?? null,
      }),
    };

    return {
      header: {
        title: app.name,
        description: app.description ?? undefined,
        status: headerStatus(runtime),
        runNowBlueprintId: projection.runsBlueprintId,
        runNowVariables: projection.runsBlueprintVars,
        periodChip: { current: projection.period },
      },
      kpis: runtime.evaluatedKpis ?? [],
      hero,
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
