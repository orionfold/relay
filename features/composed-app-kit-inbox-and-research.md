---
title: Composed App Kits — Inbox & Research
status: completed
priority: P2
milestone: post-mvp
source: ideas/composed-apps-domain-aware-view.md
dependencies: [composed-app-kit-coach-and-ledger]
---

# Composed App Kits — Inbox & Research

## Description

Phase 4 of the Composed Apps Domain-Aware View strategy: add the two final domain kits and the last new shared primitive needed by them.

**Inbox** is the queue + draft kit. It's the only kit with a two-pane layout: left side is a `PriorityQueue` filtered to "needs follow-up", right side is the AI-generated draft for the selected row, editable in `DocumentDetailView`. Selected for apps where a row-trigger blueprint emits documents from a `notification`/`message`-shaped table — the canonical example is customer-follow-up-drafter.

**Research** is the sources + synthesis kit. Left side is a `DataTable` of sources (URL/text columns, read/unread chip, tag filter); right side is the synthesis hero — the latest digest output rendered with a `DocumentChipBar` showing which sources fed it. Below is a collapsible synthesis history. Selected for apps where a table has URL/text columns + a blueprint emits a long-form document (research-digest, topic-tracker, knowledge-base apps).

The new shared primitive: `RunHistoryTimeline` — a vertical timeline of runs with status, timestamp, and quick-jump links. Used by Research (synthesis history) and Workflow Hub (re-skin opportunity for richer run history than the current ErrorTimeline).

## User Story

As a customer-support agent using the customer-follow-up-drafter app, I want to land on a queue of touchpoints needing follow-up with an AI-drafted response visible in the right pane, so I can edit and send without context-switching to a separate drafting workflow.

As a researcher using research-digest, I want my source list and the latest synthesis side-by-side with citations linking back to the source rows, so I can see what fed the synthesis and add new sources without leaving the page.

## Technical Approach

### New shared primitive

**`src/components/apps/run-history-timeline.tsx`**

```ts
type TimelineRun = {
  id: string;
  status: "running" | "completed" | "failed" | "queued";
  startedAt: string;
  durationMs?: number;
  outputDocumentId?: string;
};

export function RunHistoryTimeline({
  runs,
  onSelect,
}: {
  runs: TimelineRun[];
  onSelect?: (runId: string) => void;
}): JSX.Element;
```

Wraps the existing `ActivityFeed` shape with run-level granularity (one entry per task, not per agent_log event). Vertical layout, status icons, relative timestamps, click-to-open behavior. Used by Research (synthesis history) and exposed for Workflow Hub re-skin in a follow-up.

### New kits

**`src/lib/apps/view-kits/kits/inbox.ts`**

```ts
export const InboxKit: KitDefinition = {
  id: "inbox",
  resolve: ({ manifest, bindings }) => ({
    queueTableId:    bindings.hero?.table     ?? manifest.tables[0]?.id,
    draftBlueprintId: bindings.runs?.blueprint ?? manifest.blueprints[0]?.id,
    triggerSource:   detectTriggerSource(manifest), // e.g., "row-insert" | "schedule"
  }),
  buildModel: (proj, runtime) => ({
    header: {
      title: runtime.app.name,
      // Run Now disabled when event-driven; trigger-source chip shown instead
      triggerSourceChip: proj.triggerSource,
      runNow: proj.triggerSource === "schedule" ? { blueprintId: proj.draftBlueprintId } : undefined,
    },
    hero: {
      kind: "inbox-split",
      queueTableId: proj.queueTableId,
      queueFilter: { status: "needs-follow-up" },
      draftBlueprintId: proj.draftBlueprintId,
    },
    activity: {
      kind: "throughput-strip",
      // drafts/day MiniBar + sentiment DonutRing if sentiment column exists
      blueprintId: proj.draftBlueprintId,
    },
    footer: { kind: "manifest", manifest: runtime.app.manifest },
  }),
};
```

**`src/lib/apps/view-kits/kits/research.ts`**

