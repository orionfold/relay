# Nav redesign — IA rethink + route census

**Status:** SPEC (approved decisions locked) · **Origin:** S12 staging walkthrough NAV-1..6 / JS6-1..3
**Findings:** `output/staging/2026-07-02-full-suite/FINDINGS.md`
**Blast radius:** cross-layer (shell chrome + route deletions + data wiring) · **Uncertainty:** low (code verified)

## Problem (from the walkthrough)

1. **Sliding accordion is the wrong model (NAV-1/2).** Top nav = 4 accordion groups
   (Home · Compose · Data · Observe) + a gear. Clicking a group slides its children open
   inline and closes the previously-open one — so only one group's children are visible at a
   time. This imposes a **4-children-per-group width cap** (Packs is the one tested 5th
   exception) purely to keep the expanded row narrow. The cap is an artifact of the accordion,
   not a real IA constraint.
2. **Apps is buried (NAV-3).** Apps — the composed-app entry point, the product's headline —
   lives *under* Compose. Composed app instances ("Northstar Site Visits") appear only on the
   `/apps` page, never in nav. Operator wants **Apps top-level with app instances as sub-items**.
3. **Nav-hidden-but-live limbo (NAV-6 / JS6-1/2/3).** The feature-cut-freeze removed
   `/analytics` and `/environment*` from `nav-items.ts` but **never disabled the routes**. Both
   are `force-dynamic` Server Components with **no `notFound()`/`redirect` guard** that compute
   real data — reachable by URL/bookmark, still making unmaintained ROI claims. Nav-pruning was
   applied as if it were feature-cutting. **Decision (operator): retire both** — make nav-cut =
   feature-cut.

## Approved decisions

- **Ceremony:** 1-page written spec (this file) → operator OK → build. (policy 3/4)
- **Route disposition:** **retire** `/analytics` and `/environment*` — delete the route pages,
  the dashboard components, and the *presentation-only* lib modules. Preserve the
  `src/lib/environment/` modules that are load-bearing infrastructure (see census below).

## Route census (verified 2026-07-03)

Every `src/app/**/page.tsx` bucketed. Source of truth for the "cut = feature-cut" audit.

| Route | In nav? | Live by URL? | Disposition |
|---|---|---|---|
| `/`, `/tasks`, `/inbox`, `/chat` | ✅ home | ✅ | keep (Home tier) |
| `/apps` (+ `/apps/[id]`) | ✅ compose | ✅ | **promote to top-level** (Apps tier) |
| `/packs`, `/projects`, `/workflows*`, `/profiles*` | ✅ compose | ✅ | keep (Compose tier) |
| `/customers*`, `/schedules*`, `/documents*`, `/tables*` | ✅ data | ✅ | keep (Data tier) |
| `/monitor`, `/costs` | ✅ observe | ✅ | keep (Observe tier) |
| `/settings` | ⚙️ gear (utility) | ✅ | keep (utility cluster) |
| **`/analytics`** | ❌ | ✅ **live, no guard** | **RETIRE — delete** |
| **`/environment`, `/environment/skills`, `/environment/compare`** | ❌ | ✅ **live, no guard** | **RETIRE — delete route + dashboard** |

**Verified:** `/analytics/page.tsx` and `/environment/page.tsx` both `export const dynamic =
"force-dynamic"` and render live dashboards with **no** `notFound()`/`redirect`/disabled guard.

## Deletion blast radius (verified — critical nuance)

- **`/analytics` is a clean cut.** `rg` finds **zero** importers of `@/lib/analytics` or
  `@/components/analytics` outside the analytics dirs. Delete: `src/app/analytics/`,
  `src/components/analytics/`, `src/lib/analytics/` — no external dependents.
- **`/environment` is NOT a clean cut — the folder is two things.** `src/lib/environment/` is a
  **load-bearing infrastructure library**, not the cut feature. External-importer counts:
  `workspace-context` **23**, `data` **10**, `auto-scan` **9**, `list-skills` **6**,
  `skill-enrichment` **4**, `scanner`/`discovery` **3**, `backup-manager`/`git-manager`/
  `profile-generator`/`sync-engine`/`templates` **2**, `profile-rules`/`skill-recommendations`/
  `types` **1**. Chat context-building, skill enrichment, and agent runtimes depend on these.
  **They stay.**
- The environment **route + dashboard + presentation-only lib** is the cut feature. Delete:
  `src/app/environment/`, `src/components/environment/`, and the lib modules with **0 external
  importers**: `comparison.ts`, `diff.ts`, `health-scoring.ts`, `skill-portfolio.ts`,
  `profile-linker.ts` (verify 0 at build time; if a delete breaks the build, that module was
  load-bearing after all → keep it and note it).

> Lesson applied: `legacy-rebrand-divergence-bugs` + `check-git-history-for-prior-art`. "Cut the
> environment feature" must not mean "delete the environment lib." Classify load-bearing vs.
> presentation before deleting each file.

## New IA — permanent two-tier bar

Replace the horizontal accordion with a **permanent two-tier bar**. No sliding, no width cap.

**Tier 1 (primary):** top-level destinations, always visible.
`Home · Apps · Compose · Data · Observe` + utility cluster (`⌘K` · Settings gear · theme · auth).

