# Handoff: Orionfold DS — core + Arena shell + cockpit + icons + boot splash + DS polish + a11y contrast SHIPPED (local-only)

**Updated:** 2026-06-29 (Orionfold Relay redesign — boot-splash + cost-dashboard polish + dark-theme
contrast session). Seven local commits now: `cc0a2a5c` (DS core) · `a0b4b444` (Arena shell) ·
`7832143f` (rail→cockpit + dashboard dedup) · `e74f3a20` (brand icon set + metadata) · `ef9719b3`
(.of-boot splash) · `4d72a8b7` (cost-dashboard DS polish) · `78688d38` (dark-theme WCAG AA contrast).
None pushed.

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

**Telemetry rail — originally 6 cells; reshaped to 10 in `7832143f` (see below).** Hook polls ~12s,
pauses on hidden tab. On poll error: keeps last snapshot + flips live-pip to red "stale".

**Deviation from reference CSS:** the Arena mock used `backdrop-filter:blur` on the bar — Calm Ops
BANS it (validator caught it). Fixed → opaque `--surface-1` bar. (Flagged back to DS producer.)

**Verified end-to-end (all green):** `validate:tokens` ✓ · `tsc --noEmit` clean · `nav-items` test
7/7 · **`npm run dev` smoke** (layout.tsx runtime-registry-adjacent, TDR-032): 0 module-load-cycle
errors, `/api/telemetry` + `/workflows` + `/` 200 · **browser**: accordion route-driven auto-open
(`/workflows` opens Compose + cyan-active "Workflows"), single-line children render, centered
canvas, rail live values. Round-trip note appended to DS `aligned/` log.

## Narrow-viewport / phone mode — DECIDED: not building (2026-06-28)

The lightweight fix (drop per-child tip → narrower pills) shipped in `a0b4b444`. **Operator then
decided NOT to build a true phone mode:** Relay's floor is **desktop/tablet (≥768px)**; below that the
bar's `overflow-x-auto` scroll is an accepted, intentional degradation, not a defect. Icon-only
collapse and the `Sheet`-drawer reinstatement are both **declined** (icon-only was judged a
half-measure — an expanded group's children still scroll; the drawer is the only real fix but the
viewport isn't a target). The deleted `nav-drawer.tsx` stays recoverable from git if this ever
reverses, but it is off the roadmap.

## DONE (committed `7832143f`, local — NOT pushed): telemetry rail → orchestration cockpit + dashboard dedup

Reshaped the rail from inert-identity + static counts into a fleet-health cockpit, then made it the
**single canonical metric surface** by deleting the dashboard's duplicate `StatsCards` strip (operator
caught the redundancy — rail and cards showed the same numbers from the same queries, stacked).

- **Rail now 10 cells:** HOST (folder · live cpu/mem via `os.loadavg`/`freemem`) · RUNTIME (label ·
  installed SDK version) · TASKS (running + 24h activity spark) · THROUGHPUT (done today + 7d spark) ·
  FAILURES (failed, **red** + 7d spark) · REVIEW (pending) · PROJECTS (active) · WORKFLOWS (active) ·
  COST TODAY · COST TO DATE. Sparklines reuse `Sparkline` + `chart-data` queries.
- **SDK version** resolved via `createRequire` walk (package `exports` hides `./package.json`); shows
  *installed* (`0.2.114`) not declared (`^0.2.71`) — drift is the point. Null → no sub-line.
- **`RailCell` API:** `strong` → `tone: "accent"|"danger"` (FAILURES reads red, not live-cyan); new
  inline `spark` slot. New `getFailuresByDay()` in `chart-data.ts`.
- **Dashboard (`page.tsx`):** removed `StatsCards` + dead `stats-cards.tsx`; pruned 5 now-orphaned
  chart-data queries/vars + unused drizzle imports. Dashboard is now a workspace, not a number recap.
- **Left in place:** 4 uncalled `chart-data` query *functions* (have tests, harmless exports) — not
  deleted per minimal-diff. Remove + their tests if cleanliness is wanted later.
- Verified: tsc · `validate:tokens` · shell/queries/dashboard tests 11/11 · **dev smoke (TDR-032,
  route is runtime-registry-adjacent)** — `/api/telemetry` 200 real data, no module-load cycle ·
  browser both themes.

## DONE (committed `e74f3a20`, local — NOT pushed): brand icon set + fixed stale app metadata

Replaced pre-brand raster logos with a full modern icon set + fixed metadata still reading "AI Native
Business". **Operator chose:** disc-fills-the-frame canvas + full modern set.

- **`scripts/generate-brand-icons.ts`** (sharp) rasterizes the OfMark → `public/`: `favicon.ico`
  (16/32/48 multi-res) + icon-16/32/48/192/512 + apple-icon-180 + icon-512-maskable. Disc fill =
  baked `#009b97` (= `--primary` light, oklch(0.62 0.11 192); rasters have no CSS). **Regenerate via
  the script** when mark or cyan changes. Deleted orphaned `ainative-s-64/128.png`.
- **`layout.tsx`:** title → "Orionfold Relay", description → "Multi-agent orchestration for AI-native
  work", explicit npx-safe icons block. **`manifest.ts`:** name/short → Orionfold Relay/Relay,
  `theme_color` → `#009b97`, `background_color` → `#040a11` (both were pre-rebrand indigo/slate
  leftovers). Updated `package.json` hoist list + `npx-process-cwd.test.ts` icon names.
- Verified: tsc · `validate:tokens` · npx test 4/4 · dev smoke (home + manifest + favicon + icons all
  200, TDR-032) · browser (title + manifest + head links + rendered mark correct).

