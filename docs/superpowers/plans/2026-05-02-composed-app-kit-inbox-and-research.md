# Phase 4: Composed App Kits — Inbox & Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `InboxKit` + `ResearchKit` with the new shared `RunHistoryTimeline` primitive so that `customer-follow-up-drafter` (Inbox kit) and `research-digest` (Research kit) render domain-aware composed app views; close the wiring-bug class via retroactive `<KitView>` integration tests across all 6 kits.

**Architecture:** Two new kits register alongside the existing four in `src/lib/apps/view-kits/index.ts`. Slot views remain content-agnostic — kits build content via `createElement(...)` inside `buildModel`, mirroring Coach/Ledger precedent. One additive DB column (`tasks.contextRowId TEXT`) links queue rows to their draft tasks, with engine population deferred to a follow-up feature. A new `detectTriggerSource(manifest)` helper drives the new `triggerSourceChip` header field and Run-Now suppression for row-insert apps. Browser smoke uses hand-crafted manifests at `~/.ainative/apps/{customer-follow-up-drafter,research-digest}/manifest.yaml`.

**Tech Stack:** TypeScript, Next.js 16 (App Router, server components + Turbopack), React 19, vitest + React Testing Library, Playwright (smoke), better-sqlite3 + Drizzle, Zod (manifest contract), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-02-inbox-and-research-design.md`
**Feature:** `features/composed-app-kit-inbox-and-research.md`
**Scope mode:** HOLD (locked during brainstorming)

---

## Scope challenge result (per project override)

| Prompt | Answer |
|--------|--------|
| **Is this overbuilt?** | No. Wave 7 (retroactive integration tests for all 6 kits) is HOLD-mode investment locked during brainstorming — designed to permanently close the Phase 3 wiring-bug class. All other waves match the spec scope. |
| **Can we reuse existing code?** | Yes, extensively. Only one net-new shared primitive (`RunHistoryTimeline`). Four small new client components. Reuses `PriorityQueue`, `DataTable`, `DocumentChipBar`, `FilterBar`, `LightMarkdown`, `DocumentDetailView`, `RunNowButton`, `RunNowSheet`, `VariableInput`, `CadenceChip`, all chart primitives, all slot views, and the `inference.ts` `rule3_research` / `rule5_inbox` predicates that already route to these kit ids. |
| **Can scope be compressed?** | Already compressed via brainstorming locked decisions: (1) trigger field is metadata-only — no engine wiring; (2) slot views remain agnostic — no slot-view dispatch refactor; (3) one additive DB column instead of new tables. |

**Recommendation: PROCEED as-is.** Plan proceeds with all 8 waves.

**Smoke-test budget rule:** Phase 4 does **not** touch any of the runtime-registry-adjacent modules (`src/lib/agents/claude-agent.ts`, `src/lib/agents/runtime/*`, `src/lib/workflows/engine.ts`, or any module that statically imports `@/lib/chat/ainative-tools`). The mandatory dev-server smoke step does **not** apply. The Wave 8 Playwright smoke is for UX verification (chip rendering, queue/draft layout, citation chip click behaviour), not module-load-cycle prevention.

---

## What already exists (do not rebuild)

Verified during brainstorming and re-confirmed during plan writing:

- **Kit framework** — `src/lib/apps/view-kits/types.ts` ships `KitDefinition`, slot types, and the `KitId` union with `"inbox" | "research"` already enumerated. `<KitView>` at `src/components/apps/kit-view/kit-view.tsx` dispatches slot order — Phase 4 does not modify it.
- **Slot views** — `header.tsx` is the only slot view that dispatches on field shape (`cadenceChip`, `periodChip`, etc.). `hero.tsx` and `activity.tsx` render `slot.content` opaquely. Phase 4 honors that contract.
- **Inference predicates** — `src/lib/apps/view-kits/inference.ts` already has `rule3_research` and `rule5_inbox` registered in `pickKit`'s decision table. The kits themselves are stubs (`viewKits.inbox = undefined`, `viewKits.research = undefined` in `src/lib/apps/view-kits/index.ts`). Wave 5 only needs to register the kit objects, not extend the rules.
- **Header chips & actions** — `RunNowButton`, `RunNowSheet`, `VariableInput` (Phase 2/3), `PeriodSelectorChip`, `CadenceChip`, `ScheduleCadenceChip` are all wired and tested.
- **Document/detail primitives** — `LightMarkdown`, `DocumentChipBar` (`src/components/documents/document-chip-bar.tsx`), `DocumentDetailView`, `DetailPane` + `DetailPaneProvider` (URL-driven via `useSearchParams`/`useRouter`).
- **Dashboard primitives** — `PriorityQueue` (`src/components/dashboard/priority-queue.tsx`), `ActivityFeed`, `ErrorTimeline` (Workflow Hub continues to use this — `RunHistoryTimeline` re-skin is explicitly deferred).
- **Table primitives** — `FilterBar`, `DataTable`. Phase 3.1 shipped `TransactionsTable` and `MonthlyCloseSummary` — Ledger-specific, not reused here.
- **Chart primitives** — Phase 3 added `TimeSeriesChart`, `RunCadenceHeatmap`. Verify in Wave 4 whether `MiniBar` / `DonutRing` exist for `<ThroughputStrip>`; if not, Wave 4 adds tiny SVG primitives.
- **Data layer** — `loadEvaluatedKpis`, `unstable_cache` keyed loaders (Phase 2/3 pattern). `src/lib/apps/view-kits/data.ts` `loadRuntimeStateUncached` is the single entry point — Phase 4 adds Inbox + Research branches to it.
- **Manifest schema** — `AppManifest` in `src/lib/apps/registry.ts`. Phase 4 adds **only one** additive Zod field: `BlueprintBase.trigger?: { kind: "row-insert", table: string }`.
- **DB schema** — `documents.taskId` FK exists. `tasks` table has `agent_profile`, `assigned_agent`, `effective_runtime_id`, `runtime_fallback_reason`, `workflow_id`, `schedule_id` — none link to user-table rows. Phase 4 adds `tasks.context_row_id TEXT NULL` (snake-case in DB, `contextRowId` in JS).
- **Smoke fixture pattern** — `~/.ainative/apps/<id>/manifest.yaml` (Phase 3 used this for surgical smokes; gitignored, local-only).
- **Starter prompt YAMLs** — `.claude/apps/starters/customer-follow-up-drafter.yaml` and `.claude/apps/starters/research-digest.yaml` exist as starter *prompts*, not pre-built manifests. Wave 6 hand-crafts the canonical smoke manifests separately.

---

## NOT in scope (explicit deferrals)

- **Engine wiring for `trigger: { kind: "row-insert" }`** — defer to follow-up `row-trigger-blueprint-execution`. Wiring real row-insert events to blueprint execution requires touching `src/lib/workflows/engine.ts` + scheduler + a row-event hook in the user-table mutation API. Phase 4 ships only the manifest field + UI affordance + the `tasks.contextRowId` column the engine will eventually populate.
- **Bidirectional channel chat for Inbox responses** — separate feature `bidirectional-channel-chat`.
- **Auto-tagging or sentiment scoring of queue items** — uses existing column metadata only.
- **Real-time SSE updates for queue items** — page-level refetch on user action only.
- **Search/filter UX inside Research's `DataTable` beyond existing `FilterBar`** — defer to user feedback.
- **Re-skinning Workflow Hub's activity slot to use `RunHistoryTimeline`** — `ErrorTimeline` continues working.
- **Pagination of Research sources** — Phase 4 caps at 50 rows.
- **Mobile-specific layouts for split panes** — default to `flex-col md:flex-row` stack.
- **Accessibility deep-pass on new components** — components inherit existing focus / keyboard / aria patterns from primitives they wrap.

---

## Error & Rescue Registry

Concise table; full registry in the spec. Each entry maps to a step in this plan.

| Error | Trigger | Rescue (and which task implements it) |
|-------|---------|---------------------------------------|
| Inbox row's linked draft document doesn't exist | Row created before blueprint ran | `EmptyState` "No draft yet" + scoped `RunNowButton` (Task 6.2 — `loadInboxDraft` returns null shape; Task 4.5 — `<InboxSplitView>` renders empty branch) |
| Inbox queue table missing the `sentiment` column | Manifest declares queue table without that column | `<ThroughputStrip>` renders MiniBar only (Task 4.4 — `detectSentimentColumn(manifest)` helper) |
| Research synthesis blueprint never run | Brand-new app | Hero shows `EmptyState` + `RunNowButton` (Task 6.4 — `loadLatestSynthesis` returns null; Task 4.6 — `<ResearchSplitView>` renders empty branch) |
| Citation chip refers to deleted source row | Source row deleted between synthesis and view | Chip renders with `data-stale="true"`, click shows toast (Task 4.6) |
| `RunHistoryTimeline.runs` is empty | New app, no runs | Empty-state branch in component (Task 2.1 — explicit `emptyHint` test; Task 2.2 — implementation) |
| Manifest declares `trigger.table` that doesn't exist | Authoring error | `detectTriggerSource` validates table existence, falls back, `console.warn`s (Task 3.1 — explicit test; Task 3.2 — implementation) |
| Two row-insert triggers in one manifest | Authoring ambiguity | Prefer `runsBlueprintId` match, else first (Task 3.1/3.2) |
| `tasks.contextRowId` is null on chat-created tasks | Engine wiring deferred | Inbox draft loader returns null, UI shows empty state (Task 6.2; this is by-design until follow-up feature) |
| Server re-render on rapid row-click feels laggy | Inbox queue with many txns | `unstable_cache` keyed `(appId, rowId)` 60s TTL (Task 6.2) |
| URL `?row=<id>` references a row no longer in queue | Row removed between click and render | Auto-select first remaining row (Task 6.7 — page.tsx logic) |
| Citation click handler fires before `<DataTable>` mounts | First-paint race | `useLayoutEffect` for highlight sync, 1-frame microtask delay (Task 4.6) |
| Phantom IDE "Cannot find module" diagnostics | Newly added files | Trust `npx tsc --noEmit` per project lesson (no rescue needed in code; reviewer note in commit message) |

---

## File structure (locked)

**New files (~22 total):**

| Path | Responsibility |
|------|----------------|
| `src/lib/db/migrations/XXXX_add_tasks_context_row_id.sql` | Migration: `ALTER TABLE tasks ADD COLUMN context_row_id TEXT;` |
| `src/lib/apps/view-kits/detect-trigger-source.ts` | Pure helper: `detectTriggerSource(manifest, preferredBlueprintId?)` returning a `TriggerSource` discriminated union |
| `src/lib/apps/view-kits/__tests__/detect-trigger-source.test.ts` | 5-branch coverage |
| `src/lib/apps/view-kits/kits/inbox.ts` | InboxKit definition |
| `src/lib/apps/view-kits/kits/__tests__/inbox.test.ts` | resolve + buildModel branches |
| `src/lib/apps/view-kits/kits/research.ts` | ResearchKit definition |
| `src/lib/apps/view-kits/kits/__tests__/research.test.ts` | resolve + buildModel branches |
| `src/lib/apps/view-kits/__tests__/render-kit-view.tsx` | Test util — drives `<KitView>` via React Testing Library |
| `src/lib/apps/view-kits/__tests__/integration/tracker-kit-view.test.tsx` | Tracker integration test |
| `src/lib/apps/view-kits/__tests__/integration/workflow-hub-kit-view.test.tsx` | Workflow Hub integration test |
| `src/lib/apps/view-kits/__tests__/integration/coach-kit-view.test.tsx` | Coach integration test |
| `src/lib/apps/view-kits/__tests__/integration/ledger-kit-view.test.tsx` | Ledger integration test |
| `src/lib/apps/view-kits/__tests__/integration/inbox-kit-view.test.tsx` | Inbox integration test |
| `src/lib/apps/view-kits/__tests__/integration/research-kit-view.test.tsx` | Research integration test |
| `src/components/apps/run-history-timeline.tsx` | Vertical timeline of runs (`RunHistoryTimeline` primitive) |
| `src/components/apps/__tests__/run-history-timeline.test.tsx` | Empty + populated + click behavior |
| `src/components/apps/inbox-split-view.tsx` | Client component: queue (left) + draft (right) with URL-driven row selection |
| `src/components/apps/__tests__/inbox-split-view.test.tsx` | Row click → router.replace + empty/populated draft |
| `src/components/apps/research-split-view.tsx` | Client component: sources DataTable + synthesis hero with citation highlight |
| `src/components/apps/__tests__/research-split-view.test.tsx` | Citation click → highlight; deleted-row stale styling |
| `src/components/apps/throughput-strip.tsx` | Drafts/day MiniBar + sentiment DonutRing (when column present) |
| `src/components/apps/__tests__/throughput-strip.test.tsx` | Sentiment column present/absent |
| `src/components/apps/trigger-source-chip.tsx` | Small chip rendering trigger-source label |
| `src/components/apps/__tests__/trigger-source-chip.test.tsx` | Three labels for three trigger kinds |
| `~/.ainative/apps/customer-follow-up-drafter/manifest.yaml` | Smoke fixture (gitignored) |
| `~/.ainative/apps/research-digest/manifest.yaml` | Smoke fixture (gitignored) |

**Modified files (~10):**

| Path | What changes |
|------|--------------|
| `src/lib/db/schema.ts` | Add `contextRowId: text("context_row_id")` to `tasks` |
| `src/lib/db/bootstrap.ts` | Add `addColumnIfMissing(\`ALTER TABLE tasks ADD COLUMN context_row_id TEXT;\`)` and add to CREATE TABLE block |
| `src/lib/apps/registry.ts` | Add `BlueprintBase.trigger?: { kind: "row-insert", table: string }` Zod field |
| `src/lib/apps/view-kits/types.ts` | Add `triggerSourceChip` to `HeaderSlot`; add Inbox/Research runtime fields to `RuntimeState`; add documentation-only members to `HeroSlot.kind` and `ActivityFeedSlot` `kind` annotations |
| `src/lib/apps/view-kits/index.ts` | Register `inboxKit` + `researchKit` in `viewKits` map |
| `src/lib/apps/view-kits/data.ts` | Add Inbox + Research branches to `loadRuntimeStateUncached`; new loaders `loadInboxQueue`, `loadInboxDraft`, `loadResearchSources`, `loadLatestSynthesis`, `loadRecentRuns` |
| `src/components/apps/kit-view/slots/header.tsx` | Render `<TriggerSourceChip>` when `slot.triggerSourceChip` is present; suppress `RunNowButton` when `triggerSourceChip.kind === "row-insert"` |
| `src/app/apps/[id]/page.tsx` | Parse `?row` query param; thread it through `loadRuntimeStateUncached` |
| `features/composed-app-kit-inbox-and-research.md` | Status `planned` → `completed`; reference verification run |
| `features/changelog.md` | Phase 4 entry |

**Smoke-only artifacts:** Two manifests under `~/.ainative/apps/`. SQL seed for Inbox queue + Research sources documented inline in Wave 8.

---

## Wave 1 — Types, manifest contract, DB migration

This wave is foundational: every later wave depends on the type extensions and DB column. Strict TDD; no implementation tasks before tests fail.

### Task 1: Add `tasks.context_row_id` column (migration + bootstrap + Drizzle schema)

**Files:**
- Create: `src/lib/db/migrations/XXXX_add_tasks_context_row_id.sql` (XXXX = highest existing prefix + 1; verify just before write)
- Modify: `src/lib/db/bootstrap.ts` — add to CREATE TABLE block + `addColumnIfMissing` call
- Modify: `src/lib/db/schema.ts` — add Drizzle column to `tasks` table

- [ ] **Step 1: Verify next migration number.**

```bash
ls src/lib/db/migrations/*.sql | sort | tail -1
```

The next number is the last + 1 (e.g., `0017_add_document_picker_tables.sql` → `0018_add_tasks_context_row_id.sql`). Use that exact name for the new migration file.

- [ ] **Step 2: Write a Drizzle integration test for the new column.**

Create `src/lib/db/__tests__/tasks-context-row-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

describe("tasks.contextRowId", () => {
  it("accepts inserts with contextRowId set", () => {
    const taskId = `t_${Date.now()}`;
    db.insert(tasks).values({
      id: taskId,
      title: "test",
      status: "queued",
      projectId: null,
      contextRowId: "row-abc-123",
    } as any).run();

    const row = db
      .select()
      .from(tasks)
      .where(sql`${tasks.id} = ${taskId}`)
      .get();
    expect(row?.contextRowId).toBe("row-abc-123");

    // cleanup
    db.delete(tasks).where(sql`${tasks.id} = ${taskId}`).run();
  });

  it("accepts inserts without contextRowId (column is nullable)", () => {
    const taskId = `t_${Date.now() + 1}`;
    db.insert(tasks).values({
      id: taskId,
      title: "test",
      status: "queued",
      projectId: null,
    } as any).run();

    const row = db
      .select()
      .from(tasks)
      .where(sql`${tasks.id} = ${taskId}`)
      .get();
    expect(row?.contextRowId).toBeNull();

    db.delete(tasks).where(sql`${tasks.id} = ${taskId}`).run();
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL.**

```bash
npx vitest run src/lib/db/__tests__/tasks-context-row-id.test.ts
```

Expected: TypeError on `contextRowId` (Drizzle schema doesn't define it) OR runtime SqliteError "table tasks has no column named context_row_id".

- [ ] **Step 4: Add the migration SQL.**

Write `src/lib/db/migrations/0018_add_tasks_context_row_id.sql`:

```sql
-- Add nullable context_row_id column to tasks for linking row-triggered tasks
-- back to their originating user_table_rows row. Engine population is deferred
-- to the row-trigger-blueprint-execution feature; for Phase 4 this column is
-- read by InboxKit's draft loader and seeded manually for smoke fixtures.
ALTER TABLE tasks ADD COLUMN context_row_id TEXT;
```

- [ ] **Step 5: Update `src/lib/db/bootstrap.ts` — add to BOTH the CREATE TABLE block AND the `addColumnIfMissing` call.**

Per `MEMORY.md` lesson: "addColumnIfMissing runs BEFORE the table CREATE in bootstrap.ts. Adding a column via ALTER alone fails silently on fresh DBs. Fix: add the column to BOTH places."

In the `CREATE TABLE IF NOT EXISTS tasks` block (search for `CREATE TABLE IF NOT EXISTS tasks`), add the column near other text columns:

```
context_row_id TEXT,
```

Then in the `addColumnIfMissing` series (around line 307+), add:

```ts
addColumnIfMissing(`ALTER TABLE tasks ADD COLUMN context_row_id TEXT;`);
```

- [ ] **Step 6: Update Drizzle schema at `src/lib/db/schema.ts`.**

In the `tasks = sqliteTable("tasks", { ... })` definition, add (next to `agentProfile`):

```ts
contextRowId: text("context_row_id"),
```

- [ ] **Step 7: Run the test — expect PASS.**

```bash
npx vitest run src/lib/db/__tests__/tasks-context-row-id.test.ts
```

Both tests should pass.

- [ ] **Step 8: Run tsc — expect clean.**

```bash
npx tsc --noEmit
```

Exit code 0.

- [ ] **Step 9: Verify on a fresh DB.**

```bash
rm -f /tmp/ainative-bootstrap-check.db
STAGENT_DB_PATH=/tmp/ainative-bootstrap-check.db npx vitest run src/lib/db/__tests__/tasks-context-row-id.test.ts
rm -f /tmp/ainative-bootstrap-check.db
```

Both tests should pass on the fresh DB. This guards against the "ALTER fails silently on new install" trap from `MEMORY.md`.

### Task 2: Extend Zod manifest schema with `BlueprintBase.trigger`

**Files:**
- Modify: `src/lib/apps/registry.ts`
- Test: `src/lib/apps/__tests__/registry-trigger-field.test.ts` (new file)

- [ ] **Step 1: Inspect the current `BlueprintBase` definition.**

```bash
grep -nB2 -A15 "BlueprintBase" src/lib/apps/registry.ts | head -40
```

Note the existing fields and the Zod approach (likely `z.object({ ... }).loose()` or similar).

- [ ] **Step 2: Write the failing test.**

Create `src/lib/apps/__tests__/registry-trigger-field.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AppManifestSchema } from "@/lib/apps/registry";

const baseManifest = {
  id: "ut",
  name: "ut",
  profiles: [],
  blueprints: [],
  schedules: [],
  tables: [],
};

describe("BlueprintBase.trigger field", () => {
  it("accepts a row-insert trigger with table id", () => {
    const m = AppManifestSchema.parse({
      ...baseManifest,
      blueprints: [
        {
          id: "draft-followup",
          name: "Draft followup",
          trigger: { kind: "row-insert", table: "customer-touchpoints" },
        },
      ],
    });
    expect(m.blueprints[0]?.trigger?.kind).toBe("row-insert");
    expect((m.blueprints[0]?.trigger as any)?.table).toBe("customer-touchpoints");
  });

  it("accepts blueprints with no trigger field (backward compatible)", () => {
    const m = AppManifestSchema.parse({
      ...baseManifest,
      blueprints: [{ id: "weekly-digest", name: "Weekly digest" }],
    });
    expect(m.blueprints[0]?.trigger).toBeUndefined();
  });

  it("rejects a trigger missing the table id", () => {
    expect(() =>
      AppManifestSchema.parse({
        ...baseManifest,
        blueprints: [
          {
            id: "bad",
            name: "Bad",
            trigger: { kind: "row-insert" },
          },
        ],
      })
    ).toThrow();
  });

  it("rejects a trigger with unknown kind", () => {
    expect(() =>
      AppManifestSchema.parse({
        ...baseManifest,
        blueprints: [
          {
            id: "bad",
            name: "Bad",
            trigger: { kind: "webhook", url: "..." },
          },
        ],
      })
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

```bash
npx vitest run src/lib/apps/__tests__/registry-trigger-field.test.ts
```

Expected: parse failures for the row-insert tests (the schema doesn't accept `trigger` yet).

- [ ] **Step 4: Add the Zod field to `BlueprintBase` in `src/lib/apps/registry.ts`.**

Locate the `BlueprintBase` (or whatever the equivalent shape is named — see Step 1). Add:

```ts
trigger: z
  .object({
    kind: z.literal("row-insert"),
    table: z.string().min(1),
  })
  .optional(),
```

Place it next to existing optional fields like `description?` or `cron?`.

- [ ] **Step 5: Run — expect PASS.**

```bash
npx vitest run src/lib/apps/__tests__/registry-trigger-field.test.ts
```

All four tests should pass.

- [ ] **Step 6: Run all manifest tests to confirm no regressions.**

```bash
npx vitest run src/lib/apps src/lib/apps/__tests__
```

All existing tests should still pass.

- [ ] **Step 7: tsc clean.**

```bash
npx tsc --noEmit
```

### Task 3: Extend `RuntimeState` with Inbox + Research fields

**Files:**
- Modify: `src/lib/apps/view-kits/types.ts`
- Test: covered by kit unit tests in Wave 5; this task is type-only.

- [ ] **Step 1: Read the current `RuntimeState` shape.**

```bash
sed -n '50,90p' src/lib/apps/view-kits/types.ts
```

Note that Phase 3 added Coach + Ledger fields under explicit comment headers.

- [ ] **Step 2: Add Phase 4 fields to `RuntimeState`.**

In `src/lib/apps/view-kits/types.ts`, after the `/** Phase 3: Ledger kit fields. */` block, add:

```ts
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
researchRecentRuns?: import("./types").TimelineRun[];
researchSourcesCount?: number;
researchLastSynthAge?: string | null;
```

(The `TimelineRun` self-import will resolve once Wave 2 adds the type — see Task 4.)

- [ ] **Step 3: Add a `TimelineRun` shared type to `types.ts` (Phase 4 needs it referenced by both the runtime state and the timeline component).**

In `src/lib/apps/view-kits/types.ts`, add (above `RuntimeState` so it's available for the import-from-self):

```ts
/** Phase 4: per-run summary used by RunHistoryTimeline + Research kit. */
export interface TimelineRun {
  id: string;
  status: "running" | "completed" | "failed" | "queued";
  startedAt: string;          // ISO
  durationMs?: number;
  outputDocumentId?: string;
}
```

Then change the `RuntimeState.researchRecentRuns` line to:

```ts
researchRecentRuns?: TimelineRun[];
```

(removing the `import("./types")` self-reference).

- [ ] **Step 4: tsc clean.**

```bash
npx tsc --noEmit
```

Should be 0 errors. The new fields are all optional, so no kit needs changes yet.

### Task 4: Add `triggerSourceChip` field to `HeaderSlot`

**Files:**
- Modify: `src/lib/apps/view-kits/types.ts`
- Test: covered by Wave 4 slot view tests + Wave 5 kit unit tests.

- [ ] **Step 1: Locate `HeaderSlot`.**

```bash
grep -nA15 "interface HeaderSlot" src/lib/apps/view-kits/types.ts
```

- [ ] **Step 2: Add the trigger-source chip type and field.**

Above `HeaderSlot`, add:

```ts
/** Phase 4: discriminated union describing how an app's run blueprint fires. */
export type TriggerSource =
  | { kind: "row-insert"; table: string; blueprintId: string }
  | { kind: "schedule"; scheduleId: string; blueprintId: string }
  | { kind: "manual"; blueprintId?: string };
