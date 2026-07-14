---
title: SDK Runtime Hardening
status: completed
priority: P2
milestone: post-mvp
source: output/done-sdk-usage-audit.md, commit e5680ff
dependencies: [provider-runtime-abstraction, usage-metering-ledger, spend-budget-guardrails, agent-self-improvement]
---

# SDK Runtime Hardening

## Description

A systematic audit of Claude Agent SDK and Codex App Server usage (2026-03-15) identified 13 findings where ainative's runtime adapters underutilized available SDK capabilities. This feature tracks the code changes that addressed the highest-impact findings — improving cost tracking accuracy, execution safety, prompt quality, and code maintainability.

The audit compared each `query()` call site against the latest SDK reference documentation and surfaced gaps in system prompt handling, budget enforcement, pricing coverage, turn limits, and prompt construction hygiene.

## User Story

As a ainative operator, I want the agent runtime layer to use SDK capabilities correctly so that cost tracking is accurate, execution has safety bounds, and prompt construction follows SDK best practices.

## Audit Findings — Implemented

| Finding | Title | Category |
|---------|-------|----------|
| F1 | `systemPrompt` option — use `claude_code` preset with `append` | Accuracy |
| F2 | Remove decorative `temperature` from profiles | Accuracy |
| F4 | Add `maxBudgetUsd` per-execution spending cap | Cost/Safety |
| F5 | Expand pricing registry (3 Anthropic + 3 OpenAI families) | Cost |
| F6 | Parse `modelUsage` per-model breakdown via `getProviderModelBreakdown()` | Cost |
| F9 | Default `maxTurns` on task execution with per-profile override | Cost/Safety |
| F10 | Codex `item/tool/call` graceful stub response | Accuracy |
| F12 | Extract shared `buildTaskQueryContext()` helper | Maintenance |

## Acceptance Criteria

- [x] `executeClaudeTask()` and `resumeClaudeTask()` use `systemPrompt: { type: 'preset', preset: 'claude_code', append }` instead of concatenating profile instructions into the user prompt
- [x] `temperature` field removed from all profile YAMLs and the `AgentProfile` type definition
- [x] `maxBudgetUsd` passed to `query()` options via `DEFAULT_MAX_BUDGET_USD` constant for both execute and resume paths
- [x] Pricing registry covers 3 Anthropic model families (Sonnet 4, Opus 4, Haiku 4) and 3 OpenAI model families (Codex Mini, GPT-4o, GPT-5) with conservative fallback estimates
- [x] `getProviderModelBreakdown()` in `ledger.ts` extracts per-model usage from SDK `modelUsage` field
- [x] `maxTurns` defaults to `DEFAULT_MAX_TURNS` on task execution, with per-profile override from `AgentProfile.maxTurns`
- [x] Codex `item/tool/call` handler returns a structured graceful response instead of a bare string stub
- [x] Shared `buildTaskQueryContext()` helper eliminates duplicate prompt construction between execute and resume paths

## Scope Boundaries

**Included:**
- All findings listed above (F1, F2, F4, F5, F6, F9, F10, F12)

**Excluded / Deferred:**
- F3 (`outputFormat`) — Field exists in profile types but is not yet wired to `query()` options; requires per-profile JSON Schema definitions
- F7 (`fallbackModel`) — Deferred; no multi-model failover needed currently
- F8 (`includePartialMessages` optimization) — Only set to `false` for connection test; remaining call sites deferred
- F11 (Codex MCP passthrough) — Catalog already lists `mcpServers: false`; no code change needed
- F13 (Usage dedup by message ID) — Deferred; current first-non-null merge strategy is sufficient without multi-model sessions

## Implementation Notes

- Changes landed in commit `e5680ff` ("Add agent self-improvement, SDK audit fixes, and /tasks redirect")
- The `systemPrompt` change uses the `claude_code` preset which gives agents access to Claude Code's built-in system prompt (tool usage guidance, safety rules, formatting conventions) while appending profile-specific instructions
- Pricing registry versioned as `registry-2026-03-15` with 6 model family rules plus a conservative fallback for unknown models
- `DEFAULT_MAX_BUDGET_USD` and `DEFAULT_MAX_TURNS` constants centralized in the Claude runtime adapter

## Verification

- Verified with full Vitest suite on March 15, 2026
- Verified with a successful production build on March 15, 2026

## References

- Audit source: internal SDK usage report; durable findings are captured above.
- Related features: [provider-runtime-abstraction](provider-runtime-abstraction.md), [usage-metering-ledger](usage-metering-ledger.md), [spend-budget-guardrails](spend-budget-guardrails.md), [agent-self-improvement](agent-self-improvement.md)
- Related features: [cross-provider-profile-compatibility](cross-provider-profile-compatibility.md) (temperature removal)