## DONE (committed `ef9719b3`, local — NOT pushed): .of-boot brand boot splash

CSS-only, FOUC-safe brand boot screen (roadmap light item). Operator chose **every-load CSS fade**
(not first-visit JS-gated, not Suspense-gated).

- **`src/app/globals.css`** — `.of-boot` opaque full-screen veil (`z-100`, `var(--background)`) +
  `of-boot-out` (700ms fade) / `of-boot-mark` (scale-in) keyframes. Sits above app content, below
  modal/toast layers.
- **`src/app/layout.tsx`** — splash markup as first `<body>` child: `OfMark size={72}` + inlined
  "Orion·**fold**·Relay" lockup (inlined, not `AinativeWordmark`, because the splash needs a larger
  mark than that component's fixed 28px). `aria-hidden`.
- **Edge case handled:** the global `prefers-reduced-motion` reset zeroes `animation-duration`,
  which would FREEZE the veil at `opacity:1` and lock the app. Explicit `.of-boot { display:none }`
  under reduced-motion skips it for those users — don't remove that override.
- Verified: validate:tokens · tsc · dev smoke (`/` 200, TDR-032 layout.tsx adjacent) · live browser
  (composition + clean natural dismiss, both themes).

## DONE (committed `4d72a8b7`, local — NOT pushed): cost-dashboard DS radius/opacity polish

Roadmap light item. `src/components/costs/cost-dashboard.tsx` only:
- `rounded-3xl`→`rounded-xl` ×6 · `rounded-2xl`→`rounded-lg` ×16 · `bg-background/40`→opaque
  `bg-background` ×5.
- **Left intentionally:** `bg-status-*/{8,10}` semantic alert tints (accepted DS pattern, not glass).
- **Also left (minimal-diff):** pre-existing dead `Coins` import + `formatTokenCount` fn — unrelated
  to this polish; same call as the prior session's 4 uncalled chart-data fns. Remove later if wanted.
- Verified: validate:tokens · tsc · live browser.

## DONE (committed `78688d38`, local — NOT pushed): dark-theme WCAG AA contrast fix

Operator caught low-contrast gray nav + telemetry text on the near-black dark surface (live walkthrough).
Root cause: muted text **double-diluted** — `text-muted-foreground` PLUS `/70 /60 /50` opacity
suffixes — and the un-diluted token (L0.58 ≈ 3.6:1) was itself borderline.

- **`globals.css`** — dark `--muted-foreground` L0.58 → **L0.66** (≈5.3:1, clears AA 4.5:1). **Scoped
  to `.dark` only**; light theme (L0.45) untouched. Lifts the floor for ALL dark muted text while
  staying subordinate to `--foreground` (L0.92) — hierarchy preserved.
- **`app-bar.tsx`** — nav group/child icons `/70`→full token; group chevron `/50`→`/70`.
- **`rail-cell.tsx`** — label `/70` + sub-line value `/60`→full token.
- **Kept diluted:** loading `—` placeholder (`/50`, transient) + group chevron (`/70`, affordance).
- Verified: validate:tokens · tsc · live browser (rail/nav brightened, light theme un-regressed).

## Deferred / roadmap (NOT yet built) — 2 left
proof "signature objects" (receipt card / verdict banner) on `/monitor` + `/tasks/[id]` — **the heavy
from-scratch design build, no existing receipt/verdict primitives** · per-route off-system finish
polish for any OTHER routes (cost-dashboard now done; sweep remaining pages for stray
`rounded-2xl/3xl` + `bg-*/NN`). The two light items (`.of-boot` splash + cost-dashboard polish) shipped
this session, plus an unplanned dark-theme contrast fix. Earlier roadmap items (HOST CPU/RAM, RUNTIME
SDK version, favicon, phone-mode) already resolved. Full roadmap:
`~/orionfold-design-system/apply/ainative/roadmap/2026-06-28-164854-log.md`.

**Suggested next:** proof signature objects as its own properly-spec'd feature (the only heavy item
left). Optionally a quick `rg 'rounded-[23]xl|bg-\w+/[0-9]'` sweep of remaining routes first.

## State
- Branch `main`, dev server may be running on `:3000` (operator's). **Seven** local redesign commits,
  none pushed: `cc0a2a5c` (DS core) · `a0b4b444` (Arena shell) · `7832143f` (rail→cockpit + dedup) ·
  `e74f3a20` (brand icons + metadata) · `ef9719b3` (.of-boot splash) · `4d72a8b7` (cost-dashboard
  polish) · `78688d38` (dark-theme WCAG AA contrast).
- Version NOT bumped per-commit — `0.15.0` accumulates toward the next batched release
  (`project-self-extending-machine-npm-deferred`).
- **Operator prefers side-by-side walkthroughs in Claude in Chrome** (drives the live Chrome session,
  not headless/DevTools) — memory `feedback-prefer-claude-in-chrome-walkthroughs`. NB: the live tab
  doesn't auto-raise to front; tell the operator to switch to the Browser-1 window, and DON'T auto-
  close the tab mid-session.
- The sibling repo `~/orionfold-design-system` has my round-trip logs under `apply/ainative/` —
  do NOT commit/push that repo (it's the producer's; `feedback-no-sibling-repo-edits`).
- Prior content-extraction + book-migration handoff archived at
  `.archive/handoff/HANDOFF-2026-06-28-content-extraction.md` (book/User-Guide extraction is DONE;
  one open follow-up there: a real end-to-end book-content PR round-trip from `~/orionfold/books`).
