# Relay `_ASSETS` Demo — Option C Vertical Slice (Design)

_Date: 2026-07-09 · Status: approved, ready for implementation plan · Scope: T2 Demo, first vertical slice_

## Problem

The current `_ASSETS/demo/` build is a from-scratch mock: `source/public/relay-demo/app.js`
hand-authors a fake Relay shell (its own `.rail`/`.nav`/`.card` markup + CSS) with zero
relationship to the real product's components, tokens, or information architecture. Its fatal
flaw is not fake *data* — it is fake *structure*: the moment the real product's IA changes
(exactly the drift that just bit the docs pass — a "sidebar" claim vs. the real two-tier top
app-bar), the demo silently lies. A behavioral verifier (`verify-relay-demo.mjs`) is already
proven RED against this mock.

**Goal:** rebuild the demo as **Option C** — a *seeded-prerender + network-shim hybrid* that
captures the **real** Relay UI (SSR HTML + `_next` chunks against seeded data) so structure
cannot drift, and attaches an Arena-style `boot.js` that shims only the *network layer* so the
captured UI stays interactive offline. This spec covers the **first vertical slice**: prove ONE
lane end-to-end (SMB Ops Lead + Workflow Run) so the pipeline and the behavioral gate are
validated before fanning out to the rest of the corpus.

## Decisions (operator-approved this session)

- **Slice path:** Support Triage workflow Run — the full state machine including the
  waiting-for-human → Inbox → approve → Monitor + Cost ledger effects (the marquee moment).
  Uses the richest seed data (`demo_workflow_support_triage` active + `demo_task_support_waiting`
  already seeded).
- **Capture mechanism:** Playwright crawl of the live `npm run dev` server booted against the
  seeded, isolated data dir. Highest fidelity (post-hydration DOM), reuses `scripts/staging.mjs`
  + `_ASSETS/seed/`. This is the honest "real UI" path LIVE #7 mandates.
- **Guidance layer:** Full — DEMO ribbon + self-guiding coach + `live`-gated sticky buy strip.
- **Throwaway authorized:** standing operator grant to discard + rebuild any part of `_ASSETS`
  to meet the quality bar (pinned atop `_ASSETS/README.md`).

## Verified codebase facts (source-cited, this session)

- Target pages are **async Server Components** that read the DB directly then delegate rendering
  to Client Components that self-fetch:
  - `src/app/workflows/page.tsx:9-13` (force-dynamic) → `WorkflowList`
    (`src/components/workflows/workflow-list.tsx:1` `"use client"`) fetches `/api/workflows` on
    mount (`:72-80`); mutates via `/api/workflows/[id]/{execute,stop}` (`:95,:106`), DELETE (`:84`).
  - `src/app/tasks/page.tsx:12-40` (force-dynamic) → `TaskSurface`/`KanbanBoard`; `/api/tasks`
    refresh is post-mutation only (`kanban-board.tsx:232`).
- **SSE surface = 2 distinct URLs across 4 LIVE consumers** (a 5th, `StepLiveMetrics`, is dead
  code — nothing imports it):
  - `/api/notifications/pending-approvals/stream` — `pending-approval-host.tsx:334` (global,
    root layout `:141`), `unread-badge.tsx:35` (global, app-bar `:68`), `inbox-list.tsx:65` (/inbox).
  - `/api/logs/stream?…` — `monitoring/log-stream.tsx:42` (/monitor).
- **Global always-mounted clients fire network on EVERY page** and MUST be neutralized first:
  `PendingApprovalHost` (SSE + `POST /api/notifications/pending-approvals` poll) and `UnreadBadge`
  (SSE + `GET /api/notifications?countOnly=true&unread=true`).
- **Root layout hydration:** `src/app/layout.tsx:96` `await cookies()` reads `relay-theme`. Served
  statically it falls back to `DEFAULT_THEME`; `suppressHydrationWarning` is already set on `<html>`
  (`:112`). Non-blocking — capture in the desired theme.
