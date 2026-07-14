---
title: Chat Session Persistence Provider
status: completed
priority: P0
milestone: post-mvp
source: internal history record
dependencies: [chat-engine, chat-ui-shell, chat-stream-resilience-telemetry]
---

# Chat Session Persistence Provider

## Description

Chat conversations regress when the user switches sidebar views mid-stream.
Navigating away from `/chat` destroys the in-flight SSE reader loop along with
all local chat state, and navigating back can wipe the visible turn history
entirely if the messages refetch has any hiccup. The regression reproduces
across both Claude and GPT (Codex) runtimes, so it is not a model or runtime
issue — it is an architectural mismatch between streaming lifecycle and view
lifecycle in the current `ChatShell` design.

The existing `chat-stream-resilience-telemetry` feature (commit `89316c4`,
timing fix in `a131402`) explicitly called out this escalation trigger:

> If telemetry shows >1% of streams terminating with unexpected codes during
> normal use, file a follow-up feature `chat-stream-resume-protocol` with
> evidence.

The user's bug report is that evidence — but the right fix is not a resume
protocol. The root cause is that all chat state lives inside `ChatShell`
(a route-level component) instead of a layout-level provider that survives
route transitions. Hoisting the state one level up makes the bug
architecturally impossible to reproduce, and it also fixes a second latent
bug where `handleSelectConversation`'s catch block calls `setMessages([])`
on any fetch error.

## User Story

As a user, I want to switch between sidebar views while a chat turn is
streaming and return to the conversation with the response fully intact,
so that I can multitask during long generations without losing context.

## Technical Approach

### 1. New file: `src/components/chat/chat-session-provider.tsx`

A client-side React context provider that owns every piece of chat-domain
state currently held in `ChatShell`. Rendered by `src/app/layout.tsx` around
`<main>{children}</main>` so that **the provider and its state persist
across sidebar navigation** — a Next.js App Router guarantee when providers
live in a layout rather than a child route.

State held by the provider:

- `conversations: ConversationRow[]`
- `activeId: string | null`
- `messagesByConversation: Map<string, ChatMessageRow[]>` — keyed by
  conversation id so switching conversations does not clobber state from
  other open conversations
- `streamingState: { conversationId: string; assistantMsgId: string;
  abortController: AbortController; startedAt: number } | null` — singleton
  slot describing the currently-active stream, if any
- `modelId: string`
- `availableModels: ChatModelOption[]`
- `hydrated: boolean` — true once the initial `listConversations` fetch completes

Actions exposed via `useChatSession()`:

- `sendMessage(content: string, mentions?: MentionReference[])` — creates a
  conversation if one is not active, appends an optimistic user message,
  appends a placeholder assistant message in `streaming` state, opens
  `fetch().body.getReader()`, and runs the SSE read loop **inside the
  provider callback**. Every delta/status/done/permission_request/question/
  screenshot/error event updates `messagesByConversation` via functional
  setState.
- `stopStreaming()` — calls `streamingState.abortController.abort()`
- `selectConversation(id)` — loads messages and conversation metadata for
  `id`, sets `activeId`. **On fetch failure: preserve existing messages for
  that conversation**, surface a non-blocking `toast.error`, and do **not**
  call `setMessagesByConversation(new Map())`.
- `createConversation(modelId)` — creates a new conversation via
  `POST /api/chat/conversations`, prepends to `conversations`, sets active.
- `deleteConversation(id)`, `renameConversation(id, title)`, `setActiveModelId(modelId)`

### 2. Provider lifecycle

One-time initialization on first mount (runs in root layout, so exactly once
per page load):

- Lazy-fetch initial conversations via `fetch("/api/chat/conversations")`
- Lazy-fetch default model via `fetch("/api/settings/chat")`
- Lazy-fetch available models via `fetch("/api/chat/models")`
- Restore `activeId` from `localStorage["ainative-active-chat"]`, then lazy-
  fetch messages for it

Because the provider lives in the root layout, these fetches run exactly once
per page load (not once per `/chat` mount). Rapid nav no longer re-fires them.

### 3. ChatShell becomes a thin consumer

`src/components/chat/chat-shell.tsx` drops every `useState` hook that held
chat-domain state and instead calls `useChatSession()`. All its callbacks
become thin wrappers over session actions. View-local state (mobile sheet
open, hover preview) stays.

The useEffect at lines 50-67 that restores active conversation on mount moves
into the provider's init effect — so it runs once at app load, not once per
`/chat` mount.

### 4. Layout integration

`src/app/layout.tsx` wraps `<main id="main-content">{children}</main>` with
`<ChatSessionProvider>`. The provider is a `"use client"` component so it
renders inside the server component layout without forcing the whole layout
to become a client component.

Rejected alternative: running `listConversations()` inside the server layout
(layout.tsx is already async) and passing `initialConversations` prop to
the provider. Rejected because it would execute the DB query on every route
navigation across the entire app, taxing non-chat pages.

### 5. Telemetry hook

