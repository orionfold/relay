---
title: Sidebar IA + Route Restructure
status: completed
shipped-date: 2026-05-03
priority: P1
milestone: post-mvp
source: features/architect-report.md
dependencies: [app-shell, task-board, homepage-dashboard, keyboard-shortcut-system, command-palette-enhancement]
---

> Verified shipped 2026-05-03 via Ship Verification on prior `planned` drift. Original IA fully landed: 5 groups (Home/Compose/Observe/Learn/Configure), Dashboard at `/`, kanban at `/tasks`, `/dashboard` deleted, TDR-033 created, keyboard shortcuts rewired. One residual `/dashboard?task=` literal in `command-palette.tsx:305` was migrated to `/tasks?task=` during this verification. **Post-ship IA evolution:** the `Apps` item was added to Compose as a 7th entry after the original 6 (`Sparkles` icon at `app-sidebar.tsx:77`) as part of the composed-app work track — this is acknowledged drift from the original "exactly 6" AC, not a regression of the spec's intent.

# Sidebar IA + Route Restructure

## Description

The current sidebar has three IA drifts from product positioning:

1. **Profiles and Schedules are misclassified.** The product positioning now preserved in `_ASSETS/features-catalog.md` treats Projects, Profiles, Workflows, and Schedules as co-equal primitives. Today Profiles and Schedules live under **Manage** — a group intended for observability — which makes them feel like admin surfaces rather than composition primitives. Users compose Profiles while building Workflows; proximity matters.

2. **The real dashboard has no sidebar entry.** The route `/` renders a genuine dashboard (greeting + 5 stat tiles with sparklines + priority queue + activity feed + recent projects + quick actions), but it's only reachable via logo click. First-time users and anyone who navigates away from `/` cannot easily return. The word "Dashboard" is currently squatting on the kanban task board at `/dashboard`.

3. **The route names violate their own sibling pattern.** Every other list route in the app is object-plural: `/projects`, `/workflows`, `/profiles`, `/schedules`, `/documents`, `/tables`. The kanban of tasks is the single exception, living at `/dashboard` — named after a view type, not the object it displays. `/tasks` already exists as a redirect stub awaiting this rename.

This feature fixes all three in a single coordinated change: split the sidebar's "Work" group into **Home** (entry-point surfaces) and **Compose** (primitives and artifact libraries), rename "Manage" to **Observe**, promote Profiles + Schedules into Compose, reclaim the "Dashboard" label for the screen that actually is a dashboard, and rename the kanban's route to `/tasks`. The old `/dashboard` route is deleted outright — ainative is in alpha with few external users, so bookmark back-compat is not a constraint.

The change is being bundled with the brand pivot content refresh — `/refresh-content-pipeline` will cascade the doc, screengrab, and user-guide updates in the same run, so the marginal doc cost is zero.

## User Story

As a team-lead persona (the SMB operator journey now maintained in `_ASSETS/journeys/smb.md`), I want the sidebar groups to mirror my cognitive modes — morning check-ins, mid-day composition, retrospective observation — so that the first click of the day lands me on the right surface without scanning a flat list.

As a developer contributing a new list route (e.g. a future `/agents` or `/queues`), I want a written TDR telling me to name routes after the object, not the view type, so that this drift does not re-accumulate.

## Technical Approach

### 1. Sidebar structure change (`src/components/shared/app-sidebar.tsx`)

Replace the 4-group config with 5:

- **Home**: Dashboard, Tasks, Inbox, Chat
- **Compose**: Projects, Workflows, Profiles, Schedules, Documents, Tables
- **Observe**: Monitor, Cost & Usage, Analytics
- **Learn**: AI Native Book, User Guide (unchanged)
- **Configure**: Environment, Settings (unchanged)

Every item keeps the existing two-line menu treatment (title + ≤32-char subtext under DD-020). The `Dashboard` entry's href changes from `/dashboard` to `/`. A new `Tasks` entry is added at href `/tasks` with `alsoMatches: ["/tasks/"]` (mirrors the existing Tables pattern that handles `/tables/[slug]`). The existing `alsoMatches: ["/tasks"]` on Dashboard is removed.

The `isItemActive` function at `app-sidebar.tsx:96-104` requires **no logic change** — line 98's root-path guard (`if (item.href === "/") return pathname === "/";`) already handles the new Dashboard entry correctly and the Tasks entry inherits the standard prefix-match behavior. This was verified in the architect report.

