---
title: Routing Cascade — Dual-Provider Auth & Model Recommendations
status: superseded
shipped-date: 2026-05-03
priority: P1
milestone: post-mvp
source: conversation — 2026-04-18 task-routing UX audit
dependencies: []
---

> Historical implementation record: verified shipped 2026-05-03, then
> superseded on 2026-07-15 by G-077 (`explicit-eligible-runtime-pool.md`).
> Routing policy no longer mutates provider authentication or model defaults;
> the former recommendation helper and cascade regressions were removed.

# Routing Cascade — Dual-Provider Auth & Model Recommendations

## Description

Selecting a Task Routing preference (Latency / Cost / Quality / Manual) on `/settings` should configure both Anthropic AND OpenAI providers — auth method AND default model — with Ollama surfaced when it is a better fit for the chosen preference. Users retain full override of every recommendation.

Today the cascade is asymmetric: only Anthropic's panel reacts, OpenAI is ignored, and per-runtime default models are never touched. The only feedback is a 3-second toast. The user is left to scroll through each provider row and infer what the routing preference should mean for them.

## User Story

As a user, I want my Task Routing choice to visibly configure both providers' auth methods and default models above the fold so that I can trust my preference is actually driving routing and I can override per-provider if I want.

## Technical Approach

A new pure helper `recommendForRouting(pref, { ollamaAvailable, ollamaDefaultModel })` returns a provider-keyed recommendation (`{anthropic, openai, useOllama, ollamaModel?}`). The helper lives at `src/lib/settings/routing-recommendation.ts` and is tested exhaustively (4 preferences × Ollama on/off = 8 cases).

The existing `GET /api/settings/providers` is extended to include Ollama availability (via `testRuntimeConnection("ollama")`) with a 15-second in-memory TTL cache, plus echoes of `anthropic_direct_model` / `openai_direct_model` settings. Per-runtime model persistence reuses the existing per-provider POSTs: `POST /api/settings` and `POST /api/settings/openai` gain an optional `model` field. The Zod validators in `src/lib/validators/settings.ts` are extended accordingly.

The settings component rewrites `handleRoutingChange` to fire parallel POSTs via `Promise.allSettled`, report per-provider success/failure in a single toast, then `fetchData()` to re-sync. New `openAIOpen` state mirrors the existing `anthropicOpen` pattern (ProviderRow already supports a controlled `open` prop). A "Recommended for {pref}" banner renders inline below the radio row, using the existing inline-banner pattern (`rounded-xl border border-primary/20 bg-primary/5`). Recommendation chips use `Badge variant="outline"` with icon prefixes so they visually differ from the filled `AuthStatusBadge` chips in the provider rows below.

### Recommendation Matrix

| Preference | Anthropic | OpenAI | Ollama branch |
|---|---|---|---|
| Latency | `api_key` + `claude-haiku-4-5-20251001` | `api_key` + `gpt-4.1-nano` | not shown |
| Cost (Ollama connected) | `api_key` + `claude-haiku-4-5-20251001` | `api_key` + `gpt-4.1-nano` | `llama3` — primary |
| Cost (Ollama offline) | `api_key` + `claude-haiku-4-5-20251001` | `api_key` + `gpt-4.1-nano` | not shown |
| Quality | `oauth` + `claude-sonnet-4-20250514` | `oauth` → ChatGPT login + `gpt-4.1` | not shown |
| Manual | no change | no change | not shown |

## Acceptance Criteria

- [x] Clicking Latency/Cost/Quality writes the recommendation for BOTH providers — auth + model — via parallel POSTs.
- [x] Clicking Cost when Ollama is connected also writes the Ollama default model via `POST /api/settings/ollama`.
- [x] Clicking Manual writes no provider changes; the banner collapses to a single explanatory line.
- [x] A "Recommended for {pref}" banner renders inline below the radio row using the existing inline-banner pattern.
- [x] Recommendation chips use `Badge variant="outline"` so they visually differ from the filled `AuthStatusBadge` configured-state chips.
- [x] At 1512×767, the routing radio row + recommendation banner + Anthropic row header are all above the fold.
- [x] The OpenAI provider row auto-expands when a non-Manual routing is selected, mirroring Anthropic.
- [x] Each provider row in the banner has a "Configure ↓" link that scrolls and opens that ProviderRow.
- [x] When one cascade POST fails, the other provider still updates; the UI reports the specific failure and re-syncs via `fetchData()`.
- [x] User overrides (manually switching auth or changing model) persist and are not reverted unless the user picks a new routing preference.
- [x] When Ollama probe returns `connected: false`, Cost falls back to haiku + nano and the Ollama row is hidden.
- [x] Switching between Quality and Cost/Latency visibly changes the OpenAI row's recommended auth chip.

## Scope Boundaries

**Included (v1):**
- Cascade covers Anthropic, OpenAI, and (for Cost) Ollama.
- Model updates via routing cascade only.
- Recommendation banner with outline-variant chips.
- Per-provider Configure links that expand + scroll.
- 15-second TTL cache on Ollama availability probe.
- 8-case recommendation unit test matrix.

**Excluded (v2+):**
- Per-runtime model selector dropdown in the UI (outside of cascade).
- Server-side validation of `model` strings against `getRuntimeCatalogEntry(id).models.options`.
- "Your configuration differs from the recommendation" inline hint.
- Cascade extension to additional providers beyond Anthropic, OpenAI, Ollama.
- Per-task override flow referencing routing state from the task create panel.

## Dependencies / Risks

- `ProvidersPayload` shape change is consumed by `providers-runtimes-section.tsx` + its test; both move together.
- Anthropic `AuthMethod` is `"api_key" | "oauth"`; OpenAI internal is `"apikey" | "chatgpt"`. The cascade POSTs `"oauth"` to OpenAI for Quality and relies on the existing route's normalization.
- 5-second Ollama probe runs on `/api/settings/providers` GET. Mitigated by 15s TTL cache — fresh on tab load, cached across radio-click re-fetches.
- `OpenAIChatGPTAuthControl` starts a login flow on auth switch; banner copy must explain that picking Quality will prompt a ChatGPT sign-in.
- Model strings are not validated against the catalog enum in v1 — stale model IDs (after Anthropic/OpenAI rotation) silently point at an unavailable model until the catalog is updated.

## References

- Conversation: 2026-04-18 audit of `/settings` task-routing asymmetry
- Current cascade code: `src/components/settings/providers-runtimes-section.tsx:364-384`
- Runtime preference scoring (inspiration for matrix): `src/lib/agents/router.ts:64-86`
- Ollama probe: `src/lib/agents/runtime/ollama-adapter.ts:346`
- Higher-level runtime connection test: `src/lib/agents/runtime/index.ts:182`
