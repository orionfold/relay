---
title: Workflow Intelligence & Observability
status: completed
priority: P2
milestone: post-mvp
source: ideas/analysis-chat-issues.md
dependencies: [workflow-budget-governance, workflow-runtime-configuration, workflow-execution-resilience, usage-metering-ledger, monitoring-dashboard]
---

# Workflow Intelligence & Observability

## Description

After stabilizing workflow execution (Features 1-3), this feature builds proactive intelligence on top: a co-pilot that generates optimal workflow definitions, a live execution dashboard with real-time per-step metrics, workflow-embedded debugging with error timelines and fix suggestions, and execution-informed learning that analyzes past runs to improve future workflows. Together these create a feedback loop: execute → learn → optimize → execute better.

This is structured as 4 sequential sub-capabilities with an internal build order: Execution Learning (data foundation) → Live Dashboard (real-time visibility) → Debug Panel (failure analysis) → Optimizer Co-pilot (proactive intelligence).

## User Story

As a workflow operator, I want to see what my workflows are doing in real-time, understand why they fail, and get intelligent suggestions for building better workflows so that I can iterate toward reliable automation without trial and error.

## Technical Approach

### Sub-capability D: Execution-Informed Learning (build first)

- **New table `workflowExecutionStats`** — materialized rollup of execution history:
  - Schema: `id, pattern, stepCount, avgDocsPerStep, avgCostPerStepMicros, avgDurationPerStepMs, successRate, commonFailures (JSON), runtimeBreakdown (JSON), sampleCount, lastUpdated, createdAt`
  - Add to `schema.ts`, `bootstrap.ts`, migration SQL, and `clear.ts` (FK-safe order)
- **New module `src/lib/workflows/execution-stats.ts`**:
  - `updateExecutionStats(workflowId)` — queries `usageLedger` + `agent_logs` for this run, upserts stats keyed by `(pattern, stepCount)` bucket with running averages
  - `getWorkflowOptimizationHints(pattern, stepCount, docCount)` — returns budget recommendation, doc binding strategy, runtime recommendation, pattern comparison
- **Wire into engine**: call `updateExecutionStats()` in finally block of `executeWorkflow()` (never breaks execution)

### Sub-capability B: Live Execution Dashboard

- **Emit structured step events** in `engine.ts`: `step_started`, `step_completed`, `step_failed` with stepId, cost, tokens, duration as agent_log entries
- **New component `step-progress-bar.tsx`** — numbered circles with connecting lines (completed/running/pending states)
- **New component `step-live-metrics.tsx`** — 4 metric tiles in grid (reusing TaskBentoCell pattern):
  - Tokens (count + rate/s from `content_block_delta` events)
  - Cost ($ + budget progress bar from usage ledger polling)
  - Current Tool (name + turn count from `tool_start` events)
  - Elapsed (mm:ss + estimated remaining)
  - SSE subscription to `/api/logs/stream?taskId=X` for running step's task
  - Streaming partial results area with auto-scroll
- **Integrate**: add StepProgressBar and StepLiveMetrics to `workflow-status-view.tsx` for running workflows
- Reuse: SSE pattern from `log-stream.tsx`, charts from `src/components/charts/` (Sparkline, DonutRing), TaskBentoCell pattern

### Sub-capability C: Workflow-Embedded Debug Panel

- **New module `src/lib/workflows/error-analysis.ts`**:
  - `analyzeWorkflowFailure(workflowId)` — parses `_state`, queries `agent_logs`, builds error timeline, pattern-matches root cause, generates tiered fix suggestions
  - Root cause patterns: `"Reached maximum budget"` → budget, `"timeout"/"max turns"` → complexity, `"connection"/"rate limit"` → transient
  - Fix suggestions: Quick (raise budget), Better (reduce docs), Best (restructure workflow)
- **New endpoint `GET /api/workflows/[id]/debug`** — returns timeline + analysis
- **New component `error-timeline.tsx`** — vertical timeline with colored dots (green/yellow/red)
- **New component `workflow-debug-panel.tsx`** — collapsible section with error summary (red left-border), timeline, suggestions, action buttons (Retry Step, Re-run Workflow, View Full Logs)
- **Integrate**: render after step cards in `workflow-status-view.tsx` when workflow is failed/completed-with-errors
- Reuse: ErrorState pattern, swarm retry pattern from `swarm-dashboard.tsx:47-68`

