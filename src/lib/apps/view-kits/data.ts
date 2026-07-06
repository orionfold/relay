import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, tasks, schedules, userTableRows } from "@/lib/db/schema";
import { humanizeCron } from "@/lib/apps/registry";
import type { AppDetail, AppManifest, ViewConfig } from "@/lib/apps/registry";
import type { ResolvedBindings } from "./resolve";
import type {
  BlueprintCard,
  CadenceChipData,
  ChartData,
  FunnelData,
  HeroTableData,
  KitId,
  KpiTile,
  RuntimeState,
  RuntimeTaskSummary,
} from "./types";
import type { ColumnDef } from "@/lib/tables/types";
import type { TaskStatus } from "@/lib/constants/task-status";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";
import { evaluateKpi } from "./evaluate-kpi";
import { createKpiContext, windowStart } from "./kpi-context";
import { computeFunnelBands } from "./funnel-compute";

type KpiSpec = NonNullable<ViewConfig["bindings"]["kpis"]>[number];
type ChartSpec = NonNullable<ViewConfig["bindings"]["charts"]>[number];
type FunnelSpec = NonNullable<ViewConfig["bindings"]["funnel"]>;

/**
 * Subset of kit projection fields read by `loadRuntimeState`. Kits that need
 * specific runtime data declare these in their projection; kits that don't
 * leave them undefined.
 */
export interface KitProjectionShape {
  heroTableId?: string;
  cadenceScheduleId?: string;
  runsBlueprintId?: string;
  kpiSpecs?: KpiSpec[];
  /** Wave-1 resurface: manifest-declared charts to load rows for (Tracker). */
  chartSpecs?: ChartSpec[];
  /** Funnel band-flow spec to compute bands for (Tracker + Workflow Hub). */
  funnelSpec?: FunnelSpec;
  blueprintIds?: string[];
  scheduleIds?: string[];
  /** FEAT-5/6: Workflow Hub — blueprint flagged "Start here" on the card home. */
  primaryBlueprintId?: string;
  /** Phase 3: Ledger period; threaded into windowed KPI specs. */
  period?: "mtd" | "qtd" | "ytd";
  /** Phase 3: Ledger column inference for data-layer queries. */
  amountColumn?: string;
  categoryColumn?: string;
  /** Phase 3: Ledger transaction-row date column (e.g. `date`, `billing_date`). */
  dateColumn?: string;
  /** Phase 4: Inbox kit — table whose rows populate the queue. */
  queueTableId?: string;
  /** Phase 4: Research kit — table whose rows are source documents. */
  sourcesTableId?: string;
  /** Phase 4: Research kit — blueprint id for synthesis runs. */
  synthesisBlueprintId?: string;
}

/**
 * Server-only loader: assembles a `RuntimeState` for the kit's `buildModel`.
 * Phase 2 makes this kit-aware — based on `kitId` we populate different
 * subsets of the optional Phase 2 fields. Tracker needs heroTable + cadence
 * + KPIs; Workflow Hub needs blueprintLastRuns + counts + failedTasks.
 *
 * Generic baseline (recentTaskCount, scheduleCadence) is always populated
 * for compat with the placeholder kit and Phase 1.1 behavior.
 */
