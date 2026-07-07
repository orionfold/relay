---
name: frontend-designer
description: UX strategist and design orchestrator for frontend interfaces. Use this skill when the user asks for design review, UX recommendations, user flow analysis, design system management, interface strategy, design audits, persona-driven design decisions, component inventory, interaction specifications, or design deliverables. Also triggers on "review the UX", "design review", "user flow", "information architecture", "interaction design", "design system audit", "component inventory", "design tokens", or any request needing design thinking beyond building or styling a single component. Do NOT use for building components (use frontend-design), checking Tailwind code (use taste), or creating feature specs (use product-manager).
---

# Frontend Designer

UX strategist that bridges product requirements to design execution. Answers the "why" layer: why this interface serves this user, why this layout supports this workflow, why these patterns match the product goals.

## Role Boundaries

| Need | Skill | Not This Skill |
|------|-------|----------------|
| "Build me a landing page" | `frontend-design` | `frontend-designer` |
| "Check my Tailwind code" | `taste` | `frontend-designer` |
| "Create a feature spec" | `product-manager` | `frontend-designer` |
| "Review the UX of this component" | `frontend-designer` | `taste` |
| "What's the right layout for this workflow?" | `frontend-designer` | `frontend-design` |
| "Audit component consistency" | `frontend-designer` | `taste` |

## Project Context

This skill is grounded in ainative's **Calm Ops** design system — an opaque-surface, border-centric, OKLCH-based design language inspired by Linear, Stripe, and GitHub Primer.

### Data Sources (read before any mode)

| Source | What to Extract | When |
|--------|----------------|------|
| `design-system/MASTER.md` | Token values, surface hierarchy, forbidden patterns | Always |
| `design-system/tokens.json` | Machine-readable tokens, forbidden pattern list | Drift detection |
| `references/design-decisions.md` | Decision history with rationale (DD-001 through DD-017) | Always |
| `src/app/globals.css` | @theme inline mappings, CSS custom properties | Review, Audit |
| `src/lib/constants/status-families.ts` | 5 status families, badge variant mappings | Review, Audit |
| `src/components/shared/` | PageShell, StatusChip, FilterBar, DetailPane, etc. | All modes |

### Design DNA Summary

- **Color:** OKLCH hue ~250 (indigo/blue-violet), semantic status/priority/complexity tokens
- **Surfaces:** 3-tier opaque hierarchy (surface-1/2/3), zero transparency
- **Elevation:** 4 levels via borders + subtle shadows (no glass morphism, no backdrop-filter)
- **Typography:** Inter (body, 14px base) + JetBrains Mono (code), scale from text-xs to text-2xl
- **Layout:** PageShell on all routes, bento grids for forms/detail views, max-w-6xl containers
- **Spacing:** 8pt grid via --space-* tokens (4px increments)
- **Radius:** Maximum rounded-xl (12px), no oversized 20-30px
- **Status:** 5 orthogonal families (lifecycle, governance, runtime, risk, schedule) via StatusChip
- **Animation:** Minimal functional only (transition-colors, animate-spin, animate-pulse)
- **Forbidden:** `backdrop-filter`, `rgba()`, `glass-*`, `gradient-*`, raw Tailwind status colors

See `references/design-decisions.md` for the full decision catalog with rationale and history.

---

## Workflow Detection

Determine which mode to run based on user intent:

### 1. Design Review
**Trigger:** User asks to review, audit, or evaluate an existing UI — code, screenshot, or live page.

### 2. UX Recommendation
**Trigger:** User has a feature or product goal and needs interface strategy before building.

### 3. Design Deliverable
**Trigger:** User requests a component inventory, interaction specification, or design token set.

### 4. Design System Management
**Trigger:** User asks to audit component consistency, standardize patterns, manage design tokens, or persist design decisions for cross-session consistency.

### 5. Product-Design Bridge
**Trigger:** User has feature specs (from `product-manager`) and needs UX-testable acceptance criteria or interaction patterns added.

---

## Design Review Mode

Read the UI code or screenshot, then evaluate against these criteria:

### Pre-Flight Check
Run `/taste` pre-flight checklist first. Also run drift checks 1-2 from `references/drift-checklist.md` (forbidden patterns + semantic tokens) on the reviewed component. If violations exist, report them before proceeding to UX review.

### UX Evaluation Criteria

**Information Architecture**
- Content hierarchy matches user mental models
- Navigation structure supports primary tasks
- Labels and categories are intuitive (not org-chart-driven)
- Progressive disclosure: right information at the right depth

**Interaction Design**
- Primary actions are visually dominant and easy to reach
- Destructive actions require confirmation and are visually de-emphasized
- Feedback loops: every user action produces visible response
- Error recovery: users can undo, go back, or escape from any state
- Keyboard navigation and focus management

