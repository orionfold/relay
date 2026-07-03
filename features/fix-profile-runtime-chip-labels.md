---
title: Fix — profile runtime chips collapse 4 runtimes to "Claude", hiding Ollama ($0)
status: fixed
priority: P2
milestone: mvp
source: staging Mode B run 2026-07-03, bundle output/staging/2026-07-03-suite/ (J2-1, verified CONFIRMED against HEAD f00fdaa3)
issue: https://github.com/orionfold/relay/issues/26
dependencies: []
---

# Fix: profile runtime-coverage chips render "Claude Codex Claude Claude Claude"

## Description (verified mechanism)

Every profile card's runtime-coverage row shows 5 chips as **"Claude Codex Claude
Claude Claude"** for the runtime set `[claude-code, openai-codex-app-server,
anthropic-direct, openai-direct, ollama]`. A customer cannot tell which runtimes a
profile covers, and — worst — **Ollama (the $0-local differentiator) displays as
"Claude"**.

Code-verified: `src/components/profiles/profile-card.tsx:18-23` maps every runtime
label inline as `runtime.label.includes("Codex") ? "Codex" : "Claude"` (rendered at
`:70`). The catalog (`src/lib/agents/runtime/catalog.ts`) has distinct labels —
"Ollama (Local)" (L268), "Anthropic Direct API" (L184), "OpenAI Direct API" (L228) —
but only "OpenAI Codex App Server" contains "Codex", so `ollama`, `anthropic-direct`,
and `openai-direct` all fall through to "Claude".

## Repro
`/profiles` → any built-in card → the runtime row reads "Claude Codex Claude Claude
Claude"; the Ollama chip says "Claude".

## Proposed fix

- Replace the inline `label.includes("Codex") ? "Codex" : "Claude"` with a real
  runtime-id → short-label map (e.g. `claude-code`→"Claude", `openai-codex-app-server`→
  "Codex", `anthropic-direct`→"Anthropic", `openai-direct`→"OpenAI", `ollama`→"Ollama").
- Surface Ollama distinctly (it is the $0 differentiator) — consider "Ollama (Local)".
- De-dup identical labels so the row reads e.g. "Claude · Codex · Anthropic · OpenAI ·
  Ollama" rather than five ambiguous chips.

## Principle
CLAUDE.md #5 (explicit over clever — an inline ternary hides the real mapping); the
UI currently misrepresents capability coverage.
