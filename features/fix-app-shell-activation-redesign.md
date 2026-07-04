# fix: Post-purchase app-shell activation redesign — dead cards, mislabeled "Run", fake "Running" chip

**Status:** proposed · **Priority:** P1 (contains 2 HIGH) · **Milestone:** 0.26.0
**Source:** staging Mode B run 2026-07-04, bundle `output/staging/2026-07-04-operator-walkthrough/` (findings BUG-2/BUG-3/BUG-4 + FEAT-5/6/7/8 + CF-FEAT-5/6/7/8, verified against HEAD `dd39bea7`; BUG-3 & BUG-1 root causes CORRECTED by the verify gate)
**Dependencies:** BUG-3 is runtime-registry-adjacent → **CLAUDE.md smoke budget applies**. FEAT-7/8 need one primitive→pack source-of-truth decided before either can ship.

This is the operator's **highest-leverage feedback**, carried across two staging runs. It is ONE redesign of the moment a customer lands on a pack-installed app, not N patches. The two HIGH bugs (BUG-3, BUG-4) are the acute failures; the FEAT items are the redesign that makes the surface coherent.

## The two HIGH bugs (fix first — the flagship free-app first-run is broken)

### BUG-3 (HIGH) — blueprint cards render DEAD; root cause is an `unstable_cache` staleness, NOT import duplication

Verified: `/apps/relay-agency` shows 8 blueprint cards but none are clickable, none in the a11y tree, and they show the raw id (`relay-agency--lease-abstraction`) not the human name.

