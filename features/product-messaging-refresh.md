---
title: Product Messaging Refresh
status: completed
priority: P0
milestone: post-mvp
source: ideas/vision/machine-builds-machine-claude-ext-rsrch.md
dependencies: []
---

# Product Messaging Refresh

## Description

Reposition all in-repo product messaging from "Governed AI Agent Workspace" to "AI Business Operating System" targeting solo founders and micro-teams. This covers README, package metadata, CLI help text, in-app welcome copy, documentation index, user journey guides, feature reference docs, and new problem statement / use case documents.

The repositioning does not change the product's technical capabilities — it reframes existing 74+ features around business outcomes rather than governance primitives. The current positioning ("govern your AI agents, operate with oversight") speaks to developers managing agent infrastructure. The new positioning ("run your entire business with AI agents") speaks to solo founders building AI-native businesses.

Website updates (orionfold.com/relay) are explicitly out of scope. This spec covers only in-repo artifacts that ship with `npx ainative` or live on GitHub.

## User Story

As a solo founder evaluating ainative, I want the README and in-app experience to immediately communicate that this is a platform for running my business with AI agents, so that I understand the value without having to decode developer governance terminology.

## Technical Approach

### Phase 1 — Anchor Points (5 files)

These establish the canonical new voice. All other updates reference this vocabulary.

**1. `README.md`**
- Hero blockquote (line 3): Replace "Governed AI Agent Workspace — Supervised Local Execution, Workflows, Documents, and Provider Runtimes" with business-outcome positioning
- "Why ainative" section (lines 29-38): Rewrite to lead with the problem ("The AI agent stack is broken") and position governance as the solution, not the identity
- Feature Highlights table (lines 48+): Add business-outcome framing column or regroup entries by function (Operations, Intelligence, Governance, Content)
- Add badges: "AI Business Operating System" and "74+ Features Shipped"
- Keep: Feature deep-dive body text (technically accurate), API endpoints table, Tech stack, Development section

**2. `package.json`**
- `description` field: Align with new positioning
- `keywords` array: Add "business", "operating-system", "orchestration", "ai-business", "solo-founder"

**3. `bin/cli.ts`**
- Line 59: Update Commander `.description()` string to match new positioning

**4. `docs/index.md`**
- Opening paragraph (line 9): Rewrite from "governed AI agent workspace" to AI Business OS framing
- User Journeys table descriptions: Consider business-outcome language for persona summaries

**5. `src/components/dashboard/welcome-landing.tsx`**
- Subtitle (line 34): Rewrite "The governed AI agent operations workspace" to business-outcome framing
- Three pillars (lines 5-21): Reframe from governance-technical ("Governed Execution", "Reusable Automation", "Cost & Visibility") to business-outcome pillars

### Phase 2 — Docs Alignment (7 files)

For each file: rewrite opening 1-3 paragraphs to use new vocabulary. Leave procedural content (step-by-step instructions, screenshots) unchanged.

1. `docs/getting-started.md` — "governed agent task" reframing in intro
2. `docs/features/home-workspace.md` — 14 occurrences of old framing; intro paragraph rewrite
3. `docs/journeys/personal-use.md` — Persona intro reframe (Alex)
4. `docs/journeys/work-use.md` — Persona intro reframe (Jordan)
5. `docs/journeys/power-user.md` — Intro paragraph
6. `docs/journeys/developer.md` — Intro paragraph
7. `docs/manifest.json` — Review section titles (likely no changes since they describe UI routes)

### Phase 3 — New Documents (3 files)

**1. `docs/why-ainative.md`** (500-800 words)
- The broken AI agent stack problem
- Five gaps: orchestration, strategy-to-execution, lifecycle, trust/governance, distribution
- How ainative solves it (AI Business OS positioning)
- Market validation signals (solo founder stats, failure rates, analyst projections)
- Link to getting-started.md

**2. `docs/use-cases/solo-founder.md`**
- Maps ainative features to solo founder business operations
- Projects = business units, Workflows = business processes, Profiles = AI team members
- Schedules = recurring operations, Cost dashboard = business spend control
- Example scenarios: content marketing pipeline, lead research, customer support triage

**3. `docs/use-cases/agency-operator.md`**
- Maps to AI agency deploying automations for clients
- Multi-project management for client portfolios
- Profile customization per client vertical
- Workflow blueprints as repeatable service packages

After creation, update `docs/index.md` to link new docs and `docs/manifest.json` to include them in playbook navigation.

### What NOT to Change

- Book chapter body text — generated content; regenerate via document-writer agent if messaging alignment needed later
- AGENTS.md — stable agent instructions, not product messaging
- MEMORY.md, CLAUDE.md, FLOW.md — operational files
- Feature specs in `features/` — gitignored planning artifacts
- Source code comments — technically accurate, not positioning
- Architecture diagram (`public/readme/architecture.svg`) — technical artifact
- Screenshots — show actual product; update only if UI itself changes

### Messaging Tension to Resolve

The product today IS a governed agent workspace. It does not yet have marketing/sales/finance agent profiles (those ship with `business-function-profiles`). The new positioning is aspirational but grounded:
- Frame existing features in outcome language ("Profiles define your AI team")
- Keep feature descriptions accurate about what they actually do today
- Use "AI Business Operating System" as the identity, not as a feature claim
- The Autonomy x Governance competitive positioning matrix is genuinely compelling — keep it

## Acceptance Criteria

- [ ] README hero communicates "AI Business Operating System" positioning within first 3 lines
- [ ] "Why ainative" section leads with problem statement, not feature list
- [ ] package.json description and keywords reflect new positioning
- [ ] CLI help text (`npx ainative --help`) shows updated description
- [ ] In-app welcome landing pillars reframed as business outcomes
- [ ] docs/index.md opening paragraph uses new vocabulary
- [ ] All 4 journey guide intros updated with business-outcome framing
- [ ] docs/why-ainative.md exists with problem statement and five gaps
- [ ] docs/use-cases/ directory exists with solo-founder.md and agency-operator.md
- [ ] docs/manifest.json updated to include new documents in playbook navigation
- [ ] No "Governed AI Agent Workspace" phrasing remains in anchor point files (Phase 1)
- [ ] Feature deep-dive body text and API docs remain technically accurate (not over-repositioned)

## Scope Boundaries

**Included:**
- All in-repo product messaging (README, docs, playbook content, CLI help, in-app welcome)
- New problem statement and use case documents
- Package metadata (description, keywords)

**Excluded:**
- Website (orionfold.com/relay) updates — separate initiative
- Book chapter body text — regenerate via document-writer later
- UI component changes beyond welcome-landing.tsx copy
- New features or code capabilities — messaging only
- Pricing, signup, or conversion funnel content — product doesn't have these yet

## References

- Source: `ideas/vision/machine-builds-machine-claude-ext-rsrch.md` — Sections 6 (website revision), 7 (feature revision), 4 (JTBD)
- Related features: business-function-profiles (creates the profiles that make new messaging concrete)
