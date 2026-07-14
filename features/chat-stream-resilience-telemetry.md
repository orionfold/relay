---
title: Chat Stream Resilience Telemetry
status: completed
priority: P2
milestone: post-mvp
source: internal history record
dependencies: [chat-engine, chat-api-routes]
---

# Chat Stream Resilience Telemetry

## Description

A sibling ainative instance reported mid-stream chat cutoffs — conversations randomly refreshing during streaming, losing the in-progress assistant message. The sibling team attributed the symptom to Next.js dev-mode HMR remounting the chat component and abandoning the SSE reader. Before grooming that fix forward, we validated the root cause against this repo and found most of the proposed mitigations **already exist here**:

| Mitigation | Location in this repo |
|---|---|
| `finalizeStreamingMessage()` runs in a `finally` block | `src/lib/chat/engine.ts:720` |
| `reconcileStreamingMessages()` safety net on page load (10-min stale threshold) | `src/lib/chat/reconcile.ts:59-82`, called from `src/app/chat/page.tsx:18-22` |
| AbortController-based client stream control | `src/components/chat/chat-shell.tsx:257-268` |
| HMR-tolerant permission bridge with explicit "request may already be gone" comment | `src/lib/chat/permission-bridge.ts` and the respond API route |
| Zero `router.refresh()` / `revalidatePath` / `location.reload()` in chat code | verified by grep |

**We cannot reproduce the described bug locally**, and the architectural trap the sibling team identified appears already mitigated. Rather than speculatively port their proposed fixes (SSE resume protocol, Web Worker isolation, module-level state persistence across HMR), this feature adds lightweight telemetry so we can detect whether stream interruptions actually occur in this deployment. If the telemetry shows a real signal, we file a follow-up feature for an SSE resume protocol backed by evidence. If the telemetry is quiet, we close the risk with confidence.

This is the "verify before building" discipline the supervisor skill calls out — a telemetry-first feature is cheaper than a speculative resume protocol, and its output directly informs whether the follow-up is worth building.

## User Story

As a maintainer, I want to know when and why chat SSE streams terminate abnormally in this deployment, so that I can decide whether to invest in a resume protocol — or confidently close the risk as already-mitigated.

## Technical Approach

### 1. Structured termination logging

Instrument the chat stream lifecycle with six reason codes, each logged with `conversationId`, `messageId`, elapsed duration (ms), and (where applicable) error message:

| Reason code | Where to log | Condition |
|---|---|---|
| `stream.completed` | `src/lib/chat/engine.ts` (end of `sendMessage` generator, on successful exhaustion) | Normal end — reader hit `done: true` |
| `stream.aborted.client` | `src/app/api/chat/conversations/[id]/messages/route.ts` (cancel callback on the `ReadableStream`) | Client closed the connection / called AbortController.abort() |
| `stream.aborted.signal` | `src/lib/chat/engine.ts` (catch block when `signal?.aborted`) | `req.signal` fired mid-generation and SDK iterator threw |
| `stream.finalized.error` | `src/lib/chat/engine.ts` (catch block when no signal abort) | Exception path — the SDK threw during generation |
| `stream.abandoned` | `src/lib/chat/reconcile.ts` `finalizeStreamingMessage()` when it performs a salvage update | Consumer broke out of the for-await without an error, invoking `iterator.return()` which unwinds through `finally` and skips `catch`. This covers HMR mid-stream, clean client disconnects, and any other code path that bypasses both primary termination branches. **Added after E2E evaluation revealed the original 5-code set missed this case.** |
| `stream.reconciled.stale` | `src/lib/chat/reconcile.ts` `reconcileStreamingMessages()` (per orphan swept) | Safety net caught a row stuck in `streaming` state older than 10 min at chat page load |

Use the existing structured logger (not `console.log` directly) — check what pattern `src/lib/chat/engine.ts` already uses and match it.

### 2. Client-side reader-loop telemetry

In `src/components/chat/chat-shell.tsx` (lines 275-395), distinguish three exit paths for the reader loop:

- Normal `done: true` → log `client.stream.done`
- Reader throws an error → log `client.stream.reader-error` with the error type
- User abort (AbortController triggered) → log `client.stream.user-abort`

Send these via an existing telemetry path — look for how other client-side events are reported (likely through a `fetch('/api/diagnostics/...')` or analytics wrapper).

### 3. Dev-only diagnostics endpoint