**Tier 2 (contextual):** the children of the *active* tier-1 section, always visible below tier 1.
- `Home` → Dashboard · Tasks · Inbox · Chat
- `Apps` → **app instances** (from `listAppsCached()`) + a leading "All apps" link to `/apps`
- `Compose` → Packs · Projects · Workflows · Profiles (Apps removed — it's tier-1 now)
- `Data` → Customers · Schedules · Documents · Tables
- `Observe` → Monitor · Cost & Usage

**Apps overflow (NAV-3, primary pattern): "+N more".** Tier 2 for Apps shows up to N app
instances inline; the rest collapse into a **"+N more"** pill that links to `/apps`. (Documented
alternatives, not built: a horizontal carousel, or a ⌘K command-jump. "+N more" is the primary —
simplest, no new interaction state, degrades to the full grid on `/apps`.)

Tier 2 for Apps is **data-driven** — the shell must read app instances server-side. This is the
one architectural shift: today `AppShell`/`AppBar` hold no data. Fetch `listAppsCached()` in the
shell (Server Component) and pass instances down; the bar's active-tier rendering stays client-side
for the `usePathname()` active state.

## Files

**Modify**
- `src/components/shell/nav-items.ts` — restructure `NAV_GROUPS`: add top-level `apps`; move Apps
  out of `compose`; drop the 4/5-children cap comments. Add an `AppInstanceNavItem`-style type or
  reuse `NavItem` for dynamic app children. Keep `isItemActive` / `activeGroupId` /
  `groupHasActiveItem` (public API — tests depend on them).
- `src/components/shell/app-bar.tsx` — rewrite: permanent two-tier bar, drop `GroupAccordion`
  slide logic + `openGroup` state. Tier 1 = section links (active = whichever owns the route).
  Tier 2 = active section's children. Apps tier 2 renders instances + "+N more".
- `src/components/shell/app-shell.tsx` — becomes an async Server Component that calls
  `listAppsCached()` and passes app instances to `AppBar`.
- `src/components/shell/__tests__/nav-items.test.ts` — update contract: 5 top-level sections
  (`home · apps · compose · data · observe`); Apps no longer under compose; cut-route assertions
  stay (`/analytics`, `/environment`, `/settings` still not in any static group).

**Delete (route + presentation, per census)**
- `src/app/analytics/`, `src/components/analytics/`, `src/lib/analytics/`
- `src/app/environment/`, `src/components/environment/`
- `src/lib/environment/{comparison,diff,health-scoring,skill-portfolio,profile-linker}.ts`
  (only those with 0 external importers — verify at build)

**Preserve (load-bearing — do NOT delete)**
- `src/lib/environment/{workspace-context,data,auto-scan,list-skills,skill-enrichment,scanner,
  discovery,backup-manager,git-manager,profile-generator,sync-engine,templates,profile-rules,
  skill-recommendations,types}.ts` and `parsers/`, `scanners/`, `sync/`.

## Out of scope

- Command palette (⌘K) contents, carousel/command-jump overflow variants (documented, not built).
- Telemetry rail, page-level content, the `/apps` page itself, pack/app composition logic.
- Any change to `src/lib/environment/` infrastructure modules (they are not the cut feature).
- Copy sweep, legacy-brand leaks, the 2 Agency Pro blockers — separate queued tasks.

## Build sequence (vertical slice first)

1. **Route census delete — analytics (clean):** delete `src/app/analytics`,
   `src/components/analytics`, `src/lib/analytics`. `npm run build` → confirm no broken imports.
2. **Route census delete — environment (careful):** delete route pages + dashboard + the 5
   zero-importer lib modules. `npm run build`. If any deletion breaks the build, that module was
   load-bearing → restore it, note it in this spec.
3. **IA data model:** restructure `nav-items.ts` (top-level `apps`, Apps out of compose). Update
   `nav-items.test.ts` to the new contract. `npm test -- nav-items`.
4. **Shell data read:** make `app-shell.tsx` async, call `listAppsCached()`, thread instances to
   `AppBar`.
5. **Two-tier bar:** rewrite `app-bar.tsx` — tier 1 sections, tier 2 active-section children,
   Apps tier 2 = instances + "+N more". Drop accordion state.
6. **Verify (end-to-end, `/verify`):** `npm run build && npm run dev`; in-browser confirm:
   two tiers render on every section; Apps tier-1 active on `/apps` and `/apps/[id]`; app
   instances appear in tier 2 with correct `/apps/[id]` links; "+N more" links to `/apps` when
   instances exceed N; **`/analytics` and `/environment` now 404** (retired); no regression on
   Home/Compose/Data/Observe/Settings active states. Full `npm test`.

## End-to-end check (done = all true)

- Two-tier bar visible on every route; no sliding, no accordion, no 4-children cap.
- Apps is a top-level tier-1 section; its tier 2 lists app instances + "All apps" + "+N more".
- Deep-linking `/analytics` and `/environment` returns 404 (feature retired, not just nav-hidden).
- `src/lib/environment/` infrastructure intact — chat/agents/skill-enrichment still build & pass.
- `npm run build` clean; `npm test` green (modulo the 8 known pre-existing failures in HANDOFF).