### 2. Route swap (`src/app/`)

- Move page body from `src/app/dashboard/page.tsx` → `src/app/tasks/page.tsx` (currently a redirect stub that gets overwritten).
- **Delete** `src/app/dashboard/` entirely. Including its `__tests__/` subtree — the accessibility test file moves to live adjacent to the renamed components.
- Update `src/app/tasks/[id]/page.tsx:53` and `src/app/tasks/new/page.tsx:20` backHref from `/dashboard` to `/tasks`.
- Update `src/components/tasks/task-surface.tsx:64` H1 text from "Dashboard" to "Tasks".

### 3. Code-wide URL remapping (~15 files, enumerated in architect report)

Every `router.push("/dashboard")`, `<Link href="/dashboard">`, or string-literal `"/dashboard"` in `src/**/*.tsx` and `src/**/*.ts` must be rewritten to `"/tasks"`. After the change, ripgrep must report zero remaining `/dashboard` occurrences anywhere in `src/`. Touched files:

- `src/components/dashboard/stats-cards.tsx:52`
- `src/components/dashboard/priority-queue.tsx:119`
- `src/components/tasks/task-create-panel.tsx:207`, `:523`
- `src/components/tasks/task-detail-view.tsx:56`
- `src/components/workflows/workflow-confirmation-view.tsx:213`
- `src/components/costs/cost-dashboard.tsx:755` (includes `?create=task` query — preserve it: `/tasks?create=task`)
- `src/components/shared/global-shortcuts.tsx:34`
- `src/components/shared/command-palette.tsx:40` (entity alias `task: "/dashboard"`)
- `src/lib/chat/command-data.ts:32`
- `src/lib/chat/entity-detector.ts:124`, `:147`
- `src/components/chat/chat-quick-access.tsx:35`
- `src/components/notifications/__tests__/pending-approval-host.test.tsx:13` (test mock)
- `src/app/api/workflows/from-assist/route.ts:69` (comment only — optional cleanup for semantic clarity)

A grep assertion in the verification step catches drift: `rg -n "/dashboard" src/` returns zero lines.

### 4. Keyboard shortcuts (`src/components/shared/global-shortcuts.tsx`)

Replace the single `g d` → `/dashboard` binding with two shortcuts that match the new IA:

- **`g h`** → navigate to `/` ("Go to Home")
- **`g t`** → navigate to `/tasks` ("Go to Tasks")

The old `g d` binding is removed outright. Alpha audience + clean rename.

### 5. New TDR — Route Semantics

Create `.claude/skills/architect/references/tdr-033-route-object-label-convention.md` (status `accepted`) capturing the rule: list routes name the object (`/tasks`, `/projects`); detail routes use object singular + id (`/tasks/[id]`); view-type selection (board, table, grid, kanban) is an in-page toggle, never a route. Root `/` is reserved for the cross-cutting home overview.

### 6. Doc + screengrab + book refresh

Run `/refresh-content-pipeline` as the final step, bundled with the already-planned brand pivot cascade. This regenerates:

- 15 docs files referencing `/dashboard` (listed in architect report)
- Historical `dashboard-*` README images under `public/readme/`; current product capture belongs only in `_ASSETS/screenshots/`
- Dirty guide units in `_ASSETS/docs/guide-tracker.json`
- Current product journeys under `_ASSETS/journeys/`
- Any book chapters whose alt-text or narrative references the kanban as "dashboard"

Book content has zero current `/dashboard` references (verified via grep); no manual book edits required.

### 7. UX state specifications (added via `/frontend-designer` Product-Design Bridge, 2026-04-18)

**§7a — `/` overview state handling.** The existing `HomePage` Server Component already branches on `totalTasks` and renders `<WelcomeLanding />` + `<ActivationChecklist />` for fresh installs, and the full 6-section layout (Greeting + StatsCards + PriorityQueue + ActivityFeed + QuickActions + RecentProjects) when data exists. No new component work needed; this is a regression-preservation requirement after the route swap. Next.js SSR streams the page; there is no skeleton fallback today and none is added in this feature. Adding a slow-DB skeleton is explicitly deferred.

