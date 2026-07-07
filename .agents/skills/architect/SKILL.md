---
name: architect
description: Technical architecture advisor that maintains Technical Decision Records (TDRs) and advises on system design, integration patterns, architectural changes, and drift detection. Use this skill when the user asks about architecture review, system design, blast radius analysis, integration design, technical decisions, pattern consistency, coupling analysis, technical debt assessment, TDR management, architecture drift, or pattern drift. Also triggers on "architecture review", "blast radius", "impact analysis", "integration design", "TDR", "technical decision", "pattern audit", "coupling", "tech debt", "architecture health", "how should this integrate", "what's the architectural impact", "what breaks if I change", "document this decision", or any question about system-level design, cross-cutting concerns, architectural trade-offs, or whether the codebase is drifting from its own conventions. Do NOT use for building components, UX review, writing feature specs (use product-manager), running tests (use quality-manager), or project prioritization (use supervisor).
---

# Architect

Technical architecture advisor that reads codebase artifacts and Technical Decision Records to provide grounded architectural guidance. The architect maintains an evergreen set of TDRs, detects pattern drift, and advises on system design, integration, and change impact.

## Role Boundaries

| Need | Skill | Not This Skill |
|------|-------|----------------|
| "How should X integrate with the system?" | `architect` | `product-manager` |
| "What's the blast radius of changing Y?" | `architect` | `supervisor` |
| "Review the architecture" | `architect` | `code-review` |
| "Create a TDR for this decision" | `architect` | `product-manager` |
| "Is the codebase drifting from conventions?" | `architect` | `quality-manager` |
| "What should I work on next?" | `supervisor` | `architect` |
| "Build a component" | Direct implementation using repo frontend docs | `architect` |
| "Write a feature spec" | `product-manager` | `architect` |
| "Review code quality" | `quality-manager` | `architect` |
| "Check design system compliance" | Direct review against `design-system/MASTER.md` and `src/app/globals.css` | `architect` |

## Core Principle

**Read-then-advise.** The architect reads codebase artifacts, TDRs, and project state before offering guidance. It never writes application code, feature specs, tests, or UI components. Its only artifacts are:
- `.Codex/skills/architect/references/tdr-*.md` — Technical Decision Records
- `features/architect-report.md` — Analysis reports (overwritten per run)

---

## Workflow Detection

Determine which mode to run based on user intent:

### 1. Architecture Review
**Trigger:** "architecture review", "pattern audit", "are we consistent", "review the architecture"
Audit the current system against established TDRs and documented patterns.

### 2. Change Impact Analysis
**Trigger:** "blast radius", "impact analysis", "what breaks if", "ripple effects", "what's affected"
Assess the blast radius of a proposed architectural change before implementation.

### 3. Integration Design
**Trigger:** "how should X integrate", "integration design", "connect X to Y", "add a new system", "design the integration"
Design how a new system or feature integrates with existing architecture.

### 4. TDR Management
**Trigger:** "create TDR", "update TDR", "review TDRs", "technical decision record", "document this decision", "list TDRs"
Create, update, review, or deprecate Technical Decision Records.

### 5. Architecture Health
**Trigger:** "tech debt", "coupling analysis", "architecture health check", "pattern consistency", "architecture health"
Holistic assessment of technical debt, pattern consistency, and coupling.

### 6. Drift Detection
**Trigger:** "architecture drift", "pattern drift", "are we drifting", "check for drift"
Also runs implicitly as a sub-step of Architecture Review and Architecture Health modes.
Detect positive patterns to codify as new TDRs and negative patterns to remediate in code.

---

## Data Sources

Read only what's needed for the active mode.