**Corrected root cause** (the raw finding blamed static-vs-dynamic import module duplication — a red herring; in one Next Node process both resolve to the same registry singleton):
- `src/lib/apps/view-kits/data.ts:882-896` — `loadRuntimeState` wraps `loadRuntimeStateUncached` in `unstable_cache({ revalidate: 30, tags: ['app-runtime:<id>'] })`. The app-detail page reads a Next.js **Data Cache snapshot** of `blueprintCards`.
- `data.ts:641` `loadBlueprintCards` enriches via `getBlueprint(id)` (dynamic import of the registry, `:645-651`); on a miss it falls back to `name: def?.name ?? stub.id` (`:669`) → husk card with raw id, no button.
- Contrast `src/app/api/blueprints/route.ts:2-5` — static `listBlueprints()`, **live/uncached**, always sees all 23 enriched. That's the asymmetry: the API enriches, the cached app-detail snapshot can be frozen with a miss.
- `src/lib/packs/install.ts:357-361` calls `reloadBlueprints()` to invalidate the *registry* cache but **never** `revalidateTag('app-runtime:<id>')` for the *Data Cache*.
- The `catch { getBlueprint = null }` (`data.ts:645-651`) also swallows real import failures silently (principle #1).

**Fix:** (1) `revalidateTag('app-runtime:<id>')` on pack install/reload so the Data Cache can't serve a pre-population snapshot. (2) Surface an enrichment failure as an explicit error/empty state, never a husk card (principle #1/#3). (3) Add a fresh-install smoke asserting a blueprint card renders its Run button. **Live-repro first** to confirm cache-staleness (self-heals in 30s / on `revalidateTag`) vs a genuine first-render-before-populated race.

### BUG-4 (HIGH) — "Run now" drafts-but-doesn't-execute; the success toast lies "Run started"

Verified end-to-end: `run-now-button.tsx:37` label `"Run now"`, `:59` POSTs `/api/blueprints/<id>/instantiate` → `route.ts:20` → `instantiator.ts:105-113` `db.insert(workflows).values({status:"draft"})` with **no dispatch**, returns `{workflowId,…}`. Handler `:69` `toast.success("Run started")` — no redirect, no draft link, no "Execute still required" nudge (ignores the returned `workflowId`). `RunNowSheet` (variable path) has the identical defect (`run-now-sheet.tsx:59,77`). The real Execute verb (`/api/workflows/[id]/execute` → `executeWorkflow`) is reached only from `/workflows`, which "Run now" never routes to — and the codebase's own "click Execute" nudge (`workflow-header.tsx:25-26,48`) only shows there.

**Fix:** EITHER make "Run" instantiate→dispatch (matching the label) OR relabel to "Create workflow" + toast "Draft created → open in Workflows to Execute" with a deep link to `workflowId`. Reconcile with FEAT-6 (two explicit buttons below). Dispatch-wired variant is runtime-registry-adjacent → smoke budget.

### BUG-2 (MED) — hardcoded "Running" chip pulses on an idle app

Verified: all 7 view-kit builders hardcode `status:"running"` (`workflow-hub.ts:123`, `ledger.ts:137`, `inbox.ts:116`, `tracker.ts:106`, `coach.ts:85`, `research.ts:109`, `placeholder.ts:44`); `status-families.ts:58-63` maps `running`→`live:true`→green `animate-ping` (`status-chip.tsx:62-71`). So an idle app pulses "Running" while cards read "never run · 0 runs". Also the wrong vocabulary level — a live workflow is `active` at the top level (`workflow-header.tsx:51-53`; memory `workflow-status-vocab-active-not-running`). Reproduces on both `/apps/relay-agency` and `/apps/relay-agency-pro`.

**Fix:** make the header status data-driven — `Ready`/`idle` (installed & healthy, non-pulsing) vs `active` (an in-flight run). Reuse FEAT-8's `computeSignpost` run-state model.

## The redesign (FEAT items — one coherent activation surface)

Verified feasible at `file:line` in FINDINGS-live.md; grooming decides design.

- **FEAT-5** — Blueprints as a top-level Compose submenu (sibling of Workflows, `nav-items.ts:74-79`), additive; keep the "From Blueprint" entry. Watch active-state disambiguation (`/workflows/blueprints` is a sub-path Workflows' `alsoMatches` claims).
- **FEAT-6** — each blueprint card shows TWO buttons: **Run** (create+execute, resolves BUG-4) + **Create Workflow** (draft to review). Makes the two verbs explicit instead of one mislabeled button.
- **FEAT-7** — "filter by installed pack" on all 4 primitive-listing views (Profiles/Blueprints/Tables/Schedules). **Blocked on a decision:** primitives carry no `packId` today — only the `relay-agency--` id-prefix convention. One source-of-truth (a real field or a documented prefix reliance) must be decided ONCE for all 4 views.
- **FEAT-8** — pack-provenance pill on every primitive card/row (distinct color family in the existing `StatusChip` system). Same primitive→pack association as FEAT-7 — filter and pill are two faces of one feature; groom together.
- **CF-FEAT-5/6/7/8** (carried from 2026-07-03, still reproduce): per-button explainer text; a 1-2-3 numbered visual step flow with progress; elevate all 6 blueprints into the shell (not just the Run-now hero); verb clarity (blueprint/workflow/Run/Execute); post-Execute signposting to Monitor/Inbox.

## Repro

Fresh `npx` → install free Relay Agency pack → `/apps/relay-agency`: cards are dead (BUG-3), the one working button drafts-without-running (BUG-4), header pulses "Running" while everything reads 0 runs (BUG-2), and there is no guided path from "installed" to "something ran".

## Verification

Fresh-install browser smoke (per CLAUDE.md smoke budget, since BUG-3 is registry-adjacent): assert a blueprint card renders its Run button, clicking Run actually executes (or clearly routes to Execute), the header chip does not pulse on an idle app, and the post-Execute signpost appears. Unit-cover the data-driven status + the two-button card. This must run under a real `npm run dev` / npx launch, not just unit tests that mock the chat-tools modules.

## Resolution (2026-07-04, S38) — live-repro changed 2 of the 3 acute findings

Staging harness, `orionfold-relay@0.25.1` prebuilt artifact, isolated data dir, `relay-agency` free pack installed. Full evidence: `output/staging/2026-07-04-operator-walkthrough/REPRO-BUG3-BUG4.md`.

**BUG-4 (HIGH) — CONFIRMED + FIXED (relabel path, operator-chosen).** Live: `POST .../instantiate` → workflow `status=draft`, `run_number=0`, **0 tasks dispatched**, yet the button toasted "Run started". Fix = honest copy + deep link, NO engine touch (so NOT smoke-budget-gated):
- new shared `src/components/apps/run-now-toast.ts` `toastDraftCreated(workflowId)` → `toast.success("Draft created. Open it in Workflows to Execute.", { action: "Open workflow" → /workflows/<id> })`.
- both `run-now-button.tsx` (direct POST) and `run-now-sheet.tsx` (variable path) call it; error copy no longer says "start"/"Run failed" (→ "create draft"/"Could not create draft").
- unit-covered: `run-now-toast.test.ts` (honest copy, deep-link, no-id fallback).
- The two-button Run/Create redesign (FEAT-6) is deferred to the redesign; this is the acute-honesty fix.

**BUG-3 (HIGH) — NOT REPRODUCED (verify gate). Reclassify HIGH→not-reproduced.** `/apps/relay-agency` renders all 8 cards fully enriched (human names, 8 working Run buttons, "Start here", `never run · 0 runs`), immediately after install AND under a 40-poll install race — the raw-id husk NEVER appeared as a card title, zero registry load warnings. The `unstable_cache` mechanism can't fire because the registry singleton (`ensureLoaded()`) is populated in-process before first render, and the snapshot is only written after enrichment. Same stale-build false-positive class as BUG-1/CF-FEAT-1/4.
- Kept ONLY the cheap defensive fix: `install.ts` now `revalidateTag('app-runtime:<id>', {expire:0})` after `reloadBlueprints()` (Next 16 arity), wrapped in try/catch (no-op + non-fatal on the CLI install path). Closes the latent staleness race.
- DROPPED the "surface husk as error" work — there is no husk to surface at this code state.
- **Runtime-registry-adjacent** (`install.ts`): re-verified with a real artifact rebuild + staging launch (smoke budget), not just units.

**BUG-2 (MED)** confirmed pulsing on the unfixed artifact; fixed this session (data-driven `headerStatus`), re-verified after rebuild.

## Grooming decision (2026-07-04, S40) — the primitive→pack source-of-truth (unblocks FEAT-7/8 + BUG-6)

FEAT-7 (filter-by-pack) and FEAT-8 (pack-provenance pill) are two faces of ONE need: given an
installed primitive, name the pack that installed it. That association was the cluster's blocker.
Verified current state (code-true, S40) settles the design.

**Current state — the association already exists, just non-uniformly:**
- `pack.meta.id` (`format.ts:32`) IS the pack id. The `relay-agency--` prefix is authored INTO the
  manifest by the pack author, so `prefix === manifest.id === pack.meta.id`; install copies it verbatim.
- **Tables** — DB, UUID id, `projectId = pack.meta.id` (`install.ts:230`). Association = `projectId`.
- **Schedules** — DB, id `app:<packId>:<sid>` (`install.ts:279`) + `projectId = pack.meta.id` (`:306`).
- **Blueprints / Profiles** — file-dropped, id/dir carries the `<packId>--<name>` prefix only.
- Authoritative per-pack artifact ledger already on disk: `install-state.json`
  (`install-state.ts`), trusted by `update.ts`. Uninstall (`deleteAppCascade`, `registry.ts:545`)
  enumerates profiles/blueprints/schedules **by the prefix** — so the prefix is load-bearing.
- Existing seam: `extractAppIdFromArtifactId(id)` (`composition-detector.ts:20`) splits on the first
  `--`; `appIdFromResult` already does "explicit appId field OR slug parse".

**DECISION — Model A: a pure `packOf()` resolver over the existing signals. NO new schema field,
NO migration.** Rejected Model B (write a first-class `packId` onto every installed record) because
the prefix already encodes the answer AND is load-bearing for uninstall — Model B would force a
rewrite of `deleteAppCascade`'s sweeps plus a backfill migration for already-installed packs, for
zero functional gain. Model A is the lowest-blast-radius path (Principles #5/#7) and extends a
tested seam rather than inventing one.

**`packOf(kind, primitive) → packId | null`** (new leaf, `src/lib/apps/pack-of.ts`):
- DB kinds (tables, schedules): return `projectId` when it is a member of the installed-pack set.
- File kinds (blueprints, profiles): `extractAppIdFromArtifactId(id)`, then confirm the parsed
  prefix is a member of the installed-pack set (`listApps().map(a => a.id)`) so a hand-authored
  `foo--bar` is NOT mis-attributed to a pack that was never installed. Return `null` otherwise.
- The installed-pack set is read once per request (server component) and passed in — the resolver
  itself is pure (no I/O), so it is trivially unit-testable and reusable client-side with a prefetched set.

**Consumers (all read `packOf`, none branch on raw id shape):**
- FEAT-7 — a "filter by pack" control on Profiles / Blueprints / Tables / Schedules listing views.
  Tables & Schedules pages already load the `projects` list (`tables/page.tsx`, `schedules/page.tsx`),
  so their filter is a thin addition; Profiles/Blueprints gain the parsed-prefix grouping.
- FEAT-8 — a pack-provenance pill (distinct `StatusChip` color family) on every primitive card/row,
  rendered from `packOf`. The pack's display `name` comes from its manifest (`listAppsWithManifestsCached`).
- BUG-6 (#35) — pack-aware seed reads `packOf` to scope the seed/clear gate to a pack's own primitives
  instead of the current global `relay-agency--` id-prefix assumption.

**Vertical slice (this decision → implementation, sequenced):**
1. `src/lib/apps/pack-of.ts` — the pure resolver + `PackRef` type; unit tests (each kind, the
   not-installed-prefix negative case, the composed-app `projectId` case).
2. FEAT-8 pill on ONE view (Profiles) end-to-end as the proof slice — resolver → server component
   passes the installed-pack set → `StatusChip` pack family. Verify in a real browser.
3. Roll the pill to the other 3 views; add the FEAT-7 filter control (reuse the existing project
   filter on the 2 DB views).
4. BUG-6 — rewire the seed/clear gate onto `packOf`.

**Out of scope for this decision:** FEAT-6 two-button Run/Create (separate redesign concern, not
gated on the association), CF-FEAT items (copy/step-flow), the top-chrome initiative. Not a schema
change; no `next` pin or apiVersion-window impact (no pack-format change).

**Verification:** `packOf` is not runtime-registry-adjacent (pure, no chat-tools import) → unit tests
suffice for the resolver. The listing-view + pill wiring needs a real `npm run dev` browser check
that a pack-installed primitive shows the pill and the filter narrows to it, per the smoke budget
(the seed-gate BUG-6 rewire touches `install`-adjacent code → smoke it).

## Resolution (2026-07-04, S40) — FEAT-7/8 SHIPPED (steps 1-3); BUG-6 (step 4) still open

Model A landed as 4 bisectable commits (`d66836d1`→`3fa28b41`), each browser-verified against the
operator's real `~/.relay` (3 installed packs: relay-agency, relay-agency-pro, contractor-invoices).

- **Step 1 — resolver (`d66836d1`).** `src/lib/apps/pack-of.ts` — pure `packOf(primitive, installedSet)`
  composing `extractAppIdFromArtifactId` (profiles/blueprints `--`), `parseAppScheduleId` (schedules
  `app:<id>:`), and `projectId` (tables/schedules), gated on the installed-pack set. 13 unit tests pin the
  gating invariant (a hand-authored `foo--bar` is NOT mis-attributed). NO schema change, NO migration.
- **Step 2 — FEAT-8 pill on Profiles (`187b5c06`).** New `src/components/shared/pack-pill.tsx` (amber
  provenance Badge, deliberately NOT a StatusChip family). Resolved client-side from profile id + a stable
  server-passed installed-pack list, so it survives `refreshProfiles()`. Outranks the Custom/origin chain.
- **Step 3a — Blueprints (`f9aeea57`).** Gallery fetches `/api/apps` alongside `/api/blueprints`; renders
  the pill + a new **FEAT-7 filter-by-pack** dropdown (shown only when a pack is installed). Verified:
  filtering to "Relay Agency" narrows to its 6 blueprints, each pilled.
- **Step 3b — Tables + Schedules (`3fa28b41`).** Tables: pill in the Project column via `packOf` on
  `projectId` (FEAT-7 filter already satisfied by the existing `projectFilter`). Schedules: pill resolved
  from the `app:<packId>:` composite id — correctly distinguishes a pack-installed schedule from one that
  merely references a pack's profile (no false-positive on Acme/finance-pack schedules).

**BUG-6 (#35) still OPEN — reclassified, NOT unblocked by the resolver.** On implementation it became clear
BUG-6 is a *write* feature (generate ledger transactions / row-insert-table rows into an installed pack's
tables), not a *read/classify* one — `packOf` doesn't directly unblock it. What it needs: (1) `listApps()`
to enumerate installed packs, (2) `listTables({projectId: packId})` per pack (both exist), (3) generate
plausible domain rows the pack's cockpit reads — the real work, best done with the running Pro ledger open
to see which columns `/apps/relay-agency-pro` reads. Still `install`-adjacent → smoke budget applies. Next
session's clean task.

**Deviation from the spec letter, with rationale:** the spec said "distinct color family in the StatusChip
system"; the code showed StatusChip is a *fixed-status-key* renderer, wrong for open-set pack identity. Built
a purpose-named `PackPill` on the shared `Badge` primitive instead — one concept, one name, reusing the
established provenance-badge pattern already on the profile card.
