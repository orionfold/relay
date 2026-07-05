import type { ReactNode } from "react";
import type { AppDetail, AppManifest, ViewConfig } from "@/lib/apps/registry";
import type { ColumnDef } from "@/lib/tables/types";
import type { UserTableRowRow } from "@/lib/db/schema";
import type { TaskStatus } from "@/lib/constants/task-status";

/** A manifest-declared chart plus its resolved (JSON-parsed) source rows. */
export interface ChartData {
  spec: NonNullable<ViewConfig["bindings"]["charts"]>[number];
  rows: { data: Record<string, unknown> }[];
}

/**
 * Frozen contracts for the composed-app view-kit registry.
 *
 * Phase 1.1 lands these types and a single `placeholder` kit. Later phases
 * (Phase 2 onward) populate the registry with domain-aware kits — Tracker,
 * Workflow Hub, Coach, Ledger, Inbox, Research — that consume the same
 * `KitDefinition` shape. The shape is contract-frozen at this point.
 */

export type KitId =
  | "placeholder"
  | "tracker"
  | "workflow-hub"
  | "coach"
  | "ledger"
  | "inbox"
  | "research";

/**
 * Minimal per-table column descriptor passed into kit selection. In Phase 1.1
 * this is always an empty array; Phase 1.2 (`composed-app-manifest-view-field`)
 * wires real column shapes for the `pickKit` decision table.
 */
export interface ColumnSchemaRef {
  tableId: string;
  columns: { name: string; type?: string; semantic?: string }[];
}

export interface ResolveInput {
  manifest: AppManifest;
  columns: ColumnSchemaRef[];
  /** Phase 3: period selector value passed by Ledger only. */
  period?: "mtd" | "qtd" | "ytd";
  /** Phase 4: Inbox-only — selected row id from URL ?row=. Backward-compatible (optional). */
  rowId?: string | null;
}

/**
 * `KitProjection` is whatever a kit's `resolve` step extracts from the
 * manifest + columns to feed `buildModel`. Each kit defines its own internal
 * shape; the registry only sees `unknown` here so kits remain decoupled.
 */
export type KitProjection = Record<string, unknown>;

/** Phase 4: per-run summary used by RunHistoryTimeline + Research kit. */
export interface TimelineRun {
  id: string;
  status: "running" | "completed" | "failed" | "queued";
  startedAt: string;          // ISO
  durationMs?: number;
  outputDocumentId?: string;
}

/**
 * Server-only runtime state assembled by `data.ts` once per request and
 * passed through to `buildModel`. Phase 1.1 keeps this minimal; Phase 2+
 * extends it with recent runs, schedule windows, and KPI source rows.
 */
export interface RuntimeState {
  app: AppDetail;
  recentTaskCount?: number;
  /**
   * BUG-2: number of tasks currently in flight (status = "running") for this
   * app. Drives the header status chip — Ready (idle) vs Running — so an idle
   * app never pulses a fake "Running" literal.
   */
  activeRunCount?: number;
  scheduleCadence?: string | null;
  /** Phase 2: hero table content for Tracker kit (columns + last-N rows). */
  heroTable?: HeroTableData | null;
  /**
   * Wave-1 resurface: manifest-declared table charts (`view.bindings.charts`)
   * with their source rows loaded, rendered as promoted secondary slots by the
   * Tracker kit instead of leaving charts buried behind the Charts tab.
   */
  chartData?: ChartData[];
  /** Phase 2: schedule cadence chip data for Tracker / Workflow Hub headers. */
  cadence?: CadenceChipData | null;
  /** Phase 2: KPI tiles already evaluated from declared/synthesized specs. */
  evaluatedKpis?: KpiTile[];
  /** Phase 2: per-blueprint last-run summary (Workflow Hub `secondary`). */
  blueprintLastRuns?: Record<string, RuntimeTaskSummary | null>;
  /** Phase 2: per-blueprint run count over last 30 days. */
  blueprintRunCounts?: Record<string, number>;
  /** Phase 2: recent failed tasks for Workflow Hub `error-timeline`. */
  failedTasks?: RuntimeTaskSummary[];
  /**
   * FEAT-5/6: per-blueprint card metadata for the runnable-cards home. Name +
   * one-line description + input variables (for the Run sheet) + trigger (for
   * row-insert gating) + `isPrimary` ("Start here" flag). Resolved from the
   * blueprint registry via a dynamic import so `data.ts` stays off the
   * runtime-catalog module-load cycle (see CLAUDE.md smoke-budget note).
   */
  blueprintCards?: BlueprintCard[];