async function loadRuntimeStateUncached(
  app: AppDetail,
  bindings: ResolvedBindings,
  kitId: KitId,
  projection: KitProjectionShape,
  /** Phase 4: Inbox-only — selected row id from URL ?row= */
  rowId?: string | null
): Promise<RuntimeState> {
  const baseline = await loadBaseline(app);
  // Provide a typed input alias so inbox/research branches can read rowId
  const input = { rowId };

  if (kitId === "tracker") {
    return {
      ...baseline,
      cadence: await loadCadence(app.manifest, projection.cadenceScheduleId),
      heroTable: await loadHeroTable(projection.heroTableId),
      evaluatedKpis: await loadEvaluatedKpis(projection.kpiSpecs ?? []),
      chartData: await loadChartData(projection.chartSpecs ?? []),
      funnelData: await loadFunnelData(projection.funnelSpec),
    };
  }

  if (kitId === "workflow-hub") {
    return {
      ...baseline,
      cadence: await loadCadence(app.manifest, undefined),
      blueprintLastRuns: await loadBlueprintLastRuns(bindings.blueprintIds),
      blueprintRunCounts: await loadBlueprintRunCounts(bindings.blueprintIds),
      blueprintCards: await loadBlueprintCards(app.manifest, projection.primaryBlueprintId),
      failedTasks: await loadFailedTasks(app.id, 10),
      evaluatedKpis: await loadEvaluatedKpis(projection.kpiSpecs ?? []),
      funnelData: await loadFunnelData(projection.funnelSpec),
    };
  }

  if (kitId === "coach") {
    return {
      ...baseline,
      cadence: await loadCadence(app.manifest, projection.cadenceScheduleId),
      coachLatestTask: await loadCoachLatestTask(app.id, projection.runsBlueprintId),
      coachPreviousRuns: await loadCoachPreviousRuns(app.id, projection.runsBlueprintId, 8),
      coachCadenceCells: await loadCoachCadenceCells(app.id, projection.runsBlueprintId, 12),
      evaluatedKpis: await loadEvaluatedKpis(projection.kpiSpecs ?? []),
    };
  }

  if (kitId === "ledger") {
    const period = projection.period ?? "mtd";
    const amountCol = projection.amountColumn ?? "amount";
    const categoryCol = projection.categoryColumn ?? "category";
    return {
      ...baseline,
      ledgerSeries: await loadLedgerSeries(projection.heroTableId, amountCol, period),
      ledgerCategories: await loadLedgerCategories(
        projection.heroTableId,
        amountCol,
        categoryCol,
        period
      ),
      ledgerTransactions: await loadLedgerTransactions(projection.heroTableId, period, 25, projection.dateColumn),
      ledgerMonthlyClose: await loadMonthlyCloseSummary(app.id, projection.runsBlueprintId),
      ledgerPeriod: period,
      evaluatedKpis: await loadEvaluatedKpis(projection.kpiSpecs ?? []),
    };
  }

  if (kitId === "inbox") {
    const queue = await loadInboxQueue(projection.queueTableId);
    return {
      ...baseline,
      inboxQueueRows: queue,
      inboxSelectedRowId: input.rowId ?? null,
      inboxDraftDocument: input.rowId
        ? await loadInboxDraft(app.id, input.rowId)
        : null,
    };
  }

  if (kitId === "research") {
    const sources = await loadResearchSources(projection.sourcesTableId);
    const synthesis = await loadLatestSynthesis(app.id, projection.synthesisBlueprintId);
    const runs = await loadRecentRuns(app.id, projection.synthesisBlueprintId, 10);
    const cadence = await loadCadence(app.manifest, projection.cadenceScheduleId);
    const lastSynthAge = synthesis ? humanizeAge(synthesis.ageMs) : null;
    return {
      ...baseline,
      cadence,
      researchSources: sources,
      latestSynthesisDocId: synthesis?.docId ?? null,
      researchSynthesisContent: synthesis?.content ?? null,
      researchCitations: [], // Phase 4: real citation linkage deferred; ship as []
      researchRecentRuns: runs,
      researchSourcesCount: sources.length,
      researchLastSynthAge: lastSynthAge,
    };
  }

  // placeholder + any unrecognized kit: just baseline
  return baseline;
}

async function loadBaseline(app: AppDetail): Promise<RuntimeState> {
  let recentTaskCount: number | undefined;
  let activeRunCount = 0;
  try {
    const rows = db
      .select({ value: count() })
      .from(tasks)
      .where(eq(tasks.projectId, app.id))
      .all();
    recentTaskCount = rows[0]?.value ?? 0;
    // BUG-2: the header status must reflect whether the app is ACTUALLY
    // running something, not a hardcoded literal. Count in-flight tasks
    // (status = "running") for this app so kits can render Ready vs Running.
    const running = db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.projectId, app.id), eq(tasks.status, "running")))
      .all();
    activeRunCount = running[0]?.value ?? 0;
  } catch {
    recentTaskCount = undefined;
    activeRunCount = 0;
  }
  const firstCron = app.manifest.schedules[0]?.cron;
  const scheduleCadence = firstCron ? humanizeCron(firstCron) : null;
  return { app, recentTaskCount, scheduleCadence, activeRunCount };
}