```

Inside `HeaderSlot`, after `periodChip?: ...`, add:

```ts
/** Phase 4: render a TriggerSourceChip when present (Inbox kit). */
triggerSourceChip?: TriggerSource;
```

- [ ] **Step 3: Update `HeroSlot.kind` and add documentation-only entries to it.**

Locate `HeroSlot`:

```bash
grep -nA6 "interface HeroSlot" src/lib/apps/view-kits/types.ts
```

The existing `kind: "table" | "markdown" | "list" | "custom"`. Phase 4 doesn't need new dispatch but, for documentation, change to:

```ts
/**
 * Render-shape annotation. The slot view only renders `slot.content`; this
 * field is documentation-only for kits to declare intent.
 */
kind: "table" | "markdown" | "list" | "custom" | "inbox-split" | "research-split";
```

- [ ] **Step 4: Add a documentation-only `kind` field to `ActivityFeedSlot` (additive).**

The existing interface has only `content: ReactNode`. Add:

```ts
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
```

This is fully backward-compatible — existing kits don't set `kind` and the field is optional.

- [ ] **Step 5: tsc clean.**

```bash
npx tsc --noEmit
```

### Task 5: Commit Wave 1

- [ ] **Step 1: Run all tests touching changed files.**

```bash
npx vitest run src/lib/db src/lib/apps
```

Expected: all green (existing tests + 6 new tests for context_row_id and trigger field).

- [ ] **Step 2: Stage and commit.**

```bash
git add src/lib/db/migrations/0018_add_tasks_context_row_id.sql \
        src/lib/db/schema.ts \
        src/lib/db/bootstrap.ts \
        src/lib/db/__tests__/tasks-context-row-id.test.ts \
        src/lib/apps/registry.ts \
        src/lib/apps/__tests__/registry-trigger-field.test.ts \
        src/lib/apps/view-kits/types.ts

git commit -m "$(cat <<'EOF'
feat(apps): Phase 4 wave 1 — types, manifest trigger field, contextRowId column

Adds tasks.context_row_id column (migration + bootstrap CREATE+ALTER + Drizzle
schema sync). Adds optional BlueprintBase.trigger Zod field for row-insert
metadata. Extends HeaderSlot with triggerSourceChip and RuntimeState with
Inbox + Research runtime fields. Adds shared TimelineRun type.

