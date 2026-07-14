import type { AppManifest } from "@/lib/apps/registry";
import type { ColumnSchemaRef, KitId } from "./types";

export interface InferenceProbe {
  id: string;
  label: string;
  value: boolean;
  evidence: string[];
}

export interface InferenceCandidate {
  ruleId: string;
  kit: KitId;
  condition: string;
  matched: boolean;
  selected: boolean;
  explanation: string;
}

export interface InferenceTrace {
  version: 1;
  source: "explicit" | "inferred";
  kit: KitId;
  declaredKit: KitId | "auto" | null;
  selectedRule: string;
  explanation: string;
  probes: InferenceProbe[];
  candidates: InferenceCandidate[];
}

/**
 * `pickKit` resolves which view kit renders a composed app. If the manifest
 * declares `view.kit` (and it isn't `auto`), that wins. Otherwise a
 * deterministic 7-rule decision table runs top-to-bottom — first match wins,
 * no scoring, no tie-breakers. Every rule is a small named pure predicate.
 *
 * Initial rule implementations are intentionally approximate. Phase 5
 * (`composed-app-auto-inference-hardening`) tightens the column-shape probes
 * against edge cases.
 */
export function pickKit(
  manifest: AppManifest,
  columnSchemas: ColumnSchemaRef[]
): KitId {
  return resolveKitSelection(manifest, columnSchemas).kit;
}

/**
 * Resolve a manifest to its actual kit plus a JSON-safe mechanical trace.
 * This is the single decision-table entry point used by both the dispatcher
 * and diagnostics UI, preventing explanation drift from runtime behavior.
 */
export function resolveKitSelection(
  manifest: AppManifest,
  columnSchemas: ColumnSchemaRef[]
): InferenceTrace {
  const declared = manifest.view?.kit ?? null;
  if (declared && declared !== "auto") {
    const kit = declared as KitId;
    return {
      version: 1,
      source: "explicit",
      kit,
      declaredKit: kit,
      selectedRule: "explicit-view-kit",
      explanation: `The app manifest explicitly declares view.kit: ${kit}.`,
      probes: [],
      candidates: [
        {
          ruleId: "explicit-view-kit",
          kit,
          condition: "The manifest declares a concrete view.kit value.",
          matched: true,
          selected: true,
          explanation: "Explicit manifest selection takes precedence over every inference rule.",
        },
      ],
    };
  }

  const evaluation = evaluateInference(manifest, columnSchemas);
  const selectedIndex = evaluation.candidates.findIndex((candidate) => candidate.matched);
  const winnerIndex = selectedIndex === -1 ? evaluation.candidates.length - 1 : selectedIndex;
  const winner = evaluation.candidates[winnerIndex];
  const candidates = evaluation.candidates.map((candidate, index) => ({
    ...candidate,
    selected: index === winnerIndex,
    explanation:
      index === winnerIndex
        ? candidate.explanation
        : index > winnerIndex && candidate.matched
          ? `${candidate.explanation} It did not win because an earlier rule matched first.`
          : candidate.explanation,
  }));

  return {
    version: 1,
    source: "inferred",
    kit: winner.kit,
    declaredKit: declared,
    selectedRule: winner.ruleId,
    explanation: winner.explanation,
    probes: evaluation.probes,
    candidates,
  };
}

export function explicitViewYaml(kit: KitId): string {
  return `view:\n  kit: ${kit}\n`;
}

// --- Rule predicates ---------------------------------------------------------

export function rule1_ledger(
  m: AppManifest,
  schemas: ColumnSchemaRef[]
): boolean {
  return evaluateInference(m, schemas).candidates[0].matched;
}

export function rule2_tracker(
  m: AppManifest,
  schemas: ColumnSchemaRef[]
): boolean {
  return evaluateInference(m, schemas).candidates[1].matched;
}

export function rule3_research(
  m: AppManifest,
  schemas?: ColumnSchemaRef[]
): boolean {
  return evaluateInference(m, schemas ?? []).candidates[2].matched;
}