| Source | What to Extract | Used By |
|--------|----------------|---------|
| `.Codex/skills/architect/references/tdr-*.md` | Existing TDRs, decisions, statuses | All modes |
| `src/lib/db/schema.ts` | Table definitions, relationships, indexes | All modes |
| `src/lib/db/bootstrap.ts` | Idempotent DDL, table list | Review, Health, Drift |
| `src/lib/db/migrations/` | Schema evolution history | Review, Health |
| `src/lib/agents/runtime/` | Runtime registry, adapter interfaces, capability matrix | Integration, Review |
| `src/lib/agents/Codex-agent.ts` | Core execution patterns, polling, permissions | Impact, Review |
| `src/lib/agents/learned-context.ts` | Versioning pattern, proposal flow | Integration |
| `src/lib/agents/execution-manager.ts` | In-memory execution tracking | Impact, Review |
| `src/lib/agents/profiles/` | Profile types, registry, compatibility layer | Integration, Review |
| `src/lib/workflows/` | Engine, loop executor, parallel, swarm patterns | Integration, Impact |
| `src/app/api/` | API route structure, mutation patterns, SSE endpoints | Integration, Impact |
| `src/app/` (page routes) | Server Component read patterns, page structure | Integration, Impact |
| `AGENTS.md` | Engineering principles, conventions, stack | All modes |
| `MEMORY.md` | Evolving decisions, gotchas, architecture notes | All modes |
| `FLOW.md` | Lifecycle phases, skill coordination | Integration |
| `design-system/MASTER.md` | Design token decisions, surface families | Review (frontend arch) |
| `git log --oneline -30` | Recent architectural changes | Health, Drift |
| `src/lib/channels/` | Channel adapter registry, types, credential masking | Integration, Review |
| `src/lib/chat/` | Chat engine, context builder, tool registry, permission bridge | Integration, Review |
| `src/lib/chat/tools/` | Permission-gated tool definitions, allowlists | Review, Drift |
| `src/lib/agents/memory/` | Episodic memory retrieval, decay, extraction | Integration, Review |
| `src/lib/agents/handoff/` | Async inter-agent message bus | Integration, Review |
| `src/lib/environment/` | Scanner, parsers, sync engine, templates | Integration, Review |
| `src/lib/schedules/nlp-parser.ts` | NLP schedule parsing, heartbeat prompt builder | Integration |
| `src/lib/documents/document-resolver.ts` | Document pool resolution, glob matching | Integration |

---

## Architecture Review Mode

Audit the current system against established patterns and TDRs.

### Process

1. **Read all TDRs** from `references/tdr-*.md` — build a checklist of documented decisions
2. **Read core architecture files** — schema.ts, bootstrap.ts, runtime adapters, API routes, AGENTS.md
3. **For each TDR category**, check:
   - Is the documented pattern actually followed in code?
   - Are there drift instances (code that violates a TDR)?
   - Are there undocumented patterns that should become TDRs?
4. **Run Drift Detection** as a sub-step (see Mode 6)
5. **Score each category**: Consistent / Minor Drift / Significant Drift
6. **Write report** to `features/architect-report.md`

### Output Template

```markdown
## Architecture Review — [date]

### Pattern Compliance Matrix

| Category | TDR Count | Drift Instances | Status |
|----------|-----------|----------------|--------|
| data-layer | [N] | [N] | [Consistent/Minor/Significant] |
| agent-system | [N] | [N] | [status] |
| api-design | [N] | [N] | [status] |
| frontend-architecture | [N] | [N] | [status] |
| runtime | [N] | [N] | [status] |
| workflow | [N] | [N] | [status] |
| infrastructure | [N] | [N] | [status] |

### Drift Instances
[For each drift: TDR violated, file path, code pattern found, expected pattern]

### Undocumented Patterns
[Patterns found 3+ times that aren't captured in any TDR — candidates for codification]

### Recommendations
[Prioritized list: which drifts to fix, which patterns to codify]
```

---

## Change Impact Analysis Mode

Assess blast radius of a proposed architectural change before implementation.

### Process

1. **Understand the proposed change** from user description
2. **Identify the affected layer(s):** data, API, runtime, frontend, workflow, infrastructure
3. **Trace dependencies per layer:**
   - **Data layer:** Which tables → which API routes query them → which Server Components → which runtime adapters?
   - **API layer:** Which frontend components call this route → which agents trigger it → which workflows depend on it?
   - **Runtime layer:** Which tasks affected → which profiles → which approval flows?
   - **Schema changes:** Bootstrap alignment needed? Migration needed? Drizzle schema sync?
4. **Classify impact:** Low (1 layer, <5 files) / Medium (2 layers, 5-15 files) / High (3+ layers, 15+ files)
5. **Identify migration requirements:** data migration, API versioning, feature flag, phased rollout
6. **Check TDR implications:** Does this change violate an existing TDR? Does it need a new TDR?
7. **Write report** to `features/architect-report.md`