  /** Phase 3: Coach kit fields. */
  coachLatestTask?: RuntimeTaskSummary | null;
  coachPreviousRuns?: RuntimeTaskSummary[];
  coachCadenceCells?: { date: string; runs: number; status?: "success" | "fail" }[];

  /** Phase 3: Ledger kit fields. */
  ledgerSeries?: { date: string; value: number }[];
  ledgerCategories?: { label: string; value: number }[];
  ledgerTransactions?: { id: string; date: string; label: string; amount: number; category?: string }[];
  ledgerMonthlyClose?: RuntimeTaskSummary | null;
  ledgerPeriod?: "mtd" | "qtd" | "ytd";

  /** Phase 4: Inbox kit fields. */
  inboxQueueRows?: { id: string; tableId: string; values: Record<string, unknown> }[];
  inboxSelectedRowId?: string | null;
  inboxDraftDocument?: {
    id: string;
    filename: string;
    content: string;
    taskId: string;
  } | null;

  /** Phase 4: Research kit fields. */
  researchSources?: { id: string; values: Record<string, unknown> }[];
  latestSynthesisDocId?: string | null;
  researchSynthesisContent?: string | null;
  researchCitations?: { docId: string; sourceRowId: string; sourceLabel: string }[];
  researchRecentRuns?: TimelineRun[];
  researchSourcesCount?: number;
  researchLastSynthAge?: string | null;
}

/** Phase 2: cadence chip data for `HeaderSlot.cadenceChip`. */
export interface CadenceChipData {
  humanLabel: string | null;
  nextFireMs: number | null;
}

/** Phase 2: hero-table payload for the Tracker kit's hero slot. */
export interface HeroTableData {
  tableId: string;
  columns: ColumnDef[];
  rows: UserTableRowRow[];
}

/**
 * FEAT-5/6: metadata for one runnable blueprint card on the app home. Combines
 * the manifest stub (id + trigger) with the registered blueprint definition
 * (name + description + variables). `isPrimary` flags the "Start here" card.
 */
export interface BlueprintCard {
  id: string;
  /** Human name from the blueprint definition; falls back to the id. */
  name: string;
  /** One-line "what it does" from the blueprint definition, if any. */
  description: string | null;
  /** Input variables for the Run sheet; empty array = direct-POST run. */
  variables: import("@/lib/workflows/blueprints/types").BlueprintVariable[];
  /**
   * How the blueprint fires. `row-insert` blueprints run automatically on new
   * rows — the card labels that instead of offering a fighting manual Run.
   * `table` is the raw (post-install often a UUID) table id; `tableName` is the
   * human-readable table name for copy, resolved from the table store.
   */
  trigger: { kind: "row-insert"; table: string; tableName: string } | null;
  /** The recommended first workflow, rendered with a "Start here" flag. */
  isPrimary: boolean;
  /**
   * Whether the blueprint DEFINITION was resolved from the registry at
   * enrichment time. `false` = the registry had no definition for this id (the
   * files never reached the scanned dir, or the registry import failed), so
   * `name` fell back to the raw id and there are no `variables`/`description`.
   * The card renders an explicit "couldn't load" state instead of a fake Run
   * button that would fail downstream at /instantiate (#31, principle #1).
   */
  resolved: boolean;
}

/** Phase 2: minimal task summary used by Workflow Hub's secondary + activity. */
export interface RuntimeTaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: number;
  result: string | null;
}

// --- Slot types (consumed by `<KitView/>`) -----------------------------------