- **Real nav IA** (`nav-items.ts:98-104`): tier-1 Home/Packs/Compose/Data/Observe. Tasks lives
  under Home tier-2 (`/tasks`), Workflows under Compose tier-2 (`/workflows`). Settings = app-bar gear.
- ~300 `fetch("/api/…")` call sites; dominant families settings(55)/workflows(25)/tables(25)/
  tasks(24)/agents(21). The slice's two families are both top-tier.
- **Seed universe** (`_ASSETS/seed/data/fixture.json`) already covers every state machine:
  `demo_workflow_support_triage` (sequence, active, run#19) + `demo_table_support_queue` (3 rows) +
  `demo_task_support_waiting` ("Approve refund-policy reply for order #BL-1048").

## Architecture

### Throwaway
Discard the mock: `source/public/relay-demo/{app.js,app.css,favicon.svg}`, the `html()` template
in `build-relay-demo.mjs`, and the string-literal `dist/relay/demo/**/index.html`. Keep the
*concept* of `extract-fixtures.mjs` (rewrite to DERIVE) and the behavioral verifier.

### Pipeline (4 scripts under `_ASSETS/demo/scripts/`)
```
seed data dir ──(scripts/staging.mjs reuse)──► npm run dev (seeded, isolated port)
      │
      ▼
capture-relay-demo.mjs  ── Playwright crawl of 5 routes ──► source/captured/<route>/index.html + _next/**
      │
derive-fixtures.mjs     ── read seed fixture.json ──► source/public/relay-demo/fixtures.json
      │
build-relay-demo.mjs    ── stitch captured HTML + inject boot.js ──► dist/relay/demo/**
      │
verify-relay-demo.mjs   ── Playwright behavioral: prove the state machine ──► reports/behavioral.json (gate)
```

**Slice routes:** `/` (Home), `/workflows`, `/tasks`, `/monitor`, `/inbox`.

`capture-relay-demo.mjs` must run under `node --preserve-symlinks` (Playwright is a Relay-local
dep reached through the `_ASSETS` symlink; see [[assets-symlink-preserve-symlinks]]).

## The `boot.js` shim contract

Render-blocking classic script ported from Arena
(`~/ainative-business.github.io/arena-app/public/arena-demo/boot.js`, 451 lines) injected into
every captured `<head>` before the `_next` chunks. Sets `window.__RELAY_DEMO__ = true`, loads
`fixtures.json`, shims `fetch` + `EventSource`.

### A. Global noise-neutralizers (every page — required from step one)
| Path | Method | Response |
|---|---|---|
| `/api/notifications?countOnly…` | GET | `{ count: N }` from fixture (unread-badge) |
| `/api/notifications/pending-approvals` | POST | `{ pending: [...] }` from mutable state (host poll) |
| `/api/settings/*`, `/api/instance/*` | GET | canned stubs (theme, license=`active`) |

### B. Slice data GETs (read-only, derived off seed)
- `/api/workflows` → 8 seed workflows (Support Row Triage `active` among them)
- `/api/tasks` → seed tasks incl. `demo_task_support_waiting`

### C. Workflow Run state machine (mutable state + subscriber re-emit — Arena's core pattern)
```
POST /api/workflows/demo_workflow_support_triage/execute
  → workflow.status queued→running (re-emit)
  → +2s: spawn child task, status→waiting_for_human
  → push Inbox approval item  → pending-approvals/stream re-emits
  → push Monitor event rows   → logs/stream re-emits
POST /api/notifications/pending-approvals/{id}/approve   (Approve click)
  → workflow.status running→completed (re-emit)
  → push Cost & Usage ledger row
POST /api/workflows/{id}/stop → status→stopped
```
Maps onto tech-spec Workflow Run machine (`technical-spec.md:182`) and its 5 required UI effects
(`:190-196`).

### D. EventSource shim (`DemoES`, 2 URLs / 4 live consumers, 3 share url #1)
- `/api/notifications/pending-approvals/stream` — snapshot on attach + re-emit on every
  approval-state mutation (drives inbox list, unread badge, approval-host popup).
- `/api/logs/stream?…` — replay Monitor event rows on recorded cadence.
- Emit initial snapshot after subscribers attach; close cleanly on nav/hide; no timers after
  `close()` (tech-spec:172-178).

### E. Catch-alls
Unmatched `/api/*` GET → `{}`, POST → `{ ok:true, demo:true }` (benign; islands stay on empty
states). Everything else (static assets, `_next` chunks, `fixtures.json`) → real network.

### Leak guard
Derive step + verifier scan fixtures/HTML/JS for tech-spec forbidden strings (`/Users/`,
`/home/`, `.env`, real tokens, `localhost:`, private peer names) and **fail closed**
(tech-spec:318-331).

## Guidance layer (ported thin from Arena, injected on `onReady`)

- **DEMO ribbon** — fixed bottom bar, `role="note"`, contrast-checked, keyboard-reachable; honest
  disclosure + `npx orionfold-relay` install line.
- **Coach** — pulsing ring (`@keyframes`; reduced-motion → static outline) on the next action for
  the ONE slice lane: `Run` on `/workflows` → `Approve` in `/inbox`; clears on interaction,
  advances. Ported from Arena `coachFind`/`demoCoach`.
- **Buy strip** — sticky, `live`-gated per the publish contract: reads `fixtures.buy.live`; when
  `false` (default) shows an inert "buy opens at launch" state, never hardcodes a live purchase
  URL. Relay builds it into the bundle; the website flips `live` at publish
  ([[assets-website-publish-contract]]).

## Verification gate (acceptance criterion)

`verify-relay-demo.mjs` — Playwright, headless, asserts + throws, exits non-zero on any failure
(the HEADLESS run is the gate; a GIF only *shows* — see [[vhs-capture-headless-is-the-gate]]):
1. Serve `dist/` statically (`http.server`); no live backend reachable.
2. Load `/relay/demo/workflows/` → assert **real Relay DOM** (shadcn card classes + real seed
   workflow names), NOT mock markup.
3. Click Run on Support Row Triage → assert status `running` → `waiting`.
4. Navigate `/inbox` → assert approval item appeared.
5. Approve → assert workflow `completed`.
6. `/monitor` → assert event rows; `/costs` → assert ledger row.
7. Leak scan; no unhandled `/api/*`; every referenced asset resolves.
8. Wire into `flow/scripts/supervise-assets.mjs` behavioral gate with `requires:["demoDist"]`
   (scaffolded in T1). Ensure every wired arg matches the script's `parseArgs`
   ([[assets-verifier-args-must-match-parseargs]]).

**Acceptance:** `supervise-assets.mjs --run-validators` folds the demo behavioral pass from
AMBER (skipped) → GREEN.

## Out of scope (fenced)

- The other 3 state machines (Row Trigger, Web Publish, License/Pack update).
- The remaining ~30 routes beyond the 5 slice routes.
- Deploy-to-website (`deploy-relay-demo.mjs` stays a stub this pass).
- Responsive capture beyond desktop 1440×1000.

These are the fan-out phase, after the slice proves the pipeline + gate.

## End-to-end check

`capture → derive → build → verify` runs clean as a command sequence; the behavioral gate goes
green; `supervise-assets.mjs --run-validators` reports demo = verified (no longer skipped).

## References

- Arena pattern: `~/ainative-business.github.io/arena-app/public/arena-demo/boot.js`
- Tech spec: `_ASSETS/demo/technical-spec.md` (state machines `:182-237`, shim `:132-178`,
  leak rules `:318-331`, a11y `:333-341`).
- Seed: `_ASSETS/seed/data/fixture.json`; seed scripts `_ASSETS/seed/scripts/`.
- Publish contract: `docs/superpowers/specs/2026-07-09-relay-assets-website-publish-contract-design.md`.
- Memory: [[assets-golden-source-workstream]], [[assets-throwaway-and-rebuild-authorized]],
  [[assets-website-publish-contract]], [[assets-symlink-preserve-symlinks]],
  [[assets-verifier-args-must-match-parseargs]], [[vhs-capture-headless-is-the-gate]].
