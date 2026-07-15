---
title: Workflow Budget Governance
status: completed
priority: P1
milestone: post-mvp
source: ideas/analysis-chat-issues.md
dependencies: [spend-budget-guardrails, workflow-engine]
---

# Workflow Budget Governance

## Description

Workflow step execution is capped at $2 because `WORKFLOW_STEP_MAX_BUDGET_USD = 5.0` is dead code — defined but never imported. All workflow steps use `DEFAULT_MAX_BUDGET_USD = 2.0`, which is insufficient for any non-trivial agent task with document context. Additionally, budget settings are readable via chat but not writable, and no pre-flight cost estimation exists — users discover budget failures only after wasting money.

This feature wires the existing $5 constant into the execution path, makes budget settings writable via the chat `set_settings` tool, and adds pre-execution cost estimation that warns users before running document-heavy workflows.

## User Story

As a workflow operator, I want workflow steps to use appropriate budget caps and warn me before exceeding them so that I don't waste money on doomed executions.

## Technical Approach

- **Wire `WORKFLOW_STEP_MAX_BUDGET_USD`** into `executeChildTask()` in `engine.ts` (~line 720). Pass as `maxBudgetUsd` through to `executeClaudeTask()` / `resumeClaudeTask()` in `claude-agent.ts` (~lines 458, 572) which currently hardcode `DEFAULT_MAX_BUDGET_USD`
- **Budget resolution precedence** (highest to lowest):
  1. User setting: `budget_max_cost_per_task` (from settings table)
  2. Workflow constant: `WORKFLOW_STEP_MAX_BUDGET_USD` ($5)
  3. Default: `DEFAULT_MAX_BUDGET_USD` ($2)
- **Add 3 budget keys to `WRITABLE_SETTINGS`** in `settings-tools.ts` (~line 12-67):
  - `budget_max_cost_per_task` — positive number, max 50
  - `budget_max_tokens_per_task` — positive integer
  - `budget_max_daily_cost` — positive number
- **Pre-flight estimation**: New `estimateWorkflowCost()` in `engine.ts` that:
  - Calculates document context size per step via exported `estimateStepTokens()` from `context-builder.ts`
  - Projects cost using `estimateTokens()` (already exists at `chat/context-builder.ts:16-18`) × approximate model pricing
  - Stores estimate in workflow `_state.costEstimate` for UI consumption
  - If over budget: stores advisory warning (does not block execution)
  - Warning surfaces in: WorkflowStatusView banner + `execute_workflow` chat tool response text

## Acceptance Criteria

- [ ] Workflow steps use $5 budget by default (not $2) — verify `WORKFLOW_STEP_MAX_BUDGET_USD` is imported and used in `engine.ts`
- [ ] `budget_max_cost_per_task` is writable via `set_settings` chat tool with validation (positive, max 50)
- [ ] `budget_max_tokens_per_task` and `budget_max_daily_cost` are writable with appropriate validation
- [ ] User budget setting overrides the $5 constant when set
- [ ] Pre-flight estimation calculates per-step token cost from document context size
- [ ] Estimation result stored in workflow `_state.costEstimate` as `{ steps: [{name, tokens, cost}], total, budgetCap, overBudget }`
- [ ] Over-budget warning is advisory (does not block execution)
- [ ] All runtime adapters (`openai-direct.ts`, `anthropic-direct.ts`, etc.) respect the resolved budget

## Scope Boundaries

**Included:**
- Wiring existing $5 constant into execution path
- Making budget settings writable via chat
- Pre-flight cost estimation based on document context size
- Advisory warnings for over-budget workflows

**Excluded:**
- Workflow-level budget pooling (shared budget across steps) — requires SDK changes
- Real-time cost streaming during execution — SDK doesn't expose this
- LLM-based document summarization to reduce context — separate feature
- Per-step budget overrides in workflow definition — future enhancement

## References

- Source: `ideas/analysis-chat-issues.md` — Issues 1, 3, 6
- Historical design: Relay git commit `da666406` — Feature 1
- Related features: `spend-budget-guardrails` (completed, this extends it), `workflow-intelligence-observability` (enabled by this)
- Key files: `src/lib/constants/task-status.ts:55-58`, `src/lib/agents/claude-agent.ts:458,572`, `src/lib/chat/tools/settings-tools.ts:12-67`, `src/lib/workflows/engine.ts:720`, `src/lib/documents/context-builder.ts:16-18`