export function rule4_coach(m: AppManifest): boolean {
  return evaluateInference(m, []).candidates[3].matched;
}

export function rule5_inbox(
  m: AppManifest,
  schemas?: ColumnSchemaRef[]
): boolean {
  return evaluateInference(m, schemas ?? []).candidates[4].matched;
}

export function rule6_multiBlueprint(m: AppManifest): boolean {
  return evaluateInference(m, []).candidates[5].matched;
}

// --- Column-shape probes -----------------------------------------------------

type Col = ColumnSchemaRef["columns"][number];

const CURRENCY_NAME_RE = /(^|[^a-z])(amount|price|cost|balance|total|revenue|income|spend)([^a-z]|$)/i;
const DATE_NAME_RE = /(^date$|_date$|_at$|^at_)/i;
const BOOLEAN_NAME_RE = /(^|_)(active|completed|done|enabled|verified|is)(_|$)/i;
const RATING_NAME_RE = /(^|_)(rating|score|stars|grade)(_|$)/i;
const SOURCE_NAME_RE = /(^|_)(url|link|source|article|reference|feed)(_|$)/i;
const NOTIFICATION_NAME_RE = /(^|_)(read|unread|seen|notified|notification)(_|$)/i;
const MESSAGE_NAME_RE = /(^|_)(body|message|subject|summary|content)(_|$)/i;
const STATUS_NAME_RE = /(^|_)(status|state|stage|phase)(_|$)/i;
const COUNT_NAME_RE = /(^|_)(count|total)(_|$)/i;
const COACH_RE = /(^|[-_])coach($|[-_])/i;
const DOC_BLUEPRINT_RE = /(^|[-_])(digest|report|summary|brief|synthesis)([-_]|$)/i;
const INBOX_BLUEPRINT_RE = /(^|[-_])(drafter|inbox|notification|message|follow[-_]?up|triage)([-_]|$)/i;

export function hasCurrency(cols: Col[]): boolean {
  return columnProbe(cols, "currency").value;
}

export function hasDate(cols: Col[]): boolean {
  return columnProbe(cols, "date").value;
}

export function hasBoolean(cols: Col[]): boolean {
  return columnProbe(cols, "boolean").value;
}

export function hasNotificationShape(cols: Col[]): boolean {
  return columnProbe(cols, "notification").value;
}

export function hasMessageShape(cols: Col[]): boolean {
  return columnProbe(cols, "message").value;
}

/** A numeric rating/score column — a tracker-style completion signal that's
 *  not a boolean (e.g. "stars given to a book"). */
export function hasRating(cols: Col[]): boolean {
  return columnProbe(cols, "rating").value;
}

/** A categorical state column — the workflow's "lane". Used to recognize
 *  pipeline/campaign-style trackers that use status instead of a boolean. */
export function hasStatusLike(cols: Col[]): boolean {
  return columnProbe(cols, "status").value;
}

/** A numeric measurement/aggregation column. Used to recognize trackers
 *  that use counts (engagement_count, total_views) as a progress signal. */
export function hasCountLike(cols: Col[]): boolean {
  return columnProbe(cols, "count").value;
}

/** A column that looks like an external source link/reference — used to
 *  decide whether the research kit (sources + synthesis) is appropriate. */
export function hasSourceShape(cols: Col[]): boolean {
  return columnProbe(cols, "source").value;
}

type ColumnProbeKind =
  | "currency"
  | "date"
  | "boolean"
  | "notification"
  | "message"
  | "rating"
  | "status"
  | "count"
  | "source";

function columnProbe(cols: Col[], kind: ColumnProbeKind): Omit<InferenceProbe, "id" | "label"> {
  const evidence: string[] = [];
  for (const column of cols) {
    const matches = columnMatch(column, kind);
    if (matches) evidence.push(`${column.name} (${matches})`);
  }
  return { value: evidence.length > 0, evidence };
}

