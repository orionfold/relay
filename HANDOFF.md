# Handoff: Orionfold DS — core slice + Arena-shape shell both SHIPPED (committed local-only)

**Updated:** 2026-06-28 (Orionfold Relay redesign — shell session, shell now committed).

> **Operator policy:** all commits stay **local-only** through the next release. Do NOT push or
> prompt to push (`feedback-no-push-reminders-pre-release`). Default to `main`
> (`feedback-default-main-not-worktree`).

## CONTEXT: ainative → "Orionfold Relay" rebrand + redesign

ainative is aligning to the **Orionfold design system** (the system the sibling products Orionfold
Proof + Orionfold Arena already use). Prep + DS-package review are done. See
`_IDEAS/orionfold-relay-redesign-prep.md` and memory `project-orionfold-relay-rebrand`.

## DONE (committed `cc0a2a5c`, local — NOT pushed): Orionfold DS core slice

Applied + verified end-to-end (validator + tsc + `npm run dev` + browser, both themes):
- **Tokens → Tide cyan** single accent (`--primary`/`--ring`/`--status-running`/`--chart-1..5` +
  sidebar tokens), both themes. Zero indigo. (`src/app/globals.css`)
- **Fonts → Geist + Geist Mono** (operator chose Option B = align with brand). `validate-tokens.ts`
  **inverted**: now rejects leftover Inter/JetBrains Mono instead of Geist. (`layout.tsx`,
  `globals.css`, `tokens.json`, `validate-tokens.ts`)
- **Charts single-accent** — every sparkline/donut cyan; `projects/[id]` status bar → status tokens.
- **Voice** — `section-heading` mono-uppercase. `status-chip` / `permission-response-actions` /
  `sonner` were already DS-compliant (no change).
- **Brand** — new `src/components/shared/of-mark.tsx` (theme-aware delta-star SVG); wordmark →
  "Orion**fold** Relay" (cyan `fold`); logo → delta mark.
- Round-trip logs written back to the DS package:
  `~/orionfold-design-system/apply/ainative/{aligned,roadmap}/2026-06-28-164854-log.md`.

## DONE (committed `a0b4b444`, local — NOT pushed): Arena shell w/ in-bar accordion nav

Replaced the left sidebar with the Arena stack **app bar → telemetry rail → centered canvas**.
Spec was `_SPECS/arena-shell-migration.md` (the drawer nav model in it is SUPERSEDED — see below).

**Nav model — in-bar horizontal accordion (NOT tabs+drawer):**
- The app bar (`h-16`) holds **5 group buttons**: `Home · Compose · Data · Observe · Config`.
  Clicking a group slides its children open **inline** (grid-cols 0fr→1fr), pushing siblings
  right, and slides any prior-open group closed. Max visible at once = 5 buttons + one group's
  ≤4 children. Active child = cyan fill. `useEffect` auto-opens the group owning the current
  route (deep links land expanded).
- **Compose was SPLIT** to cap children at 4: Compose(Apps/Projects/Workflows/Profiles) +
  new **Data** group (Schedules/Documents/Tables). IA is still all 16 routes. `nav-items.ts` is the
  single source. **No drawer, no hamburger** — the whole IA lives in the bar.
- **Children are single-line** (icon + title only). The per-item tip (`item.description`) is
  **dropped from the bar** — keeps each child pill narrow on small viewports — and survives as
  the native `title=` tooltip on hover. (Operator decision for narrow-viewport; see below.)

**Files (`src/components/shell/`):** `app-shell.tsx` (Server Component wrapper, mounted in
`layout.tsx`), `app-bar.tsx` (the accordion — client), `telemetry-rail.tsx` + `rail-cell.tsx`
(6 real cells, `sticky top-16`), `use-telemetry.ts` + `telemetry-types.ts`, `nav-items.ts`,
`__tests__/nav-items.test.ts`. **New API:** `src/app/api/telemetry/route.ts` (`force-dynamic`;
one `getBudgetGuardrailSnapshot()` yields BOTH costs + runtime states, + 2 Drizzle counts +
`getWorkspaceContext()`). **Modified:** `layout.tsx` (sidebar → `<AppShell>`). **Deleted:**
`app-sidebar.tsx`. `nav-drawer.tsx` was built then removed when the model changed (recoverable
from git history if ever needed).

**Telemetry rail — 6 wired cells (no fabricated data):** HOST (cwd·branch) · RUNTIME
(label·provider) · TASKS running · REVIEW pending · COST TODAY · COST TO DATE. Hook polls ~12s,
pauses on hidden tab. On poll error: keeps last snapshot + flips live-pip to red "stale".

**Deviation from reference CSS:** the Arena mock used `backdrop-filter:blur` on the bar — Calm Ops
BANS it (validator caught it). Fixed → opaque `--surface-1` bar. (Flagged back to DS producer.)

**Verified end-to-end (all green):** `validate:tokens` ✓ · `tsc --noEmit` clean · `nav-items` test
7/7 · **`npm run dev` smoke** (layout.tsx runtime-registry-adjacent, TDR-032): 0 module-load-cycle
errors, `/api/telemetry` + `/workflows` + `/` 200 · **browser**: accordion route-driven auto-open
(`/workflows` opens Compose + cyan-active "Workflows"), single-line children render, centered
canvas, rail live values. Round-trip note appended to DS `aligned/` log.

## Narrow-viewport behavior — operator decision applied (partial)

**Decision (this session):** the operator chose the lightweight fix — **drop the per-child tip
from the bar** (done, see above). This shrinks each expanded child pill so four-across fits more
viewports before horizontal-scroll kicks in. The bar's `<nav>` still uses `overflow-x-auto`, so it
degrades to horizontal scroll on very narrow screens rather than a dedicated phone mode.

**Still open if a true phone mode is wanted later** (NOT chosen this session): icon-only collapse
`< md`, or reinstating a compact `Sheet` drawer `< md` (the deleted `nav-drawer.tsx`, recoverable
from git). If built, re-verify with Chrome DevTools `resize_page` (real viewport change — window
resize does NOT change the MCP screenshot viewport; learned this session) at ~375px and ~680px,
both themes; touch-target ≥ 32px; `npm run dev` smoke still required (layout-adjacent).

## Deferred / roadmap (NOT this build)
Favicon/PWA disc+star raster set (+ `npx-process-cwd.test.ts` update) · HOST CPU/RAM telemetry ·
RUNTIME SDK version · `.of-boot` splash · proof "signature objects" (receipt card / verdict banner)
on `/monitor` + `/tasks/[id]` · per-route off-system finish polish (e.g. `cost-dashboard` rounded-3xl) ·
true phone/compact nav mode (see above). Full roadmap:
`~/orionfold-design-system/apply/ainative/roadmap/2026-06-28-164854-log.md`.

## State
- Branch `main`, dev server may be running on `:3000` (operator's). Two new local commits this
  session: `cc0a2a5c` (DS core) and `a0b4b444` (Arena shell). Neither pushed.
- Version NOT bumped per-commit — `0.15.0` accumulates toward the next batched release
  (`project-self-extending-machine-npm-deferred`).
- The sibling repo `~/orionfold-design-system` has my round-trip logs under `apply/ainative/` —
  do NOT commit/push that repo (it's the producer's; `feedback-no-sibling-repo-edits`).
- Prior content-extraction + book-migration handoff archived at
  `.archive/handoff/HANDOFF-2026-06-28-content-extraction.md` (book/User-Guide extraction is DONE;
  one open follow-up there: a real end-to-end book-content PR round-trip from `~/orionfold/books`).
