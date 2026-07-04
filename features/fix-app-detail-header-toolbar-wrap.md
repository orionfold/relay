# fix: App-detail header toolbar wraps + lone "Delete app" buried in `⋯` (reopened regression)

**Status:** proposed · **Priority:** P2 (MED) · **Milestone:** 0.26.0
**Source:** staging Mode B run 2026-07-04, bundle `output/staging/2026-07-04-operator-walkthrough/` (finding FEAT-4 = CF-FEAT-3, verified against HEAD `dd39bea7`)
**Dependencies:** none. Pure CSS/layout — NOT runtime-registry-adjacent. **Browser retest per candidate is the gate**, not unit tests.

## Description (verified mechanism, not the raw symptom)

**This is a reopened regression:** last session's FEAT-3, which the handoff claimed shipped in S29-30 — it **still reproduces on 0.25.1**.

On `/apps/relay-agency` at a 1920px viewport, the app-detail header's right-side action group breaks onto two lines (row 1 = `Running` chip + `⋯`, row 2 = `View manifest ⌄`) instead of one horizontal group.

**Verified cause** (the naive "add flex-nowrap" fix won't help):
- `src/components/apps/kit-view/slots/header.tsx:36` — the actions container is ALREADY `flex flex-wrap … sm:flex-nowrap sm:shrink-0`, so `flex-nowrap` is active at ≥640px.
- `src/components/apps/kit-view/slots/header.tsx:25` — the parent row is `sm:justify-between` with a `min-w-0 flex-1` title on the left. The title's `flex-1` doesn't yield enough inline space, so the `sm:shrink-0` action group overflows and the browser wraps it.
- `ManifestSheet`'s trigger is a plain inline `<Button>` — ruled out as the cause.

Secondary finding (part B): `src/components/apps/app-detail-actions.tsx` — the `⋯` three-dots menu contains ONLY "Delete app" (single `menuitem`, per `app-detail-actions.test.tsx:50`). A one-item overflow menu is an unnecessary hop.

**NOTE (width-dependent):** the wrap reproduced on `/apps/relay-agency` but NOT on `/apps/relay-agency-pro` at the same 1920px — it's content/width-dependent, so the fix must be verified across both apps and viewports.

## Repro

`/apps/relay-agency` at 1920px → the header action group wraps to two rows. Open the `⋯` menu → it holds only "Delete app".

## Proposed fix (candidates — each needs a browser retest)

- (a) Cap/truncate the title harder so the action group always gets its intrinsic width.
- (b) Deliberately drop the actions to their own row below the title on narrower app-detail widths (intentional, not an accidental wrap).
- (c) Collapse `⋯` + "View manifest" into a single overflow menu when space is tight.

Also elevate "Delete app" to a direct toolbar button (reuse `src/components/apps/app-card-delete-button.tsx` — already a plain button with the same confirm dialog) and drop the `⋯` trigger. Test inverts at `app-detail-actions.test.tsx:50/58`.

## Verification

Browser retest at 1920px AND narrower on BOTH `/apps/relay-agency` and `/apps/relay-agency-pro` — assert one horizontal action row, no wrap, and "Delete app" as a direct button. Unit test is insufficient (the defect is layout-only and width-dependent).

## Resolution (2026-07-04, S38)

**Part B — already shipped.** The `⋯` kebab holding only "Delete app" no longer exists; `app-detail-actions.tsx` renders a direct **Delete app** button (the eval read a stale snapshot). Asserted by `app-detail-actions.test.tsx` ("renders the Delete app button directly, not behind a kebab menu").

**Part A — source fix landed, candidate (b).** `kit-view/slots/header.tsx`: moved `flex-wrap` from the action-group child to the parent row and made the action group `flex-nowrap`, so under width pressure the whole group drops to its own row as one atomic unit (intentional stack) instead of splitting chip/manifest across lines. Title keeps a `sm:min-w-[16rem]` floor. Header unit tests pass.

**✅ SHIPPED — browser gate PASSED (2026-07-04, S39).** Ran the explicit viewport gate against a live `npm run dev` (:3000) at 1920px on BOTH `/apps/relay-agency` and `/apps/relay-agency-pro`:
- **Wide (1920px):** action group renders as one horizontal row inline right of the title — free app = 3 children (`Ready · Delete app · View manifest`), Pro = 4 children (`Ready · 6am cadence chip · Delete app · View manifest`). Zoom screenshot + DOM geometry both confirm one row.
- **Narrow (forced 380px card):** the whole action group drops below the title **as one intact row** (`groupStacksBelowTitle: true`, `visualRowCount: 1`) — the intended atomic stack, never an internal chip/manifest split.
- **Verification method:** DOM row-clustering (`getBoundingClientRect().top` within a 12px tolerance) proved `visualRowCount: 1` in all four cases — more reliable than the screenshot pipeline, whose capture viewport doesn't track OS window resizes. Part B (direct **Delete app** button, no `⋯` kebab) confirmed visually in the same run.

FEAT-4 is fully shipped. Unblocks the 0.26.0 release.