function columnMatch(column: Col, kind: ColumnProbeKind): string | null {
  const semantic = column.semantic;
  if (
    (kind === "currency" && semantic === "currency") ||
    (kind === "date" && semantic === "date") ||
    (kind === "boolean" && semantic === "boolean") ||
    (kind === "notification" && semantic === "notification") ||
    (kind === "message" && semantic === "message-body") ||
    (kind === "rating" && semantic === "rating") ||
    (kind === "status" && semantic === "status") ||
    (kind === "count" && semantic === "count") ||
    (kind === "source" && (semantic === "url" || semantic === "source"))
  ) return `semantic: ${semantic}`;

  if (kind === "currency" && column.format === "currency") return "format: currency";
  if (kind === "date" && (column.type === "date" || column.type === "datetime")) return `type: ${column.type}`;
  if (kind === "boolean" && column.type === "boolean") return "type: boolean";
  if (kind === "source" && column.type === "url") return "type: url";

  const regex =
    kind === "currency" ? CURRENCY_NAME_RE :
    kind === "date" ? DATE_NAME_RE :
    kind === "boolean" ? BOOLEAN_NAME_RE :
    kind === "notification" ? NOTIFICATION_NAME_RE :
    kind === "message" ? MESSAGE_NAME_RE :
    kind === "rating" ? RATING_NAME_RE :
    kind === "status" ? STATUS_NAME_RE :
    kind === "count" ? COUNT_NAME_RE : SOURCE_NAME_RE;
  return regex.test(column.name) ? "name heuristic" : null;
}