**§7b — `/tasks` kanban state handling.** The existing `<Suspense fallback={<SkeletonBoard />}>` boundary at `src/app/dashboard/page.tsx:102` moves wholesale to `src/app/tasks/page.tsx`. TaskSurface's empty-state card and error handling preserve parity with today's `/dashboard`. Zero UX regression is the shipping bar — if a state-handling gap exists today, it is out of scope for this feature and tracked in a separate UX follow-up.

**§7c — Error handling principle (AGENTS.md §1).** Any query failure in `/` or `/tasks` must produce visible output — no section renders a blank where data failed to load. If this principle holds on `/dashboard` today, the move preserves it; if a regression surfaces during implementation, fix or defer deliberately (no silent degradations).

**§7d — Silent rename (no returning-user messaging).** No toast, banner, "what's new" popover, badge, or changelog modal for the rename. Rationale: alpha audience (product decision 2026-04-18), and the command palette provides organic discovery — ⌘K + "dashboard" surfaces the new `/` entry; ⌘K + "tasks" or "kanban" surfaces `/tasks`. The subtext under each nav item is the passive signal. A migration notice would inflate the change beyond its actual weight.

**§7e — Accordion single-open behavior preserved.** The existing `toggleGroup` logic (one group expanded at a time, with active-route auto-expansion via `useEffect` on pathname change) is unchanged. Clicking a Compose item while Home is expanded collapses Home and expands Compose — same as today between Work and Manage. No new state management.

**§7f — Subtext calibration (final copy).** All four Home items have ≤32-char subtexts per DD-020:

| Item | Subtext | Chars | Notes |
|------|---------|-------|-------|
| Dashboard | Today's work at a glance | 24 | Keep existing — now correctly describes `/` overview |
| Tasks | Work in flight across projects | 30 | New — specifies kanban purpose + cross-project scope |
| Inbox | Approvals and notifications | 27 | Unchanged |
| Chat | Talk directly with agents | 25 | Unchanged |

## Acceptance Criteria

### Navigation structure

- [x] Sidebar renders exactly 5 accordion groups in order: Home, Compose, Observe, Learn, Configure
- [x] Home group contains exactly these items in order: Dashboard, Tasks, Inbox, Chat
- [x] Compose group contains the originally specified items in order: Projects, Workflows, Profiles, Schedules, Documents, Tables (the `Apps` item was added as a post-ship IA evolution under the composed-app work track and is currently positioned between Projects and Workflows)
- [x] Observe group contains exactly these items in order: Monitor, Cost & Usage, Analytics
- [x] Each of the 17 sidebar items has a title + one-line subtext ≤32 characters (per DD-020)
- [x] The new Tasks item has subtext "Work in flight across projects" (30 chars); Dashboard subtext remains "Today's work at a glance" (now accurately describes `/`); Inbox and Chat subtexts unchanged

### Route behavior

- [x] Visiting `/` renders the home overview: Greeting + StatsCards + PriorityQueue + ActivityFeed + QuickActions + RecentProjects
- [x] Visiting `/tasks` renders the kanban task surface with the same functionality the old `/dashboard` had (TaskSurface component, view toggle, density toggle, filters, detail sheet)
- [x] Visiting `/dashboard` returns Next.js 404 (the `src/app/dashboard/` directory is deleted)
- [x] `/tasks/[id]` PageShell backHref points to `/tasks`; "Back to Dashboard" label replaced with "Back to Tasks"
- [x] `/tasks/new` PageShell backHref points to `/tasks`; label "Back to Tasks"
- [x] Task-surface page H1 displays "Tasks" (not "Dashboard")

### Code migration

- [x] `rg -n "/dashboard" src/` returns zero lines — no remaining literal references anywhere in `src/`
- [x] Every `router.push` and `<Link href>` that previously targeted `/dashboard` now targets `/tasks` (see Technical Approach for full file list)
- [x] Cost-dashboard deeplink `/dashboard?create=task` rewritten to `/tasks?create=task` preserving the query parameter
- [x] `src/app/dashboard/` directory removed entirely (including `__tests__/`); any still-relevant tests moved to live adjacent to the components they cover

### Active-highlight correctness

- [x] When on `/`, only Dashboard (in Home group) is active-highlighted; no other item is active
- [x] When on `/tasks`, only Tasks (in Home group) is active-highlighted; Dashboard is NOT active
- [x] When on `/tasks/[id]` or `/tasks/new`, Tasks is active-highlighted
- [x] Accordion auto-expands the group owning the current route (Home for Dashboard/Tasks/Inbox/Chat, Compose for Projects/Workflows/etc.)