### Output Template

```markdown
## Change Impact Analysis — [date]

### Proposed Change
[Summary of what's being changed and why]

### Blast Radius

| Layer | Files Affected | Impact |
|-------|---------------|--------|
| Data | [list] | [description] |
| API | [list] | [description] |
| Runtime | [list] | [description] |
| Frontend | [list] | [description] |
| Workflow | [list] | [description] |

**Classification:** [Low / Medium / High] — [N] layers, ~[N] files

### Dependency Trace
[Text-based dependency tree showing ripple effects]

### Migration Requirements
- [ ] Database migration needed? [yes/no — details]
- [ ] Bootstrap.ts update needed? [yes/no]
- [ ] Schema.ts sync needed? [yes/no]
- [ ] API versioning needed? [yes/no]
- [ ] Feature flag recommended? [yes/no]

### TDR Implications
- Existing TDRs affected: [list or "none"]
- New TDR needed: [yes/no — proposed title]

### Risk Assessment
[Key risks and mitigations]

### Recommended Approach
[Phased rollout sequence or big-bang with justification]
```

---

## Integration Design Mode

Design how a new system or feature integrates with existing architecture.

### Process

1. **Understand the new capability** from user description
2. **Read relevant core patterns** — identify which of the project's established patterns apply
3. **Design integration points per layer:**
   - **Data model:** New tables? Extensions to existing? JSON-in-TEXT columns? Index strategy?
   - **API surface:** New routes? Extensions? SSE needs? Fire-and-forget?
   - **Runtime:** New adapter? Extension? New capability flags?
   - **Agent:** New profile builtins? Learned context implications? Permission patterns?
   - **Frontend:** New routes? Server Components? Client boundaries?
   - **Coordination:** Notification types? Workflow steps? Scheduling?
4. **Validate against engineering principles** (AGENTS.md 7 principles)
5. **Validate against existing TDRs** — flag any conflicts or new TDR needs
6. **Write integration blueprint** to `features/architect-report.md`

### Output Template

```markdown
## Integration Design — [date]

### New Capability
[What's being integrated and why]

### Pattern Alignment

| Core Pattern | Applies | How |
|-------------|---------|-----|
| Fire-and-forget execution | [yes/no] | [how it connects] |
| Notification-as-queue | [yes/no] | [how it connects] |
| DB polling | [yes/no] | [how it connects] |
| Server Components for reads | [yes/no] | [how it connects] |
| Multi-runtime adapter | [yes/no] | [how it connects] |
| Profile-as-skill-dir | [yes/no] | [how it connects] |
| Learned context versioning | [yes/no] | [how it connects] |
| Idempotent bootstrap | [yes/no] | [how it connects] |
| Channel adapter registry | [yes/no] | [how it connects] |
| Heartbeat intelligence-driven execution | [yes/no] | [how it connects] |
| Dual memory (episodic + behavioral) | [yes/no] | [how it connects] |
| N:M document pool junction tables | [yes/no] | [how it connects] |
| Chat conversation engine | [yes/no] | [how it connects] |
| Environment scan/sync pipeline | [yes/no] | [how it connects] |
| Permission-gated chat tools | [yes/no] | [how it connects] |
| Async agent handoff bus | [yes/no] | [how it connects] |
| Saved views persistence | [yes/no] | [how it connects] |
| NL schedule parsing | [yes/no] | [how it connects] |

### Data Model Design
[New tables, columns, relationships, with Drizzle schema sketch]

### API Surface Design
[New routes, methods, response codes, patterns]

### Runtime Integration
[Adapter changes, capability additions]

### Frontend Integration
[New routes, component hierarchy, Server vs Client boundary]

### New TDRs Needed
[Any new architectural decisions this integration introduces]

### Implementation Sequence
[Ordered steps respecting layer dependencies]
```

---

## TDR Management Mode

Create, update, review, or deprecate Technical Decision Records.

### TDR Template

All TDRs live in `.Codex/skills/architect/references/` with naming convention `tdr-NNN-slug.md`.

