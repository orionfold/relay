---
title: Fix — Ollama TASK execution 404s on fresh install (phantom llama3.2 default; per-task model ignored)
status: fixed
priority: P1
milestone: mvp
issue: https://github.com/orionfold/relay/issues/25
source: staging Mode B run 2026-07-03, bundle output/staging/2026-07-03-suite/ (JS1-OLLAMA-FRESH / J5-OLLAMA, verified CONFIRMED against HEAD f00fdaa3)
dependencies: []
---

# Fix: Ollama task execution 404s on a fresh install (phantom default model)

## Description (verified mechanism)

Every Relay **task** routed to the Ollama runtime fails on a fresh install with
`Ollama API error (404): model 'llama3.2' not found`. This breaks the "$0 local
inference" value proposition (the solo-founder JS1 thesis) for the task path.

Code-verified against HEAD:

- `src/lib/agents/runtime/ollama-adapter.ts:27` — `DEFAULT_OLLAMA_MODEL = "llama3.2"`.
- `:38-43` — `getOllamaModel()` resolves ONLY from the global `OLLAMA_DEFAULT_MODEL`
  setting; empty on a fresh install → falls back to the `llama3.2` constant. No fresh
  customer has `llama3.2` pulled (the staging box had `qwen2.5` + `Advisor-GGUF`).
- `:189` consumes it; `:66-75` calls `/api/chat`; `:79` throws the generic 404 `Error`.
- **Per-task model is ignored:** `resolveTaskExecutionTarget` hardcodes
  `requestedModelId: null` on all three task paths
  (`src/lib/agents/runtime/execution-target.ts:287-288, 321-322, 360-361`); the
  `tasks` table has no requested-model column (`schema.ts:63`), so a caller cannot
  steer the task's Ollama model. Setting the Settings default (POST
  `/api/settings/ollama {defaultModel}`) DOES fix it — proving the default-resolution
  is the sole gate.
- **No fallback to a pulled model:** `/api/tags` is queried only in
  `testOllamaConnection` (`:349`) and its list is discarded.
- Duplicate latent site: `src/lib/chat/ollama-engine.ts:44-47` (chat path, same
  hardcoded default; chat happened to work in staging because it ran on claude-code).

## Repro

1. Fresh install (staging), Ollama running with any model that is NOT `llama3.2`
   (e.g. `qwen2.5`). Do not set a Settings → Ollama default model.
2. Create a task, queue it, execute → task routes to `ollama`, resolves `model:null`
   → 404 `model 'llama3.2' not found`. Status: failed.

## Proposed fix

- In `getOllamaModel()`: when `OLLAMA_DEFAULT_MODEL` is empty, resolve to an
  **available pulled model** by querying `/api/tags` (pick the first, or a sensible
  heuristic), instead of the hardcoded `llama3.2`.
- If `/api/tags` is empty (no models pulled), throw a **named**
  `OllamaModelNotConfiguredError` with an actionable message ("Pull a model or set a
  default in Settings → Ollama"), NOT a raw 404 — CLAUDE.md #1/#2.
- Optionally thread a per-task requested Ollama model through
  `resolveTaskExecutionTarget` so a task can pin its model (parity with chat).
- Apply the same fix to `ollama-engine.ts:44-47`.
- Regression test: fresh-install Ollama task with a non-`llama3.2` model succeeds.

## Principle
CLAUDE.md #1 (zero silent failures — assumes a model is pulled), #2 (name the error
vs generic `Error`; a `RequestedModelUnavailableError` already exists to mirror), #3
(the empty-setting shadow path falls to a constant instead of a live lookup).