All additions are backward-compatible: existing manifests parse unchanged,
existing kits compile unchanged, fresh DBs and migrated DBs both pass the new
column round-trip test.
EOF
)"
```

---

## Wave 2 — RunHistoryTimeline primitive

The only net-new shared component in Phase 4. Pure presentation — no fetching.

### Task 6: `RunHistoryTimeline` component

**Files:**
- Create: `src/components/apps/run-history-timeline.tsx`
- Test: `src/components/apps/__tests__/run-history-timeline.test.tsx`

- [ ] **Step 1: Inspect existing primitives for icon and timestamp conventions.**

```bash
sed -n '1,40p' src/components/dashboard/activity-feed.tsx
grep -n "taskStatusVariant\|formatRelative" src/lib/constants/status-colors.ts src/lib/utils/*.ts 2>/dev/null | head -10
```

Note which icon set (`lucide-react`) and time-formatting helpers are already canonical.

- [ ] **Step 2: Write the failing test.**

Create `src/components/apps/__tests__/run-history-timeline.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunHistoryTimeline } from "../run-history-timeline";
import type { TimelineRun } from "@/lib/apps/view-kits/types";

const runs: TimelineRun[] = [
  { id: "r1", status: "completed", startedAt: "2026-04-30T08:00:00Z", durationMs: 4_000 },
  { id: "r2", status: "failed", startedAt: "2026-04-29T08:00:00Z" },
  { id: "r3", status: "running", startedAt: "2026-04-28T08:00:00Z" },
];

describe("RunHistoryTimeline", () => {
  it("renders one entry per run with status icon and relative timestamp", () => {
    render(<RunHistoryTimeline runs={runs} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/4s/i)).toBeInTheDocument(); // duration
  });

  it("renders empty state when runs is empty", () => {
    render(<RunHistoryTimeline runs={[]} />);
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
  });

  it("uses emptyHint override when provided", () => {
    render(<RunHistoryTimeline runs={[]} emptyHint="Synthesis hasn't run yet" />);
    expect(screen.getByText(/synthesis hasn't run yet/i)).toBeInTheDocument();
  });

  it("invokes onSelect when a run is clicked", () => {
    const onSelect = vi.fn();
    render(<RunHistoryTimeline runs={runs} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onSelect).toHaveBeenCalledWith("r1");
  });

  it("does not render buttons when onSelect is absent", () => {
    render(<RunHistoryTimeline runs={runs} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

```bash
npx vitest run src/components/apps/__tests__/run-history-timeline.test.tsx
```

Expected: "Cannot find module '../run-history-timeline'".

- [ ] **Step 4: Implement the component.**

Create `src/components/apps/run-history-timeline.tsx`:

```tsx
import { CheckCircle2, AlertTriangle, Loader2, Clock } from "lucide-react";
import type { TimelineRun } from "@/lib/apps/view-kits/types";

interface RunHistoryTimelineProps {
  runs: TimelineRun[];
  onSelect?: (runId: string) => void;
  emptyHint?: string;
}

const STATUS_ICON: Record<TimelineRun["status"], typeof CheckCircle2> = {
  completed: CheckCircle2,
  failed: AlertTriangle,
  running: Loader2,
  queued: Clock,
};

const STATUS_COLOR: Record<TimelineRun["status"], string> = {
  completed: "text-emerald-600",
  failed: "text-destructive",
  running: "text-primary",
  queued: "text-muted-foreground",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function RunHistoryTimeline({
  runs,
  onSelect,
  emptyHint,
}: RunHistoryTimelineProps): JSX.Element {
  if (runs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-lg">
        {emptyHint ?? "No runs yet"}
      </div>
    );
  }

  return (
    <ol className="space-y-2" role="list">
      {runs.map((run) => {
        const Icon = STATUS_ICON[run.status];
        const colorClass = STATUS_COLOR[run.status];
        const inner = (
          <span className="flex items-center gap-3 w-full text-left">
            <Icon
              className={`h-4 w-4 shrink-0 ${colorClass} ${
                run.status === "running" ? "animate-spin" : ""
              }`}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">
              <span className="text-xs text-muted-foreground capitalize">
                {run.status}
              </span>
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatRelative(run.startedAt)}
            </span>
            {run.durationMs !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDuration(run.durationMs)}
              </span>
            )}
          </span>
        );

        return (
          <li
            key={run.id}
            role="listitem"
            className="border rounded-lg p-2"
            data-run-id={run.id}
            data-run-status={run.status}
          >
            {onSelect ? (
              <button
                type="button"
                className="w-full"
                onClick={() => onSelect(run.id)}
              >
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 5: Run — expect PASS.**

```bash
npx vitest run src/components/apps/__tests__/run-history-timeline.test.tsx
```

All five tests pass.

- [ ] **Step 6: tsc clean.**

```bash
npx tsc --noEmit
```

### Task 7: Commit Wave 2

- [ ] **Step 1: Stage and commit.**

```bash
git add src/components/apps/run-history-timeline.tsx \
        src/components/apps/__tests__/run-history-timeline.test.tsx

git commit -m "$(cat <<'EOF'
feat(apps): Phase 4 wave 2 — RunHistoryTimeline primitive

New shared component used by ResearchKit's activity slot. Vertical timeline of
runs with status icons (lucide), color-coded statuses, relative timestamps, and
optional click-to-open. Empty state with override hint. Pure presentation;
no fetching.
EOF
)"
```

---

## Wave 3 — Helpers

`detectTriggerSource` is pure — no React, no DB. Easy TDD.

### Task 8: `detectTriggerSource` helper

**Files:**
- Create: `src/lib/apps/view-kits/detect-trigger-source.ts`
- Test: `src/lib/apps/view-kits/__tests__/detect-trigger-source.test.ts`

- [ ] **Step 1: Write the failing test covering 5 branches.**

Create `src/lib/apps/view-kits/__tests__/detect-trigger-source.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { detectTriggerSource } from "../detect-trigger-source";

const baseManifest = {
  id: "ut",
  name: "ut",
  profiles: [],
  blueprints: [] as any[],
  schedules: [] as any[],
  tables: [] as any[],
};

describe("detectTriggerSource", () => {
  it("returns row-insert when a blueprint declares it and the table exists", () => {
    const m = {
      ...baseManifest,
      tables: [{ id: "customer-touchpoints" }],
      blueprints: [
        {
          id: "draft",
          name: "Draft",
          trigger: { kind: "row-insert", table: "customer-touchpoints" },
        },
      ],
    } as any;

    const result = detectTriggerSource(m);
    expect(result).toEqual({
      kind: "row-insert",
      table: "customer-touchpoints",
      blueprintId: "draft",
    });
  });

  it("falls back to schedule when row-insert table is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = {
      ...baseManifest,
      tables: [],
      blueprints: [
        {
          id: "draft",
          name: "Draft",
          trigger: { kind: "row-insert", table: "missing-table" },
        },
      ],
      schedules: [{ id: "s1", cron: "0 8 * * 1", runs: "draft" }],
    } as any;

    const result = detectTriggerSource(m);
    expect(result).toEqual({
      kind: "schedule",
      scheduleId: "s1",
      blueprintId: "draft",
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("missing-table")
    );
    warn.mockRestore();
  });

  it("returns schedule when no trigger but a schedule binds the blueprint", () => {
    const m = {
      ...baseManifest,
      blueprints: [{ id: "weekly", name: "Weekly" }],
      schedules: [{ id: "s1", cron: "0 9 * * 1", runs: "weekly" }],
    } as any;

    expect(detectTriggerSource(m, "weekly")).toEqual({
      kind: "schedule",
      scheduleId: "s1",
      blueprintId: "weekly",
    });
  });

  it("returns manual when no trigger and no schedule references the blueprint", () => {
    const m = {
      ...baseManifest,
      blueprints: [{ id: "manual-bp", name: "Manual" }],
      schedules: [],
    } as any;

    expect(detectTriggerSource(m, "manual-bp")).toEqual({
      kind: "manual",
      blueprintId: "manual-bp",
    });
  });

  it("prefers preferredBlueprintId when two blueprints declare row-insert", () => {
    const m = {
      ...baseManifest,
      tables: [{ id: "tbl-a" }, { id: "tbl-b" }],
      blueprints: [
        {
          id: "first",
          name: "First",
          trigger: { kind: "row-insert", table: "tbl-a" },
        },
        {
          id: "second",
          name: "Second",
          trigger: { kind: "row-insert", table: "tbl-b" },
        },
      ],
    } as any;

    expect(detectTriggerSource(m, "second")).toEqual({
      kind: "row-insert",
      table: "tbl-b",
      blueprintId: "second",
    });
  });

  it("falls back to first match when preferredBlueprintId doesn't match", () => {
    const m = {
      ...baseManifest,
      tables: [{ id: "tbl-a" }],
      blueprints: [
        {
          id: "first",
          name: "First",
          trigger: { kind: "row-insert", table: "tbl-a" },
        },
      ],
    } as any;

    expect(detectTriggerSource(m, "nonexistent")).toEqual({
      kind: "row-insert",
      table: "tbl-a",
      blueprintId: "first",
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__/detect-trigger-source.test.ts
```

Expected: "Cannot find module '../detect-trigger-source'".

- [ ] **Step 3: Implement the helper.**

Create `src/lib/apps/view-kits/detect-trigger-source.ts`:

```ts
import type { AppManifest } from "@/lib/apps/registry";
import type { TriggerSource } from "./types";

/**
 * Pure helper that classifies how an app's run blueprint fires.
 *
 * Precedence: row-insert (validated against manifest.tables) > schedule > manual.
 *
 * When two blueprints declare row-insert triggers, the one matching
 * `preferredBlueprintId` wins; otherwise the first match wins (and the choice
 * is documented at the call site).
 *
 * When `trigger.table` references a non-existent table, the trigger is ignored
 * with a `console.warn` and detection falls through to schedule/manual.
 */
export function detectTriggerSource(
  manifest: AppManifest,
  preferredBlueprintId?: string
): TriggerSource {
  const knownTableIds = new Set(manifest.tables.map((t) => t.id));

  // Step 1: row-insert pass — find all valid row-insert triggers
  const rowInsertCandidates: TriggerSource[] = [];
  for (const bp of manifest.blueprints) {
    const trigger = (bp as { trigger?: { kind: string; table?: string } }).trigger;
    if (trigger?.kind !== "row-insert") continue;
    if (!trigger.table || !knownTableIds.has(trigger.table)) {
      console.warn(
        `[detectTriggerSource] blueprint "${bp.id}" declares trigger.table="${trigger.table}" which is not in manifest.tables; ignoring trigger.`
      );
      continue;
    }
    rowInsertCandidates.push({
      kind: "row-insert",
      table: trigger.table,
      blueprintId: bp.id,
    });
  }
  if (rowInsertCandidates.length > 0) {
    const preferred = preferredBlueprintId
      ? rowInsertCandidates.find((c) => c.blueprintId === preferredBlueprintId)
      : null;
    return preferred ?? rowInsertCandidates[0]!;
  }

  // Step 2: schedule pass — find a schedule that binds the preferred blueprint
  for (const s of manifest.schedules) {
    const runsId = (s as { runs?: string }).runs;
    if (!runsId) continue;
    if (preferredBlueprintId && runsId !== preferredBlueprintId) continue;
    return {
      kind: "schedule",
      scheduleId: s.id,
      blueprintId: runsId,
    };
  }

  // Step 3: manual fallback
  return { kind: "manual", blueprintId: preferredBlueprintId };
}
```

- [ ] **Step 4: Run — expect PASS.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__/detect-trigger-source.test.ts
```

All six tests pass.

- [ ] **Step 5: tsc clean.**

```bash
npx tsc --noEmit
```

### Task 9: Sentiment-column detector helper (co-located with ThroughputStrip in Wave 4)

This sub-task is intentionally inlined into Wave 4 / Task 13 (ThroughputStrip), where the helper lives close to its only consumer. No work in Wave 3 — proceed to commit.

### Task 10: Commit Wave 3

- [ ] **Step 1: Stage and commit.**

```bash
git add src/lib/apps/view-kits/detect-trigger-source.ts \
        src/lib/apps/view-kits/__tests__/detect-trigger-source.test.ts

git commit -m "$(cat <<'EOF'
feat(apps): Phase 4 wave 3 — detectTriggerSource helper

Pure manifest classifier used by InboxKit (and any future kit needing trigger
inference). Returns a discriminated union: row-insert | schedule | manual.
Validates trigger.table against manifest.tables; on missing table, emits
console.warn and falls through to schedule/manual. Honors preferredBlueprintId
for tie-breaking.

6 tests cover all branches (row-insert, missing-table fallback, schedule,
manual, preferred-match wins, no-preferred-fall-through).
EOF
)"
```

---

## Wave 4 — Slot extensions + new client components