async function loadCadence(
  manifest: AppManifest,
  scheduleId: string | undefined
): Promise<CadenceChipData | null> {
  const sched = scheduleId
    ? manifest.schedules.find((s) => s.id === scheduleId)
    : manifest.schedules[0];
  if (!sched?.cron) return null;
  const humanLabel = humanizeCron(sched.cron);

  let nextFireMs: number | null = null;
  if (sched.id) {
    try {
      const row = db
        .select({ value: schedules.nextFireAt })
        .from(schedules)
        .where(eq(schedules.id, sched.id))
        .get();
      nextFireMs = row?.value ? row.value.getTime() : null;
    } catch {
      nextFireMs = null;
    }
  }
  return { humanLabel, nextFireMs };
}

async function loadHeroTable(
  heroTableId: string | undefined
): Promise<HeroTableData | null> {
  if (!heroTableId) return null;
  try {
    const mod = await import("@/lib/data/tables");
    const cols = await mod.getColumns(heroTableId);
    const columns: ColumnDef[] = cols.map((c) => ({
      name: c.name,
      displayName: c.displayName,
      dataType: c.dataType as ColumnDef["dataType"],
      position: c.position,
      required: c.required,
      defaultValue: c.defaultValue,
      config: c.config ? (JSON.parse(c.config) as ColumnDef["config"]) : null,
    }));
    const rows = db
      .select()
      .from(userTableRows)
      .where(eq(userTableRows.tableId, heroTableId))
      .orderBy(desc(userTableRows.createdAt))
      .limit(50)
      .all();
    return { tableId: heroTableId, columns, rows };
  } catch {
    return null;
  }
}

/**
 * Wave-1 resurface: load source rows for each manifest-declared chart. Each
 * chart's table rows are read and their JSON `data` column parsed into the
 * shape `TableChartView` consumes. A chart whose table has no rows (or fails
 * to load) resolves to an empty `rows` array so the chart renders its own
 * "No data" empty state rather than the whole view erroring — principle #1,
 * failures are visible-but-contained, not swallowed into a blank surface.
 */
async function loadChartData(specs: ChartSpec[]): Promise<ChartData[]> {
  const out: ChartData[] = [];
  for (const spec of specs) {
    let rows: { data: Record<string, unknown> }[] = [];
    try {
      const raw = db
        .select({ data: userTableRows.data })
        .from(userTableRows)
        .where(eq(userTableRows.tableId, spec.table))
        .orderBy(desc(userTableRows.createdAt))
        .limit(500)
        .all();
      rows = raw.map((r) => ({
        data: JSON.parse(r.data) as Record<string, unknown>,
      }));
    } catch {
      rows = [];
    }
    out.push({ spec, rows });
  }
  return out;
}

/**
 * Compute the funnel band-flow from live rows. Collects the DISTINCT tables the
 * bands reference (Attract reads `channels`, the leads bands read `leads`),
 * loads each once, and delegates the math to the pure `computeFunnelBands`. A
 * table that fails to load resolves to empty rows, so a band over it renders 0
 * rather than erroring the whole view (Principle #1 — contained, not swallowed:
 * a 0 band is visible). Returns `null` when the app declares no funnel.
 *
 * After a bundle flatten the band `table` refs are already the real UUIDs
 * (`rewriteViewRefs` walked every `table` key at install), so a cross-child
 * read — Attract's `channels` from relay-social feeding the same funnel as the
 * leads bands from relay-crm — resolves against the merged app's real tables.
 */
async function loadFunnelData(spec?: FunnelSpec): Promise<FunnelData | null> {
  if (!spec) return null;
  const tableIds = [...new Set(spec.bands.map((b) => b.table))];
  const rows: Record<string, { data: Record<string, unknown> }[]> = {};
  for (const tableId of tableIds) {
    try {
      const raw = db
        .select({ data: userTableRows.data })
        .from(userTableRows)
        .where(eq(userTableRows.tableId, tableId))
        .limit(2000)
        .all();
      rows[tableId] = raw.map((r) => ({
        data: JSON.parse(r.data) as Record<string, unknown>,
      }));
    } catch {
      rows[tableId] = [];
    }
  }
  const bands = computeFunnelBands(spec, rows, { now: Date.now() });
  return { title: spec.title ?? null, bands };
}