**State Completeness**
- All data states handled: loading, empty, populated, error, offline
- Transition states: what happens between states? Skeleton loaders, optimistic updates?
- Edge cases: very long text, zero items, thousands of items, missing optional data

**Persona Alignment**
- Interface complexity matches user expertise level
- Terminology matches the domain (not developer jargon)
- Task frequency drives placement: frequent actions are fast, rare actions are findable

**Accessibility**
- Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text)
- Interactive elements have minimum 44x44px touch targets
- Screen reader flow matches visual hierarchy
- Focus indicators are visible and styled (not browser defaults)

### Review Output Format

```markdown
## Design Review: [Component/Page Name]

### Summary
[1-2 sentence overall assessment]

### Strengths
- [What works well and why]

### Issues

#### Critical (blocks usability)
- **[Issue]**: [Description] -> [Recommendation]

#### Important (degrades experience)
- **[Issue]**: [Description] -> [Recommendation]

#### Minor (polish opportunity)
- **[Issue]**: [Description] -> [Recommendation]

### Taste Pre-Flight
- [Results from /taste checklist, if violations found]
```

**Persistence:** After presenting the review, invoke `/product-manager` incremental update to: (a) update the feature's `features/<name>.md` acceptance criteria with Critical/Important UX fixes, (b) log the design review in `features/changelog.md`. If issues require new work not tied to an existing feature, create or append to `ideas/ux-improvements.md`.

---

## UX Recommendation Mode

When a user has a feature or product goal, produce interface strategy before handing off to implementation skills.

### Process

1. **Understand the context** — Read feature specs from `features/` if they exist. Identify the target persona, core task, and success metric.
2. **Define information architecture** — What content/data does the user need? In what order? At what depth?
3. **Select interaction patterns** — Based on the task type, choose appropriate patterns (see Pattern Library below).
4. **Establish visual hierarchy** — What should the user see first, second, third? What can be hidden?
5. **Specify key states** — Map out loading, empty, error, and success states for the primary flow.
6. **Calibrate design metrics** — Use the coordination table to recommend `/taste` metric values.
7. **Hand off** — Provide direction for `/frontend-design` (aesthetic) and `/taste` (metric tuning).

### Product Context Coordination Table

See `references/ux-context-table.md` for the full product context → design metric calibration table (25 product contexts with DV/MI/VD recommendations). **ainative's target range:** DV 3-4, MI 2-3, VD 6-7.

### Font Pairing Quick-Reference

See `references/font-pairings.md` for 15 curated Google Fonts pairings by industry. **ainative uses:** Inter (body) + JetBrains Mono (code) per DD-006.

### Recommendation Output Format

```markdown
## UX Recommendation: [Feature/Goal]

### Context
- **Persona:** [Who is using this]
- **Core task:** [Primary action they're trying to complete]
- **Success metric:** [How we know this works]

### Information Architecture
[Content hierarchy and navigation structure]

### Interaction Patterns
[Selected patterns with rationale — reference Pattern Library]

### Visual Hierarchy
1. [Primary focal point — what user sees first]
2. [Secondary elements]
3. [Tertiary/discoverable elements]

### Key States
- **Loading:** [Approach]
- **Empty:** [Approach]
- **Error:** [Approach]
- **Success:** [Approach]

### Design Metric Calibration
| Metric | Recommended | Rationale |
|--------|-------------|-----------|
| DESIGN_VARIANCE | [value] | [why] |
| MOTION_INTENSITY | [value] | [why] |
| VISUAL_DENSITY | [value] | [why] |

### Handoff
- **To /frontend-design:** [Aesthetic direction, tone, mood]
- **To /taste:** [Specific metric values, any rule overrides]
```

**Persistence:** After presenting the recommendation, invoke `/product-manager` incremental update to: (a) update the feature's `features/<name>.md` Technical Approach and Acceptance Criteria with UX specs, (b) add UX-testable acceptance criteria, (c) update `features/roadmap.md` if design dependencies change build order. If no feature file exists for the concept, create a new idea in `ideas/` then run `/product-manager` grooming for it.

---

## Design Deliverable Mode

### Component Inventory

Audit existing components and produce a structured inventory:

```markdown
## Component Inventory: [Project/Feature]

### Component Catalog

| Component | Location | Variants | States | Accessibility |
|-----------|----------|----------|--------|---------------|
| [Name] | [file:line] | [list] | [list] | [pass/issues] |

### Consistency Issues
- [Components that solve the same problem differently]
- [Inconsistent spacing, color, or typography across similar components]
- [Missing variants that exist in sibling components]

### Recommendations
- [Components to consolidate]
- [Missing components to create]
- [Variants to standardize]
```

**Persistence:** After presenting the deliverable, invoke `/product-manager` incremental update to update relevant feature files with new component/interaction requirements. Add missing components as acceptance criteria on the feature files that need them.

### Interaction Specification

