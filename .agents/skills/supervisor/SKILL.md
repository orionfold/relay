---
name: supervisor
description: Meta-orchestrator that reads project state holistically to recommend what to work on next. Use this skill when the user asks "what should I work on next", "project health", "status overview", "plan a sprint", "are we on track", "vision check", "retro", "lessons learned", "what's the priority", or any question about overall project direction, velocity, or process improvement. Do NOT use for writing feature specs (use product-manager), building components directly, running tests (use quality-manager), or UX review.
---

# Supervisor

Meta-orchestrator that reads project artifacts holistically to answer: **"What should I work on next?"** Each skill knows *how* to do its job — the supervisor decides *what* to do by scanning the canonical backlog, changelog, feature specs, ideas, design system, and git history, then recommending prioritized actions with specific skill delegations.

## Role Boundaries

| Need | Skill | Not This Skill |
|------|-------|----------------|
| "What should I work on next?" | `supervisor` | `product-manager` |
| "How's the project doing?" | `supervisor` | — |
| "Plan next sprint" | `supervisor` | — |
| "Are we on track with the vision?" | `supervisor` | — |
| "Run a retro" | `supervisor` | — |
| "Write a feature spec for X" | `product-manager` | `supervisor` |
| "What features are planned?" | `product-manager` | `supervisor` |
| "Run tests" | `quality-manager` | `supervisor` |
| "Review the UX" | Direct UX/design-system review | `supervisor` |
| "Build a component" | Direct implementation using `AGENTS.md` + design-system docs | `supervisor` |

## Core Principle

**Read-then-delegate.** The supervisor reads artifacts for signals and produces recommendations. It never writes feature specs, tests, components, or design docs — it tells you which skill to invoke and why. The only artifact it writes is `features/supervisor-report.md`.

## Relay planning authority

`_IDEAS/backlog.md` is Relay's sole live portfolio and goal queue. Its header
owns workstreams, release trains, lane/status, current increment/current goal(s),
dependencies, and next gates; its body owns exact incomplete Goal Contracts.

`features/roadmap.md` is a historical feature/dependency catalog only. Never use
it to choose current work, infer live status, or write workstream/release state.
`features/supervisor-report.md` is a disposable generated snapshot derived from
the canonical backlog, not an authority that goal completion must synchronize.

---

## Workflow Detection

Determine which mode to run based on user intent:

### 1. Health Check
**Trigger:** "project health", "status overview", "how are we doing", "project status"
Produce a 7-dimension health dashboard.

### 2. Next Steps
**Trigger:** "what should I do next", "what's the priority", "what should I work on", "next task"
Single prioritized recommendation with rationale + skill delegation.

### 3. Sprint Planning
**Trigger:** "plan a sprint", "plan next sprint", "sprint plan", "what goes in the next sprint"
Feature grouping with sequencing, skill assignments, pre-sprint checklist.

### 4. Vision Alignment
**Trigger:** "are we on track", "vision check", "alignment check", "are we building the right thing"
Trajectory vs. original vision comparison.

### 5. Retrospective
**Trigger:** "retro", "retrospective", "lessons learned", "what went well", "what can we improve"
Velocity trends, skill utilization, process recommendations.

---

## Data Sources

All modes read from the same artifact set. Read only what's needed for the active mode.

| Source | What to Extract | Used By |
|--------|----------------|---------|
| `_IDEAS/backlog.md` | Canonical workstreams, release trains, live goal status/order, dependencies and gates | All modes |
| `features/roadmap.md` | Historical feature/milestone/dependency catalog only | Vision, Retro |
| `features/changelog.md` | Completion dates, velocity signals, decision history | Health, Retro, Sprint |
| `features/*.md` frontmatter | Status distribution, deferred items, unverified completions | Health, Next Steps, Sprint |
| `ideas/*.md` | Pipeline depth — how many ungroomed ideas remain | Health, Sprint |
| `AGENTS.md` | Tech stack, architecture decisions, conventions | Vision |
| `design-system/MASTER.md` | Design token inventory, forbidden patterns | Health (design dimension) |
| `FLOW.md` | Lifecycle phases, skill coordination patterns | Retro, Vision |
| `git log --oneline -20` | Recent velocity, commit frequency, active areas | Health, Retro |
| `MEMORY.md` | Lessons learned, known issues, project state | Retro, Vision |
| `.Codex/skills/architect/references/tdr-*.md` | TDR status, staleness, pattern compliance | Health, Vision |
| `book/chapters/*.md` | Chapter freshness, case study coverage, API example currency | Health, Next Steps |
| `ai-native-notes/*.md` | Case study source material for book chapters | Health |