Add a new client-side reason code `client.stream.view-remount` to
`src/lib/chat/stream-telemetry.ts` as documentation (the server cannot see
it directly — it is logged via `console.info("[chat-stream] ...")`).
Logged from a useEffect cleanup in any consumer that mounts while a stream
is active, indicating the view switched away while streaming. This
complements the existing three client codes and proves at `GET
/api/diagnostics/chat-streams` time that the provider-based fix is working
(the count of abandoned streams should drop to zero for this scenario).

### 6. Server-side is unchanged

`finalizeStreamingMessage()` and `reconcileStreamingMessages()` already
handle partial message salvage correctly. No changes to `src/lib/chat/
engine.ts`, `src/lib/chat/reconcile.ts`, or the route handler. No
migrations. No schema changes.

## Acceptance Criteria

- [ ] `src/components/chat/chat-session-provider.tsx` exists with
      `ChatSessionProvider` component, `useChatSession` hook, and the action
      surface listed above.
- [ ] `src/app/layout.tsx` wraps `<main>` with `<ChatSessionProvider>`.
- [ ] `src/components/chat/chat-shell.tsx` holds zero chat-domain `useState`
      hooks. It consumes the provider exclusively for chat state.
- [ ] Neither the provider nor `ChatShell` contains a `setMessages([])` or
      equivalent catch-all clear. Fetch failures preserve existing state.
- [ ] Manual repro: start a 5-10s streaming response, click Dashboard, wait
      10s, return to `/chat`. Assistant message is complete or still
      streaming live. Prior user turn and assistant content intact.
- [ ] Manual repro: same as above, five times rapidly, across both Claude
      and GPT runtimes. Zero turn loss.
- [ ] `GET /api/diagnostics/chat-streams` shows zero `stream.abandoned`
      events for the nav-during-streaming scenario.
- [ ] Stop button still aborts correctly via provider's AbortController.
- [ ] Unit tests in `src/components/chat/__tests__/chat-session-provider.test.tsx`
      cover: unmount/remount preserves state; fetch failure in
      `selectConversation` preserves existing messages; `sendMessage`
      accumulates deltas; `stopStreaming` aborts cleanly.
- [ ] `npm test` passes, `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- New `ChatSessionProvider` in layout
- `ChatShell` refactor to consume the provider
- Fix for the `setMessages([])` catch-all in `handleSelectConversation`
- One new client-side telemetry reason code for observability
- Unit tests for the provider

**Excluded:**
- SSE resume protocol (`lastEventId` replay) — still deferred; provider
  preserves state across view switches but not across full page reloads or
  browser tab close
- Web Worker isolation for the SSE reader — still deferred
- Multi-tab chat state sync via BroadcastChannel — out of scope
- Changes to server-side engine, reconcile, or stream telemetry module
- Changes to conversation list, message list, or input composer components
- A new TDR — this is a client architecture fix, not a cross-cutting
  architectural decision. If the pattern is reused elsewhere (e.g.,
  workflow execution state), a TDR would be appropriate then.

## References

- Source: `internal history record`
- Related: `chat-stream-resilience-telemetry` (telemetry that measured this),
  `chat-engine`, `chat-ui-shell`, `chat-conversation-persistence`
- Files to create:
  - `src/components/chat/chat-session-provider.tsx`
  - `src/components/chat/__tests__/chat-session-provider.test.tsx`
- Files to modify:
  - `src/app/layout.tsx` — wrap main with provider
  - `src/components/chat/chat-shell.tsx` — consume provider, drop local state
  - `src/app/chat/page.tsx` — simplify initial props; may stay as-is if
    provider accepts hydration hints
  - `src/lib/chat/stream-telemetry.ts` — add `client.stream.view-remount`
    reason code doc comment

## Verification run — 2026-04-14

End-to-end smoke run of the plan's Task 4 after the `view-remount`
telemetry landed. Executed against the developer's live dev server on
port 3000 (`next dev --turbopack`, PID 67490, started 10:59 PM the
prior night — HMR picked up the `ChatShell` change cleanly).

| Scenario | Runtime | Nav cycles | Turn loss | `stream.abandoned` | Outcome |
|---|---|---|---|---|---|
| Single 5–10s stream + nav away/back | Claude (`sonnet`) | 1 | 0 | 0 | ✓ |
| Rapid Dashboard→Projects→Workflows→Chat | Claude (`sonnet`) | 5 | 0 | 0 | ✓ |
| Single 5–10s stream + nav away/back | GPT (Codex) | 1 | 0 | 0 | ✓ |
| Rapid Dashboard→Projects→Workflows→Chat | GPT (Codex) | 5 | 0 | 0 | ✓ |

`client.stream.view-remount` log lines appeared in the dev-server
console during nav-away events as expected, confirming the emitter
in `ChatShell` fires and the ref-based cleanup sees the correct
`activeId` at unmount time (not the stale closure-captured value).

One cosmetic observation unrelated to this feature: a Next.js 16
Turbopack preload warning appears once on page load —
`The resource .../_next/static/chunks/...__03.afym._.css was
preloaded using link preload but not used within a few seconds from
the window's load event.` This is a Turbopack CSS-chunk
measurement quirk, not a regression caused by the provider
hoisting. Not in scope for this feature; no action taken.

Closing criteria per spec AC all met: zero turn loss, zero
abandoned streams, telemetry breadcrumb present.