async function loadBlueprintLastRuns(
  blueprintIds: string[]
): Promise<Record<string, RuntimeTaskSummary | null>> {
  const out: Record<string, RuntimeTaskSummary | null> = {};
  if (blueprintIds.length === 0) return out;
  for (const id of blueprintIds) out[id] = null;
  try {
    const rows = db
      .select()
      .from(tasks)
      .where(inArray(tasks.assignedAgent, blueprintIds))
      .orderBy(desc(tasks.createdAt))
      .limit(50)
      .all();
    for (const row of rows) {
      const bp = row.assignedAgent ?? "";
      if (bp && out[bp] == null) {
        out[bp] = {
          id: row.id,
          title: row.title,
          status: row.status as TaskStatus,
          createdAt: row.createdAt.getTime(),
          result: row.result,
        };
      }
    }
  } catch {
    // leave nulls
  }
  return out;
}

async function loadBlueprintRunCounts(
  blueprintIds: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (blueprintIds.length === 0) return out;
  const since = new Date(Date.now() - 30 * 86_400_000);
  for (const id of blueprintIds) out[id] = 0;
  try {
    for (const bpId of blueprintIds) {
      const rows = db
        .select({ value: count() })
        .from(tasks)
        .where(and(eq(tasks.assignedAgent, bpId), gte(tasks.createdAt, since)))
        .all();
      out[bpId] = rows[0]?.value ?? 0;
    }
  } catch {
    // leave zeros
  }
  return out;
}

async function loadFailedTasks(
  projectId: string,
  limit: number
): Promise<RuntimeTaskSummary[]> {
  try {
    const rows = db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "failed")))
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .all();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as TaskStatus,
      createdAt: r.createdAt.getTime(),
      result: r.result,
    }));
  } catch {
    return [];
  }
}

async function loadEvaluatedKpis(specs: KpiSpec[]): Promise<KpiTile[]> {
  if (specs.length === 0) return [];
  const ctx = createKpiContext();
  const tiles: KpiTile[] = [];
  for (const spec of specs) {
    try {
      tiles.push(await evaluateKpi(spec, ctx));
    } catch {
      tiles.push({ id: spec.id, label: spec.label, value: "—" });
    }
  }
  return tiles;
}

// --- Phase 3: Coach loaders ---------------------------------------------------

/**
 * Returns the most recent COMPLETED task scoped to the app + (optional)
 * blueprint, or `null` when nothing has run yet. Used by Coach kit's "latest
 * run summary" panel and reused by Ledger kit's monthly-close summary.
 */
async function loadCoachLatestTask(
  appId: string,
  blueprintId: string | undefined
): Promise<RuntimeTaskSummary | null> {
  try {
    const conditions = [
      eq(tasks.projectId, appId),
      eq(tasks.status, "completed"),
    ];
    if (blueprintId) {
      conditions.push(eq(tasks.assignedAgent, blueprintId));
    }
    const row = db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(1)
      .get();
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      status: row.status as TaskStatus,
      createdAt: row.createdAt.getTime(),
      result: row.result,
    };
  } catch {
    return null;
  }
}

/**
 * Returns previous runs (any status) for the Coach kit, skipping the most
 * recent completed one (which is loaded separately as `coachLatestTask`).
 */
async function loadCoachPreviousRuns(
  appId: string,
  blueprintId: string | undefined,
  limit: number
): Promise<RuntimeTaskSummary[]> {
  try {
    const conditions = [eq(tasks.projectId, appId)];
    if (blueprintId) {
      conditions.push(eq(tasks.assignedAgent, blueprintId));
    }
    // Pull limit+1 so we can drop the most recent (the "latest" entry).
    const rows = db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(limit + 1)
      .all();
    return rows.slice(1).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as TaskStatus,
      createdAt: r.createdAt.getTime(),
      result: r.result,
    }));
  } catch {
    return [];
  }
}

