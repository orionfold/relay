# Design Decisions — ainative Calm Ops

Decision catalog with rationale. Updated by the self-healing loop during Mode 4 audits.
Each decision has an ID (DD-NNN), decided date, rationale, and supersession chain where applicable.

---

## Color System

### DD-001: OKLCH with Hue ~250

- **Decided:** 2026-03-08
- **Rationale:** OKLCH provides perceptually uniform color manipulation — equal chroma/lightness deltas produce visually equal contrast changes across all hues. Hue ~250 (indigo/blue-violet) is calm, professional, and avoids the overused "AI purple" (#7C3AFF range). All theme tokens use OKLCH notation.
- **Key values:** Primary light `oklch(0.50 0.20 260)`, dark `oklch(0.65 0.20 260)`. Dark mode locks all surfaces to hue 250 with chroma 0.02 for unified palette.

### DD-002: Semantic Status Tokens Over Raw Tailwind

- **Decided:** 2026-03-20
- **Rationale:** Status colors must be consistent and centrally mutable. Raw `text-green-500` creates fragile coupling to a specific Tailwind shade that diverges across components. Semantic tokens (`text-status-completed`, `bg-status-failed/15`) allow palette changes in one place.
- **Forbidden:** `text-green-*`, `text-red-*`, `text-blue-*`, `text-amber-*` for status indication. Use `text-status-*` and `text-priority-*` tokens instead.
- **Token source:** `design-system/tokens.json` → `color.status.*` and `color.priority.*`

---

## Surface System

### DD-003: Opaque Surfaces, No Glass Morphism

- **Decided:** 2026-03-20 (Calm Ops pivot, commit b527c15)
- **Rationale:** Glassmorphism (backdrop-filter, rgba surfaces, blur layers) caused compositing jank in dense operational views, reduced readability of data-heavy surfaces, and conflicted with the calm aesthetic goal. The project initially used glassmorphism (Mar 9, commit 63e059b with +1,139 lines of glass tokens) but removed it entirely during the Calm Ops pivot.
- **Supersedes:** Glassmorphism phase (2026-03-09)
- **Forbidden:** `backdrop-filter`, `backdrop-blur`, `rgba(`, `glass-*`, `--glass-*`, `--blur-glass`

### DD-004: 3-Tier Surface Hierarchy

- **Decided:** 2026-03-20
- **Rationale:** Clear visual nesting without shadows or transparency. Three tiers create parent→child→inset reading order:
  - Surface-1: Cards, raised panels (white in light, oklch 0.18 in dark)
  - Surface-2: Nested content, muted backgrounds (oklch 0.975 light, 0.16 dark)
  - Surface-3: Inset wells, scroll areas (oklch 0.96 light, 0.14 dark)
- **CSS utilities:** `.surface-card`, `.surface-card-muted`, `.surface-control`, `.surface-scroll`

### DD-005: Border-Centric Elevation (4 Levels)

- **Decided:** 2026-03-20
- **Rationale:** Borders are cheaper to render than box-shadows, more predictable across light/dark themes, and visually clearer at small sizes. Four levels:
  - `elevation-0`: Flat, inline (border-subtle, no shadow)
  - `elevation-1`: Cards, panels (border, shadow-subtle)
  - `elevation-2`: Active cards, toolbars (border, shadow-raised)
  - `elevation-3`: Popovers, modals, dialogs (border-strong, shadow-overlay)
- **Anti-pattern:** Using `shadow-lg`, `shadow-xl`, `shadow-2xl` directly instead of elevation utilities.

---

## Typography

### DD-006: Inter + JetBrains Mono

- **Decided:** 2026-03-20
- **Rationale:** Inter is optimized for small text (13-14px) in dense operational views — its x-height and letter spacing excel at the sizes ainative uses most. JetBrains Mono for code, IDs, timestamps, and monospace data.
- **Supersedes:** Geist Sans + Geist Mono (initial choice, removed)
- **Forbidden:** Any reference to `Geist`, `geist-sans`, `geist-mono`
- **Base font size:** 14px (set on `<html>`)
- **Scale:** Page title `text-2xl font-bold`, Card title `text-base font-medium`, Body `text-sm`, Dense `text-xs`

---

## Layout

### DD-007: PageShell Unification

- **Decided:** 2026-03-21 (commit 838852e)
- **Rationale:** Every route uses `PageShell` for consistent title/actions/filters/detail-pane anatomy. Eliminates per-page layout decisions, ensures consistent back navigation, bounded content width, and optional right-rail detail pane (420px). 16 pages migrated in one commit.
- **Component:** `src/components/shared/page-shell.tsx`
- **Anti-pattern:** Page routes that build their own layout wrapper instead of using PageShell.

### DD-008: Bento Grid for Forms and Detail Views

- **Decided:** 2026-03-11 (commits 497f71d, 344e07a)
- **Rationale:** Multi-column card-based grids (using `FormSectionCard` with fieldset/legend semantics) provide better scannability than single-column form stacks. Detail views use responsive 2-3 column grids with collapsible sections.
- **Pattern:** CSS Grid with `grid-cols-1 md:grid-cols-2` base, spanning cards for wide content.

### DD-009: Max Radius rounded-xl (12px)

- **Decided:** 2026-03-20
- **Rationale:** Oversized radii (20-30px) conflict with enterprise density and information-heavy surfaces. 12px maximum keeps surfaces professional and data-focused.
- **Forbidden:** `rounded-[24px]`, `rounded-[28px]`, `rounded-[30px]`, `rounded-2xl` on cards/containers. `rounded-full` is acceptable only on avatars, badges, and pulse indicators.

---

## Spacing

### DD-010: 8pt Grid with --space-* Tokens

- **Decided:** 2026-03-08
- **Rationale:** Consistent spatial rhythm across all surfaces. All spacing values use 4px increments on the 8pt base grid: `--space-1` (4px) through `--space-16` (64px). Standard padding is `--space-4` (16px), section padding `--space-6` (24px), page-level `--space-8` (32px).
- **Anti-pattern:** Arbitrary pixel values not on the 4px grid (e.g., `p-[5px]`, `gap-[7px]`).

---

## Status System

### DD-011: 5 Orthogonal Status Families

- **Decided:** 2026-03-20
- **Rationale:** Status is not one-dimensional. An entity can be "running" (lifecycle) AND "pending_approval" (governance) simultaneously. Five families:
  1. **Lifecycle:** planned, queued, running, active, completed, failed, paused, cancelled, draft
  2. **Governance:** pending_approval, approved, denied, needs_input
  3. **Runtime:** claude, codex, hybrid
  4. **Risk:** read_only, git_safe, full_auto
  5. **Schedule:** active, paused, completed, expired
- **Source:** `src/lib/constants/status-families.ts`
- **Component:** `StatusChip` renders any status from any family uniformly.

### DD-012: Badge Variants Mapped to Semantic Status

- **Decided:** 2026-03-20
- **Rationale:** Consistent visual encoding of status across all surfaces:
  - `default` (primary bg) → running/active states
  - `success` (green bg) → completed/approved states
  - `destructive` (red bg) → failed/denied states
  - `secondary` (muted bg) → queued/paused/cancelled states
  - `outline` (border only) → planned/draft/pending states
- **Source:** `src/lib/constants/status-colors.ts`

---

## Styling Patterns

### DD-013: data-slot Styling for shadcn/ui

- **Decided:** 2026-03-20
- **Rationale:** shadcn/ui components expose `data-slot` attributes. Styling via `[data-slot="card"]` in `globals.css` allows clean opaque surface application without modifying component source files. Doubled attribute selectors `[data-slot="x"][data-slot="x"]` boost specificity from (0,1,0) to (0,2,0) to override Tailwind v4 cascade layers.
- **Key selectors:** `[data-slot="card"]`, `[data-slot="input"]`, `[data-slot="select-trigger"]`, `[data-slot="popover-content"]`, `[data-slot="dialog-content"]`, `[data-slot="table-row"]`

### DD-014: Tailwind v4 @theme inline

- **Decided:** 2026-03-20
- **Rationale:** Tailwind v4's `@theme inline { ... }` block in `globals.css` maps CSS custom properties to utility classes without needing `tailwind.config.ts`. All design tokens defined in CSS, automatically generating utilities like `text-status-running`, `bg-surface-1`, etc.
- **No tailwind.config.ts needed** — the entire theme is in `globals.css`.

---

## Animation

### DD-015: Minimal Functional Animations Only

- **Decided:** 2026-03-20
- **Rationale:** Calm operational clarity means motion serves function, not decoration. Defined animations:
  - `transition-colors` (150ms) — hover state changes
  - `animate-spin` — loading spinners
  - `animate-pulse` — skeleton loaders
  - `animate-fade-in` — element entry (opacity + translateY, 300ms)
  - `animate-card-exit` — card deletion (opacity + scale + height, 400ms)
  - `animate-pulse-slide` — indeterminate progress bars
- **Forbidden:** `glass-shimmer`, noise-grain overlay, auto-glass enhancement, decorative parallax
- **Design metrics target:** MOTION_INTENSITY 2-3

---

## Candidate Patterns (Research-Informed, Not Yet Implemented)

### DD-016: Hierarchical Dimming (Linear-Inspired)

- **Status:** Candidate
- **Source:** Linear's 2026 design refresh — "structure should be felt, not seen"
- **Pattern:** Dim navigation surfaces (sidebar, tabs) while spotlighting content areas. Navigation chrome uses surface-2/surface-3 with reduced text contrast; content stays on surface-1 with full contrast.
- **Potential application:** App sidebar could use dimmed treatment to recede behind main content.

### DD-017: Border Opacity from OKLCH Lightness Delta

- **Status:** Candidate
- **Source:** Modern OKLCH design system research
- **Pattern:** Derive border visibility from the lightness difference between the surface and its parent. Darker surfaces automatically get stronger borders via `color-mix(in oklab, var(--border) 80%, transparent)` or similar. Eliminates manual border-subtle/border/border-strong selection.
- **Potential application:** Could replace the 3-tier border token system with a single computed border.

---

## Composition Patterns

### DD-018: Bento for Paired Control + Effect Panel

- **Decided:** 2026-04-18
- **Context:** A compact control (2×2 radio group, toggle, filter) that drives an always-visible effect panel (recommendation banner, preview, summary) was stacked full-width by default. At wide viewports (>1024px) this wasted 40-60% of horizontal space and visually separated cause from effect.
- **Decision:** When a control's primary output is always rendered, pair them in a 2-column bento: `grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-stretch`. Fixed 280px for the control column keeps it compact; effect panel absorbs remaining width. Below `lg:`, stack full-width.
- **Consequences:**
  - Cause ↔ effect stays within the user's visual locus — no saccade required
  - Effect panel gets ~2× the area it had when stacked below
  - Requires `min-w-0` discipline on the flex chain inside the right column so chips can truncate
- **References:** `src/components/settings/providers-runtimes-section.tsx` (task-routing section)

### DD-019: Locked Container Height on State-Changing Content

- **Decided:** 2026-04-18
- **Context:** When a container's content varies across user selections (e.g., a banner rendering 3, 4, or 5 rows based on a radio pick), the container resizes on every click. Sibling elements stretched via `flex-1` (paired columns, mode-switcher buttons) resize too. Users perceive "jarring" layout shift — a CLS-equivalent inside a session.
- **Decision:** Lock the container with `lg:min-h-[Xpx]` where X is the tallest possible state + ~6% buffer. Combine with `lg:items-stretch` on the grid so sibling columns inherit the locked height. Inner content stays top-aligned; sparse states leave graceful whitespace rather than collapsing.
- **Consequences:**
  - Zero layout shift between user selections
  - Design budget forced upfront: "what's the tallest state?" becomes an explicit design question
  - Wastes a few pixels of vertical space in sparse states — acceptable tax for stability
- **References:** `src/components/settings/providers-runtimes-section.tsx` `lg:min-h-[180px]`

### DD-020: Crisp Single-Line Subtext in Narrow Columns

- **Decided:** 2026-04-18
- **Context:** Descriptive copy (section subtext, option hints, helper text) written at full sentence length wrapped onto multiple lines when placed in narrow columns (~280px or less). Wrapping doubled vertical consumption, broke uniform height of sibling descriptions, and read as a content problem disguised as a layout problem.
- **Decision:** In columns narrower than 280px, subtext and option-level hints must fit single-line at 14px. Default to ≤35 characters; aim for ≤28 when possible. Apply `truncate` + `title={fullText}` tooltip as a safety net for dynamic content (translations, catalog-sourced strings), but always shorten copy at source first — truncation is a fallback, not a feature.
- **Consequences:**
  - Forces terser, more scannable copy — "How should ainative choose a runtime when creating tasks?" → "Pick how ainative picks a runtime."
  - Option descriptions stay height-uniform across states
  - Tooltip via `title` preserves full meaning for screen readers and hover
- **References:** `src/components/settings/providers-runtimes-section.tsx` ROUTING_OPTIONS

### DD-021: Horizontal Mode-Switcher Buttons

- **Decided:** 2026-04-18
- **Context:** Radio-as-button mode switchers (Latency / Cost / Quality / Manual) initially used stacked icon-above-label layout (`flex-col items-center`). In a 2×2 grid within a 280px column this crowded the horizontal axis and over-allocated vertical space (~56px per button), reading as "4 rich product cards" when the semantic is "4 mode toggles."
- **Decision:** For 2×N mode-switcher grids at narrow widths, use horizontal `flex items-center gap-2` (icon beside label). Pairs icon with its label like a toolbar button. Reduces height ~18% (56→46px) and lets buttons fit 2×2 without hairline crowding.
- **Consequences:**
  - Reads as a control strip, not a product catalog — matches semantic weight of the choice
  - `shrink-0` on icon + `truncate` on label ensures graceful degradation with longer labels
  - NOT appropriate for actual product-choice grids (agent profile cards, etc.) where vertical stack still reads richer
- **References:** `src/components/settings/providers-runtimes-section.tsx` radio buttons

### DD-022: Outline Badges for Recommended State

- **Decided:** 2026-04-18
- **Context:** UI surfaces that show both "what the system recommends" and "what the user currently has configured" risk visual conflation — users mistake a recommendation pill for an already-applied setting. Filled badges read as committed state; unclear visual grammar breeds confusion.
- **Decision:** "Recommended" chips use `Badge variant="outline"` (thin border, no fill) with an icon prefix (Key for api_key, Shield for oauth, Cpu for local). "Configured/active" chips keep the existing filled treatment (`AuthStatusBadge`). Meaning is reinforced by a container heading like "Recommended for {X}" — the container carries intent, individual chips stay compact.
- **Consequences:**
  - Outline ≠ filled is an at-a-glance differentiator that survives color-blindness better than hue alone
  - Recommendation chips stay small — no extra "recommended:" label text per chip
  - User can scan "what the system thinks" vs "what's actually set" without reading
- **References:** `src/components/settings/providers-runtimes-section.tsx` `AuthModelPair` / `RecommendationBanner`

### DD-023: Min-Width-Zero Chain for Flex Truncation

- **Decided:** 2026-04-18
- **Context:** `truncate` inside flex containers silently fails because Tailwind's flex children default to `min-width: auto` — children can never shrink below their content's intrinsic size. Developers debug this by trying `max-width` on just the truncating child, which doesn't help because the parent's `min-width: auto` still forces overflow.
- **Decision:** Every ancestor from the truncating child up to the flex root must have `min-w-0`. Pattern: outer `flex min-w-0 items-center gap-2` → inner wrapper `flex min-w-0 flex-1 overflow-hidden` → target child `min-w-0 max-w-[Xpx] truncate`. Sibling "never-truncate" elements (icon hints, action buttons) bypass via `shrink-0`.
- **Consequences:**
  - `truncate` works reliably — model IDs, long labels, dynamic strings shrink gracefully with ellipsis
  - Three levels of `min-w-0` look redundant but each one matters; removing any breaks the chain
  - Combine with `title={fullText}` tooltip for accessibility (ellipsised text must remain readable on hover)
- **References:** `src/components/settings/providers-runtimes-section.tsx` `RecommendationRow`, `AuthModelPair`