### Keyboard shortcuts

- [x] `g h` navigates to `/`
- [x] `g t` navigates to `/tasks`
- [x] The old `g d` binding is removed (no longer registered in `global-shortcuts.tsx`)
- [x] Command palette has a "Dashboard" entry with href `/` and a separate "Tasks" entry with href `/tasks`

### Architecture & documentation

- [x] TDR-033 file created at `.claude/skills/architect/references/tdr-033-route-object-label-convention.md` with status `accepted` and the rule stated in Technical Approach §5
- [x] `/refresh-content-pipeline` cascade completes without errors; stats snapshot regenerated
- [x] Zero live `/dashboard` references remain in the `_ASSETS` guide/journey corpus after the cascade
- [x] The retired dashboard guide identity was replaced by the Tasks guide identity before the old generated corpus was removed
- [x] Historical README images use the `tasks-*` names; future product capture is declared and generated only through `_ASSETS/screenshots/`

### State preservation — `/` (Dashboard overview)

- [x] **Loading**: Next.js SSR streams the full render; no layout shift during the streaming window; no skeleton fallback required (preserves current behavior, not a new affordance)
- [x] **Empty (fresh install, zero tasks + zero projects)**: `<WelcomeLanding />` and `<ActivationChecklist />` render; Greeting still appears; priority queue and recent projects collapse out gracefully — parity with today's `/` behavior
- [x] **Populated**: Greeting + StatsCards (5 tiles + sparklines) + PriorityQueue + ActivityFeed + QuickActions + RecentProjects all render in the same layout as today's `/`
- [x] **Error (one or more of the 6 parallel DB queries fails)**: page renders as much data as it has; failed sections show an inline error state rather than blank or crashed the whole page (AGENTS.md §1 zero-silent-failures)

### State preservation — `/tasks` (kanban)

- [x] **Loading**: `<SkeletonBoard />` renders inside the `<Suspense>` boundary — moved intact from `src/app/dashboard/page.tsx:102`
- [x] **Empty (zero tasks)**: TaskSurface renders its empty-state card; "New Task" CTA remains reachable; view toggles still functional — regression parity with `/dashboard` verified
- [x] **Populated**: KanbanBoard renders queued / running / done / failed columns; TaskViewToggle switches to table; DensityToggle works; filter persistence honors board-context-persistence feature
- [x] **Error (tasks query fails)**: PageShell renders with inline error card; filter bar and "New Task" button remain visible so user can still create or recover

### Active-highlight regression (16 route checks)

- [x] On `/`: Dashboard active; no other item active; Home group auto-expanded
- [x] On `/tasks`: Tasks active; Dashboard NOT active; Home expanded
- [x] On `/tasks/[id]` and `/tasks/new`: Tasks active; Home expanded
- [x] On `/inbox`: Inbox active; Home expanded
- [x] On `/chat`: Chat active; Home expanded
- [x] On `/projects` and `/projects/[id]`: Projects active; Compose expanded
- [x] On `/workflows` and `/workflows/[id]`: Workflows active; Compose expanded
- [x] On `/profiles` and `/profiles/[id]`: Profiles active; Compose expanded (guard against old Manage coupling)
- [x] On `/schedules` and `/schedules/[id]`: Schedules active; Compose expanded (guard against old Manage coupling)
- [x] On `/documents` and `/documents/[id]`: Documents active; Compose expanded
- [x] On `/tables` and `/tables/[slug]`: Tables active; Compose expanded
- [x] On `/monitor`: Monitor active; Observe expanded
- [x] On `/costs`: Cost & Usage active; Observe expanded
- [x] On `/analytics`: Analytics active; Observe expanded
- [x] On `/book` and `/user-guide`: corresponding item active; Learn expanded
- [x] On `/environment` and `/settings`: corresponding item active; Configure expanded

### Keyboard and accessibility

- [x] Tab order through sidebar traverses: logo → each visible group header in order → (when expanded) its items → next group header → footer controls (~22 focus stops total)
- [x] Each group header button has `aria-expanded` reflecting accordion state
- [x] Space/Enter on a group header toggles accordion state (regression check — already implemented today)
- [x] `focus-visible` ring on group headers and menu items uses existing sidebar-ring token — no bare browser default
- [x] Command palette keyword match: typing "dashboard" surfaces `/` entry; typing "tasks", "kanban", or "board" surfaces `/tasks` entry (update `src/lib/chat/command-data.ts` keywords to split "dashboard" from kanban-related matches)

