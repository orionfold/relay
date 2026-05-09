import type { AppManifest } from "@/lib/apps/registry";
import type { ColumnSchemaRef, KitId } from "./types";

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
  const declared = manifest.view?.kit;
  if (declared && declared !== "auto") {
    return declared as KitId;
  }
  if (rule1_ledger(manifest, columnSchemas)) return "ledger";
  if (rule2_tracker(manifest, columnSchemas)) return "tracker";
  if (rule3_research(manifest, columnSchemas)) return "research";
  if (rule4_coach(manifest)) return "coach";
  if (rule5_inbox(manifest, columnSchemas)) return "inbox";
  if (rule6_multiBlueprint(manifest)) return "workflow-hub";
  return "workflow-hub";
}

// --- Rule predicates ---------------------------------------------------------

export function rule1_ledger(
  m: AppManifest,
  schemas: ColumnSchemaRef[]
): boolean {
  const heroId = m.tables[0]?.id;
  if (!heroId) return false;
  if (m.blueprints.length < 1) return false;
  const cols = lookupColumns(schemas, heroId);
  // A ledger is intrinsically transactional. Currency without a date is a
  // snapshot (e.g. positions) — render via workflow-hub or tracker, not ledger.
  return cols !== null && hasCurrency(cols) && hasDate(cols);
}

export function rule2_tracker(
  m: AppManifest,
  schemas: ColumnSchemaRef[]
): boolean {
  const heroId = m.tables[0]?.id;
  if (!heroId) return false;
  if (m.schedules.length < 1) return false;
  const cols = lookupColumns(schemas, heroId);
  if (!cols) return false;
  // A tracker has dated entries with some kind of progress signal: boolean
  // (completed/done), rating (stars/score), categorical state (status/stage),
  // or numeric measurement (count/total). All four shapes belong here.
  return (
    hasDate(cols) &&
    (hasBoolean(cols) ||
      hasRating(cols) ||
      hasStatusLike(cols) ||
      hasCountLike(cols))
  );
}

export function rule3_research(
  m: AppManifest,
  schemas?: ColumnSchemaRef[]
): boolean {
  if (m.schedules.length < 1) return false;
  if (!m.blueprints.some((b) => DOC_BLUEPRINT_RE.test(b.id))) return false;
  // The research kit only renders a sources sidebar + synthesis pane — it
  // assumes the hero table holds source links/articles. Personal logs (e.g.
  // "books I've read") share the digest+schedule signature but have no source
  // shape; route them elsewhere instead of dropping into a kit that hides
  // their table. When schemas aren't supplied (legacy callers) keep the
  // pre-tightening behavior so existing fixtures still resolve.
  if (!schemas) return true;
  const heroId = m.tables[0]?.id;
  if (!heroId) return true;
  const cols = lookupColumns(schemas, heroId);
  if (!cols) return true;
  return hasSourceShape(cols);
}

export function rule4_coach(m: AppManifest): boolean {
  if (m.schedules.length < 1) return false;
  if (m.profiles.some((p) => COACH_RE.test(p.id))) return true;
  return m.schedules.some((s) =>
    typeof s.runs === "string" && /^profile:.*-coach\b/i.test(s.runs)
  );
}

export function rule5_inbox(
  m: AppManifest,
  schemas?: ColumnSchemaRef[]
): boolean {
  if (m.blueprints.some((b) => INBOX_BLUEPRINT_RE.test(b.id))) return true;
  if (!schemas) return false;
  const heroId = m.tables[0]?.id;
  if (!heroId) return false;
  const cols = lookupColumns(schemas, heroId);
  if (!cols) return false;
  return hasNotificationShape(cols) && hasMessageShape(cols);
}

export function rule6_multiBlueprint(m: AppManifest): boolean {
  if (m.blueprints.length < 2) return false;
  // "no clear hero table" — interpreted as: no hero table at all.
  return m.tables.length === 0;
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
const DOC_BLUEPRINT_RE = /(digest|report|summary|brief|synthesis)/i;
const INBOX_BLUEPRINT_RE = /(drafter|inbox|notification|message|follow[-_]?up|triage)/i;

export function hasCurrency(cols: Col[]): boolean {
  return cols.some(
    (c) => c.semantic === "currency" || CURRENCY_NAME_RE.test(c.name)
  );
}

export function hasDate(cols: Col[]): boolean {
  return cols.some(
    (c) =>
      c.type === "date" ||
      c.type === "datetime" ||
      c.semantic === "date" ||
      DATE_NAME_RE.test(c.name)
  );
}

export function hasBoolean(cols: Col[]): boolean {
  return cols.some(
    (c) =>
      c.type === "boolean" ||
      c.semantic === "boolean" ||
      BOOLEAN_NAME_RE.test(c.name)
  );
}

export function hasNotificationShape(cols: Col[]): boolean {
  return cols.some(
    (c) => c.semantic === "notification" || NOTIFICATION_NAME_RE.test(c.name)
  );
}

export function hasMessageShape(cols: Col[]): boolean {
  return cols.some(
    (c) => c.semantic === "message-body" || MESSAGE_NAME_RE.test(c.name)
  );
}

/** A numeric rating/score column — a tracker-style completion signal that's
 *  not a boolean (e.g. "stars given to a book"). */
export function hasRating(cols: Col[]): boolean {
  return cols.some(
    (c) => c.semantic === "rating" || RATING_NAME_RE.test(c.name)
  );
}

/** A categorical state column — the workflow's "lane". Used to recognize
 *  pipeline/campaign-style trackers that use status instead of a boolean. */
export function hasStatusLike(cols: Col[]): boolean {
  return cols.some(
    (c) => c.semantic === "status" || STATUS_NAME_RE.test(c.name)
  );
}

/** A numeric measurement/aggregation column. Used to recognize trackers
 *  that use counts (engagement_count, total_views) as a progress signal. */
export function hasCountLike(cols: Col[]): boolean {
  return cols.some(
    (c) => c.semantic === "count" || COUNT_NAME_RE.test(c.name)
  );
}

/** A column that looks like an external source link/reference — used to
 *  decide whether the research kit (sources + synthesis) is appropriate. */
export function hasSourceShape(cols: Col[]): boolean {
  return cols.some(
    (c) =>
      c.type === "url" ||
      c.semantic === "url" ||
      c.semantic === "source" ||
      SOURCE_NAME_RE.test(c.name)
  );
}

function lookupColumns(
  schemas: ColumnSchemaRef[],
  tableId: string
): Col[] | null {
  const hit = schemas.find((s) => s.tableId === tableId);
  return hit ? hit.columns : null;
}