---

## Health Check Mode

Produce a 7-dimension health dashboard with green/yellow/red signals.

### Dimensions

| Dimension | Green | Yellow | Red |
|-----------|-------|--------|-----|
| **Velocity** | 2+ features completed in last 2 sprints | 1 feature completed | 0 features completed recently |
| **Pipeline** | 3+ groomed features in `planned` status | 1-2 planned features | 0 planned features (starvation) |
| **Ideas** | 3+ unprocessed ideas in `ideas/` | 1-2 ideas | 0 ideas (dry pipeline) |
| **Quality Debt** | All completed features have passing tests | Some features lack test coverage | Multiple features shipped without tests |
| **Design Consistency** | Design system tokens used consistently, no forbidden patterns | Minor inconsistencies | Hardcoded colors, missing tokens, forbidden patterns |
| **Documentation** | README, changelog, canonical backlog current AND all features have journey coverage | 1 artifact stale OR <5 features missing journey coverage | Multiple artifacts stale OR >5 features missing journey coverage OR entire feature family missing from journeys |
| **Book Health** | All 12 chapters have ≥2 case study callouts AND "Building with ainative" examples AND none stale | Some chapters missing case studies or API examples OR 1-2 chapters stale | Multiple chapters stale OR missing case study integration OR no roadmap section |
| **Asset Corpus Sync** | `_ASSETS/flow/asset-flow-report.json` says `fullyVerified: true` and the screenshot/docs stages pass | Validators pass but prerequisites are skipped, or one tracker is dirty | Any executed validator fails, provenance is ambiguous, or required outputs are missing |

### Process

1. **Read artifacts** — canonical backlog, changelog, recent feature specs, git log
2. **Score each dimension** — classify as green/yellow/red based on criteria above
3. **Identify top concern** — the dimension most urgently needing attention
4. **Recommend action** — specific skill invocation to address the top concern
5. **Write report** — output to `features/supervisor-report.md`
6. **Read asset coverage data** — inspect `_ASSETS/journeys/coverage-matrix.md`, `_ASSETS/screenshots/metadata/manifest.json`, `_ASSETS/docs/guide-tracker.json`, and the latest `_ASSETS/flow/asset-flow-report.json`. Treat skipped validators as incomplete evidence, not green.

### Health Check Output

```markdown
## Project Health Check — [date]

### Dashboard

| Dimension | Status | Signal |
|-----------|--------|--------|
| Velocity | [green/yellow/red] | [evidence] |
| Pipeline | [green/yellow/red] | [evidence] |
| Ideas | [green/yellow/red] | [evidence] |
| Quality Debt | [green/yellow/red] | [evidence] |
| Design Consistency | [green/yellow/red] | [evidence] |
| Documentation | [green/yellow/red] | [evidence] |
| User Guide Sync | [green/yellow/red] | [evidence] |

### Top Concern
[Dimension] is [status] because [evidence]. Recommend: invoke `/[skill]` to [action].

### Secondary Concerns
- [Dimension]: [brief recommendation]
```

---

## Next Steps Mode

The most common mode — answer "What should I work on next?" with a single, prioritized recommendation.

### Priority Algorithm

Evaluate in strict order. The first category with actionable items wins:

1. **Blockers** — Features marked `in-progress` with failing tests, broken builds, or unresolved human-in-the-loop notifications
2. **Unverified completions** — Features marked `completed` that haven't been through Ship Verification (`/product-manager` ship verify mode)
3. **High-leverage unblocks** — `planned` features that, when completed, unblock 2+ other features (check dependency graph)
4. **Phase advancement** — The next feature in the current sprint/milestone that's `planned` and has all dependencies met
5. **Pipeline replenishment** — If fewer than 3 features are `planned`, groom new features from `ideas/` via `/product-manager`
6. **Quality debt** — Features lacking test coverage, stale documentation, design system violations
7. **Documentation** — README needs updating, changelog is behind, reference library gaps
8. **Reference library** — Tech stack docs not captured via `/capture`

### Process

1. **Read canonical backlog** — scan workstream status, current increments/goals, live goal states and dependencies
2. **Walk the priority algorithm** — evaluate each category in order
3. **Select the top recommendation** — the first actionable item found
4. **Formulate delegation** — which skill to invoke, with what arguments
5. **Write report** — output to `features/supervisor-report.md`

### Next Steps Output

```markdown
## Next Steps — [date]

### Recommendation
**Do this:** [specific action]
**Why:** [rationale citing artifacts — e.g., "3 features depend on this", "completed but unverified"]
**Invoke:** `/[skill]` [with arguments if applicable]
**Priority category:** [which algorithm level triggered this]

### Context
- Features in-progress: [list]
- Features planned (ready): [list with met dependencies]
- Pipeline depth: [N groomed features, M raw ideas]

### If You Have More Time
1. [Second priority action] — `/[skill]`
2. [Third priority action] — `/[skill]`
```

---

## Sprint Planning Mode

Group features into a coherent sprint with sequencing and skill assignments.

### Process

1. **Read canonical backlog and changelog** — understand current workstreams, live goals, release increments and recent velocity
2. **Estimate sprint capacity** — based on recent velocity (features completed per sprint)
3. **Select features** — pick features that:
   - Have all dependencies met
   - Fit within estimated capacity
   - Maximize value delivery (prioritize unblocking features)
4. **Sequence features** — order by dependency, then by skill efficiency (batch similar work)
5. **Assign skills** — map each feature to its lifecycle phase and primary skill
6. **Create pre-sprint checklist** — things to verify before starting
7. **Write report** — output to `features/supervisor-report.md`

### Sprint Planning Output

```markdown
## Sprint Plan — [sprint name/number] — [date]

### Sprint Goal
[1-2 sentence theme for this sprint]

### Capacity
Based on recent velocity: ~[N] features per sprint

### Features

| Order | Feature | Phase | Primary Skill | Dependencies Met |
|-------|---------|-------|---------------|-----------------|
| 1 | [name] | [Build/Design/etc.] | `/[skill]` | yes |
| 2 | [name] | [Build/Design/etc.] | `/[skill]` | yes (after #1) |

### Skill Sequence
Recommended order of skill invocations:
1. `/[skill]` — [feature] — [rationale for ordering]
2. `/[skill]` — [feature] — [rationale]

### Pre-Sprint Checklist
- [ ] All dependencies for sprint features are actually `completed` (not just marked)
- [ ] No unresolved blockers from previous sprint
- [ ] `ideas/` pipeline has enough depth for next sprint planning
- [ ] Design system is current (no pending token updates)

### Risks
- [Risk]: [mitigation]
```

---

## Vision Alignment Mode

Compare current trajectory against original product vision.

### Process

1. **Read vision sources** — `ideas/*.md` (original vision), `AGENTS.md` (architecture decisions), `MEMORY.md` (project state), and the historical feature catalog when useful
2. **Read current state** — canonical backlog, changelog, completed feature specs
3. **Compare trajectory** — are we building what was originally envisioned? Have we drifted?
4. **Check tech stack** — use `/refer` if reference docs are captured to verify we're using libraries as intended
5. **Identify drift** — features built that weren't in the original vision, vision items not yet addressed
6. **Assess** — is drift intentional (scope evolved) or accidental (lost focus)?
7. **Write report** — output to `features/supervisor-report.md`

### Vision Alignment Output