function evaluateInference(
  manifest: AppManifest,
  schemas: ColumnSchemaRef[]
): { probes: InferenceProbe[]; candidates: Omit<InferenceCandidate, "selected">[] } {
  const heroId = manifest.tables[0]?.id ?? null;
  const heroColumns = heroId ? lookupColumns(schemas, heroId) ?? [] : [];
  const currency = columnProbe(heroColumns, "currency");
  const date = columnProbe(heroColumns, "date");
  const boolean = columnProbe(heroColumns, "boolean");
  const rating = columnProbe(heroColumns, "rating");
  const status = columnProbe(heroColumns, "status");
  const count = columnProbe(heroColumns, "count");
  const source = columnProbe(heroColumns, "source");
  const notification = columnProbe(heroColumns, "notification");
  const message = columnProbe(heroColumns, "message");
  const hasBlueprint = manifest.blueprints.length > 0;
  const hasSchedule = manifest.schedules.length > 0;
  const docBlueprints = manifest.blueprints.filter((item) => DOC_BLUEPRINT_RE.test(item.id)).map((item) => item.id);
  const coachProfiles = manifest.profiles.filter((item) => COACH_RE.test(item.id)).map((item) => item.id);
  const coachSchedules = manifest.schedules.filter((item) => typeof item.runs === "string" && /^profile:.*-coach\b/i.test(item.runs)).map((item) => item.id);
  const inboxBlueprints = manifest.blueprints.filter((item) => INBOX_BLUEPRINT_RE.test(item.id)).map((item) => item.id);
  const progressValue = boolean.value || rating.value || status.value || count.value;
  const progressEvidence = [...boolean.evidence, ...rating.evidence, ...status.evidence, ...count.evidence];

  const probes: InferenceProbe[] = [
    { id: "hero-table", label: "Hero table available", value: Boolean(heroId && lookupColumns(schemas, heroId)), evidence: heroId ? [heroId] : [] },
    { id: "workflow", label: "Workflow present", value: hasBlueprint, evidence: manifest.blueprints.map((item) => item.id) },
    { id: "schedule", label: "Schedule present", value: hasSchedule, evidence: manifest.schedules.map((item) => item.id) },
    { id: "currency", label: "Currency column", ...currency },
    { id: "date", label: "Date column", ...date },
    { id: "progress", label: "Progress column", value: progressValue, evidence: progressEvidence },
    { id: "source", label: "Source-link column", ...source },
    { id: "document-workflow", label: "Document workflow", value: docBlueprints.length > 0, evidence: docBlueprints },
    { id: "coach", label: "Coach profile or schedule", value: coachProfiles.length + coachSchedules.length > 0, evidence: [...coachProfiles, ...coachSchedules] },
    { id: "inbox-workflow", label: "Inbox workflow", value: inboxBlueprints.length > 0, evidence: inboxBlueprints },
    { id: "notification", label: "Notification column", ...notification },
    { id: "message", label: "Message column", ...message },
  ];

  const candidates: Omit<InferenceCandidate, "selected">[] = [
    {
      ruleId: "rule-1-ledger",
      kit: "ledger",
      condition: "A hero table has currency and date columns, and at least one workflow exists.",
      matched: Boolean(heroId) && hasBlueprint && currency.value && date.value,
      explanation: Boolean(heroId) && hasBlueprint && currency.value && date.value
        ? "The ledger rule matched the hero table's dated monetary records."
        : "The ledger rule requires a hero table, a workflow, and both currency and date columns.",
    },
    {
      ruleId: "rule-2-tracker",
      kit: "tracker",
      condition: "A scheduled app's hero table has a date plus a progress signal.",
      matched: Boolean(heroId) && hasSchedule && date.value && progressValue,
      explanation: Boolean(heroId) && hasSchedule && date.value && progressValue
        ? "The tracker rule matched dated rows with a progress signal and a schedule."
        : "The tracker rule requires a hero table, schedule, date column, and boolean/rating/status/count progress column.",
    },
    {
      ruleId: "rule-3-research",
      kit: "research",
      condition: "A scheduled document workflow has a source-shaped hero table.",
      matched: Boolean(heroId) && hasSchedule && docBlueprints.length > 0 && source.value,
      explanation: Boolean(heroId) && hasSchedule && docBlueprints.length > 0 && source.value
        ? "The research rule matched a scheduled document workflow backed by source links."
        : "The research rule requires a schedule, document workflow, and source-link hero column.",
    },
    {
      ruleId: "rule-4-coach",
      kit: "coach",
      condition: "A schedule runs with a coach profile.",
      matched: hasSchedule && coachProfiles.length + coachSchedules.length > 0,
      explanation: hasSchedule && coachProfiles.length + coachSchedules.length > 0
        ? "The coach rule matched a scheduled coach profile."
        : "The coach rule requires a schedule plus a coach-named profile or schedule target.",
    },
    {
      ruleId: "rule-5-inbox",
      kit: "inbox",
      condition: "An inbox workflow exists, or the hero table has notification and message columns.",
      matched: inboxBlueprints.length > 0 || (Boolean(heroId) && notification.value && message.value),
      explanation: inboxBlueprints.length > 0 || (Boolean(heroId) && notification.value && message.value)
        ? "The inbox rule matched a message-triage workflow or notification/message table shape."
        : "The inbox rule requires an inbox-like workflow or both notification and message hero columns.",
    },
    {
      ruleId: "rule-6-workflow-hub",
      kit: "workflow-hub",
      condition: "The app has at least two workflows and no hero table.",
      matched: manifest.blueprints.length >= 2 && manifest.tables.length === 0,
      explanation: manifest.blueprints.length >= 2 && manifest.tables.length === 0
        ? "The workflow-hub rule matched multiple workflows with no table competing as the app's center."
        : "The workflow-hub rule requires at least two workflows and no table.",
    },
    {
      ruleId: "rule-7-fallback",
      kit: "workflow-hub",
      condition: "No earlier rule matches.",
      matched: true,
      explanation: "No specialized rule matched, so Relay uses the deterministic workflow-hub fallback.",
    },
  ];

  candidates[6].matched = !candidates.slice(0, 6).some((candidate) => candidate.matched);

  return { probes, candidates };
}

function lookupColumns(
  schemas: ColumnSchemaRef[],
  tableId: string
): Col[] | null {
  const hit = schemas.find((s) => s.tableId === tableId);
  return hit ? hit.columns : null;
}