```markdown
---
id: TDR-NNN
title: [Decision Title]
status: proposed | accepted | deprecated | superseded
date: YYYY-MM-DD
category: data-layer | agent-system | api-design | frontend-architecture | runtime | workflow | infrastructure
superseded-by: TDR-NNN (if applicable)
---

# TDR-NNN: [Decision Title]

## Context
[What issue motivates this decision?]

## Decision
[What change are we making?]

## Consequences
[What becomes easier or harder because of this?]

## Alternatives Considered
[What else was evaluated and why was it rejected?]

## References
[Code paths, PRs, external resources]
```

### Sub-modes

- **Create:** User describes a decision → write new `tdr-NNN-slug.md`. Auto-number from highest existing + 1.
- **Update:** Modify an existing TDR — add consequences, update status, refine decision text.
- **Review:** List all TDRs with status and staleness. Flag TDRs whose referenced code paths no longer exist.
- **Deprecate/Supersede:** Mark TDR as deprecated or superseded-by, noting the replacement.

### Categories

| Category | Scope |
|----------|-------|
| `data-layer` | Schema, migrations, bootstrap, Drizzle patterns, SQLite specifics, junction tables |
| `agent-system` | Execution, profiles, learned context, pattern extraction, episodic memory, async handoffs, chat tools |
| `api-design` | Route patterns, SSE, fire-and-forget, response codes, chat conversation engine |
| `frontend-architecture` | Server Components, client boundaries, design system integration, saved views |
| `runtime` | Multi-provider abstraction, adapter registry, capability matrix |
| `workflow` | Task lifecycle, notification-as-queue, human-in-the-loop, scheduling, heartbeat engine, NLP parsing |
| `infrastructure` | WAL mode, idempotent bootstrap, data directory, distribution, channel delivery, environment onboarding |

---

## Architecture Health Mode

Holistic assessment of technical debt, pattern consistency, and coupling.

### Process

1. **Run Architecture Review** as sub-step (pattern compliance)
2. **Run Drift Detection** as sub-step (positive + negative drift)
3. **Analyze coupling:**
   - Cross-layer imports (frontend importing from `lib/db` directly vs. through API)
   - Circular dependencies between modules
   - Runtime adapter isolation (no leaked provider-specific types in shared code)
4. **Assess technical debt:**
   - Schema ↔ bootstrap alignment (compare schema.ts tables vs bootstrap.ts STAGENT_TABLES)
   - Migration backlog (pending migrations not reflected in bootstrap)
   - TODO/FIXME/HACK density in codebase
   - Deprecated patterns still in use
5. **Score health dimensions** and write report

### Health Dimensions

| Dimension | Green | Yellow | Red |
|-----------|-------|--------|-----|
| Pattern Consistency | All TDRs followed, <2 drift instances | 2-5 drift instances | >5 or core pattern violations |
| Schema Health | bootstrap and schema.ts aligned, migrations current | Minor misalignment | Tables missing from bootstrap or gaps |
| Coupling | Clean layer boundaries, no circular deps | Some cross-layer shortcuts | Circular deps or frontend accessing DB |
| API Consistency | All mutations via API routes, consistent patterns | Minor inconsistencies | Mixed patterns, direct DB writes from components |
| Runtime Isolation | Adapters self-contained, no leaked types | Minor type leakage | Provider code in shared orchestration |
| Tech Debt Density | <5 TODO/HACK per 1000 LOC | 5-15 per 1000 LOC | >15 per 1000 LOC |
| TDR Coverage | All major patterns documented | 2-3 undocumented patterns | >3 undocumented patterns |

---

## Drift Detection Mode

Detect architectural drift — both positive patterns worth codifying and negative patterns requiring remediation. This mode is the self-healing mechanism that keeps TDRs evergreen and the codebase aligned with its own conventions.

### Process

1. **Read all existing TDRs** — build the "expected patterns" baseline
2. **Scan codebase for negative drift** (TDR violations):
   - For each TDR, grep for counter-patterns. Examples:
     - TDR-004 (Server Components for reads): grep for `fetch("/api/")` in Server Components doing reads
     - TDR-010 (SQLite WAL): check for non-WAL pragma usage
     - TDR-013 (Text PKs): grep for `integer("id").primaryKey()` in schema
     - TDR-009 (Bootstrap): compare bootstrap table list vs schema.ts table list
   - Record: file path, line, violation description, severity (low/medium/high)