Add `src/app/api/diagnostics/chat-streams/route.ts`:

- `GET` returns counts for each reason code over the last N hours from an in-memory ring buffer (simple — no DB persistence needed for dev).
- Gate behind `process.env.NODE_ENV !== "production"` or the existing dev-mode sentinel (`AINATIVE_DEV_MODE=true`) — this is for maintainer inspection, not user-facing.
- Response shape:
  ```typescript
  {
    windowHours: number,
    counts: Record<TerminationReason, number>,
    recent: Array<{ reason, conversationId, durationMs, timestamp, error? }>
  }
  ```

The in-memory ring buffer lives in `src/lib/chat/stream-telemetry.ts` (new file) — a module-level `CircularBuffer<TerminationEvent>` of size ~500. Engine + route + reconcile all push to the same buffer via a small `recordTermination(event)` helper. No persistence — a server restart clears the buffer, which is fine for dev diagnostics.

### 4. Runbook note

Add a short section to `AGENTS.md` (or a new `docs/runbooks/chat-stream-debugging.md` if AGENTS.md is full):

> **"Chat refreshed mid-stream" bug reports**: Before filing, hit `GET /api/diagnostics/chat-streams` and check whether `stream.aborted.client`, `stream.aborted.signal`, or `stream.finalized.error` counts are elevated. Attach the response to the bug report. If all termination events are `stream.completed` or `client.stream.done`, the symptom is likely client-side (browser extension, tab suspension) rather than a server stream issue.

### 5. Escalation trigger (not part of this feature, but documented)

If telemetry shows >1% of streams terminating with `stream.aborted.client` / `stream.finalized.error` during normal use, file a follow-up feature `chat-stream-resume-protocol` with the evidence. That follow-up would introduce:
- Client sends `lastEventId` on reconnect
- Server replays events from that point
- A new TDR for "SSE resume via lastEventId"

**Do not build the resume protocol speculatively.** Only after telemetry confirms the need.

## Acceptance Criteria

- [ ] Six server-side termination reason codes logged at the correct lifecycle points with `conversationId`, `messageId`, and `durationMs`.
- [ ] Three client-side reader-loop exit paths logged with distinguishable reason codes.
- [ ] `src/lib/chat/stream-telemetry.ts` exists and exposes `recordTermination()` + ring-buffer read accessors.
- [ ] `GET /api/diagnostics/chat-streams` returns counts and recent events, gated behind dev mode.
- [ ] Chat page UI is unchanged — zero visual impact for end users.
- [ ] Happy-path stream latency is unchanged (measured against a baseline — the existing screengrab flow is sufficient).
- [ ] Runbook note added explaining how to use the diagnostics endpoint before filing a "chat refreshed mid-stream" bug.
- [ ] Unit tests for the ring buffer (push, wrap, read).
- [ ] `npm test` passes, `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- Termination reason logging (server + client)
- In-memory ring buffer
- Dev-only diagnostics GET endpoint
- Runbook note
- Unit tests for the ring buffer

**Excluded:**
- SSE resume protocol (`lastEventId` replay) — deferred pending telemetry signal
- Web Worker isolation for the SSE reader — deferred pending telemetry signal
- Module-level state persistence across HMR — deferred pending telemetry signal
- Persistent (DB-backed) telemetry — in-memory is sufficient for dev diagnostics
- Production telemetry shipping to an external analytics system — out of scope; this is a local dev tool
- A new TDR — no new architectural decision yet (would only be needed if a resume protocol lands)

## References

- Source: `internal history record` (original theory from sibling repo)
- Mitigations already in place:
  - `src/lib/chat/engine.ts:720` — `finalizeStreamingMessage()` in finally block
  - `src/lib/chat/reconcile.ts:59-82` — `reconcileStreamingMessages()` safety net
  - `src/app/chat/page.tsx:18-22` — reconcile called on page load
  - `src/components/chat/chat-shell.tsx:257-268` — AbortController client control
  - `src/lib/chat/permission-bridge.ts` — HMR-tolerant request handling
- Files to modify: `src/lib/chat/engine.ts`, `src/app/api/chat/conversations/[id]/messages/route.ts`, `src/lib/chat/reconcile.ts`, `src/components/chat/chat-shell.tsx`, `AGENTS.md`
- Files to create: `src/lib/chat/stream-telemetry.ts`, `src/app/api/diagnostics/chat-streams/route.ts`
- Related: `chat-engine`, `chat-api-routes`