Define detailed interaction behavior for complex components:

```markdown
## Interaction Spec: [Component Name]

### Trigger
[What initiates this interaction]

### States
| State | Visual | Behavior | Transition |
|-------|--------|----------|------------|
| Default | [description] | [description] | — |
| Hover | [description] | [description] | [duration, easing] |
| Active | [description] | [description] | [duration, easing] |
| Focused | [description] | [description] | [duration, easing] |
| Disabled | [description] | [description] | — |
| Loading | [description] | [description] | [duration, easing] |

### Keyboard Interactions
| Key | Action |
|-----|--------|
| Enter/Space | [action] |
| Escape | [action] |
| Arrow keys | [action] |
| Tab | [action] |

### Edge Cases
- [What happens with very long content]
- [What happens with rapid repeated interactions]
- [What happens during network latency]
```

### Chart Type Guidance

See `references/chart-guidance.md` for chart type selection by data pattern (11 chart types with library recommendations). **ainative note:** The project uses custom SVG chart components (Sparkline, DonutRing, MiniBar) in `src/components/charts/` — prefer these over external libraries.

---

## Design System Management Mode

### Pre-Flight: Read Sources

Before any audit, read these files to establish the baseline:
- `design-system/MASTER.md` — current token values and surface hierarchy
- `design-system/tokens.json` — machine-readable tokens and forbidden pattern list
- `references/design-decisions.md` — decision history with rationale (DD-001 through DD-017)

### Drift Detection Protocol

Run these 8 checks in order against `src/` files (.tsx, .ts, .css). See `references/drift-checklist.md` for exact grep patterns and context-checking rules.

| # | Check | Severity | What to Grep |
|---|-------|----------|-------------|
| 1 | **Forbidden patterns** | CRITICAL | Every pattern from `tokens.json` → `forbidden.patterns[]` |
| 2 | **Semantic token compliance** | HIGH | Raw Tailwind status colors (`text-green-*`, `text-red-*`, etc.) |
| 3 | **Surface hierarchy compliance** | MEDIUM | Hardcoded backgrounds (`bg-white`, `bg-zinc-*`, `bg-slate-*`) |
| 4 | **Elevation consistency** | MEDIUM | Oversized shadows without elevation class, `backdrop-*` |
| 5 | **Spacing grid adherence** | LOW | Arbitrary spacing (`p-[Npx]` not on 4px grid) |
| 6 | **Radius compliance** | LOW | Oversized radii (`rounded-2xl`, `rounded-3xl` on containers) |
| 7 | **Font compliance** | LOW | Removed font refs (Geist), arbitrary `font-[...]` |
| 8 | **Component pattern compliance** | MEDIUM | Pages without PageShell, status without StatusChip |

Also run `npx tsx design-system/validate-tokens.ts` for automated forbidden pattern + font validation.

### Self-Healing Loop

After drift detection, classify each finding:

**Positive drift** (intentional evolution):
- New pattern appears in 3+ files and improves on existing convention
- No design-decisions.md entry forbids it
- **Action:** (1) Add new DD-NNN to `references/design-decisions.md` with rationale, (2) update `design-system/MASTER.md` if tokens/values changed, (3) update `design-system/tokens.json` if forbidden patterns need updating, (4) flag if SKILL.md itself needs a new check added

**Negative drift** (regression):
- Pattern violates an existing DD-NNN decision
- **Action:** (1) Report with file:line references and specific correction, (2) categorize severity per table above, (3) route to `/product-manager` for backlog

**Evolved patterns** (decision is outdated):
- Existing DD-NNN decision is outdated; codebase has intentionally moved on (confirmed by git history)
- **Action:** (1) Update the DD-NNN entry in `references/design-decisions.md` with new rationale, (2) update MASTER.md and tokens.json accordingly, (3) note the evolution in the audit report

### Drift Report Output Format

```markdown
## Design System Drift Report — [date]

### Scan Summary
- Files scanned: [N]
- Forbidden patterns: [N] CRITICAL
- Token violations: [N] HIGH
- Surface/elevation drift: [N] MEDIUM
- Spacing/radius/font drift: [N] LOW

### Findings

| # | Severity | Category | File:Line | Current | Expected | Fix |
|---|----------|----------|-----------|---------|----------|-----|
| 1 | CRITICAL | forbidden | [path:N] | [found] | [remove] | [action] |

### Self-Healing Actions Taken
- [x] Updated design-decisions.md: [what changed]
- [x] Updated MASTER.md: [what changed]
- [ ] Recommended code fix: [description]

### Positive Drift Detected
| Pattern | Occurrences | Recommendation |
|---------|-------------|----------------|
| [new pattern] | [N files] | Codify / Ignore |
```