```ts
export const ResearchKit: KitDefinition = {
  id: "research",
  resolve: ({ manifest, bindings }) => ({
    sourcesTableId:    bindings.hero?.table       ?? manifest.tables[0]?.id,
    synthesisBlueprintId: bindings.runs?.blueprint ?? manifest.blueprints[0]?.id,
    cadenceScheduleId:    bindings.cadence?.schedule ?? manifest.schedules[0]?.id,
  }),
  buildModel: (proj, runtime) => ({
    header: {
      title: runtime.app.name,
      cadenceChip: runtime.cadence,
      runNow: { blueprintId: proj.synthesisBlueprintId },
      kpis: [
        { id: "sources", label: "Sources",  value: runtime.sourcesCount, format: "int" },
        { id: "age",     label: "Last synth", value: runtime.lastSynthAge, format: "relative" },
      ],
    },
    hero: {
      kind: "research-split",
      sourcesTableId: proj.sourcesTableId,
      latestSynthesisDocId: runtime.latestSynthesisDocId,
    },
    activity: {
      kind: "run-history-timeline",
      blueprintId: proj.synthesisBlueprintId,
      limit: 10,
    },
    footer: { kind: "manifest", manifest: runtime.app.manifest },
  }),
};
```

### Slot renderer additions

- `src/components/apps/kit-view/slots/hero.tsx` gets `inbox-split` (uses existing `DetailPane` to render queue + draft side-by-side) and `research-split` (sources `DataTable` + `LightMarkdown` synthesis with `DocumentChipBar` of citations)
- `src/components/apps/kit-view/slots/activity.tsx` gets `throughput-strip` (drafts/day `MiniBar` + sentiment `DonutRing`) and `run-history-timeline` (renders the new primitive)
- `src/components/apps/kit-view/slots/header.tsx` gets a `triggerSourceChip` rendering for event-driven apps where Run Now is suppressed

### Trigger detection

`detectTriggerSource(manifest)` is a small pure helper that inspects the manifest's blueprints and schedules:
- If any blueprint declares `trigger: { kind: "row-insert", table: <id> }` → return `"row-insert"`
- Else if a schedule binds the blueprint → return `"schedule"`
- Else → return `"manual"`

This selects whether the header shows Run Now (manual/schedule paths) or a passive trigger-source chip (row-insert path — the system fires when rows arrive).

### Citation chip wiring (Research)

The synthesis hero's `DocumentChipBar` reads the latest synthesis task's `documentInputs` (existing FK) to find which source rows fed it. Each chip is clickable and scrolls/highlights the matching row in the sources table on the same page (intra-page link, not a route change).

## Acceptance Criteria

- [ ] `RunHistoryTimeline` exists and renders a vertical timeline with run status, timestamp, click-to-open
- [ ] `InboxKit` renders for customer-follow-up-drafter: queue on the left filtered to "needs follow-up", draft pane on the right with the AI-generated text editable
- [ ] `InboxKit` header shows the trigger-source chip (e.g., "Triggered by row insert in customer-touchpoints") and suppresses Run Now for row-insert apps
- [ ] `ResearchKit` renders for research-digest: sources DataTable left, latest synthesis right with DocumentChipBar citations
- [ ] Synthesis citation chips are clickable and highlight the matching source row in the table
- [ ] Manifest auto-inference picks `inbox` for customer-follow-up-drafter and `research` for research-digest (no explicit `view:` needed)
- [ ] `detectTriggerSource` returns `"row-insert"` / `"schedule"` / `"manual"` correctly for each starter app
- [ ] Unit tests for `InboxKit.resolve` / `buildModel` covering each `triggerSource` branch
- [ ] Unit tests for `ResearchKit.resolve` / `buildModel` covering empty + full bindings
- [ ] Browser smoke: `npm run dev` → `/apps/<customer-follow-up-drafter>` renders Inbox split; selecting a row in the queue updates the draft pane
- [ ] Browser smoke: `npm run dev` → `/apps/<research-digest>` renders Research split; clicking a citation chip highlights the source row
- [ ] All earlier kits (Tracker, Hub, Coach, Ledger) still pass their browser smokes (no regression)

## Scope Boundaries

**Included:**
- `RunHistoryTimeline` primitive
- `InboxKit`, `ResearchKit` registered in the view-kit registry
- Slot renderer additions: `inbox-split`, `research-split`, `throughput-strip`, `run-history-timeline`, `triggerSourceChip` in header
- `detectTriggerSource` helper