```markdown
## Vision Alignment Check — [date]

### Original Vision
[Summary of core product vision from ideas/]

### Current State
- Completed: [N] features across [milestones]
- In-progress: [N] features
- Deferred: [N] features

### Alignment Assessment
| Vision Element | Status | Notes |
|---------------|--------|-------|
| [core capability] | Built / In Progress / Not Started / Drifted | [details] |

### Intentional Evolution
[Features or directions that weren't in original vision but add value]

### Drift Concerns
[Areas where focus may have shifted away from core vision without deliberate decision]

### Tech Stack Check
| Technology | Intended Use | Actual Use | Status |
|-----------|-------------|------------|--------|
| [tech] | [what it was chosen for] | [how it's being used] | Aligned / Drifted |

### Recommendations
- [Action to realign, if needed]
```

---

## Retrospective Mode

Analyze recent work for process improvements using git-derived metrics.

### Time Windows

Default: 7 days. User can request: `24h`, `7d` (default), `14d`, `30d`.

### Process

1. **Read changelog** — extract completion dates, feature timelines
2. **Run git log analysis** — commit frequency, active areas, patterns (see Metrics below)
3. **Read MEMORY.md** — lessons learned, known issues
4. **Compute all metrics** — categorization, sessions, streaks, focus, hotspots, fix-chains
5. **Analyze velocity** — features per sprint trend (improving, steady, declining)
6. **Analyze skill utilization** — which skills are used most/least, any underutilized
7. **Detect contributor mode** — if `git log --format='%ae' | sort -u | wc -l` > 1, include per-contributor breakdown; otherwise solo-developer focus (no per-contributor noise)
8. **Identify process friction** — recurring issues from lessons learned, common failure patterns
9. **Recommend improvements** — specific process changes, skill adjustments, lifecycle tweaks
10. **Write report** — output to `features/supervisor-report.md`
11. **Save metrics snapshot** — output JSON to `features/retros/[YYYY-MM-DD].json` for trend tracking

### Metrics

Compute the following from `git log` within the time window:

| Metric | How to Compute | What It Reveals |
|--------|---------------|-----------------|
| **Commit categorization** | Parse conventional commit prefixes (feat/fix/refactor/test/chore/docs). Commits without prefix: infer from changed files | Build vs. maintain ratio |
| **Session detection** | Group commits by 45-min gap heuristic → classify: deep (>2h), medium (30min-2h), micro (<30min) | Work pattern health |
| **Shipping streak** | Count consecutive calendar days with at least 1 commit | Momentum signal |
| **Focus score** | % of commits touching files in the primary directory (highest commit count dir) | Scope discipline |
| **Hotspot files** | Top 5 files by churn (number of commits touching them) in period | Complexity magnets |
| **Fix-chain detection** | Count fix commits that follow a feat commit within 24h on same files | Quality signal — high fix-chains suggest insufficient testing |
| **Commit size distribution** | Bucket commits by lines changed: small (<50), medium (50-200), large (>200) | Bisectability signal |

### Git Commands for Metrics

```bash
# Commits in time window (replace N with days)
git log --since="N days ago" --format="%H|%ae|%aI|%s" --no-merges

# Files changed per commit
git log --since="N days ago" --format="%H" --no-merges | while read h; do echo "$h $(git diff-tree --no-commit-id --name-only -r $h | wc -l)"; done

# Lines changed per commit
git log --since="N days ago" --format="%H" --no-merges --numstat

# Hotspot files
git log --since="N days ago" --format="" --name-only --no-merges | sort | uniq -c | sort -rn | head -5
```

### Metrics Snapshot (JSON)

Save to `features/retros/[YYYY-MM-DD].json`:

```json
{
  "date": "2026-03-14",
  "period_days": 7,
  "commits": 23,
  "categories": {
    "feat": 8,
    "fix": 5,
    "refactor": 4,
    "test": 3,
    "chore": 2,
    "docs": 1
  },
  "shipping_streak": 5,
  "focus_score": 0.72,
  "hotspots": [
    "src/lib/agents/Codex-agent.ts",
    "src/app/globals.css"
  ],
  "sessions": {
    "deep": 3,
    "medium": 5,
    "micro": 8
  },
  "fix_chains": 2,
  "commit_sizes": {
    "small": 15,
    "medium": 6,
    "large": 2
  },
  "contributors": 1
}
```