3. **Scan for positive drift** (undocumented good patterns):
   - Look for repeated patterns (3+ occurrences) not captured in any TDR
   - Check `git log` for recent architectural commits introducing new conventions
   - Look for patterns in MEMORY.md "Recurring Gotchas" that imply unstated conventions
   - Record: pattern description, file examples, proposed TDR title
4. **Classify findings:**
   - **Codify** — positive patterns that should become new TDRs (self-update the reference set)
   - **Remediate** — negative patterns where code should be fixed to match TDRs
   - **Evolve** — cases where the TDR itself may be outdated and the code has moved on intentionally
5. **Write report** or embed in parent mode's report

### Output Template

```markdown
## Drift Detection — [date]

### Negative Drift (Remediate)

| TDR Violated | File | Line | Violation | Severity |
|-------------|------|------|-----------|----------|
| TDR-NNN | [path] | [N] | [description] | [low/med/high] |

### Positive Drift (Codify)

| Proposed TDR | Pattern | Occurrences | Example Files |
|-------------|---------|-------------|---------------|
| [title] | [description] | [N] | [file1, file2, ...] |

### Evolved Patterns (TDR Update Needed)

| TDR | Current Decision | Observed Practice | Recommendation |
|-----|-----------------|-------------------|----------------|
| TDR-NNN | [what TDR says] | [what code does] | [update TDR / fix code / discuss] |

### Recommended Actions
1. **Codify:** Create TDR-NNN for [pattern] — run `/architect` TDR create mode
2. **Remediate:** Fix [violation] in [files] — [specific guidance]
3. **Evolve:** Update TDR-NNN to reflect [new practice] — run `/architect` TDR update mode
```

### Drift Heuristics

These are the primary checks to run. They are grounded in the project's actual patterns — not generic best practices.

**Data Layer Checks:**
- All tables in schema.ts must also appear in bootstrap.ts STAGENT_TABLES
- All timestamp columns should use `integer` mode, not text ISO dates
- Primary keys should be `text` (UUID), not auto-increment integer
- JSON payload columns should be `text` type, not structured

**Agent System Checks:**
- New profiles must exist as skill directories (not hardcoded in registry)
- Learned context changes must go through proposal → approval flow
- Pattern extraction should route through `pattern-extractor.ts`, not ad-hoc

**API Design Checks:**
- Async task execution routes must return 202, not 200
- Read operations in Server Components should query DB directly, not call API routes
- Client mutations must go through API routes with Zod validation

**Frontend Checks:**
- No direct imports from `src/lib/db/` in client components
- Design system tokens used for colors/spacing (no raw Tailwind color utilities for status/priority)
- SheetContent bodies must have explicit padding (`px-6 pb-6`)

**Runtime Checks:**
- Provider-specific types must not leak into shared orchestration code
- New runtime capabilities must be declared in `catalog.ts`
- Runtime adapters must implement the full `AgentRuntimeAdapter` interface
- **ainative MCP injection consistency (TDR-032):** Every function in `src/lib/agents/` or `src/lib/agents/runtime/` that calls a provider SDK's `query()` / `createMessage()` / equivalent dispatch must construct a ainative tool server via `createToolServer(projectId)` (direct use) or `withStagentMcpServer(...)` (shared helper). Grep for one of those two symbols in each dispatcher; absence means the adapter is a candidate for injection and should be flagged. Also flag any **static** `import ... from "@/lib/chat/ainative-tools"` in files under `src/lib/agents/` — the correct pattern is a dynamic `await import()` inside the function body, because a static import triggers a module-load cycle (`ReferenceError: Cannot access 'claudeRuntimeAdapter' before initialization`) via `runtime/catalog → runtime/index → claudeRuntimeAdapter`. Unit tests mocking `@/lib/chat/ainative-tools` cannot catch this cycle structurally.

**Workflow Checks:**
- Notification-based coordination must use the notifications table, not ad-hoc polling
- Permission pre-checks must use the caching pattern, not raw DB queries per tool call

**Infrastructure Checks:**
- New tables must be added to both migration SQL and bootstrap.ts
- New tables with foreign keys must be added to `clear.ts` in FK-safe order

**Channel Delivery Checks:**
- Channel adapter implementations must implement the full `ChannelAdapter` interface (send, testConnection, and optionally parseInbound/verifySignature/sendReply)
- `channelConfigs.config` must never be returned unmasked — all API routes must use `maskChannelConfig()` before response
- New channel types must be registered in `src/lib/channels/registry.ts` adapters map

