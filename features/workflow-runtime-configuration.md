---
title: Workflow Runtime & Model Configuration
status: completed
priority: P1
milestone: post-mvp
source: ideas/analysis-chat-issues.md
dependencies: [provider-runtime-abstraction, workflow-engine, smart-runtime-router]
---

# Workflow Runtime & Model Configuration

## Description

ainative has 5 fully implemented runtime adapters (Claude SDK, OpenAI Codex, Anthropic Direct, OpenAI Direct, Ollama) but workflows can't specify which runtime to use — they all default to the system setting. Model IDs are scattered across 3 disconnected registries: `CHAT_MODELS` in the UI, hardcoded fallbacks in adapters (`"gpt-4.1"`, `"claude-sonnet-4-20250514"`), and the runtime catalog which carries zero model information. The chat agent hallucinates about available models because no tool exposes the runtime catalog.

This feature unifies the model catalog into `RuntimeCatalogEntry`, adds per-workflow runtime selection via a new `runtimeId` column, creates a `list_runtimes` chat tool, and tags settings with writability metadata to prevent chat hallucination.

## User Story

As a workflow creator, I want to choose which AI provider runs my workflow and know which models are available so that I can optimize for cost, quality, or latency per workflow.

## Technical Approach

- **Extend `RuntimeCatalogEntry`** in `catalog.ts` (~line 24-30) with `models: { default: string; supported: string[] }` for all 5 registered runtimes
- **Replace hardcoded model fallbacks** in `openai-direct.ts` (~line 234: `?? "gpt-4.1"`) and `anthropic-direct.ts` (~line 318: `?? "claude-sonnet-4-20250514"`) with `getRuntimeCatalogEntry(id).models.default`
- **Add `runtimeId` column** to workflows table in `schema.ts` (nullable text), bootstrap.ts, and migration SQL
- **Add `runtime` param** to `create_workflow` chat tool in `workflow-tools.ts` (~line 70-164), validate against `isAgentRuntimeId()`
- **Pass runtimeId through execution**: in `engine.ts`, read `workflow.runtimeId` and pass to `executeTaskWithRuntime(taskId, runtimeId)` — the optional param already exists at `runtime/index.ts:77`
- **Runtime resolution precedence**:
  1. Step agent profile `preferredRuntime` (existing)
  2. `workflow.runtimeId` (new)
  3. System `routing.preference` setting (existing)
  4. `DEFAULT_AGENT_RUNTIME` (existing)
- **New `list_runtimes` chat tool** in `src/lib/chat/tools/runtime-tools.ts` — calls `listRuntimeCatalog()` (exists at `catalog.ts:138-140`), returns runtimes with models and capabilities
- **Register in tool collection**: add `runtimeTools` to `collectAllTools()` in `ainative-tools.ts`
- **Tag settings writability**: in `get_settings` handler (`settings-tools.ts` ~line 77-141), add `writable: boolean` field to each returned key by checking against `WRITABLE_SETTINGS`
- **Validate CHAT_MODELS**: at startup, verify each `CHAT_MODELS` entry exists in some runtime's `models.supported[]`, log warning on mismatch

## Acceptance Criteria

- [ ] `RuntimeCatalogEntry` interface includes `models: { default: string; supported: string[] }`
- [ ] All 5 registered runtimes have `models` populated with correct model IDs
- [ ] Adapter fallbacks use `catalog.models.default` instead of hardcoded strings
- [ ] `workflows` table has nullable `runtime_id` column (migration + bootstrap)
- [ ] `create_workflow` chat tool accepts optional `runtime` parameter validated against runtime IDs
- [ ] Workflow execution passes `runtimeId` to `executeTaskWithRuntime`
- [ ] New `list_runtimes` chat tool returns all 5 runtimes with id, label, provider, models, and capabilities
- [ ] `get_settings` response tags each key with `writable: true/false`
- [ ] `set_settings` error message suggests alternatives when a key isn't writable
- [ ] `CHAT_MODELS` validated against catalog at startup (warning on stale model IDs)

## Scope Boundaries

**Included:**
- Unified model catalog in RuntimeCatalogEntry
- Per-workflow runtime selection (new column + tool param)
- Runtime discoverability via list_runtimes chat tool
- Settings writability metadata
- CHAT_MODELS validation against catalog

**Excluded:**
- Global model override settings (`openai_direct_model` writable) — wrong abstraction, per-workflow is the right surface
- Automatic model selection based on task complexity — future ML feature
- Per-step runtime selection (different runtime per step) — future enhancement
- Model pricing data in catalog — separate concern from identity

## References

- Source: `ideas/analysis-chat-issues.md` — Issues 4, 4b, 8, 9
- Historical design: Relay git commit `da666406` — Feature 2
- Related features: `provider-runtime-abstraction` (completed, extends it), `smart-runtime-router` (completed, this adds workflow-level surface), `workflow-intelligence-observability` (enabled by this)
- Key files: `src/lib/agents/runtime/catalog.ts:24-30,119-140`, `src/lib/agents/runtime/index.ts:77`, `src/lib/agents/runtime/openai-direct.ts:234`, `src/lib/agents/runtime/anthropic-direct.ts:318`, `src/lib/db/schema.ts:53-66`, `src/lib/chat/tools/workflow-tools.ts:70-164`, `src/lib/chat/tools/settings-tools.ts:12-67,77-141`, `src/lib/chat/types.ts:57-66`
