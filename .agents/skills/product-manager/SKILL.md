---
name: product-manager
description: Transform raw product ideas into structured, implementable feature specs. Use this skill whenever the user mentions grooming features, creating a roadmap, extracting features from ideas, updating feature status, checking what to build next, prioritizing work, maintaining a changelog, or managing product backlog. Also triggers on "what should we build", "groom", "feature spec", "roadmap update", "mark feature as", "what's the status", "prioritize", or any request to turn ideas into actionable development tasks. If the user has an ideas/ directory and wants to organize it into buildable units, use this skill.
---

# Product Manager

Transform raw ideas into discrete, implementable feature files that each fit within a single Codex session.

## Core Principle

Every feature file must be **self-contained** — a developer (or Codex) should be able to pick up one feature file and implement it in 1-3 sessions without needing to read other feature files. Target 80-400 lines per feature file (~2-10K tokens), leaving ample room in the context window for the actual codebase.

## Relay planning authority

Relay uses one canonical live planning file: `_IDEAS/backlog.md`.

- Its header owns major workstreams, release trains, lane/status, current
  increment/current goal(s), dependencies, and next gates.
- Its body owns the exact full contracts for incomplete goals.
- `features/*.md` owns durable specifications and implementation plans.
- `features/changelog.md` and git own completed history.
- `features/roadmap.md` is a legacy historical feature/dependency catalog only.
  Never add live priority, workstream status, release trains, or incomplete goal
  state there.

In every workflow below, “roadmap” or “live plan” means the workstream/release
header plus goal queue in `_IDEAS/backlog.md`.

## Workflow Detection

Determine which mode to run based on the current state:

### 1. Initial Grooming
**Trigger:** `features/` directory is empty or doesn't exist.
Run the full extraction pipeline (see below).

### 2. Incremental Update
**Trigger:** Feature files already exist AND the user wants to add/modify/re-prioritize features.
Add new features, update statuses, adjust priorities, and log changes to the changelog.

### 3. Status Check
**Trigger:** The user asks what's done, what's next, or wants a progress report.
Read the canonical backlog and relevant feature files, then report current state and recommend what to build next based on workstream status, dependencies, and priorities.

### 4. Ship Verification
**Trigger:** A feature is about to be marked `completed`, or the user asks to verify/audit completed features.

Steps:
1. **Read the feature spec** — extract every Acceptance Criterion and Technical Approach item
2. **AC Verification** — For each acceptance criterion, verify the implementation exists:
   - Search for the component/route/API that satisfies the criterion
   - If found, mark as PASS
   - If missing or partial, mark as GAP with details
3. **Technical Approach Reconciliation** — Compare Technical Approach items against implementation:
   - Built — note as implemented
   - Not built — flag as either: needs implementation, OR should be marked "Deferred" in spec
4. **Frontmatter Sync** — Update feature spec `status:` to match verified implementation and changelog; confirm a completed goal is removed from `_IDEAS/backlog.md`
5. **Changelog Entry** — Create/verify changelog entry for the feature
6. **Report** — Present verification results:
   - AC pass/fail table
   - Technical approach gaps
   - Metadata consistency status
   - Recommendation: ship / fix gaps first

---

## Initial Grooming Workflow

Run these steps in order when starting from scratch.

### Step 1: Extract Knowledge from Ideas

Read all files in `ideas/*.md`. For each file, extract:
- **Concepts** — What product capabilities are described?
- **Decisions** — What technical or product choices have been made?
- **Scope boundaries** — What's explicitly in/out of scope?
- **Dependencies** — What must exist before other things can work?
- **User stories** — Who benefits and how?

Synthesize across all idea files — concepts often span multiple documents.

### Step 2: Identify Discrete Features

Break the extracted knowledge into features that are:
- **Implementable in 1-3 Codex sessions** — not too big, not trivially small
- **Independently testable** — has clear acceptance criteria you can verify
- **Shippable** — delivers user-visible value or unlocks other features
- **Clearly bounded** — explicit about what's included and what's not

Aim for the natural joints in the product — where would you draw the line between one PR and the next?

### Step 3: Write Feature Files

Create `features/<feature-name>.md` for each feature using the template below.

### Step 4: Create the Canonical Backlog

Write or update `_IDEAS/backlog.md` using the canonical backlog structure below,
ordering incomplete goals by workstream, release increment, dependency, and
priority. Do not create a second live roadmap.

### Step 5: Initialize the Changelog

Create `features/changelog.md` with the initial grooming entry.

### Step 6: Present Summary

Show the user:
- How many features were extracted
- The milestone breakdown (MVP vs post-MVP)
- The priority distribution (P0/P1/P2/P3)
- The recommended build order
- Any open questions or ambiguities found in the ideas

> After initial grooming, run `/doc-generator` to generate documentation and update README.md.

---

## Feature File Template

```markdown
---
title: Feature Title
status: planned
priority: P1
milestone: mvp
source: ideas/source-file.md
dependencies: []
---

# Feature Title

## Description

2-3 paragraph description of what this feature does and why it matters. Include enough context that someone unfamiliar with the broader product vision can understand the feature's purpose.

## User Story

As a [persona], I want to [action] so that [benefit].

## Technical Approach

Outline the implementation strategy:
- Key components to create or modify
- Data structures or APIs involved
- Integration points with other features
- Technology choices (reference decisions from idea docs)
- UX considerations (interaction patterns, state handling, accessibility requirements — flag for direct UX/design-system review if complex)

## Acceptance Criteria

- [ ] Criterion 1 — specific, testable condition
- [ ] Criterion 2 — specific, testable condition
- [ ] Criterion 3 — specific, testable condition

## Scope Boundaries

**Included:**
- What this feature covers

**Excluded:**
- What this feature explicitly does NOT cover (even if related)

## References

- Source: `ideas/source-file.md` — section or concept referenced
- Related features: list any features this depends on or enables
```