Create the `features/retros/` directory if it doesn't exist. Each retro overwrites the report but **appends** a new JSON snapshot (one per date).

### Retrospective Output

```markdown
## Retrospective — [date range]

### Metrics Dashboard

| Metric | Value | Signal |
|--------|-------|--------|
| Commits | [N] | — |
| Shipping streak | [N] days | [strong/moderate/cold] |
| Focus score | [0.XX] | [focused/scattered] |
| Fix-chain count | [N] | [healthy/concerning] |
| Deep sessions | [N] of [total] | [good/needs more focus time] |

### Commit Breakdown
| Category | Count | % |
|----------|-------|---|
| feat | [N] | [%] |
| fix | [N] | [%] |
| refactor | [N] | [%] |
| test | [N] | [%] |
| chore | [N] | [%] |
| docs | [N] | [%] |

### Hotspot Files
| File | Commits | Notes |
|------|---------|-------|
| [path] | [N] | [complexity magnet / active feature / stabilizing] |

### Commit Size Distribution
| Size | Count | % |
|------|-------|---|
| Small (<50 lines) | [N] | [%] |
| Medium (50-200) | [N] | [%] |
| Large (>200) | [N] | [%] |

### Velocity
| Sprint | Features Completed | Key Deliverables |
|--------|-------------------|-----------------|
| [N] | [count] | [feature list] |

**Trend:** [improving / steady / declining]

### What Went Well
- [Positive pattern with evidence]

### What Could Improve
- [Issue with evidence and recommended fix]

### Skill Utilization
| Skill | Usage Frequency | Notes |
|-------|----------------|-------|
| `/product-manager` | [high/medium/low] | [observations] |
| `/quality-manager` | [high/medium/low] | [observations] |
| Direct frontend implementation | [high/medium/low] | [observations] |
| [other skills...] | | |

### Lessons Learned (from MEMORY.md)
- [Key lessons with recurrence patterns]

### Process Recommendations
1. [Specific, actionable improvement]
2. [Specific, actionable improvement]
```

---

## Report Writing

All modes write their output to `features/supervisor-report.md`. This file is **overwritten** on each run (not appended) — it always reflects the most recent analysis.

The report file uses this wrapper:

```markdown
---
generated: [ISO date]
mode: [health-check | next-steps | sprint-planning | vision-alignment | retrospective]
---

# Supervisor Report

[Mode-specific output from above]

---

*Generated by `/supervisor` — [mode name] mode*
```

---

## Coordination with Other Skills

### Delegations (supervisor recommends, other skills execute)

| Situation | Supervisor Says | Skill Invoked |
|-----------|----------------|---------------|
| Pipeline is dry | "Groom new features from ideas/" | `/product-manager` |
| Feature completed but unverified | "Run ship verification" | `/product-manager` (ship verify) |
| Quality debt detected | "Run coverage report and write tests" | `/quality-manager` |
| Design inconsistencies found | "Audit against AGENTS.md, design-system/MASTER.md, and globals.css" | Direct implementation/review |
| UX gaps in feature specs | "Add interaction specs" | Direct UX/design-system review |
| Ready to build next feature | "Build [feature] using Relay design-system guidance" | Direct implementation |
| Reference docs missing | "Capture docs for [library]" | `/capture` |
| Need to check library usage | "Look up [API] usage" | `/refer` |
| Screenshots captured but docs/user guide not synced | "Sync user guide with latest screengrabs" | `/user-guide-sync` |
| Docs regenerated but user guide images stale | "Sync user guide images and validate references" | `/user-guide-sync` |
| Journey coverage gaps detected | "Regenerate journeys to cover N missing features" | `/doc-generator` (reads `.coverage-gaps.json`) |
| Architecture drift detected | "Run architecture review for pattern compliance" | `/architect` (review) |
| Major feature touches 2+ layers | "Run impact analysis before building" | `/architect` (impact) |
| New integration proposed | "Design integration before implementing" | `/architect` (integration) |
| Informal technical decision made | "Document as TDR" | `/architect` (tdr) |
| Pattern drift in health check | "Run drift detection to identify codify/remediate items" | `/architect` (drift) |