### Sub-capability A: Workflow Optimizer Co-pilot (build last)

- **New endpoint `POST /api/workflows/optimize`** — accepts partial workflow definition, returns suggestions array
- **New module `src/lib/workflows/optimizer.ts`**:
  - `generateOptimizationSuggestions(definition, workflowId?)` — combines:
    - Document binding analysis (step prompts vs doc names → per-step recommendation)
    - Budget estimate from `estimateWorkflowCost()` (Feature 1)
    - Runtime + pattern recommendations from `getWorkflowOptimizationHints()` (Sub-cap D)
  - Returns typed suggestion objects: `{ type, title, description, data, action }`
- **Add optimizer DetailPane panel** to `workflow-form-view.tsx`:
  - Right-rail on desktop (1/3 width, sticky), Sheet on mobile
  - Fetches suggestions on debounced form state change (500ms)
  - 4 suggestion cards: Document Binding, Budget Estimate, Runtime Recommendation, Pattern Insight
  - Each with Apply (modifies form state) / Dismiss actions
- Reuse: DetailPane from `shared/detail-pane.tsx`, FormSectionCard pattern
- UX note: flag for `/frontend-designer` review — complex multi-state panel with real-time updates

## Acceptance Criteria

- [ ] `workflowExecutionStats` table exists with correct schema (migration + bootstrap)
- [ ] Stats updated after each workflow completion and failure
- [ ] `getWorkflowOptimizationHints()` returns sensible defaults when no history exists (graceful cold start)
- [ ] Running workflow steps show live metric tiles (tokens, cost, tool, elapsed) updating in real-time via SSE
- [ ] Step progress bar shows completed/running/pending states with visual indicators
- [ ] Streaming partial results visible for running steps with auto-scroll
- [ ] Failed workflows show debug panel with error summary, timeline, and root cause analysis
- [ ] Fix suggestions are tiered (Quick/Better/Best) and contextually relevant to the failure type
- [ ] Retry Step and Re-run Workflow actions work from the debug panel
- [ ] Optimizer panel appears in WorkflowFormView when editing workflow definitions
- [ ] Optimizer suggestions update reactively as user modifies the form (debounced)
- [ ] Apply action modifies form state directly (e.g., sets per-step documentIds)
- [ ] Budget estimate shows progress bar with projected cost vs cap
- [ ] Runtime recommendation includes historical success rate data

## Scope Boundaries

**Included:**
- Execution stats aggregation table and learning loop
- Live per-step metrics during execution (tokens, cost, tool, elapsed)
- Step progress indicator (completed/running/pending)
- Error timeline and root cause analysis for failed workflows
- Tiered fix suggestions based on failure patterns
- Optimizer co-pilot panel with 4 suggestion types
- Apply/Dismiss actions for optimizer suggestions

**Excluded:**
- Cross-workflow failure correlation in Monitor page — Monitor stays as global overview
- ML-based optimization (clustering, embeddings) — rule-based + historical averages sufficient
- Parallel execution cost estimation — combinatorial complexity deferred
- Real-time cost streaming from SDK — SDK limitation
- Automatic workflow restructuring (co-pilot suggests, user decides)

## References

- Source: `ideas/analysis-chat-issues.md` — EXPAND additions beyond the 9 original issues
- Historical design: Relay git commit `da666406` — Feature 4 (all sub-capabilities)
- Related features: `workflow-budget-governance` (dependency — budget estimation reused), `workflow-runtime-configuration` (dependency — runtime catalog for recommendations), `workflow-execution-resilience` (dependency — reliable state for metrics/debugging), `usage-metering-ledger` (dependency — cost data source), `monitoring-dashboard` (dependency — SSE streaming pattern)
- Key files: `src/lib/workflows/engine.ts`, `src/components/workflows/workflow-status-view.tsx`, `src/components/workflows/workflow-form-view.tsx`, `src/app/api/logs/stream/route.ts`, `src/components/charts/`, `src/components/shared/detail-pane.tsx`, `src/components/workflows/swarm-dashboard.tsx:47-68`