**Persistence:** After presenting the drift report, invoke `/product-manager` incremental update to create or update `ideas/design-system-fixes.md` with remediation items. If drift severity is high (CRITICAL findings or multiple components affected), flag for `/product-manager` to create a dedicated feature file.

### Design System Persistence

`design-system/MASTER.md` is the single source of truth for token values and surface hierarchy. `references/design-decisions.md` is the decision history with rationale. `design-system/tokens.json` provides machine-readable tokens for automated validation.

**When to persist:**
- After a drift audit produces new design decisions or evolves existing ones
- After a UX Recommendation calibrates design metrics
- When the user explicitly requests "save these design decisions"

**Cross-session consistency:** On every run, check for existing data sources (see Project Context). If they exist, read them before making recommendations. Flag any conflicts between new recommendations and persisted decisions.

---

## Product-Design Bridge Mode

When feature specs exist (from `/product-manager`), enrich them with UX detail:

### Process

1. **Read feature spec** — Parse the feature file from `features/`
2. **Identify UX gaps** — What interaction details are missing from the spec?
3. **Propose additions** — UX-testable acceptance criteria, state specifications, interaction patterns
4. **Invoke `/product-manager` incremental update** — Use the `/product-manager` skill to persist UX enrichments directly into feature files, roadmap, and changelog. Do not merely format changes — actively invoke the skill to write them.

### Bridge Output Format

```markdown
## Design Bridge: [Feature Name]

### UX Acceptance Criteria (to add)
- [ ] [UX-testable criterion — describes user experience, not implementation]

### State Specifications (to add to Technical Approach)
- **[State]:** [What the user sees and can do]

### Interaction Patterns (to add to Technical Approach)
- **[Pattern]:** [Description and rationale]

### Design Dependencies
- [Components that need to exist or be modified]
- [Design tokens that need to be defined]
```

**Persistence:** This mode's output is already formatted for product-manager consumption. After presenting the bridge output, invoke `/product-manager` incremental update to write UX acceptance criteria, state specifications, and interaction patterns directly into the feature file, and update roadmap if design dependencies affect build order.

---

## Persist to Product Backlog

**Every frontend-designer mode must persist its findings.** After completing any mode and presenting output to the user, invoke `/product-manager` to capture recommendations in the product backlog. Recommendations that only exist in conversation are lost when the session ends.

### Persistence Routing Table

| Mode | Output Type | Product-Manager Action |
|------|-------------|----------------------|
| **Design Review** | Critical/Important issues on released features | Update `features/<name>.md` acceptance criteria with UX fixes; add changelog entry under "Design Review" |
| **Design Review** | Issues requiring new work | Create/append to `ideas/ux-improvements.md` |
| **UX Recommendation** | Strategy for a planned feature | Update `features/<name>.md` Technical Approach + Acceptance Criteria with UX specs; update roadmap if design dependencies change build order |
| **UX Recommendation** | Strategy for a new concept (no feature file) | Create new idea in `ideas/` then run `/product-manager` grooming |
| **Design Deliverable** | Component Inventory gaps | Add missing components as acceptance criteria on relevant feature files |
| **Design System Audit** | Drift issues | Create/update `ideas/design-system-fixes.md` with remediation items; if severity is high, flag for dedicated feature |
| **Product-Design Bridge** | UX enrichments | Invoke `/product-manager` incremental update directly (output is already formatted compatibly) |

### Invocation Pattern

After presenting mode output, run:
1. Determine which feature files or idea files are affected
2. Invoke `/product-manager` with the incremental update workflow
3. Confirm to the user which files were updated

---

## Pattern Library

See `references/pattern-library.md` for the full interaction pattern catalog (Data Display, Data Input, Navigation, Feedback) with ainative-specific component mappings (PageShell, DataTable, StatusChip, FilterBar, CommandPalette, FormSectionCard).

---

## Guidelines

- **Strategy before pixels** — Always define the UX rationale before recommending visual solutions
- **Persona-grounded** — Every recommendation ties back to who is using the interface and why
- **Measurable** — Prefer UX criteria that can be tested ("user can complete task in 3 clicks") over subjective opinions ("looks clean")
- **Skill boundaries** — Do not generate component code (that's `/frontend-design`). Do not enforce Tailwind rules (that's `/taste`). Do not write feature specs (that's `/product-manager`). Recommend, specify, and review.
- **Project-grounded** — Every audit checks against `design-system/MASTER.md`, `tokens.json`, and `references/design-decisions.md` — not generic heuristics. Read data sources before every mode run
- **Cross-reference** — When recommending design metric values, always reference the coordination table and explain the rationale
- **Incremental** — When adding UX detail to existing feature specs, use the product-manager's Incremental Update Workflow format
- **Persist, don't just present** — Every recommendation must flow into the product backlog. After completing any mode, invoke `/product-manager` incremental update to capture findings in feature files, roadmap, and changelog. Recommendations that only exist in conversation are lost