### Visual weight regression

- [x] At 1366×768 viewport (common laptop) with Compose group expanded (6 items × 48px = 288px): sidebar footer — UpgradeBadge (when present) + WorkspaceIndicator + separators + AuthStatusDot + TrustTierBadge + ⌘K button + ThemeToggle — remains visible above the fold without intra-sidebar scroll
- [x] At 1440×900 viewport with Compose expanded: no visual regression vs. current 4-group layout
- [x] 2-line menu items: title + subtext fit without wrapping; `lg` size (h-12 = 48px) preserved

### Regression checks (generic)

- [x] Browser smoke test: navigate logo → Dashboard (Home), Tasks, each Compose item, each Observe item, Learn and Configure items — every route loads without console errors
- [x] `pending-approval-host.test.tsx` updated (`usePathname: () => "/tasks"`) and passes
- [x] Full test suite passes; no newly failing tests

## Scope Boundaries

**Included:**
- Sidebar group split, label rename, item promotion (Profiles + Schedules from Manage → Compose)
- Route swap: kanban moves from `/dashboard` → `/tasks`; `/dashboard` directory deleted outright
- All code-level URL literal migrations enumerated in the architect report
- Keyboard shortcut rewrite: `g d` removed; `g h` and `g t` added
- TDR-033 creation
- Doc, screengrab, and user-guide regeneration via `/refresh-content-pipeline` (bundled with brand pivot)
- Task-surface H1 rename
- Test mock update

**Excluded:**
- Brand rename assets (logo, wordmark, favicon) — tracked separately under the brand pivot work item
- Any new routes beyond moving the existing kanban to `/tasks`
- Changes to the home overview (`/`) content itself — greeting copy, card layouts, priority queue logic are out of scope
- Changes to the kanban's internal behavior — view toggle, filters, density, detail sheet are preserved as-is; only the route and page chrome change
- Back-compat redirect from `/dashboard` to `/tasks` — alpha audience does not justify the maintenance surface
- Adding new items to Learn or Configure groups
- Creating a sixth group or further IA splits

## References

- **Architect impact report:** `features/architect-report.md` (2026-04-18 — blast radius MEDIUM, ~50 files, single frontend layer)
- **TDR (to be written):** `.claude/skills/architect/references/tdr-033-route-object-label-convention.md`
- **Product positioning:** `_ASSETS/features-catalog.md`
- **User journey evidence:** `_ASSETS/journeys/smb.md`
- **Design decisions:** DD-016 (hierarchical dimming), DD-020 (single-line subtext ≤35 chars), pattern-library entry for AppSidebar
- **Related specs:**
  - `app-shell.md` — originating sidebar scaffold
  - `task-board.md` — the component whose route is being renamed
  - `homepage-dashboard.md` — the screen reclaiming the "Dashboard" label
  - `keyboard-shortcut-system.md` — owns the `g X` navigation idiom
  - `command-palette-enhancement.md` — owns palette entries updated by this change
- **Bundled refresh:** brand pivot content cascade (see session context; `/refresh-content-pipeline` will run end-to-end)
- **Smoke verification run — 2026-04-18** (`PORT=3010 npm run dev`):
  - `/` renders overview (Greeting + 5 StatsCards + Needs Attention + Live Agent Activity); Dashboard item active in Home group; "Completed Today" card correctly links to `/tasks`
  - `/tasks` renders kanban (5 columns: Planned 10, Queued 6, Running 10, Completed 9, Failed 1); H1 reads "Tasks"; filters + view toggle + density toggle intact; Tasks item active in Home group
  - `/dashboard` returns Next.js 404 "This page could not be found" — expected clean-delete behavior
  - `/profiles` renders with Profiles active in **Compose** group (confirmed promotion from old Manage); Compose expanded showing Projects/Workflows/Profiles/Schedules/Documents/Tables
  - `/monitor` renders with Monitor active in **Observe** group; Observe expanded showing Monitor/Cost & Usage/Analytics
  - At 1366×768 viewport with Observe expanded, footer (WorkspaceIndicator + auth dot + trust tier + ⌘K + theme toggle) visible above the fold
  - Zero console errors across routes except pre-existing warnings unrelated to this feature