**Excluded:**
- Bidirectional channel chat for inbox responses (separate feature: `bidirectional-channel-chat`)
- Auto-tagging or sentiment scoring of queue items (existing column metadata only)
- Real-time updates of queue items (the page polls / refetches on user action; SSE is out of scope here)
- Search/filter UX inside the sources DataTable beyond what the existing `FilterBar` provides
- Re-skinning Workflow Hub's activity slot to use `RunHistoryTimeline` (deferred — current ErrorTimeline still works)

## References

- Source: `ideas/composed-apps-domain-aware-view.md` — sections 1.C (Inbox), 1.D (Research), 7 (Net-New Primitives), 13 shard #5
- Related features: `composed-app-kit-coach-and-ledger` (preceding phase, established patterns), `composed-app-auto-inference-hardening` (next phase, hardens probes)
- Reference primitives: `src/components/dashboard/priority-queue.tsx`, `src/components/documents/document-detail-view.tsx`, `src/components/documents/document-chip-bar.tsx`, `src/components/shared/detail-pane.tsx`
- Anti-pattern reminders: kits never own state; the inbox-split layout uses the existing `DetailPane` URL-driven pattern; synthesis citation chips don't open a new route, they highlight in place
- Historical implementation plan: Relay git commit `eac544bf`
- Historical design: Relay git commit `b59db6ed`
- Verification: 340+ unit tests + 11 KitView integration tests covering all 6 kits all green; tsc clean. Browser smoke completed 2026-05-02 — see "Verification run" below.

## Verification run — 2026-05-02

Dev server `PORT=3010 npm run dev`, captured via chrome-devtools-mcp:

- `/apps/customer-follow-up-drafter` (Inbox) — trigger chip "Triggered by row insert in customer-touchpoints", no Run Now button, 3 queue rows, empty draft pane initially. Click first row → URL becomes `?row=cft-r1`, draft pane shows "Reply to Acme Corp" with markdown body. Console clean. → `output/phase-4-inbox-empty.png`, `output/phase-4-inbox-draft.png`
- `/apps/research-digest` (Research) — cadence chip "Friday 5pm", Run Now button, KPIs Sources=3 / Last synth "just now", 3 source rows (Hacker News / ArXiv / Stratechery), synthesis markdown ("Digest for week ending Apr 30") with 3 bullets, RunHistoryTimeline showing "Completed / just now". Console clean. → `output/phase-4-research.png`
- Regression: `/apps/habit-tracker` (tracker), `/apps/weekly-portfolio-check-in` (coach), `/apps/finance-pack` (ledger) — all render, console clean. → `output/phase-4-regression-{tracker,coach,ledger}.png`. Workflow-hub kit has no seeded smoke app; integration tests at `src/lib/apps/view-kits/__tests__/integration/workflow-hub-kit-view.test.tsx` cover its DOM wiring.

### Bug fixed during smoke

Initial Inbox load threw the runtime error `Attempted to call hasSentimentColumn() from the server but hasSentimentColumn is on the client`. Root cause: `src/components/apps/throughput-strip.tsx` was marked `"use client"` despite being a pure SVG component (no state, effects, or handlers), and it exports the non-component helper `hasSentimentColumn` which `inbox.ts` (server-side kit definition) calls inside `resolve()`. Next.js replaces non-component exports of `"use client"` modules with server-side reference shims that throw on call. Fix: dropped the unnecessary `"use client"` directive — the component renders cleanly on either side. Confirmed via re-load (page renders) and unit tests (`throughput-strip.test.tsx` 6/6, `inbox.test.ts` 7/7 still pass).

This is a new instance of the wiring-bug class but at the Next.js Server/Client component boundary, not the runtime registry. Vitest + RTL integration tests structurally cannot catch it because they run everything in a single client runtime; the `"use client"` directive is never enforced. Lesson recorded in this addendum so future kit features remember to either run a real-browser smoke or factor non-component helpers out of `"use client"` modules.

**Update (Phase 5 — 2026-05-02):** the smoke manifests' broken blueprint references (`draft-followup`, `weekly-digest`) were resolved in the follow-up `row-trigger-blueprint-execution` feature, which authored the real blueprints under `~/.ainative/blueprints/` and updated the manifests to the canonical qualified-id + `source: $AINATIVE_DATA_DIR/...` pointer pattern (matching `habit-tracker--weekly-review`). See `features/row-trigger-blueprint-execution.md` for the full verification run.