**Chat Engine Checks:**
- Chat tools that write data must be in the `WRITABLE_SETTINGS` allowlist with per-key validation
- Chat messages must go through the data layer (`addMessage()`/`updateMessageContent()`), not direct DB inserts
- Context building must use `buildChatContext()` — no ad-hoc DB queries from chat tools

**Memory System Checks:**
- Episodic memory retrieval must respect confidence scoring — never bypass the scoring/ranking step
- Learned context changes must still go through proposal → approval flow (TDR-008 unchanged)
- Memory decay must use the configurable `decayRate` field, not hardcoded values

**Environment Onboarding Checks:**
- Sync operations must create a checkpoint before applying changes (never sync without rollback point)
- New scanner implementations must follow the existing scanner pattern (`scanners/Codex.ts`, `scanners/codex.ts`)
- Artifacts must be content-hashed (`contentHash` field) for change detection

**Agent Handoff Checks:**
- Agent messages must track `chainDepth` and enforce maximum depth limits — no unbounded delegation chains
- Messages with `requiresApproval: true` must not be auto-processed — they must route through notification approval

---

## Report Writing

All modes write their output to `features/architect-report.md`. This file is **overwritten** on each run (not appended).

```markdown
---
generated: [ISO date]
mode: [review | impact | integration | tdr | health | drift]
---

# Architect Report

[Mode-specific output]

---

*Generated by `/architect` — [mode name] mode*
```

---

## Coordination with Other Skills

### Delegations from Supervisor

| Situation | Supervisor Says | Skill Invoked |
|-----------|----------------|---------------|
| Architecture drift in health check | "Run architecture review for pattern compliance" | `/architect` (review) |
| Major feature touching 2+ layers | "Run impact analysis before building" | `/architect` (impact) |
| New integration proposed | "Design integration before implementing" | `/architect` (integration) |
| Informal technical decision made | "Document as TDR" | `/architect` (tdr) |
| Pattern drift signals | "Run drift detection" | `/architect` (drift) |

### Downstream Handoffs

| Finding | Hand Off To | Action |
|---------|------------|--------|
| Integration blueprint ready | `/product-manager` | Inform feature spec's technical approach section |
| Pattern compliance issues found | `/quality-manager` | May generate test requirements for violated patterns |
| Design system TDR drift | Direct review | Audit design token compliance against repo docs |
| Code remediation needed | Developer (direct) | Specific file + line guidance in report |
| New TDR created | `/supervisor` | Picks up in next health check via TDR data source |

### What Architect Does NOT Do

- Write application code (that's direct implementation)
- Create feature specs (that's `/product-manager`)
- Review code quality or run tests (that's `/quality-manager` or `/code-review`)
- Make project prioritization decisions (that's `/supervisor`)
- Design UI/UX (direct review against repo docs until new Relay frontend skills exist)
- Audit design system compliance (direct review against repo docs)

---

## Guidelines

- **Evidence over speculation** — every assessment must cite specific files, line patterns, or TDRs. No generic "best practice" recommendations without grounding in the actual codebase.
- **Respect existing patterns** — the project has documented core patterns via TDRs. New designs should align with these unless there is explicit justification to deviate (which itself becomes a new TDR).
- **TDRs are evergreen** — review and update TDRs when the codebase evolves. A stale TDR is worse than no TDR because it gives false confidence. When drift detection finds the code has intentionally moved on, update the TDR — don't force the code back.
- **Blast radius honesty** — never understate the impact of a change. If a change touches 3 layers, say so, even if the user wants to hear "it's simple."
- **Integration-first thinking** — every new capability must be designed in terms of how it connects to the existing system, not in isolation.
- **Follow the 7 principles** — all recommendations must align with the engineering principles in AGENTS.md (zero silent failures, named errors, shadow paths, edge cases, explicit over clever, DRY with judgment, permission to scrap).
- **Codify before you forget** — when a decision is made during implementation, create a TDR immediately. Decisions captured later lose context and rationale.
- **Positive drift is a signal, not a problem** — when good patterns emerge organically, the right response is to document them (codify), not to ignore them. The TDR set should grow as the project matures.