/** Phase 4: discriminated union describing how an app's run blueprint fires. */
export type TriggerSource =
  | { kind: "row-insert"; table: string; blueprintId: string }
  | { kind: "schedule"; scheduleId: string; blueprintId: string }
  | { kind: "manual"; blueprintId?: string };

export interface HeaderSlot {
  title: string;
  description?: string;
  status?: "ready" | "running" | "queued" | "completed" | "failed" | "planned";
  /** Right-aligned actions; rendered as ReactNode so kits can compose. */
  actions?: ReactNode;
  /** Phase 2: render a ScheduleCadenceChip when present. */
  cadenceChip?: CadenceChipData;
  /** Phase 2: render a RunNowButton with this blueprint id when present. */
  runNowBlueprintId?: string;
  /** Phase 3: pre-fetched blueprint variables for RunNowButton sheet. */
  runNowVariables?: import("@/lib/workflows/blueprints/types").BlueprintVariable[] | null;
  /** Phase 3: render a PeriodSelectorChip (Ledger kit). */
  periodChip?: { current: "mtd" | "qtd" | "ytd" };
  /** Phase 4: render a TriggerSourceChip when present (Inbox kit). */
  triggerSourceChip?: TriggerSource;
}

export interface KpiTile {
  id: string;
  label: string;
  value: string;
  hint?: string;
  trend?: "up" | "down" | "flat";
  /** Phase 2: optional sparkline data for the tile (max 30 points). */
  spark?: number[];
}

export interface HeroSlot {
  /**
   * Render-shape annotation. The slot view only renders `slot.content`; this
   * field is documentation-only for kits to declare intent.
   */
  kind: "table" | "markdown" | "list" | "custom" | "inbox-split" | "research-split";
  /** Rendered directly when present; kits may also provide a `data` payload. */
  content: ReactNode;
}

export interface SecondarySlot {
  id: string;
  title?: string;
  content: ReactNode;
}

export interface ActivityFeedSlot {
  /**
   * Render-shape annotation (documentation only). The slot view renders
   * `content` opaquely; kits set `kind` to declare intent.
   */
  kind?:
    | "history-list"
    | "throughput-strip"
    | "run-history-timeline"
    | "error-timeline";
  content: ReactNode;
}

/**
 * The "View manifest ▾" sheet content. The header slot's button opens this;
 * the footer slot mounts the actual sheet body.
 */
export interface ManifestPaneSlot {
  appId: string;
  appName: string;
  manifestYaml?: string;
  /** Composition cards (profiles, blueprints, tables, schedules) + files list. */
  body: ReactNode;
}

export interface ViewModel {
  header: HeaderSlot;
  kpis?: KpiTile[];
  hero?: HeroSlot;
  secondary?: SecondarySlot[];
  /**
   * FEAT-7: an optional one-line lead rendered above the secondary grid. The
   * Workflow Hub uses it for the blueprint-vs-workflow explainer ("each card is
   * a workflow you can run"). Plain text so it can't become a styling hatch.
   */
  secondaryLead?: string;
  /**
   * CF-FEAT-6: an optional 1-2-3 step flow rendered above the secondary grid
   * to orient a first-time user (pick → run → watch). Plain `{ n, text }`
   * pairs so the kit owns the wording and the slot view owns the numbering
   * chrome. Rendered only when present, so kits that don't set it are
   * unaffected.
   */
  secondarySteps?: { n: number; text: string }[];
  activity?: ActivityFeedSlot;
  footer?: ManifestPaneSlot;
}

/**
 * The frozen kit contract. A kit is a pair of pure projection functions:
 *
 *   - `resolve` reads the manifest + column schemas and produces a kit-internal
 *     projection (no React, no fetching).
 *   - `buildModel` combines the projection with server-loaded `RuntimeState`
 *     to produce a `ViewModel` ready for `<KitView/>`.
 *
 * Kits never own React state and never fetch data themselves.
 */
export interface KitDefinition {
  id: KitId;
  resolve: (input: ResolveInput) => KitProjection;
  buildModel: (proj: KitProjection, runtime: RuntimeState) => ViewModel;
}
