# fix: Ollama chat/compose silently 400s — conversations-create allow-list omits "ollama"

**Status:** IMPLEMENTED + VERIFIED (2026-07-04, real Ollama send) · **Priority:** P1 (HIGH) · **Milestone:** 0.25.1
**Source:** staging Mode B run 2026-07-03, bundle `output/staging/2026-07-03/R2/` (finding R2-1, verified against HEAD `3e0f438c`) · **Public issue:** #30
**Dependencies:** none. Runtime-registry-adjacent? The `conversations` route + chat runtime resolution — verify with a real Ollama chat send, not just a unit test.

## Description (verified mechanism, not the raw symptom)

On a fresh install, a customer who picks **"Best privacy (local only)"** (Ollama) at the first-run
chat-model modal cannot start any chat OR compose — the composer clears the input and nothing happens,
with **no error shown**. Both the headline compose feature and ordinary chat are dead on arrival for the
privacy tier.

**Root cause — a stale allow-list gate** (all 4 links verified independently):
- `src/app/api/chat/conversations/route.ts:54` — `const validRuntimes = ["claude-code", "openai-codex-app-server"];`
  EXCLUDES `"ollama"`. POST with `runtimeId: "ollama"` → **HTTP 400** at `:55-59` (`"Invalid runtimeId…"`).
- `src/lib/chat/types.ts:115` — `getRuntimeForModel()` returns `"ollama"` for an Ollama-provider model
  (`:119` for an `ollama:`-prefixed id). So the client legitimately sends the runtime the route rejects.
- `src/components/chat/chat-session-provider.tsx:291-299` — client POSTs
  `runtimeId: getRuntimeForModel(modelIdRef.current)` on conversation-create. **`:300` `if (!res.ok) return null`**
  swallows the 400 (no toast — sibling paths DO toast, e.g. `:558` `toast.error("Failed to create branch")`).
  `sendMessage` then silent-returns at `:588`; `chat-input.tsx:139` clears the composer synchronously before
  the async send resolves → "input clears, nothing happens, no error."
- `src/lib/chat/ollama-engine.ts:28` — `sendOllamaMessage` EXISTS; Ollama chat is genuinely implemented
  downstream (metering tests too). So the allow-list is a **stale gate**, not a "not supported" condition —
  the rest of the chat stack (engine, capability-banner, `getRuntimeForModel`) treats Ollama as first-class.

**Principles violated:** #1 (zero silent failures — the 400 is swallowed, no user-facing signal) and
#3 (shadow path — the first-run modal advertises Ollama, but the conversations-create endpoint doesn't
know it exists). The model selector even lists Ollama models under "Ollama (Local) · Free."

## Repro
1. Fresh install → first-run "Pick your default chat model" modal → select **"Best privacy (local only)"**.
2. Go to Chat or Compose → type any prompt → submit.
3. Observe: input clears, no conversation created, no error. Network: `POST /api/chat/conversations → 400
   {"error":"Invalid runtimeId. Must be one of: claude-code, openai-codex-app-server"}`.

## Proposed fix
1. Add `"ollama"` to `validRuntimes` at `src/app/api/chat/conversations/route.ts:54`.
2. Confirm the conversation-create → message path threads `ollama-engine` for `runtimeId: "ollama"`
   (the engine exists; verify the create path selects it). Add a focused test that a `runtimeId:"ollama"`
   conversation-create returns 201 and a subsequent message routes to `sendOllamaMessage`.
3. (Recommended, defense-in-depth for the silent-swallow class) surface a toast at
   `chat-session-provider.tsx:300` when conversation-create returns non-2xx, so this error class is never
   again invisible to the user (Principle #1).

## Verification (REQUIRED — real Ollama send)
With a local Ollama running, on a fresh instance: pick "Best privacy (local only)" → send a chat message →
assert a conversation is created AND the message streams a response from the Ollama model (not a cleared
input). A unit test on the route alone is necessary but not sufficient — verify the end-to-end send.

## Implementation + verification — 2026-07-04

**Fix shipped:**
1. `conversations/route.ts:54` — added `"ollama"` to `validRuntimes` (kept the literal; no canonical
   runtime-id constant exists and DRY doesn't warrant one for a 3-element list — Principle #6).
2. Confirmed the message-send path already handles it: `engine.ts:249-251` routes
   `effectiveRuntimeId === "ollama"` → `sendOllamaMessage`. No new threading needed.
3. Defense-in-depth (Principle #1): `chat-session-provider.tsx:300` now toasts the server's error detail
   on a non-2xx conversation-create instead of silently `return null`.
4. Test `conversations/__tests__/runtime-allowlist.test.ts` — ollama→201, cloud runtimes→201,
   unknown→400, missing→400.

**Real-launch verify (runtime-registry-adjacent → smoke-budget rule):** `next dev --port 3211`, isolated
data dir, against the local Ollama (`qwen2.5:latest`). `POST /api/chat/conversations {runtimeId:"ollama"}`
→ **201** (was 400); `POST …/messages` → 200, streamed the assistant reply "PONG" from the local model in
7.2s. Server log shows zero "Invalid runtimeId" 400s. 363 chat tests + typecheck green.