### What Supervisor Does NOT Do

- Write or modify feature specs (that's `/product-manager`)
- Create or run tests (that's `/quality-manager`)
- Build components or pages (direct implementation using `AGENTS.md`, `design-system/MASTER.md`, and `src/app/globals.css`)
- Review UX or design (direct review against repo docs until new Relay frontend skills exist)
- Create or modify skills (that's `/skill-creator`)
- Sync screenshots or fix documentation references (that's `/user-guide-sync`)
- Assess architectural blast radius or pattern drift (that's `/architect`)
- Write code of any kind

---

## Guidelines

- **Evidence over opinion** — every recommendation must cite a specific artifact (canonical backlog entry, changelog gap, feature spec, idea file, git commit). Never recommend based on general best practices alone.
- **One clear recommendation** — in Next Steps mode, give exactly one top recommendation. Decision fatigue is the enemy of productivity. Secondary options go in the "If You Have More Time" section.
- **Respect the lifecycle** — recommendations should follow the FLOW.md lifecycle phases. Don't suggest building before specifying, or shipping before verifying.
- **Calibrate to velocity** — sprint plans should reflect actual recent velocity, not aspirational targets. If the team completes 2 features per sprint, plan for 2-3, not 5.
- **Don't duplicate skill work** — the supervisor reads and recommends. When it detects a need, it names the skill to invoke — it doesn't try to do that skill's job inline.
- **Overwrite, don't append** — `features/supervisor-report.md` is always fresh and non-authoritative. Live state remains only in `_IDEAS/backlog.md`; historical data lives in changelog and git history.
- **Be honest about gaps** — if a dimension is red, say so clearly. Sugarcoating project health defeats the purpose of the supervisor.

---

## Inter-Skill Dependency Chains

Some skills produce artifacts consumed by other skills. When the supervisor detects staleness in any link of these chains, it should recommend running the downstream skill(s).

### Product Asset Pipeline

```
_ASSETS/features-catalog.md → journeys/ → seed/ → screenshots/ → docs/ → demo/
              ↑                                                       │
              └────────── assets-flow fails closed on drift ──────────┘
```

- `assets-capture` produces `_ASSETS/screenshots/{light,dark}/**` plus the metadata manifest from the live seeded product.
- `assets-narrative` updates only `_ASSETS/docs/guides/*.md` units marked dirty by `guide-tracker.json` and runs the docs verifier.
- `assets-demo` captures real Relay structure; `npm run demo:refresh` verifies the seed-structure fingerprint, derives fixtures, rebuilds, and behaviorally verifies the demo.
- `assets-flow` executes the whole corpus gate. Only `fullyVerified: true` is green; skipped prerequisites are amber.
- **Coverage signal:** reconcile `_ASSETS/journeys/coverage-matrix.md`, screenshot targets/manifest, and docs guide tracker.
- The tracked `public/readme/` images are README presentation assets, not the authoring source and not a sync timestamp.

### Freshness Checks (Health Check mode)

Add a 7th dimension to the Health Check:

| Dimension | Green | Yellow | Red |
|-----------|-------|--------|-----|
| **Asset Corpus Sync** | Latest flow report is fully verified and screenshot/docs trackers are clean | Flow is amber or a tracker is dirty | Flow is red, provenance is wrong, or references are broken |

Read these authoritative records:
- `_ASSETS/flow/asset-flow-report.json`
- `_ASSETS/screenshots/metadata/latest-run.json`
- `_ASSETS/screenshots/metadata/manifest.json`
- `_ASSETS/docs/guide-sync-report.json`
- `_ASSETS/docs/guide-tracker.json`