### Frontmatter Fields

| Field | Values | Purpose |
|-------|--------|---------|
| `title` | Descriptive name | Human-readable feature name |
| `status` | `planned` · `in-progress` · `completed` · `deferred` | Current state |
| `priority` | `P0` · `P1` · `P2` · `P3` | Implementation urgency |
| `milestone` | `mvp` · `post-mvp` | Release target |
| `source` | `ideas/<file>.md` | Traceability to original idea |
| `dependencies` | `[feature-name, ...]` | Features that must exist first |

---

## Priority Definitions

- **P0 — Must have**: Blocking. The product doesn't function without this. Build first.
- **P1 — Should have**: Core value. The product is significantly weaker without this. Build in MVP.
- **P2 — Nice to have**: Enhances the product but not essential for launch. MVP if time allows.
- **P3 — Future**: Good idea, not for now. Post-MVP or revisit later.

---

## Canonical Backlog Structure

`_IDEAS/backlog.md` is both the live portfolio and exact incomplete goal queue:

```markdown
# Product Goal Backlog

## Operating contract

- Pick the highest ready goal whose dependencies and gates are satisfied.
- Completed goals leave this file after their changelog receipt is written.

## Major workstreams and release trains

### Portfolio view

| Workstream | Lane | Status | Current increment | Current goal(s) | Next gate | Authority |
|---|---|---|---|---|---|---|
| Workstream A | primary | ready | R0 | G-001 | decision | `features/workstream-a.md` |

### Workstream A release train

| Increment | Status | Owned goals/dependencies | Customer value | Entry criteria | Exit/release gate |
|---|---|---|---|---|---|
| R0 | ready | G-001 → G-002 | bounded value | entry | executable exit |

## P1

### G-001 — Goal title

- **State:** ready
- **Outcome:** ...
- **Constraints:** ...
- **Verification:** ...
- **Operator gate:** none before completion
```

Every goal has one owning workstream or is standalone. Workstream/increment
status is updated in the same change as a goal start, block, resume, completion,
or closure. The header summarizes; the full goal block later in the same file is
the executable contract.

---

## Changelog Structure

`features/changelog.md` captures product-level decisions — the "why" behind changes that git log doesn't capture.

```markdown
# Feature Changelog

## YYYY-MM-DD

### Groomed
- Extracted N features from ideas/ backlog
- Created the initial canonical backlog with N workstreams/standalone goals

### Started
- `feature-name` — moved to in-progress

### Completed
- `feature-name` — all acceptance criteria met

### Re-prioritized
- `feature-name` — P2 → P1, reason: [why]

### Deferred
- `feature-name` — reason: [why]
```

Only include categories that have entries for a given date.

---

## Incremental Update Workflow

When features already exist and the user requests changes:

1. **Read current state** — read `_IDEAS/backlog.md`, then scan relevant `features/*.md` frontmatter and changelog history
2. **Apply the requested change** — update feature file(s), canonical backlog header/goal blocks, and changelog
3. **Check consistency** — ensure workstream ownership, increment status, goal state, feature frontmatter, and changelog agree
4. **Report what changed** — summarize the updates made

Common operations:
- **Status change**: Update the feature's `status` field, canonical backlog goal/workstream status, and changelog entry
- **New feature**: Create feature file from template, add its Goal Contract to the correct backlog workstream/increment or mark it standalone, log the grooming decision
- **Re-prioritize**: Update priority and workstream lane/order in the backlog, then log the reason
- **Defer**: Set status to `deferred`, note reason in changelog

---

## Collaborating with Frontend Designer

UX strategy and design orchestration should be handled by direct review against repo docs until new Relay frontend skills exist. Coordinate at these touchpoints:

- **During grooming:** Flag features that need UX design input — any feature with complex user interactions, multiple states, or novel UI patterns should be tagged for UX/design-system review before implementation begins
- **During spec review:** Accept design-driven spec changes (additional UX acceptance criteria, state specifications, interaction patterns) via the Incremental Update Workflow.
- **During status checks:** Note features with pending UX design vs. features ready for implementation. A feature with unresolved UX questions should not be recommended as "next to build."

---

## README Generation

README.md is maintained by the `/doc-generator` skill as part of its documentation pipeline. When docs are regenerated, README is automatically updated to reflect the latest feature state, architecture, and roadmap. To update README independently, run `/doc-generator` with "update readme" trigger.

---

## Guidelines

- **Naming**: Use `kebab-case` for feature filenames (e.g., `user-authentication.md`, `cli-task-runner.md`)
- **Sizing**: If a feature file exceeds 400 lines, it's probably two features — split it. If under 80 lines, it might be too granular — consider merging with a related feature.
- **Source traceability**: Every feature must reference its source idea doc(s). This enables auditing what ideas have been covered.
- **Incremental safety**: Never delete or overwrite existing feature files without confirmation. Append changelog entries, don't replace them.
- **Canonical consistency**: `_IDEAS/backlog.md` is the sole live queue. Feature frontmatter and changelog must agree with it; `features/roadmap.md` must not receive live status updates.
- **Ship gate**: Never mark a feature `completed` without running Ship Verification mode first. This ensures AC traceability, frontmatter sync, and changelog entry.