/**
 * Aggregates tasks by date over the last `weeks * 7` days. Each cell counts
 * runs and flags `fail` if any task on that day failed, else `success`.
 * Drives the Coach kit's GitHub-style cadence heatmap.
 */
async function loadCoachCadenceCells(
  appId: string,
  blueprintId: string | undefined,
  weeks: number
): Promise<{ date: string; runs: number; status?: "success" | "fail" }[]> {
  try {
    const days = Math.max(1, Math.floor(weeks * 7));
    const since = new Date(Date.now() - days * 86_400_000);
    const conditions = [
      eq(tasks.projectId, appId),
      gte(tasks.createdAt, since),
    ];
    if (blueprintId) {
      conditions.push(eq(tasks.assignedAgent, blueprintId));
    }
    // SQLite stores Drizzle Date columns as ms; date() expects seconds.
    const rows = db
      .select({
        date: sql<string>`date(${tasks.createdAt} / 1000, 'unixepoch')`,
        runs: count(),
        failed: sql<number>`SUM(CASE WHEN ${tasks.status} = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(tasks)
      .where(and(...conditions))
      .groupBy(sql`date(${tasks.createdAt} / 1000, 'unixepoch')`)
      .all();
    return rows.map((r) => ({
      date: r.date,
      runs: r.runs,
      status: (r.failed ?? 0) > 0 ? ("fail" as const) : ("success" as const),
    }));
  } catch {
    return [];
  }
}

// --- Phase 3: Ledger loaders --------------------------------------------------

/**
 * Daily SUM of the amount column from `userTableRows` since `windowStart`.
 * Returns ascending-by-date series for the Ledger kit's flow chart.
 */
async function loadLedgerSeries(
  tableId: string | undefined,
  amountColumn: string,
  period: "mtd" | "qtd" | "ytd"
): Promise<{ date: string; value: number }[]> {
  if (!tableId) return [];
  try {
    const path = "$." + amountColumn;
    const since = windowStart(period);
    const rows = db
      .select({
        date: sql<string>`date(${userTableRows.createdAt} / 1000, 'unixepoch')`,
        value: sql<number>`COALESCE(SUM(CAST(json_extract(${userTableRows.data}, ${path}) AS REAL)), 0)`,
      })
      .from(userTableRows)
      .where(
        and(
          eq(userTableRows.tableId, tableId),
          gte(userTableRows.createdAt, since)
        )
      )
      .groupBy(sql`date(${userTableRows.createdAt} / 1000, 'unixepoch')`)
      .orderBy(sql`date(${userTableRows.createdAt} / 1000, 'unixepoch') ASC`)
      .all();
    return rows.map((r) => ({ date: r.date, value: r.value ?? 0 }));
  } catch {
    return [];
  }
}

/**
 * Period-scoped SUM of |amount| grouped by category column. Powers the
 * Ledger kit's category breakdown / donut.
 */
async function loadLedgerCategories(
  tableId: string | undefined,
  amountColumn: string,
  categoryColumn: string,
  period: "mtd" | "qtd" | "ytd"
): Promise<{ label: string; value: number }[]> {
  if (!tableId) return [];
  try {
    const amountPath = "$." + amountColumn;
    const categoryPath = "$." + categoryColumn;
    const since = windowStart(period);
    const rows = db
      .select({
        label: sql<string>`COALESCE(json_extract(${userTableRows.data}, ${categoryPath}), 'Uncategorized')`,
        value: sql<number>`COALESCE(SUM(ABS(CAST(json_extract(${userTableRows.data}, ${amountPath}) AS REAL))), 0)`,
      })
      .from(userTableRows)
      .where(
        and(
          eq(userTableRows.tableId, tableId),
          gte(userTableRows.createdAt, since)
        )
      )
      .groupBy(sql`json_extract(${userTableRows.data}, ${categoryPath})`)
      .orderBy(
        sql`COALESCE(SUM(ABS(CAST(json_extract(${userTableRows.data}, ${amountPath}) AS REAL))), 0) DESC`
      )
      .all();
    return rows.map((r) => ({ label: r.label ?? "Uncategorized", value: r.value ?? 0 }));
  } catch {
    return [];
  }
}

/**
 * Most recent N rows scoped to the period. `label` falls back from `label`
 * to `description`; `category` is optional. Used by the Ledger kit's
 * transactions list.
 */
async function loadLedgerTransactions(
  tableId: string | undefined,
  period: "mtd" | "qtd" | "ytd",
  limit: number = 25,
  dateColumn?: string,
): Promise<{ id: string; date: string; label: string; amount: number; category?: string }[]> {
  if (!tableId) return [];
  try {
    const since = windowStart(period);
    const rows = db
      .select()
      .from(userTableRows)
      .where(
        and(
          eq(userTableRows.tableId, tableId),
          gte(userTableRows.createdAt, since)
        )
      )
      .orderBy(desc(userTableRows.createdAt))
      .limit(limit)
      .all();
    return rows.map((r) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = r.data ? (JSON.parse(r.data) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      const label =
        (typeof parsed.label === "string" && parsed.label) ||
        (typeof parsed.description === "string" && parsed.description) ||
        "(untitled)";
      const amountRaw = parsed.amount;
      const amount =
        typeof amountRaw === "number"
          ? amountRaw
          : typeof amountRaw === "string"
            ? Number.parseFloat(amountRaw) || 0
            : 0;
      const category =
        typeof parsed.category === "string" ? parsed.category : undefined;
      // Prefer the row's user-meaningful date field (e.g. "date", "billing_date")
      // over r.createdAt — the latter is the row insertion timestamp, not the
      // transaction date. Falls back to createdAt only when no date field exists.
      const parsedDate =
        dateColumn && typeof parsed[dateColumn] === "string"
          ? (parsed[dateColumn] as string)
          : null;
      let date: string;
      if (parsedDate && parsedDate.length > 0) {
        date = parsedDate.slice(0, 10);
      } else {
        const fallback = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
        date = Number.isFinite(fallback.getTime())
          ? fallback.toISOString().slice(0, 10)
          : "";
      }
      return {
        id: r.id,
        date,
        label,
        amount,
        category,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Ledger's monthly-close summary uses the same "most recent completed task
 * per blueprint" semantics as Coach's latest task. Thin alias for clarity at
 * the call site and to keep future divergence cheap.
 */
async function loadMonthlyCloseSummary(
  appId: string,
  blueprintId: string | undefined
): Promise<RuntimeTaskSummary | null> {
  return loadCoachLatestTask(appId, blueprintId);
}

/**
 * Looks up a blueprint via the workflow registry and returns its declared
 * variables. Used as a fallback when the manifest's blueprint stub lacks
 * variables and we need the registry's full definition.
 *
 * Uses dynamic `await import()` to avoid module-load cycles between the
 * runtime catalog and the apps view-kit data layer (see CLAUDE.md note).
 */
export async function loadBlueprintVariables(
  blueprintId: string | undefined
): Promise<BlueprintVariable[] | null> {
  if (!blueprintId) return null;
  try {
    const mod = await import("@/lib/workflows/blueprints/registry");
    const bp = mod.getBlueprint(blueprintId);
    if (!bp) return null;
    return bp.variables ?? [];
  } catch {
    return null;
  }
}

/**
 * FEAT-5/6: builds the runnable-card metadata for the Workflow Hub home — one
 * card per manifest blueprint, in manifest order. Combines each manifest stub
 * (id + trigger) with its registered definition (name + description +
 * variables) so the card can render a name, one-line "what it does", a Run
 * action, and honor row-insert gating.
 *
 * The blueprint registry is loaded via dynamic `import()` to keep this module
 * off the runtime-catalog module-load cycle (see CLAUDE.md smoke-budget note).
 * A blueprint whose definition is missing (not yet materialized / invalid) still
 * gets a card — it falls back to its id for the name and offers a direct Run.
 *
 * `primaryBlueprintId` flags which card reads "Start here." When it doesn't
 * match any blueprint, no card is flagged (rather than defaulting to the first,
 * which for Agency Pro is the schedule-driven month-end-close — the wrong first
 * click per the walkthrough).
 */
async function loadBlueprintCards(
  manifest: AppManifest,
  primaryBlueprintId: string | undefined
): Promise<BlueprintCard[]> {
  let getBlueprint: ((id: string) => { name?: string; description?: string; variables?: BlueprintVariable[] } | undefined) | null = null;
  try {
    const mod = await import("@/lib/workflows/blueprints/registry");
    getBlueprint = mod.getBlueprint;
  } catch {
    getBlueprint = null;
  }
  // Resolve human table names for row-insert copy. Install rewrites the
  // manifest's `intake`/`grants` ids to real UUIDs, so the raw trigger.table
  // is unreadable ("a new 583aa0c2-… row"). The table store's `name` column
  // carries the label. Loaded via dynamic import (same module-cycle guard).
  const tableName = await loadTableNameResolver();
  return manifest.blueprints.map((stub) => {
    const def = getBlueprint?.(stub.id);
    const trigger =
      stub.trigger?.kind === "row-insert"
        ? {
            kind: "row-insert" as const,
            table: stub.trigger.table,
            tableName: tableName(stub.trigger.table),
          }
        : null;
    return {
      id: stub.id,
      name: def?.name ?? stub.id,
      description: def?.description ?? null,
      variables: def?.variables ?? [],
      trigger,
      isPrimary: stub.id === primaryBlueprintId,
      // #31: a definition-less card is a husk (raw id, no variables). Flag it so
      // the card renders an explicit "couldn't load" state instead of a fake Run
      // button that would fail downstream at /instantiate (principle #1).
      resolved: def != null,
    };
  });
}

/**
 * Returns a synchronous `id → human name` lookup for user-tables, so
 * `loadBlueprintCards` can label row-insert triggers without an await per
 * blueprint. Falls back to the id itself when a table isn't found (or the
 * store is unavailable). Dynamic import keeps `data.ts` off the runtime-catalog
 * module-load cycle (smoke-budget rule).
 */
async function loadTableNameResolver(): Promise<(id: string) => string> {
  try {
    const mod = await import("@/lib/data/tables");
    const tables = await mod.listTables();
    const byId = new Map<string, string>();
    for (const t of tables) {
      if (t.id && t.name) byId.set(t.id, t.name);
    }
    return (id: string) => byId.get(id) ?? id;
  } catch {
    return (id: string) => id;
  }
}

// --- Phase 4: helpers ---------------------------------------------------------

/** Converts milliseconds to a human-readable age string. */
function humanizeAge(ms: number): string {
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

// --- Phase 4: Inbox loaders --------------------------------------------------

/**
 * Returns up to 50 rows from the given user-table in position order, with
 * their `data` JSON parsed into a `values` map. Used by the Inbox kit's
 * queue panel.
 */
export async function loadInboxQueue(
  tableId: string | undefined
): Promise<{ id: string; tableId: string; values: Record<string, unknown> }[]> {
  if (!tableId) return [];
  const rows = db
    .select()
    .from(userTableRows)
    .where(eq(userTableRows.tableId, tableId))
    .orderBy(asc(userTableRows.position))
    .limit(50)
    .all();
  return rows.map((r) => ({
    id: r.id,
    tableId: r.tableId,
    values: typeof r.data === "string" ? (JSON.parse(r.data) as Record<string, unknown>) : {},
  }));
}

/**
 * Core implementation for loadInboxDraft — separated so it can be called
 * directly in tests (which lack Next.js cache infrastructure) and wrapped
 * with `unstable_cache` in production paths.
 */
async function _inboxDraftFetch(appId: string, rowId: string) {
  const task = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.projectId, appId), eq(tasks.contextRowId, rowId)))
    .orderBy(desc(tasks.createdAt))
    .limit(1)
    .get();
  if (!task) return null;
  const doc = db
    .select()
    .from(documents)
    .where(eq(documents.taskId, task.id))
    .orderBy(desc(documents.createdAt))
    .limit(1)
    .get();
  if (!doc) return null;
  return {
    id: doc.id,
    filename: doc.filename ?? doc.originalName,
    content: typeof doc.extractedText === "string" ? doc.extractedText : "",
    taskId: task.id,
  };
}

const _loadInboxDraft = (appId: string, rowId: string) =>
  unstable_cache(
    () => _inboxDraftFetch(appId, rowId),
    ["inbox-draft", appId, rowId],
    { revalidate: 60 }
  );

/**
 * Returns the most recent document drafted for the given row in an Inbox app,
 * or `null` when no matching task + document exists. Uses `unstable_cache`
 * (60s TTL, keyed by appId + rowId).
 */
export async function loadInboxDraft(
  appId: string,
  rowId: string | null | undefined
) {
  if (!rowId) return null;
  return _loadInboxDraft(appId, rowId)();
}

// --- Phase 4: Research loaders -----------------------------------------------

/**
 * Returns up to 50 source rows from the research sources table in position
 * order. Same 50-row cap + JSON parse pattern as `loadInboxQueue`.
 */
export async function loadResearchSources(
  tableId: string | undefined
): Promise<{ id: string; values: Record<string, unknown> }[]> {
  if (!tableId) return [];
  const rows = db
    .select()
    .from(userTableRows)
    .where(eq(userTableRows.tableId, tableId))
    .orderBy(asc(userTableRows.position))
    .limit(50)
    .all();
  return rows.map((r) => ({
    id: r.id,
    values: typeof r.data === "string" ? (JSON.parse(r.data) as Record<string, unknown>) : {},
  }));
}

/**
 * Returns the most recent completed synthesis run for the app, including the
 * document's content (via `extractedText`) and the elapsed time in ms. Falls
 * back to `task.result` when no document is attached.
 */
export async function loadLatestSynthesis(
  appId: string,
  blueprintId: string | undefined
): Promise<{ docId: string; content: string; taskId: string; ageMs: number } | null> {
  if (!blueprintId) return null;
  const conditions = [eq(tasks.projectId, appId), eq(tasks.status, "completed")];
  if (blueprintId) {
    conditions.push(eq(tasks.assignedAgent, blueprintId));
  }
  const task = db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(1)
    .get();
  if (!task) return null;
  const doc = db
    .select()
    .from(documents)
    .where(eq(documents.taskId, task.id))
    .orderBy(desc(documents.createdAt))
    .limit(1)
    .get();
  const content =
    doc && typeof doc.extractedText === "string"
      ? doc.extractedText
      : (task.result ?? "");
  const ageMs = Date.now() - (task.createdAt instanceof Date ? task.createdAt.getTime() : task.createdAt ?? Date.now());
  if (!doc) {
    // Return a task-only entry — no docId but still useful for age / content.
    return { docId: task.id, content, taskId: task.id, ageMs };
  }
  return { docId: doc.id, content, taskId: task.id, ageMs };
}

/**
 * Returns the `limit` most recent runs for the app (any status), shaped as
 * `TimelineRun` records for the RunHistoryTimeline component.
 */
export async function loadRecentRuns(
  appId: string,
  blueprintId: string | undefined,
  limit: number = 10
) {
  const conditions = [eq(tasks.projectId, appId)];
  if (blueprintId) {
    conditions.push(eq(tasks.assignedAgent, blueprintId));
  }
  const rows = db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .all();
  return rows.map((t) => ({
    id: t.id,
    status: (t.status as "running" | "completed" | "failed" | "queued") ?? "queued",
    startedAt: (t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt ?? Date.now())).toISOString(),
    durationMs: undefined as number | undefined,
    outputDocumentId: undefined as string | undefined,
  }));
}

/**
 * Cached entry point. Cache key includes the app id + kit id + period (and
 * row id for Inbox) so different kits / period / row selections don't collide.
 * 30s revalidate.
 */
export function loadRuntimeState(
  app: AppDetail,
  bindings: ResolvedBindings,
  kitId: KitId,
  projection: KitProjectionShape,
  /** Phase 4: Inbox-only — selected row id from URL ?row= */
  rowId?: string | null
): Promise<RuntimeState> {
  const period = projection.period ?? "default";
  const rowKey = rowId ?? "none";
  const cached = unstable_cache(
    () => loadRuntimeStateUncached(app, bindings, kitId, projection, rowId),
    ["app-runtime", app.id, kitId, period, rowKey],
    { revalidate: 30, tags: [`app-runtime:${app.id}`] }
  );
  return cached();
}