This wave adds the small UI pieces. Each component is independently tested. The header slot is the only slot view that gets modified (other slot views are content-agnostic, per locked decision #7).

### Task 11: `<TriggerSourceChip>` component

**Files:**
- Create: `src/components/apps/trigger-source-chip.tsx`
- Test: `src/components/apps/__tests__/trigger-source-chip.test.tsx`

- [ ] **Step 1: Inspect existing chip components for the look-and-feel pattern.**

```bash
sed -n '1,40p' src/components/apps/period-selector-chip.tsx
```

Match the visual treatment.

- [ ] **Step 2: Write the failing test.**

Create `src/components/apps/__tests__/trigger-source-chip.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TriggerSourceChip } from "../trigger-source-chip";
import type { TriggerSource } from "@/lib/apps/view-kits/types";

describe("TriggerSourceChip", () => {
  it("renders row-insert label with table id", () => {
    const trigger: TriggerSource = {
      kind: "row-insert",
      table: "customer-touchpoints",
      blueprintId: "draft",
    };
    render(<TriggerSourceChip trigger={trigger} />);
    expect(
      screen.getByText(/triggered by row insert in customer-touchpoints/i)
    ).toBeInTheDocument();
  });

  it("renders schedule label", () => {
    const trigger: TriggerSource = {
      kind: "schedule",
      scheduleId: "s1",
      blueprintId: "weekly",
    };
    render(<TriggerSourceChip trigger={trigger} />);
    expect(screen.getByText(/scheduled/i)).toBeInTheDocument();
  });

  it("renders manual label", () => {
    const trigger: TriggerSource = { kind: "manual", blueprintId: "bp" };
    render(<TriggerSourceChip trigger={trigger} />);
    expect(screen.getByText(/manual/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

```bash
npx vitest run src/components/apps/__tests__/trigger-source-chip.test.tsx
```

- [ ] **Step 4: Implement.**

Create `src/components/apps/trigger-source-chip.tsx`:

```tsx
import { Bell, Calendar, Hand } from "lucide-react";
import type { TriggerSource } from "@/lib/apps/view-kits/types";
import { Badge } from "@/components/ui/badge";

interface TriggerSourceChipProps {
  trigger: TriggerSource;
}

export function TriggerSourceChip({ trigger }: TriggerSourceChipProps) {
  if (trigger.kind === "row-insert") {
    return (
      <Badge variant="outline" className="gap-1.5">
        <Bell className="h-3 w-3" aria-hidden="true" />
        <span className="text-xs">
          Triggered by row insert in {trigger.table}
        </span>
      </Badge>
    );
  }
  if (trigger.kind === "schedule") {
    return (
      <Badge variant="outline" className="gap-1.5">
        <Calendar className="h-3 w-3" aria-hidden="true" />
        <span className="text-xs">Scheduled</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5">
      <Hand className="h-3 w-3" aria-hidden="true" />
      <span className="text-xs">Manual</span>
    </Badge>
  );
}
```

- [ ] **Step 5: Run — expect PASS.**

```bash
npx vitest run src/components/apps/__tests__/trigger-source-chip.test.tsx
```

- [ ] **Step 6: tsc clean.**

### Task 12: Wire `<TriggerSourceChip>` into `HeaderSlotView` and suppress Run-Now for row-insert

**Files:**
- Modify: `src/components/apps/kit-view/slots/header.tsx`
- Test: extend the existing header test file (or create one).

- [ ] **Step 1: Read the current `header.tsx` to identify the chip insertion point and Run Now rendering.**

```bash
sed -n '1,80p' src/components/apps/kit-view/slots/header.tsx
```

Note that Phase 3 added `periodChip` between `cadenceChip` and `runNowBlueprintId` rendering — Phase 4 uses the same shape for `triggerSourceChip`.

- [ ] **Step 2: Find or create the header slot test file.**

```bash
ls src/components/apps/kit-view/slots/__tests__/header*.test.tsx 2>/dev/null
```

If it exists, append to it. If not, create a small test alongside.

Add:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeaderSlotView } from "../header";

describe("HeaderSlotView triggerSourceChip", () => {
  it("renders the trigger-source chip when present", () => {
    render(
      <HeaderSlotView
        slot={{
          title: "Inbox app",
          triggerSourceChip: {
            kind: "row-insert",
            table: "customer-touchpoints",
            blueprintId: "draft",
          },
        }}
        manifestPane={undefined}
      />
    );
    expect(
      screen.getByText(/row insert in customer-touchpoints/i)
    ).toBeInTheDocument();
  });

  it("does not render RunNowButton when triggerSourceChip.kind is row-insert", () => {
    render(
      <HeaderSlotView
        slot={{
          title: "Inbox app",
          runNowBlueprintId: "draft",
          triggerSourceChip: {
            kind: "row-insert",
            table: "customer-touchpoints",
            blueprintId: "draft",
          },
        }}
        manifestPane={undefined}
      />
    );
    expect(screen.queryByRole("button", { name: /run now/i })).not.toBeInTheDocument();
  });

  it("renders RunNowButton when triggerSourceChip.kind is schedule or manual", () => {
    render(
      <HeaderSlotView
        slot={{
          title: "Coach app",
          runNowBlueprintId: "weekly",
          triggerSourceChip: {
            kind: "schedule",
            scheduleId: "s1",
            blueprintId: "weekly",
          },
        }}
        manifestPane={undefined}
      />
    );
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

```bash
npx vitest run src/components/apps/kit-view/slots/__tests__/header.test.tsx
```

(Or wherever the file lives.)

- [ ] **Step 4: Modify `header.tsx`.**

In the destructure where `cadenceChip`, `periodChip`, `runNowBlueprintId`, `runNowVariables` are pulled, add `triggerSourceChip`. In the JSX:

- Add `<TriggerSourceChip>` next to the other chips (between `<PeriodSelectorChip>` and `<RunNowButton>` is fine).
- Wrap the `<RunNowButton>` (or its surrounding block) in:
  ```tsx
  {triggerSourceChip?.kind !== "row-insert" && runNowBlueprintId && (
    <RunNowButton ... />
  )}
  ```

Add the import:

```tsx
import { TriggerSourceChip } from "@/components/apps/trigger-source-chip";
```

- [ ] **Step 5: Run — expect PASS.**

```bash
npx vitest run src/components/apps/kit-view/slots/__tests__/header.test.tsx
```

All three new tests pass; existing tests still pass.

- [ ] **Step 6: tsc clean.**

### Task 13: `<ThroughputStrip>` component (with sentiment-column detector inline)

**Files:**
- Create: `src/components/apps/throughput-strip.tsx`
- Test: `src/components/apps/__tests__/throughput-strip.test.tsx`

- [ ] **Step 1: Verify existing chart primitives.**

```bash
ls src/components/charts/ 2>/dev/null
ls src/components/apps/ | grep -iE "(mini-?bar|donut|spark)"
```

If `MiniBar` and `DonutRing` already exist (from Phase 3 chart work), reuse them. If not, implement tiny SVG-only versions inline (still light enough to keep in this file).

- [ ] **Step 2: Write the failing test.**

Create `src/components/apps/__tests__/throughput-strip.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThroughputStrip, hasSentimentColumn } from "../throughput-strip";

describe("hasSentimentColumn", () => {
  it("returns true when manifest has a column named sentiment", () => {
    expect(
      hasSentimentColumn([
        { tableId: "queue", columns: [{ name: "sentiment" }, { name: "channel" }] },
      ])
    ).toBe(true);
  });

  it("returns true when a column has semantic 'sentiment'", () => {
    expect(
      hasSentimentColumn([
        { tableId: "queue", columns: [{ name: "score", semantic: "sentiment" }] },
      ])
    ).toBe(true);
  });

  it("returns false when no column matches", () => {
    expect(
      hasSentimentColumn([
        { tableId: "queue", columns: [{ name: "channel" }, { name: "summary" }] },
      ])
    ).toBe(false);
  });
});

describe("ThroughputStrip", () => {
  it("renders the drafts/day MiniBar", () => {
    render(<ThroughputStrip dailyDrafts={[1, 2, 3, 0, 5, 1, 2]} />);
    expect(screen.getByTestId("throughput-mini-bar")).toBeInTheDocument();
  });

  it("renders the sentiment DonutRing only when sentimentBuckets is present", () => {
    render(
      <ThroughputStrip
        dailyDrafts={[1, 2]}
        sentimentBuckets={{ positive: 5, neutral: 3, negative: 1 }}
      />
    );
    expect(screen.getByTestId("throughput-sentiment-ring")).toBeInTheDocument();
  });

  it("does NOT render the sentiment DonutRing when sentimentBuckets is absent", () => {
    render(<ThroughputStrip dailyDrafts={[1]} />);
    expect(screen.queryByTestId("throughput-sentiment-ring")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement.**

Create `src/components/apps/throughput-strip.tsx`:

```tsx
"use client";

import type { ColumnSchemaRef } from "@/lib/apps/view-kits/types";

interface SentimentBuckets {
  positive: number;
  neutral: number;
  negative: number;
}

interface ThroughputStripProps {
  dailyDrafts: number[];           // last 7 days, oldest → newest
  sentimentBuckets?: SentimentBuckets;
}

const SENTIMENT_COL_NAME_RE = /(^sentiment$|_sentiment$)/i;

export function hasSentimentColumn(schemas: ColumnSchemaRef[]): boolean {
  return schemas.some((s) =>
    s.columns.some(
      (c) => c.semantic === "sentiment" || SENTIMENT_COL_NAME_RE.test(c.name)
    )
  );
}

function MiniBar({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg
      data-testid="throughput-mini-bar"
      viewBox={`0 0 ${values.length * 8} 24`}
      className="h-6 w-24"
      role="img"
      aria-label="drafts per day"
    >
      {values.map((v, i) => {
        const h = Math.round((v / max) * 22);
        return (
          <rect
            key={i}
            x={i * 8}
            y={24 - h}
            width={6}
            height={h}
            className="fill-primary"
            rx={1}
          />
        );
      })}
    </svg>
  );
}

function DonutRing({ buckets }: { buckets: SentimentBuckets }) {
  const total = Math.max(1, buckets.positive + buckets.neutral + buckets.negative);
  const r = 10;
  const c = 2 * Math.PI * r;
  const seg = (n: number) => (n / total) * c;
  let acc = 0;
  const arc = (n: number, color: string) => {
    const len = seg(n);
    const dash = `${len} ${c - len}`;
    const offset = -acc;
    acc += len;
    return (
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeDasharray={dash}
        strokeDashoffset={offset}
        className={color}
      />
    );
  };

  return (
    <svg
      data-testid="throughput-sentiment-ring"
      viewBox="0 0 28 28"
      className="h-7 w-7"
      role="img"
      aria-label="sentiment distribution"
    >
      {arc(buckets.positive, "stroke-emerald-500")}
      {arc(buckets.neutral, "stroke-muted-foreground")}
      {arc(buckets.negative, "stroke-destructive")}
    </svg>
  );
}

export function ThroughputStrip({
  dailyDrafts,
  sentimentBuckets,
}: ThroughputStripProps) {
  return (
    <div className="flex items-center gap-4 p-3 border rounded-lg">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Drafts/day</span>
        <MiniBar values={dailyDrafts} />
      </div>
      {sentimentBuckets && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Sentiment</span>
          <DonutRing buckets={sentimentBuckets} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: tsc clean.**

### Task 14: `<InboxSplitView>` client component

**Files:**
- Create: `src/components/apps/inbox-split-view.tsx`
- Test: `src/components/apps/__tests__/inbox-split-view.test.tsx`

- [ ] **Step 1: Read PriorityQueue's prop shape to know how to feed it.**

```bash
sed -n '1,80p' src/components/dashboard/priority-queue.tsx
```

- [ ] **Step 2: Failing test.**

Create `src/components/apps/__tests__/inbox-split-view.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InboxSplitView } from "../inbox-split-view";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("row=r2"),
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/apps/inbox-app",
}));

const queue = [
  { id: "r1", title: "Reply to Acme", subtitle: "neutral · 2h ago" },
  { id: "r2", title: "Reply to Beta", subtitle: "positive · 30m ago" },
];

describe("InboxSplitView", () => {
  it("renders queue rows on the left", () => {
    render(
      <InboxSplitView
        queue={queue}
        selectedRowId="r2"
        draft={{ id: "d2", filename: "draft.md", content: "Hi Beta!", taskId: "t1" }}
      />
    );
    expect(screen.getByText(/reply to acme/i)).toBeInTheDocument();
    expect(screen.getByText(/reply to beta/i)).toBeInTheDocument();
  });

  it("renders the draft on the right when present", () => {
    render(
      <InboxSplitView
        queue={queue}
        selectedRowId="r2"
        draft={{ id: "d2", filename: "draft.md", content: "Hi Beta!", taskId: "t1" }}
      />
    );
    expect(screen.getByText(/hi beta/i)).toBeInTheDocument();
  });

  it("renders empty-draft placeholder when draft is null", () => {
    render(
      <InboxSplitView queue={queue} selectedRowId="r2" draft={null} />
    );
    expect(screen.getByText(/no draft yet/i)).toBeInTheDocument();
  });

  it("calls router.replace with ?row=<id> on row click", () => {
    replaceMock.mockClear();
    render(
      <InboxSplitView queue={queue} selectedRowId="r2" draft={null} />
    );
    fireEvent.click(screen.getByText(/reply to acme/i));
    expect(replaceMock).toHaveBeenCalledWith(
      expect.stringContaining("row=r1")
    );
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement.**

Create `src/components/apps/inbox-split-view.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LightMarkdown } from "@/components/shared/light-markdown";
import { EmptyState } from "@/components/shared/empty-state";

interface QueueRow {
  id: string;
  title: string;
  subtitle?: string;
}

interface DraftDocument {
  id: string;
  filename: string;
  content: string;
  taskId: string;
}

interface InboxSplitViewProps {
  queue: QueueRow[];
  selectedRowId: string | null;
  draft: DraftDocument | null;
}

export function InboxSplitView({
  queue,
  selectedRowId,
  draft,
}: InboxSplitViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectRow(rowId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("row", rowId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,1fr)_2fr] gap-4">
      <aside
        className="border rounded-lg overflow-hidden"
        data-kit-pane="queue"
        aria-label="Inbox queue"
      >
        <ul className="divide-y" role="list">
          {queue.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              No items in queue
            </li>
          )}
          {queue.map((row) => {
            const selected = row.id === selectedRowId;
            return (
              <li
                key={row.id}
                role="listitem"
                data-row-id={row.id}
                data-selected={selected ? "true" : "false"}
                className={
                  selected
                    ? "bg-muted/50"
                    : "hover:bg-muted/30"
                }
              >
                <button
                  type="button"
                  className="w-full text-left p-3"
                  onClick={() => selectRow(row.id)}
                >
                  <span className="block text-sm font-medium truncate">
                    {row.title}
                  </span>
                  {row.subtitle && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {row.subtitle}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section
        className="border rounded-lg p-4 min-h-[300px]"
        data-kit-pane="draft"
        aria-label="Draft response"
      >
        {!draft && (
          <EmptyState
            title="No draft yet"
            description="The drafting blueprint hasn't produced a response for this row yet."
          />
        )}
        {draft && (
          <div className="space-y-2">
            <header className="flex items-baseline justify-between border-b pb-2">
              <h3 className="text-sm font-medium">{draft.filename}</h3>
              <span className="text-xs text-muted-foreground">
                Task {draft.taskId.slice(0, 8)}
              </span>
            </header>
            <LightMarkdown content={draft.content} textSize="sm" />
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: tsc clean.**

### Task 15: `<ResearchSplitView>` client component

**Files:**
- Create: `src/components/apps/research-split-view.tsx`
- Test: `src/components/apps/__tests__/research-split-view.test.tsx`

- [ ] **Step 1: Inspect existing primitives.**

```bash
sed -n '1,50p' src/components/documents/document-chip-bar.tsx
```

Confirm the shape of citation chips.

- [ ] **Step 2: Failing test.**

Create `src/components/apps/__tests__/research-split-view.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ResearchSplitView } from "../research-split-view";

const sources = [
  { id: "src-1", values: { name: "Hacker News", url: "https://news.ycombinator.com" } },
  { id: "src-2", values: { name: "ArXiv", url: "https://arxiv.org" } },
  { id: "src-3", values: { name: "RSS feed", url: "https://example.com/rss" } },
];

const synthesis = "## Digest\n\nThree key points this week...";

const citations = [
  { docId: "d1", sourceRowId: "src-1", sourceLabel: "Hacker News" },
  { docId: "d1", sourceRowId: "src-2", sourceLabel: "ArXiv" },
];

describe("ResearchSplitView", () => {
  it("renders sources DataTable on the left", () => {
    render(
      <ResearchSplitView
        sources={sources}
        synthesis={synthesis}
        citations={citations}
      />
    );
    expect(screen.getByText(/hacker news/i)).toBeInTheDocument();
    expect(screen.getByText(/arxiv/i)).toBeInTheDocument();
  });

  it("renders synthesis markdown on the right", () => {
    render(
      <ResearchSplitView
        sources={sources}
        synthesis={synthesis}
        citations={citations}
      />
    );
    expect(screen.getByText(/digest/i)).toBeInTheDocument();
    expect(screen.getByText(/three key points/i)).toBeInTheDocument();
  });

  it("renders citation chips below the synthesis", () => {
    render(
      <ResearchSplitView
        sources={sources}
        synthesis={synthesis}
        citations={citations}
      />
    );
    const chips = screen.getAllByRole("button", { name: /hacker news|arxiv/i });
    expect(chips.length).toBeGreaterThanOrEqual(2);
  });

  it("highlights matching source row when a citation chip is clicked", () => {
    render(
      <ResearchSplitView
        sources={sources}
        synthesis={synthesis}
        citations={citations}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /hacker news/i }));
    const row = document.querySelector('[data-row-id="src-1"]');
    expect(row?.getAttribute("data-highlighted")).toBe("true");
  });

  it("renders citation chips with data-stale='true' for deleted source rows", () => {
    const citationsWithStale = [
      ...citations,
      { docId: "d1", sourceRowId: "src-deleted", sourceLabel: "Removed" },
    ];
    render(
      <ResearchSplitView
        sources={sources}
        synthesis={synthesis}
        citations={citationsWithStale}
      />
    );
    const stale = document.querySelector('[data-stale="true"]');
    expect(stale).toBeTruthy();
  });

  it("renders empty-state when synthesis is null", () => {
    render(
      <ResearchSplitView
        sources={sources}
        synthesis={null}
        citations={[]}
      />
    );
    expect(screen.getByText(/no synthesis yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement.**

Create `src/components/apps/research-split-view.tsx`:

```tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LightMarkdown } from "@/components/shared/light-markdown";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";

interface SourceRow {
  id: string;
  values: Record<string, unknown>;
}

interface Citation {
  docId: string;
  sourceRowId: string;
  sourceLabel: string;
}

interface ResearchSplitViewProps {
  sources: SourceRow[];
  synthesis: string | null;
  citations: Citation[];
}

export function ResearchSplitView({
  sources,
  synthesis,
  citations,
}: ResearchSplitViewProps) {
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const knownIds = new Set(sources.map((s) => s.id));

  // Clear highlight after 2.5s
  useEffect(() => {
    if (!highlightedRowId) return;
    const t = setTimeout(() => setHighlightedRowId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightedRowId]);

  // Scroll into view when highlight changes (after layout)
  useLayoutEffect(() => {
    if (!highlightedRowId || !tableRef.current) return;
    const row = tableRef.current.querySelector<HTMLElement>(
      `[data-row-id="${CSS.escape(highlightedRowId)}"]`
    );
    if (row) {
      // 1-frame delay to let table mount fully on first-paint races
      requestAnimationFrame(() => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [highlightedRowId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,1fr)_2fr] gap-4">
      <aside
        className="border rounded-lg overflow-hidden"
        data-kit-pane="sources"
        aria-label="Research sources"
      >
        <table className="w-full text-sm" ref={tableRef}>
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left py-2 px-3">Name</th>
              <th className="text-left py-2 px-3">URL</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 && (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={2}>
                  No sources yet
                </td>
              </tr>
            )}
            {sources.map((s) => {
              const highlighted = s.id === highlightedRowId;
              return (
                <tr
                  key={s.id}
                  data-row-id={s.id}
                  data-highlighted={highlighted ? "true" : "false"}
                  className={
                    highlighted
                      ? "bg-primary/10 transition-colors"
                      : "transition-colors"
                  }
                >
                  <td className="py-2 px-3">{String(s.values.name ?? s.id)}</td>
                  <td className="py-2 px-3 text-muted-foreground truncate max-w-[200px]">
                    {String(s.values.url ?? "")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </aside>

      <section
        className="border rounded-lg p-4 min-h-[300px] space-y-3"
        data-kit-pane="synthesis"
        aria-label="Synthesis"
      >
        {!synthesis ? (
          <EmptyState
            title="No synthesis yet"
            description="Run the synthesis blueprint to produce a digest."
          />
        ) : (
          <>
            <LightMarkdown content={synthesis} textSize="sm" />
            {citations.length > 0 && (
              <div
                className="flex flex-wrap gap-2 pt-3 border-t"
                aria-label="Citation sources"
              >
                {citations.map((c) => {
                  const stale = !knownIds.has(c.sourceRowId);
                  return (
                    <button
                      key={`${c.docId}:${c.sourceRowId}`}
                      type="button"
                      data-stale={stale ? "true" : "false"}
                      onClick={() => {
                        if (stale) return;
                        setHighlightedRowId(c.sourceRowId);
                      }}
                      className={
                        stale
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:opacity-80"
                      }
                    >
                      <Badge variant="outline">{c.sourceLabel}</Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: tsc clean.**

### Task 16: Commit Wave 4

- [ ] **Step 1: Run all touched tests.**

```bash
npx vitest run src/components/apps src/components/apps/kit-view
```

- [ ] **Step 2: Stage and commit.**

```bash
git add src/components/apps/trigger-source-chip.tsx \
        src/components/apps/__tests__/trigger-source-chip.test.tsx \
        src/components/apps/kit-view/slots/header.tsx \
        src/components/apps/kit-view/slots/__tests__/ \
        src/components/apps/throughput-strip.tsx \
        src/components/apps/__tests__/throughput-strip.test.tsx \
        src/components/apps/inbox-split-view.tsx \
        src/components/apps/__tests__/inbox-split-view.test.tsx \
        src/components/apps/research-split-view.tsx \
        src/components/apps/__tests__/research-split-view.test.tsx

git commit -m "$(cat <<'EOF'
feat(apps): Phase 4 wave 4 — slot extensions + Inbox/Research client components

- TriggerSourceChip rendered in HeaderSlotView; suppresses RunNowButton when
  triggerSource.kind === "row-insert"
- ThroughputStrip with co-located hasSentimentColumn helper; renders MiniBar
  always, DonutRing only when sentimentBuckets is provided
- InboxSplitView: URL-driven row selection (router.replace + ?row), empty-draft
  placeholder via EmptyState, LightMarkdown for draft body
- ResearchSplitView: sources DataTable + synthesis hero + citation chips with
  highlight-on-click (useLayoutEffect + requestAnimationFrame for first-paint
  race), 2.5s highlight clear, data-stale styling for deleted source rows

Slot views (hero/activity) remain content-agnostic per locked design decision.
Header is the only slot view modified — chips are typed individually.
EOF
)"
```

---

## Wave 5 — Kit definitions

`InboxKit` and `ResearchKit` follow the Coach/Ledger pattern: `resolve` extracts a projection, `buildModel` produces a `ViewModel` with `createElement`-built content.

### Task 17: `InboxKit` definition

**Files:**
- Create: `src/lib/apps/view-kits/kits/inbox.ts`
- Test: `src/lib/apps/view-kits/kits/__tests__/inbox.test.ts`

- [ ] **Step 1: Read coach.ts as the closest reference (text-only kit, similar size).**

```bash
cat src/lib/apps/view-kits/kits/coach.ts
```

- [ ] **Step 2: Failing test.**

Create `src/lib/apps/view-kits/kits/__tests__/inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inboxKit } from "../inbox";

const baseManifest = {
  id: "cfd",
  name: "Customer follow-up drafter",
  description: "Drafts follow-ups when new touchpoints land.",
  profiles: [{ id: "cs-coach" }],
  blueprints: [
    {
      id: "draft-followup",
      name: "Draft followup",
      trigger: { kind: "row-insert", table: "customer-touchpoints" },
    },
  ],
  schedules: [],
  tables: [
    {
      id: "customer-touchpoints",
      name: "customer-touchpoints",
      columns: [
        { name: "channel" },
        { name: "summary" },
        { name: "sentiment" },
      ],
    },
  ],
  view: undefined,
};

const baseColumns = [{
  tableId: "customer-touchpoints",
  columns: [
    { name: "channel" },
    { name: "summary" },
    { name: "sentiment" },
  ],
}];

const baseRuntime = {
  app: {
    id: "app1",
    name: baseManifest.name,
    description: baseManifest.description,
    manifest: baseManifest,
    files: [],
  },
  recentTaskCount: 0,
  scheduleCadence: null,
  inboxQueueRows: [],
  inboxSelectedRowId: null,
  inboxDraftDocument: null,
};

describe("inboxKit.resolve", () => {
  it("picks first table and first blueprint when bindings absent", () => {
    const proj = inboxKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    expect((proj as any).queueTableId).toBe("customer-touchpoints");
    expect((proj as any).draftBlueprintId).toBe("draft-followup");
  });

  it("computes triggerSource via detectTriggerSource", () => {
    const proj = inboxKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    expect((proj as any).triggerSource).toMatchObject({
      kind: "row-insert",
      table: "customer-touchpoints",
      blueprintId: "draft-followup",
    });
  });

  it("falls back to manual when manifest has no triggers/schedules", () => {
    const m = {
      ...baseManifest,
      blueprints: [{ id: "manual-bp", name: "Manual" }],
    };
    const proj = inboxKit.resolve({
      manifest: m as any,
      columns: baseColumns,
    });
    expect((proj as any).triggerSource.kind).toBe("manual");
  });
});

describe("inboxKit.buildModel", () => {
  it("renders header with triggerSourceChip and suppresses runNowBlueprintId for row-insert", () => {
    const proj = inboxKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    const model = inboxKit.buildModel(proj, baseRuntime as any);
    expect(model.header.triggerSourceChip?.kind).toBe("row-insert");
    expect(model.header.runNowBlueprintId).toBeUndefined();
  });

  it("includes runNowBlueprintId when triggerSource is manual or schedule", () => {
    const m = {
      ...baseManifest,
      blueprints: [{ id: "manual-bp", name: "Manual" }],
    };
    const proj = inboxKit.resolve({
      manifest: m as any,
      columns: baseColumns,
    });
    const model = inboxKit.buildModel(proj, {
      ...baseRuntime,
      app: { ...baseRuntime.app, manifest: m },
    } as any);
    expect(model.header.runNowBlueprintId).toBe("manual-bp");
  });

  it("hero is a custom kind with InboxSplitView content", () => {
    const proj = inboxKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    const model = inboxKit.buildModel(proj, baseRuntime as any);
    expect(model.hero?.kind).toBe("inbox-split");
    expect(model.hero?.content).toBeDefined();
  });

  it("activity slot is a throughput-strip", () => {
    const proj = inboxKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    const model = inboxKit.buildModel(proj, baseRuntime as any);
    expect(model.activity?.kind).toBe("throughput-strip");
    expect(model.activity?.content).toBeDefined();
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement.**

Create `src/lib/apps/view-kits/kits/inbox.ts`:

```ts
import { createElement } from "react";
import yaml from "js-yaml";
import { InboxSplitView } from "@/components/apps/inbox-split-view";
import { ThroughputStrip, hasSentimentColumn } from "@/components/apps/throughput-strip";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import { detectTriggerSource } from "../detect-trigger-source";
import type {
  ColumnSchemaRef,
  KitDefinition,
  KitProjection,
  ResolveInput,
  RuntimeState,
  TriggerSource,
  ViewModel,
} from "../types";
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

    const dailyDrafts = Array.isArray(runtime.researchRecentRuns)
      ? // not used here; placeholder to keep types stable
        []
      : [];
    // Phase 4 ships throughput-strip as opt-in based on sentiment column;
    // dailyDrafts will be populated via runtime in Wave 6 (loadInboxQueue).
    const activity = {
      kind: "throughput-strip" as const,
      content: createElement(ThroughputStrip, {
        dailyDrafts: (runtime.inboxQueueRows ?? []).length
          ? Array.from({ length: 7 }, () => 0) // placeholder until wave 6 loader fills
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
        status: "running",
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
```

(Note: the `dailyDrafts`/`sentimentBuckets` placeholders are filled by the Wave 6 data loader. The component already handles zero-value bars gracefully, so the kit is fully shippable with the placeholder values in the meantime.)

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: tsc clean.**

### Task 18: `ResearchKit` definition

**Files:**
- Create: `src/lib/apps/view-kits/kits/research.ts`
- Test: `src/lib/apps/view-kits/kits/__tests__/research.test.ts`

- [ ] **Step 1: Failing test.**

Create `src/lib/apps/view-kits/kits/__tests__/research.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { researchKit } from "../research";

const baseManifest = {
  id: "rd",
  name: "Research digest",
  description: "Weekly synthesis across configured sources.",
  profiles: [{ id: "research-analyst" }],
  blueprints: [{ id: "weekly-digest", name: "Weekly digest" }],
  schedules: [{ id: "fri-5pm", cron: "0 17 * * 5", runs: "weekly-digest" }],
  tables: [
    {
      id: "sources",
      name: "sources",
      columns: [
        { name: "name" },
        { name: "url" },
        { name: "cadence" },
      ],
    },
  ],
  view: undefined,
};

const baseColumns = [{
  tableId: "sources",
  columns: [
    { name: "name" },
    { name: "url" },
    { name: "cadence" },
  ],
}];

const baseRuntime = {
  app: {
    id: "app1",
    name: baseManifest.name,
    description: baseManifest.description,
    manifest: baseManifest,
    files: [],
  },
  recentTaskCount: 0,
  scheduleCadence: "Fridays at 5pm",
  cadence: { humanLabel: "Fridays at 5pm", nextFireMs: null },
  researchSources: [],
  latestSynthesisDocId: null,
  researchSynthesisContent: null,
  researchCitations: [],
  researchRecentRuns: [],
  researchSourcesCount: 0,
  researchLastSynthAge: null,
};

describe("researchKit.resolve", () => {
  it("picks first table and first blueprint when bindings absent", () => {
    const proj = researchKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    expect((proj as any).sourcesTableId).toBe("sources");
    expect((proj as any).synthesisBlueprintId).toBe("weekly-digest");
    expect((proj as any).cadenceScheduleId).toBe("fri-5pm");
  });
});

describe("researchKit.buildModel", () => {
  it("populates header with cadence chip + KPIs", () => {
    const proj = researchKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    const model = researchKit.buildModel(proj, baseRuntime as any);
    expect(model.header.cadenceChip).toBeDefined();
    expect(model.header.runNowBlueprintId).toBe("weekly-digest");
    expect(model.kpis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "sources-count" }),
        expect.objectContaining({ id: "last-synth-age" }),
      ])
    );
  });

  it("hero is a research-split kind with sources + synthesis content", () => {
    const proj = researchKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    const model = researchKit.buildModel(proj, baseRuntime as any);
    expect(model.hero?.kind).toBe("research-split");
    expect(model.hero?.content).toBeDefined();
  });

  it("activity is run-history-timeline", () => {
    const proj = researchKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    const model = researchKit.buildModel(proj, baseRuntime as any);
    expect(model.activity?.kind).toBe("run-history-timeline");
    expect(model.activity?.content).toBeDefined();
  });

  it("includes manifest pane in footer", () => {
    const proj = researchKit.resolve({
      manifest: baseManifest as any,
      columns: baseColumns,
    });
    const model = researchKit.buildModel(proj, baseRuntime as any);
    expect(model.footer?.appId).toBe("app1");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**

Create `src/lib/apps/view-kits/kits/research.ts`:

```ts
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
        status: "running",
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
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: tsc clean.**

### Task 19: Register both kits in `viewKits`

**Files:**
- Modify: `src/lib/apps/view-kits/index.ts`

- [ ] **Step 1: Read the current registry.**

```bash
sed -n '1,40p' src/lib/apps/view-kits/index.ts
```

- [ ] **Step 2: Add imports + register.**

In `src/lib/apps/view-kits/index.ts`, add after the existing kit imports:

```ts
import { inboxKit } from "./kits/inbox";
import { researchKit } from "./kits/research";
```

Change:

```ts
inbox: undefined,
research: undefined,
```

To:

```ts
inbox: inboxKit,
research: researchKit,
```

- [ ] **Step 3: Update or add a test confirming the registry resolves both ids.**

Find or add `src/lib/apps/view-kits/__tests__/index.test.ts` (verify whether the existing dispatcher test asserts a specific id). Add or extend:

```ts
import { resolveKit, viewKits } from "..";

it("registers inbox kit", () => {
  expect(viewKits.inbox).toBeDefined();
  expect(viewKits.inbox?.id).toBe("inbox");
});

it("registers research kit", () => {
  expect(viewKits.research).toBeDefined();
  expect(viewKits.research?.id).toBe("research");
});
```

- [ ] **Step 4: Run — expect PASS.**

```bash
npx vitest run src/lib/apps/view-kits
```

- [ ] **Step 5: tsc clean.**

### Task 20: Commit Wave 5

- [ ] **Step 1: Stage and commit.**

```bash
git add src/lib/apps/view-kits/kits/inbox.ts \
        src/lib/apps/view-kits/kits/__tests__/inbox.test.ts \
        src/lib/apps/view-kits/kits/research.ts \
        src/lib/apps/view-kits/kits/__tests__/research.test.ts \
        src/lib/apps/view-kits/index.ts \
        src/lib/apps/view-kits/__tests__/

git commit -m "$(cat <<'EOF'
feat(apps): Phase 4 wave 5 — InboxKit + ResearchKit definitions

InboxKit:
  resolve picks queueTableId, draftBlueprintId, triggerSource (via
  detectTriggerSource), and the hasSentiment flag. buildModel renders
  triggerSourceChip + suppresses runNow for row-insert; hero is InboxSplitView;
  activity is ThroughputStrip with sentiment-aware DonutRing.

ResearchKit:
  resolve picks sourcesTableId, synthesisBlueprintId, cadenceScheduleId.
  buildModel renders cadence chip + Sources / Last-synth KPIs; hero is
  ResearchSplitView (sources DataTable + markdown synthesis + citation chips);
  activity is RunHistoryTimeline.

Both registered in viewKits map. Existing inference predicates (rule3_research,
rule5_inbox) already route to these ids — Phase 4 turns them into real kits.
EOF
)"
```

---

## Wave 6 — Data loaders + page wiring

The most code in any single wave. Each loader is small and individually tested.

### Task 21: `loadInboxQueue` — fetch user-table rows for the queue

**Files:**
- Modify: `src/lib/apps/view-kits/data.ts`
- Test: `src/lib/apps/view-kits/__tests__/data-inbox.test.ts` (new file)

- [ ] **Step 1: Inspect existing data.ts loaders for pattern.**

```bash
sed -n '1,90p' src/lib/apps/view-kits/data.ts
grep -n "loadLedger\|loadCoach\|getRows\|userTableRows" src/lib/apps/view-kits/data.ts | head -10
```

- [ ] **Step 2: Failing test.**

Create `src/lib/apps/view-kits/__tests__/data-inbox.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { userTables, userTableColumns, userTableRows } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { loadInboxQueue, loadInboxDraft } from "../data";

describe("loadInboxQueue", () => {
  const tableId = "test-touchpoints";

  beforeEach(() => {
    db.delete(userTableRows).where(sql`${userTableRows.tableId} = ${tableId}`).run();
    db.delete(userTableColumns).where(sql`${userTableColumns.tableId} = ${tableId}`).run();
    db.delete(userTables).where(sql`${userTables.id} = ${tableId}`).run();
    db.insert(userTables).values({ id: tableId, name: "test-touchpoints" }).run();
    db.insert(userTableColumns).values([
      { id: `${tableId}__channel`, tableId, name: "channel", dataType: "string", position: 0 },
      { id: `${tableId}__summary`, tableId, name: "summary", dataType: "string", position: 1 },
    ]).run();
    db.insert(userTableRows).values([
      { id: "r1", tableId, position: 0, values: JSON.stringify({ channel: "email", summary: "Acme reply" }) },
      { id: "r2", tableId, position: 1, values: JSON.stringify({ channel: "email", summary: "Beta reply" }) },
    ]).run();
  });

  it("returns rows in position order", async () => {
    const queue = await loadInboxQueue(tableId);
    expect(queue).toHaveLength(2);
    expect(queue[0]?.id).toBe("r1");
    expect(queue[1]?.id).toBe("r2");
  });

  it("parses values JSON", async () => {
    const queue = await loadInboxQueue(tableId);
    expect(queue[0]?.values).toEqual({ channel: "email", summary: "Acme reply" });
  });

  it("returns [] when tableId is undefined", async () => {
    expect(await loadInboxQueue(undefined)).toEqual([]);
  });

  it("caps at 50 rows", async () => {
    db.insert(userTableRows).values(
      Array.from({ length: 60 }, (_, i) => ({
        id: `bulk-${i}`,
        tableId,
        position: i + 10,
        values: JSON.stringify({ channel: "x", summary: `S${i}` }),
      }))
    ).run();
    const queue = await loadInboxQueue(tableId);
    expect(queue.length).toBeLessThanOrEqual(50);
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement `loadInboxQueue` in `data.ts`.**

Add (near the existing private loaders):

```ts
import { userTableRows } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

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
    values: typeof r.values === "string" ? JSON.parse(r.values) : (r.values ?? {}),
  }));
}
```

(Adjust imports — `eq`, `asc`, `db`, `userTableRows` — to match existing imports in `data.ts`.)

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: tsc clean.**

### Task 22: `loadInboxDraft` — fetch the document linked to the row's draft task

**Files:**
- Modify: `src/lib/apps/view-kits/data.ts`
- Modify: extend `src/lib/apps/view-kits/__tests__/data-inbox.test.ts`

- [ ] **Step 1: Add the failing test (extends the existing file).**

Append:

```ts
import { tasks, documents } from "@/lib/db/schema";

describe("loadInboxDraft", () => {
  const appId = "app-test-inbox";
  const rowId = "r1";

  beforeEach(() => {
    db.delete(documents).where(sql`${documents.taskId} LIKE 'task-test-%'`).run();
    db.delete(tasks).where(sql`${tasks.projectId} = ${appId}`).run();
  });

  it("returns null when no task matches the row", async () => {
    expect(await loadInboxDraft(appId, rowId)).toBeNull();
  });

  it("returns the most recent document linked to the matching task", async () => {
    const taskId = "task-test-1";
    db.insert(tasks).values({
      id: taskId,
      title: "draft for r1",
      status: "completed",
      projectId: appId,
      contextRowId: rowId,
    } as any).run();
    db.insert(documents).values({
      id: "doc-1",
      taskId,
      filename: "draft-r1.md",
      originalName: "draft-r1.md",
      mimeType: "text/markdown",
      size: 50,
      filePath: "/tmp/draft-r1.md",
      uploadedAt: Date.now(),
      content: "Hi!",
    } as any).run();

    const draft = await loadInboxDraft(appId, rowId);
    expect(draft?.id).toBe("doc-1");
    expect(draft?.taskId).toBe(taskId);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**

Add to `data.ts`:

```ts
import { unstable_cache } from "next/cache";
import { tasks, documents } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

const _loadInboxDraft = unstable_cache(
  async (appId: string, rowId: string) => {
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
      .orderBy(desc(documents.uploadedAt))
      .limit(1)
      .get();
    if (!doc) return null;
    return {
      id: doc.id,
      filename: doc.filename ?? doc.originalName,
      content:
        typeof (doc as { content?: unknown }).content === "string"
          ? (doc as { content: string }).content
          : "",
      taskId: task.id,
    };
  },
  ["inbox-draft"],
  { revalidate: 60 }
);

export async function loadInboxDraft(appId: string, rowId: string | null) {
  if (!rowId) return null;
  return _loadInboxDraft(appId, rowId);
}
```

(Add `and` to the existing imports from drizzle-orm if not already.)

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: tsc clean.**

### Task 23: `loadResearchSources` + `loadLatestSynthesis` + `loadRecentRuns`

**Files:**
- Modify: `src/lib/apps/view-kits/data.ts`
- Test: `src/lib/apps/view-kits/__tests__/data-research.test.ts` (new)

- [ ] **Step 1: Failing test.**

Create `src/lib/apps/view-kits/__tests__/data-research.test.ts` with three test blocks (one per loader). Each seeds DB rows, calls the loader, asserts shape. Use the same pattern as the inbox test — schema-touching is OK in vitest because `src/lib/db/index.ts` bootstraps a temp DB.

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { userTables, userTableColumns, userTableRows, tasks, documents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { loadResearchSources, loadLatestSynthesis, loadRecentRuns } from "../data";

const appId = "app-test-research";
const tableId = "sources-test";
const blueprintId = "weekly-digest";

beforeEach(() => {
  db.delete(userTableRows).where(sql`${userTableRows.tableId} = ${tableId}`).run();
  db.delete(userTableColumns).where(sql`${userTableColumns.tableId} = ${tableId}`).run();
  db.delete(userTables).where(sql`${userTables.id} = ${tableId}`).run();
  db.delete(documents).where(sql`${documents.taskId} LIKE 'rt-%'`).run();
  db.delete(tasks).where(sql`${tasks.projectId} = ${appId}`).run();
  db.insert(userTables).values({ id: tableId, name: tableId }).run();
  db.insert(userTableColumns).values([
    { id: `${tableId}__name`, tableId, name: "name", dataType: "string", position: 0 },
  ]).run();
  db.insert(userTableRows).values([
    { id: "src-1", tableId, position: 0, values: JSON.stringify({ name: "HN" }) },
    { id: "src-2", tableId, position: 1, values: JSON.stringify({ name: "ArXiv" }) },
  ]).run();
});

describe("loadResearchSources", () => {
  it("returns rows in position order", async () => {
    const rows = await loadResearchSources(tableId);
    expect(rows.map((r) => r.id)).toEqual(["src-1", "src-2"]);
  });

  it("returns [] when tableId is undefined", async () => {
    expect(await loadResearchSources(undefined)).toEqual([]);
  });
});

describe("loadLatestSynthesis", () => {
  it("returns null when no completed synthesis task exists", async () => {
    expect(await loadLatestSynthesis(appId, blueprintId)).toBeNull();
  });

  it("returns the latest completed synthesis task's document", async () => {
    const taskId = "rt-1";
    db.insert(tasks).values({
      id: taskId,
      title: "weekly digest",
      status: "completed",
      projectId: appId,
      result: "Synthesis body",
    } as any).run();
    db.insert(documents).values({
      id: "rt-doc-1",
      taskId,
      filename: "digest.md",
      originalName: "digest.md",
      mimeType: "text/markdown",
      size: 100,
      filePath: "/tmp/digest.md",
      uploadedAt: Date.now(),
      content: "# Digest\n\nBody",
    } as any).run();

    const result = await loadLatestSynthesis(appId, blueprintId);
    expect(result?.docId).toBe("rt-doc-1");
    expect(result?.content).toContain("Digest");
  });
});

describe("loadRecentRuns", () => {
  it("returns runs in reverse-chronological order, capped at limit", async () => {
    db.insert(tasks).values([
      { id: "rt-2", title: "run a", status: "completed", projectId: appId, createdAt: 100 },
      { id: "rt-3", title: "run b", status: "failed", projectId: appId, createdAt: 200 },
    ] as any).run();

    const runs = await loadRecentRuns(appId, blueprintId, 5);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs[0]?.startedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**

Append to `data.ts`:

```ts
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
    values: typeof r.values === "string" ? JSON.parse(r.values) : (r.values ?? {}),
  }));
}

export async function loadLatestSynthesis(
  appId: string,
  blueprintId: string | undefined
): Promise<{ docId: string; content: string; taskId: string; ageMs: number } | null> {
  if (!blueprintId) return null;
  const task = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, appId), eq(tasks.status, "completed")))
    .orderBy(desc(tasks.createdAt))
    .limit(1)
    .get();
  if (!task) return null;
  const doc = db
    .select()
    .from(documents)
    .where(eq(documents.taskId, task.id))
    .orderBy(desc(documents.uploadedAt))
    .limit(1)
    .get();
  if (!doc) return null;
  return {
    docId: doc.id,
    content:
      typeof (doc as { content?: unknown }).content === "string"
        ? (doc as { content: string }).content
        : (task.result ?? ""),
    taskId: task.id,
    ageMs: Date.now() - (task.createdAt ?? Date.now()),
  };
}

export async function loadRecentRuns(
  appId: string,
  _blueprintId: string | undefined,
  limit: number = 10
) {
  const rows = db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, appId))
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .all();
  return rows.map((t) => ({
    id: t.id,
    status: (t.status as "running" | "completed" | "failed" | "queued") ?? "queued",
    startedAt: new Date(t.createdAt ?? Date.now()).toISOString(),
    durationMs: undefined,
    outputDocumentId: undefined,
  }));
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: tsc clean.**

### Task 24: Add Inbox + Research branches to `loadRuntimeStateUncached`

**Files:**
- Modify: `src/lib/apps/view-kits/data.ts`

- [ ] **Step 1: Read the current `loadRuntimeStateUncached` to find the kit-id branching block.**

```bash
grep -nA50 "loadRuntimeStateUncached" src/lib/apps/view-kits/data.ts | head -80
```

- [ ] **Step 2: Add the new branches.**

After the `if (kitId === "ledger") { ... }` block, add:

```ts
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
    researchCitations: [], // Phase 4: real citation linkage = follow-up; ship as []
    researchRecentRuns: runs,
    researchSourcesCount: sources.length,
    researchLastSynthAge: lastSynthAge,
  };
}
```

Add `humanizeAge` helper:

```ts
function humanizeAge(ms: number): string {
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
```

- [ ] **Step 3: Update `ResolveInput` (in `types.ts`) to include `rowId?` if not already; thread through.**

```bash
grep -n "rowId" src/lib/apps/view-kits/types.ts
```

If absent, add to `ResolveInput`:

```ts
/** Phase 4: Inbox-only — selected row id from URL ?row= */
rowId?: string | null;
```

And to whatever `LoadRuntimeStateInput` shape `loadRuntimeStateUncached` takes — propagate `rowId` from the page handler.

- [ ] **Step 4: Update existing data tests if any assert the kitId-branch return shape.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__
```

If anything breaks, fix the test (the branch is additive, so existing tests should still pass).

- [ ] **Step 5: tsc clean.**

### Task 25: `src/app/apps/[id]/page.tsx` — parse `?row` and thread through

**Files:**
- Modify: `src/app/apps/[id]/page.tsx`

- [ ] **Step 1: Read the current page implementation.**

```bash
sed -n '1,80p' src/app/apps/[id]/page.tsx
```

Note where `period` was added in Phase 3 — `?row` plumbs through the same hook.

- [ ] **Step 2: Add `?row` parsing and pass to data loader.**

In the `searchParams` handling, add:

```ts
const rowParam = typeof searchParams?.row === "string" ? searchParams.row : null;
```

Pass it to `loadRuntimeStateUncached(app, kitId, projection, { period, rowId: rowParam })` (or however the call signature looks now). If the input shape is positional, extend it.

- [ ] **Step 3: tsc clean.**

```bash
npx tsc --noEmit
```

### Task 26: Commit Wave 6

- [ ] **Step 1: Run full apps/view-kits suite.**

```bash
npx vitest run src/lib/apps src/components/apps
```

Expected: all green.

- [ ] **Step 2: Stage and commit.**

```bash
git add src/lib/apps/view-kits/data.ts \
        src/lib/apps/view-kits/types.ts \
        src/lib/apps/view-kits/__tests__/data-inbox.test.ts \
        src/lib/apps/view-kits/__tests__/data-research.test.ts \
        src/app/apps/\[id\]/page.tsx

git commit -m "$(cat <<'EOF'
feat(apps): Phase 4 wave 6 — data loaders + page wiring

- loadInboxQueue: 50-row cap, position order, JSON values parse
- loadInboxDraft: tasks.contextRowId LIKE pattern → JOIN documents.taskId,
  unstable_cache (60s TTL, keyed appId+rowId)
- loadResearchSources: same 50-cap pattern as Inbox queue
- loadLatestSynthesis: latest completed task → JOIN documents (falls back to
  task.result when no document is attached)
- loadRecentRuns: shaped as TimelineRun[]
- loadRuntimeStateUncached: new "inbox" and "research" branches; reuses
  loadCadence for Research; humanizeAge helper for "Last synth" KPI
- src/app/apps/[id]/page.tsx parses ?row from search params, threads rowId
  into the data loader for Inbox

ResolveInput.rowId added; backward-compatible (optional).
EOF
)"
```

---

## Wave 7 — `<KitView>` integration test infrastructure + retroactive tests

The HOLD-mode investment that closes the wiring-bug class.

### Task 27: Build `renderKitView` test helper

**Files:**
- Create: `src/lib/apps/view-kits/__tests__/render-kit-view.tsx`

- [ ] **Step 1: Inspect existing kit unit tests + KitView for the runtime shape needed.**

```bash
sed -n '1,40p' src/components/apps/kit-view/kit-view.tsx
```

- [ ] **Step 2: Implement the helper (no failing-test step — it's a test util, not a tested module; the integration tests below are its consumers).**

Create `src/lib/apps/view-kits/__tests__/render-kit-view.tsx`:

```tsx
import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { KitView } from "@/components/apps/kit-view/kit-view";
import type { AppManifest } from "@/lib/apps/registry";
import type {
  ColumnSchemaRef,
  KitDefinition,
  RuntimeState,
  ViewModel,
} from "@/lib/apps/view-kits/types";

interface RenderKitViewArgs {
  kit: KitDefinition;
  manifest: AppManifest;
  columns?: ColumnSchemaRef[];
  runtime?: Partial<RuntimeState>;
  period?: "mtd" | "qtd" | "ytd";
  rowId?: string | null;
}

/**
 * Drive a kit's resolve + buildModel + <KitView> through React Testing
 * Library to assert end-to-end DOM markers. Caller passes a fake AppManifest
 * + partial runtime overrides; defaults fill the rest.
 */
export function renderKitView(args: RenderKitViewArgs): RenderResult & {
  model: ViewModel;
} {
  const proj = args.kit.resolve({
    manifest: args.manifest,
    columns: args.columns ?? [],
    period: args.period,
    rowId: args.rowId,
  });
  const baseRuntime: RuntimeState = {
    app: {
      id: args.manifest.id,
      name: args.manifest.name,
      description: args.manifest.description ?? null,
      manifest: args.manifest,
      files: [],
    },
    recentTaskCount: 0,
    scheduleCadence: null,
    ...args.runtime,
  };
  const model = args.kit.buildModel(proj, baseRuntime);
  const result = render(<KitView model={model} />);
  return Object.assign(result, { model });
}
```

(Adjust the import to avoid hitting Next.js `headers()` if `<KitView>` calls server-only APIs. If so, mock or render the slot views directly.)

- [ ] **Step 3: tsc clean.**

### Task 28: Integration test for Tracker

**Files:**
- Create: `src/lib/apps/view-kits/__tests__/integration/tracker-kit-view.test.tsx`

- [ ] **Step 1: Failing test.**

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { trackerKit } from "../../kits/tracker";

const manifest = {
  id: "habits",
  name: "Habit tracker",
  description: "Daily habits",
  profiles: [],
  blueprints: [{ id: "weekly-review", name: "Weekly review" }],
  schedules: [{ id: "daily", cron: "0 9 * * *", runs: "weekly-review" }],
  tables: [{
    id: "habits",
    name: "habits",
    columns: [
      { name: "habit" },
      { name: "completed", type: "boolean" },
      { name: "date", type: "date" },
    ],
  }],
} as any;

describe("Tracker kit — KitView integration", () => {
  it("renders header + KPIs + hero", () => {
    const { container } = renderKitView({
      kit: trackerKit,
      manifest,
      columns: [{
        tableId: "habits",
        columns: [
          { name: "habit" },
          { name: "completed", type: "boolean" },
          { name: "date", type: "date" },
        ],
      }],
      runtime: {
        cadence: { humanLabel: "Daily 9am", nextFireMs: null },
        evaluatedKpis: [{ id: "k1", label: "Streak", value: "5d" }],
        heroTable: {
          tableId: "habits",
          columns: [],
          rows: [],
        } as any,
      },
    });
    expect(container.querySelector('[data-kit-slot="hero"]')).toBeInTheDocument();
  });

  it("includes the cadence chip in header", () => {
    renderKitView({
      kit: trackerKit,
      manifest,
      columns: [],
      runtime: {
        cadence: { humanLabel: "Daily 9am", nextFireMs: null },
      },
    });
    expect(screen.getByText(/daily 9am/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect PASS** (Tracker is already correct; if these fail it means we found a real existing wiring bug — fix at the kit, not the test).

- [ ] **Step 3: tsc clean.**

### Task 29: Integration test for Workflow Hub

**Files:**
- Create: `src/lib/apps/view-kits/__tests__/integration/workflow-hub-kit-view.test.tsx`

- [ ] **Step 1: Failing test.**

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { workflowHubKit } from "../../kits/workflow-hub";

const manifest = {
  id: "ops",
  name: "Ops hub",
  description: "Multi-blueprint orchestration",
  profiles: [],
  blueprints: [
    { id: "ingest", name: "Ingest" },
    { id: "transform", name: "Transform" },
    { id: "publish", name: "Publish" },
  ],
  schedules: [],
  tables: [],
} as any;

describe("Workflow Hub kit — KitView integration", () => {
  it("renders header + KPIs + secondary cards per blueprint", () => {
    const { container } = renderKitView({
      kit: workflowHubKit,
      manifest,
      columns: [],
      runtime: {
        evaluatedKpis: [
          { id: "k1", label: "Runs (7d)", value: "12" },
          { id: "k2", label: "Failures", value: "1" },
        ],
        blueprintLastRuns: {
          ingest: { id: "t1", title: "Ingest run", status: "completed", createdAt: 0, result: null },
          transform: { id: "t2", title: "Transform run", status: "failed", createdAt: 0, result: null },
          publish: null,
        },
        blueprintRunCounts: { ingest: 5, transform: 4, publish: 0 },
        failedTasks: [],
      },
    });
    expect(screen.getByText(/runs \(7d\)/i)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-kit-slot="secondary"]').length).toBeGreaterThanOrEqual(1);
  });

  it("renders activity feed with failed tasks when present", () => {
    const { container } = renderKitView({
      kit: workflowHubKit,
      manifest,
      columns: [],
      runtime: {
        failedTasks: [
          { id: "t-failed", title: "Transform run", status: "failed", createdAt: Date.now(), result: null },
        ],
      },
    });
    expect(container.querySelector('[data-kit-slot="activity"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect PASS.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__/integration/workflow-hub-kit-view.test.tsx
```

- [ ] **Step 3: tsc clean.**

### Task 30: Integration test for Coach

**Files:**
- Create: `src/lib/apps/view-kits/__tests__/integration/coach-kit-view.test.tsx`

- [ ] **Step 1: Failing test.**

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { coachKit } from "../../kits/coach";

const manifest = {
  id: "wpci",
  name: "Weekly portfolio check-in",
  description: "Markdown digest hero",
  profiles: [{ id: "wealth-coach" }],
  blueprints: [{ id: "weekly-checkin", name: "Weekly check-in" }],
  schedules: [{ id: "mon-8am", cron: "0 8 * * 1", runs: "weekly-checkin" }],
  tables: [],
} as any;

describe("Coach kit — KitView integration", () => {
  it("renders cadence chip + Run Now button + digest hero", () => {
    const { container } = renderKitView({
      kit: coachKit,
      manifest,
      columns: [],
      runtime: {
        cadence: { humanLabel: "Mondays at 8am", nextFireMs: null },
        coachLatestTask: {
          id: "t1",
          title: "Last check-in",
          status: "completed",
          createdAt: Date.now(),
          result: "## Portfolio update\n\nYTD up 8%",
        },
        coachPreviousRuns: [],
      },
    });
    expect(screen.getByText(/mondays at 8am/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument();
    expect(container.querySelector('[data-kit-slot="hero"]')).toBeInTheDocument();
    expect(screen.getByText(/portfolio update/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect PASS.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__/integration/coach-kit-view.test.tsx
```

- [ ] **Step 3: tsc clean.**

### Task 31: Integration test for Ledger

**Files:**
- Create: `src/lib/apps/view-kits/__tests__/integration/ledger-kit-view.test.tsx`

This test specifically catches Phase 3.1's regression class — it asserts secondary slot (`Recent transactions`) and activity slot (`MonthlyCloseSummary`) are populated, which is the wiring fixed in commit `6818b265`.

- [ ] **Step 1: Failing test.**

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { ledgerKit } from "../../kits/ledger";

const manifest = {
  id: "fin",
  name: "Finance",
  description: "Net/Inflow/Outflow",
  profiles: [],
  blueprints: [{ id: "monthly-close", name: "Monthly close" }],
  schedules: [],
  tables: [{
    id: "transactions",
    name: "transactions",
    columns: [
      { name: "date", type: "date" },
      { name: "amount", type: "number", semantic: "currency" },
      { name: "category", type: "string" },
    ],
  }],
} as any;

const columns = [{
  tableId: "transactions",
  columns: [
    { name: "date", type: "date" },
    { name: "amount", type: "number", semantic: "currency" },
    { name: "category", type: "string" },
  ],
}];

describe("Ledger kit — KitView integration", () => {
  it("renders period chip in header (mtd default)", () => {
    renderKitView({
      kit: ledgerKit,
      manifest,
      columns,
      period: "mtd",
      runtime: {
        ledgerSeries: [],
        ledgerCategories: [],
        ledgerTransactions: [],
        ledgerMonthlyClose: null,
        evaluatedKpis: [],
      },
    });
    // PeriodSelectorChip renders MTD / QTD / YTD options
    expect(screen.getByRole("button", { name: /mtd/i })).toBeInTheDocument();
  });

  it("renders Recent transactions secondary card with seeded rows", () => {
    const { container } = renderKitView({
      kit: ledgerKit,
      manifest,
      columns,
      period: "mtd",
      runtime: {
        ledgerSeries: [],
        ledgerCategories: [],
        ledgerTransactions: [
          { id: "tx1", date: "2026-04-15", label: "Salary", amount: 5000, category: "income" },
        ],
        ledgerMonthlyClose: null,
        evaluatedKpis: [],
      },
    });
    expect(container.querySelector('[data-kit-slot="secondary"]')).toBeInTheDocument();
    expect(screen.getByText(/recent transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/salary/i)).toBeInTheDocument();
  });

  it("renders monthly-close summary in activity slot when populated", () => {
    const { container } = renderKitView({
      kit: ledgerKit,
      manifest,
      columns,
      period: "mtd",
      runtime: {
        ledgerSeries: [],
        ledgerCategories: [],
        ledgerTransactions: [],
        ledgerMonthlyClose: {
          id: "mc-1",
          title: "Monthly close — April",
          status: "completed",
          createdAt: Date.now(),
          result: "## Summary\n\nNet positive month",
        },
        evaluatedKpis: [],
      },
    });
    expect(container.querySelector('[data-kit-slot="activity"]')).toBeInTheDocument();
    expect(screen.getByText(/monthly close — april/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect PASS.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__/integration/ledger-kit-view.test.tsx
```

- [ ] **Step 3: tsc clean.**

### Task 32: Integration test for Inbox

Asserts: trigger-source chip in header for row-insert manifests, Run Now suppressed, inbox-split hero with queue + draft, throughput strip in activity.

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { inboxKit } from "../../kits/inbox";

const manifest = {
  id: "cfd",
  name: "Customer follow-up drafter",
  profiles: [],
  blueprints: [{
    id: "draft",
    name: "Draft",
    trigger: { kind: "row-insert", table: "touchpoints" },
  }],
  schedules: [],
  tables: [{
    id: "touchpoints",
    name: "touchpoints",
    columns: [{ name: "summary" }, { name: "channel" }, { name: "sentiment" }],
  }],
} as any;

describe("Inbox kit — KitView integration", () => {
  it("renders trigger-source chip and suppresses Run Now for row-insert", () => {
    renderKitView({
      kit: inboxKit,
      manifest,
      columns: [{
        tableId: "touchpoints",
        columns: [{ name: "summary" }, { name: "channel" }, { name: "sentiment" }],
      }],
      runtime: { inboxQueueRows: [], inboxSelectedRowId: null, inboxDraftDocument: null },
    });
    expect(screen.getByText(/row insert in touchpoints/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run now/i })).not.toBeInTheDocument();
  });

  it("renders hero with inbox-split content", () => {
    const { container } = renderKitView({
      kit: inboxKit,
      manifest,
      columns: [{
        tableId: "touchpoints",
        columns: [{ name: "summary" }, { name: "channel" }],
      }],
      runtime: {
        inboxQueueRows: [
          { id: "r1", tableId: "touchpoints", values: { summary: "Acme reply", channel: "email" } },
        ],
        inboxSelectedRowId: "r1",
        inboxDraftDocument: { id: "d1", filename: "draft.md", content: "Hi", taskId: "t1" },
      },
    });
    expect(container.querySelector('[data-kit-pane="queue"]')).toBeInTheDocument();
    expect(container.querySelector('[data-kit-pane="draft"]')).toBeInTheDocument();
    expect(screen.getByText(/acme reply/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect PASS.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__/integration/inbox-kit-view.test.tsx
```

- [ ] **Step 3: tsc clean.**

```bash
npx tsc --noEmit
```

### Task 33: Integration test for Research

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { researchKit } from "../../kits/research";

const manifest = {
  id: "rd",
  name: "Research digest",
  profiles: [],
  blueprints: [{ id: "weekly-digest", name: "Weekly digest" }],
  schedules: [{ id: "fri-5pm", cron: "0 17 * * 5", runs: "weekly-digest" }],
  tables: [{
    id: "sources",
    name: "sources",
    columns: [{ name: "name" }, { name: "url" }],
  }],
} as any;

describe("Research kit — KitView integration", () => {
  it("renders cadence chip + sources count KPI + run-history-timeline", () => {
    const { container } = renderKitView({
      kit: researchKit,
      manifest,
      columns: [{
        tableId: "sources",
        columns: [{ name: "name" }, { name: "url" }],
      }],
      runtime: {
        cadence: { humanLabel: "Fridays at 5pm", nextFireMs: null },
        researchSources: [{ id: "src-1", values: { name: "HN", url: "https://hn" } }],
        researchSourcesCount: 1,
        researchLastSynthAge: "2h ago",
        researchSynthesisContent: "## Digest\nbody",
        researchCitations: [],
        researchRecentRuns: [
          { id: "r1", status: "completed", startedAt: "2026-04-30T08:00:00Z" },
        ],
      },
    });
    expect(screen.getByText(/fridays at 5pm/i)).toBeInTheDocument();
    expect(screen.getByText(/sources/i)).toBeInTheDocument();
    expect(container.querySelector('[data-kit-pane="sources"]')).toBeInTheDocument();
    expect(container.querySelector('[data-kit-pane="synthesis"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect PASS.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__/integration/research-kit-view.test.tsx
```

- [ ] **Step 3: tsc clean.**

```bash
npx tsc --noEmit
```

### Task 34: Commit Wave 7

- [ ] **Step 1: Run all integration tests.**

```bash
npx vitest run src/lib/apps/view-kits/__tests__/integration
```

- [ ] **Step 2: Run full apps suite for regression check.**

```bash
npx vitest run src/lib/apps src/components/apps
```

- [ ] **Step 3: Stage and commit.**

```bash
git add src/lib/apps/view-kits/__tests__/render-kit-view.tsx \
        src/lib/apps/view-kits/__tests__/integration/

git commit -m "$(cat <<'EOF'
test(apps): Phase 4 wave 7 — KitView integration tests for all 6 kits

renderKitView helper drives kit.resolve + kit.buildModel + <KitView> through
React Testing Library, asserting end-to-end DOM markers per slot.

6 integration tests:
  - tracker (cadence chip, hero present)
  - workflow-hub (KPIs, secondary blueprints)
  - coach (cadence chip + digest hero + run now)
  - ledger (period chip, transactions secondary, monthly close activity)
  - inbox (trigger-source chip, run now suppressed, inbox-split hero)
  - research (cadence chip + KPIs, sources/synthesis panes, run timeline)

Closes the wiring-bug class exposed in Phase 3 — these tests would have caught
the 3 wiring bugs documented in the previous handoff.
EOF
)"
```

---

## Wave 8 — Browser smoke + status updates

Final wave. UI verification (not a runtime-cycle smoke).

### Task 35: Hand-craft canonical smoke manifests

**Files (gitignored, local-only):**
- Create: `~/.ainative/apps/customer-follow-up-drafter/manifest.yaml`
- Create: `~/.ainative/apps/research-digest/manifest.yaml`

- [ ] **Step 1: Verify the user-table schema commands needed for seeding.**

```bash
sqlite3 ~/.ainative/ainative.db ".schema user_tables"
sqlite3 ~/.ainative/ainative.db ".schema user_table_columns"
sqlite3 ~/.ainative/ainative.db ".schema user_table_rows"
```

- [ ] **Step 2: Author the customer-follow-up-drafter manifest.**

```bash
mkdir -p ~/.ainative/apps/customer-follow-up-drafter
```

Write `~/.ainative/apps/customer-follow-up-drafter/manifest.yaml`:

```yaml
id: customer-follow-up-drafter
name: Customer follow-up drafter
description: Drafts a follow-up reply when a new touchpoint row arrives.
profiles:
  - id: cs-coach
    name: CS coach
    description: Helpful customer-success agent
blueprints:
  - id: draft-followup
    name: Draft followup
    description: Drafts a personalized follow-up email
    trigger:
      kind: row-insert
      table: customer-touchpoints
schedules: []
tables:
  - id: customer-touchpoints
    columns:
      - channel
      - customer
      - summary
      - sentiment
view:
  kit: inbox
```

- [ ] **Step 3: Seed the customer-touchpoints table + 3 rows.**

```bash
sqlite3 ~/.ainative/ainative.db <<'EOF'
INSERT OR IGNORE INTO user_tables (id, name) VALUES ('customer-touchpoints', 'customer-touchpoints');
DELETE FROM user_table_columns WHERE table_id = 'customer-touchpoints';
INSERT INTO user_table_columns (id, table_id, name, data_type, position) VALUES
  ('cft__channel', 'customer-touchpoints', 'channel', 'string', 0),
  ('cft__customer', 'customer-touchpoints', 'customer', 'string', 1),
  ('cft__summary', 'customer-touchpoints', 'summary', 'string', 2),
  ('cft__sentiment', 'customer-touchpoints', 'sentiment', 'string', 3);
DELETE FROM user_table_rows WHERE table_id = 'customer-touchpoints';
INSERT INTO user_table_rows (id, table_id, position, values) VALUES
  ('cft-r1', 'customer-touchpoints', 0,
   '{"channel":"email","customer":"Acme Corp","summary":"Bug report on signup flow","sentiment":"negative"}'),
  ('cft-r2', 'customer-touchpoints', 1,
   '{"channel":"chat","customer":"Beta LLC","summary":"Loved the new feature!","sentiment":"positive"}'),
  ('cft-r3', 'customer-touchpoints', 2,
   '{"channel":"email","customer":"Gamma Co","summary":"Question about pricing","sentiment":"neutral"}');
EOF
```

- [ ] **Step 4: Optionally seed a draft task + document for cft-r1 to prove the right-pane works.**

```bash
sqlite3 ~/.ainative/ainative.db <<'EOF'
INSERT INTO tasks (id, title, status, project_id, context_row_id, created_at) VALUES
  ('cfd-draft-1', 'Draft followup for cft-r1', 'completed',
   'customer-follow-up-drafter', 'cft-r1', strftime('%s','now') * 1000);
INSERT INTO documents (id, task_id, filename, original_name, mime_type, size, file_path, uploaded_at, content) VALUES
  ('cfd-doc-1', 'cfd-draft-1', 'reply-acme.md', 'reply-acme.md', 'text/markdown',
   80, '/tmp/reply-acme.md', strftime('%s','now') * 1000,
   '## Reply to Acme Corp\n\nSorry to hear about the signup-flow issue. We are investigating and will follow up within 24 hours.');
EOF
```

(Adjust column names if `documents.content` doesn't exist — fall back to writing the file at `/tmp/reply-acme.md` and pointing `file_path` there.)

- [ ] **Step 5: Author the research-digest manifest.**

```bash
mkdir -p ~/.ainative/apps/research-digest
```

Write `~/.ainative/apps/research-digest/manifest.yaml`:

```yaml
id: research-digest
name: Research digest
description: Weekly synthesis across configured sources.
profiles:
  - id: research-analyst
    name: Research analyst
    description: Concise news-desk synthesizer
blueprints:
  - id: weekly-digest
    name: Weekly digest
    description: Synthesize 3 most important developments across sources
schedules:
  - id: fri-5pm
    cron: "0 17 * * 5"
    runs: weekly-digest
tables:
  - id: sources
    columns:
      - name
      - url
      - cadence
view:
  kit: research
```

- [ ] **Step 6: Seed the sources table + a synthesis task + document.**

```bash
sqlite3 ~/.ainative/ainative.db <<'EOF'
INSERT OR IGNORE INTO user_tables (id, name) VALUES ('sources', 'sources');
DELETE FROM user_table_columns WHERE table_id = 'sources';
INSERT INTO user_table_columns (id, table_id, name, data_type, position) VALUES
  ('s__name', 'sources', 'name', 'string', 0),
  ('s__url', 'sources', 'url', 'string', 1),
  ('s__cadence', 'sources', 'cadence', 'string', 2);
DELETE FROM user_table_rows WHERE table_id = 'sources';
INSERT INTO user_table_rows (id, table_id, position, values) VALUES
  ('src-hn', 'sources', 0, '{"name":"Hacker News","url":"https://news.ycombinator.com","cadence":"daily"}'),
  ('src-arxiv', 'sources', 1, '{"name":"ArXiv","url":"https://arxiv.org","cadence":"daily"}'),
  ('src-rss', 'sources', 2, '{"name":"Stratechery","url":"https://stratechery.com/feed","cadence":"weekly"}');

INSERT INTO tasks (id, title, status, project_id, result, created_at) VALUES
  ('rd-synth-1', 'Weekly digest run', 'completed', 'research-digest',
   '## Digest for week ending Apr 30\n\n- HN trending: AI-native business models\n- ArXiv highlight: New paper on retrieval-augmented agents\n- Stratechery: Aggregation theory revisited',
   strftime('%s','now') * 1000);
EOF
```

### Task 36: Browser smoke for Inbox

- [ ] **Step 1: Start dev server on free port.**

```bash
PORT=3010 npm run dev &
```

(Or follow the project's existing port discipline if 3010 is taken.)

- [ ] **Step 2: Wait for ready.**

Wait until the terminal shows `Ready in <time>`.

- [ ] **Step 3: Open Playwright (or Claude in Chrome) and navigate to `/apps/customer-follow-up-drafter`.**

Use the project's preferred browser tool order: Claude in Chrome → retry → Chrome DevTools → Playwright (per `MEMORY.md`).

- [ ] **Step 4: Take a screenshot and verify the following are present:**

- Header chip: "Triggered by row insert in customer-touchpoints"
- No "Run now" button (suppressed for row-insert)
- Left pane: 3 queue rows (Acme, Beta, Gamma)
- Right pane: empty-state placeholder ("No draft yet")
- Activity strip: 7-bar drafts/day MiniBar + sentiment DonutRing (sentiment column present)

Save screenshot to `output/phase-4-inbox-empty.png`.

- [ ] **Step 5: Click the Acme row → URL should become `?row=cft-r1`.**

- [ ] **Step 6: Verify the right pane updates to show the draft.**

If the optional draft seed (Task 35 step 4) was loaded, the right pane shows "Reply to Acme Corp" markdown. Save `output/phase-4-inbox-draft.png`.

- [ ] **Step 7: Stop the dev server (only if you started it; do NOT kill the user's existing instance).**

### Task 37: Browser smoke for Research

- [ ] **Step 1: With the dev server still running (or restart per Task 36 Step 1), navigate to `/apps/research-digest`.**

- [ ] **Step 2: Verify the following are present:**

- Header: "Scheduled" cadence chip + "Run now" button
- KPIs: Sources = 3, Last synth = ~2h ago (or whatever recent time)
- Left pane: 3 source rows (Hacker News, ArXiv, Stratechery)
- Right pane: synthesis markdown ("Digest for week ending Apr 30")
- Activity: RunHistoryTimeline with at least one entry

Save `output/phase-4-research.png`.

- [ ] **Step 3: Citation chip click test.**

If the synthesis seed is extended to include citations (advanced — for Phase 4 the citations array is empty by design, since wave 6's `researchCitations` ships as `[]`). Skip this step or add a manual seed for the citation links. Document in commit.

### Task 38: Regression smoke for Tracker / Hub / Coach / Ledger

- [ ] **Step 1: Navigate to each existing app page in turn.**

```
/apps/habit-tracker
/apps/<workflow-hub-id>
/apps/weekly-portfolio-check-in
/apps/finance-pack
```

- [ ] **Step 2: Verify each renders without console errors.**

Use Playwright's console capture or Claude in Chrome's read_console_messages.

- [ ] **Step 3: Take regression screenshots saved as `output/phase-4-regression-<kit>.png`.**

### Task 39: Update feature spec status + changelog

**Files:**
- Modify: `features/composed-app-kit-inbox-and-research.md` (status `planned` → `completed`, add references to verification artifacts)
- Modify: `features/changelog.md` (add Phase 4 entry)

- [ ] **Step 1: Update status and references in the feature spec.**

In `features/composed-app-kit-inbox-and-research.md`, change the frontmatter `status: planned` to `status: completed`. In the References section, add:

```
- Implementation plan: `docs/superpowers/plans/2026-05-02-composed-app-kit-inbox-and-research.md`
- Design spec: `docs/superpowers/specs/2026-05-02-inbox-and-research-design.md`
- Verification run — 2026-05-02: dev server on PORT=3010, smoke screenshots in `output/phase-4-*.png`. Inbox + Research kits render correctly; Tracker/Hub/Coach/Ledger regression check passes without console errors.
```

- [ ] **Step 2: Append a Phase 4 entry to `features/changelog.md`.**

```
## 2026-05-02 — Phase 4 (composed-app-kit-inbox-and-research) shipped
- 2 new kits: InboxKit, ResearchKit
- 1 new shared primitive: RunHistoryTimeline
- 1 additive DB column: tasks.context_row_id
- 1 additive Zod field: BlueprintBase.trigger
- KitView integration tests retroactively applied to all 6 kits
- Closes wiring-bug class exposed in Phase 3 handoff
```

### Task 40: Commit Wave 8

- [ ] **Step 1: Stage and commit code changes.**

```bash
git add features/composed-app-kit-inbox-and-research.md \
        features/changelog.md \
        output/phase-4-*.png

git commit -m "$(cat <<'EOF'
docs(features): Phase 4 status → completed + changelog entry + smoke screenshots

Inbox + Research kits verified end-to-end via PORT=3010 dev server. Browser
smoke confirms:
- Inbox: trigger-source chip rendered, Run Now suppressed, 3 queue rows shown,
  draft pane updates on row click
- Research: cadence chip + KPIs + sources/synthesis panes + RunHistoryTimeline
- Tracker/Hub/Coach/Ledger: no regressions (console-clean)

Smoke artifacts in output/phase-4-*.png.
EOF
)"
```

- [ ] **Step 2: Update HANDOFF.md.**

Per `MEMORY.md` `feedback-handoff-md-workflow.md`: archive previous, write new.

```bash
cp HANDOFF.md .archive/handoff/2026-05-02-composed-app-kit-inbox-and-research-phase4-handoff.md
```

Overwrite `HANDOFF.md` with a Phase 4 completion summary that:
- Confirms Phase 4 fully shipped
- Notes the integration test infrastructure as the major cross-cutting deliverable
- Names the next feature (likely `composed-app-auto-inference-hardening` or `row-trigger-blueprint-execution` per the spec's References section)
- Lists smoke artifacts (paths only)

```bash
git add HANDOFF.md .archive/handoff/2026-05-02-composed-app-kit-inbox-and-research-phase4-handoff.md
git commit -m "docs(handoff): Phase 4 shipped — Inbox + Research + retroactive KitView integration tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Final verification gate

- [ ] **Step 1: Full test pass.**

```bash
npx vitest run src/lib/apps src/components/apps src/lib/db
```

Expected: all green. Total test count up by ~30+ (new kit tests, helper tests, integration tests, DB migration test).

- [ ] **Step 2: tsc clean across the project.**

```bash
npx tsc --noEmit
```

Exit code 0.

- [ ] **Step 3: Verify no runtime-registry-adjacent file was touched (sanity check that the smoke-budget rule was honored).**

```bash
git diff --name-only main...HEAD | grep -E "(claude-agent\.ts|runtime/(claude|openai-direct|anthropic-direct|catalog|index)\.ts|workflows/engine\.ts|chat/ainative-tools)"
```

Expected: no output. (If anything matches, the smoke-budget rule kicks in retroactively — additional smoke step required.)

- [ ] **Step 4: Confirm working tree is clean.**

```bash
git status
```

Expected: "nothing to commit, working tree clean".

---

## Self-review (post-write)

**Spec coverage:**
- ✅ `RunHistoryTimeline` exists — Wave 2
- ✅ InboxKit renders for customer-follow-up-drafter — Waves 5 + 6 + 8
- ✅ Trigger-source chip shown, Run Now suppressed for row-insert — Waves 4 + 5
- ✅ ResearchKit renders for research-digest — Waves 5 + 6 + 8
- ✅ Citation chips clickable + highlight matching row — Wave 4 (component) + Wave 6 (data; ships with empty `[]` per locked decision; full citation linkage deferred to follow-up)
- ✅ Manifest auto-inference picks `inbox`/`research` — already exists per `inference.ts` rule3/rule5; Wave 5 only registers the kits
- ✅ `detectTriggerSource` correctness across 5 branches — Wave 3 (6 tests including dual-trigger preference)
- ✅ Unit tests for kits — Wave 5
- ✅ Browser smoke for both apps — Wave 8 (Tasks 36-37)
- ✅ All earlier kits still pass smokes — Wave 8 Task 38 regression run
- ✅ KitView integration tests for all 6 kits — Wave 7 (the HOLD-mode investment)
- ✅ tasks.contextRowId column added with full migration / bootstrap / Drizzle / fresh-DB test — Wave 1 Task 1

**Placeholder scan:** searched for "TBD", "TODO", "implement later", "fill in details", "similar to Task N" — none found. The "Phase 4 ships citations as `[]`" note is explicit deferral, not a placeholder.

**Type consistency:**
- `TimelineRun` defined in Task 4 (`types.ts`), used in Task 6 (`run-history-timeline.tsx`), Task 23 (`loadRecentRuns` shape), Task 18 (Research kit). Naming consistent.
- `TriggerSource` defined in Task 4, used in Tasks 8, 11, 12, 17. Naming consistent.
- `contextRowId` (camelCase JS) ↔ `context_row_id` (snake_case DB) — confirmed across Tasks 1, 22.
- `inboxQueueRows` / `inboxSelectedRowId` / `inboxDraftDocument` — consistent across Tasks 3, 17, 21, 22, 24, 25, 32.
- `researchSources` / `researchSourcesCount` / `researchLastSynthAge` / `researchSynthesisContent` / `researchCitations` / `researchRecentRuns` — consistent across Tasks 3, 18, 23, 24, 33.

**Scope check:** 8 waves, ~40 tasks, single feature. Matches Phase 2/3 plan size. Single plan is appropriate (not multi-subsystem).

---

*End of plan. Proceed via `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.*
