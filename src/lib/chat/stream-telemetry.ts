/**
 * Chat stream termination telemetry.
 *
 * Lightweight, in-memory ring buffer that records how SSE chat streams
 * terminate. Added in response to a sibling-repo bug report claiming
 * conversations refresh mid-stream — the proposed root cause (Next.js dev
 * HMR remounting ChatShell) is already mitigated in this repo, so rather
 * than port a speculative fix, we instrument the termination boundaries
 * and let real data decide whether a resume protocol is worth building.
 *
 * Six server-side reason codes:
 *   - stream.completed        — normal end-of-generator (success path)
 *   - stream.aborted.signal   — req.signal fired, engine catch block entered
 *   - stream.aborted.client   — ReadableStream cancel callback fired; Relay
 *                               also propagates this into the engine signal,
 *                               so a paired aborted.signal may be present
 *   - stream.finalized.error  — non-abort exception in engine catch block
 *   - stream.abandoned        — generator return() called by consumer
 *                               (finally ran but catch was skipped). Covers
 *                               iterator abandonment — the case where the
 *                               route's for-await breaks out gracefully and
 *                               the engine's own happy/catch paths are both
 *                               bypassed. Recorded from finalizeStreamingMessage
 *                               when it actually performs a salvage update.
 *   - stream.reconciled.stale — reconcileStreamingMessages swept an orphan
 *                               at chat page load (10-min cutoff)
 *
 * Four client-side reason codes (logged via console.info with a stable
 * prefix so tests and grep can find them):
 *   - client.stream.done          — reader.read() returned done: true
 *   - client.stream.user-abort    — user clicked Stop / AbortController fired
 *   - client.stream.reader-error  — reader.read() or decode threw
 *   - client.stream.view-remount  — a chat-consuming component unmounted
 *                                    while a stream was in flight. The stream
 *                                    itself continues in the provider; this
 *                                    code exists so diagnostics can confirm
 *                                    the provider-hoisting fix is holding.
 *
 * As of the `chat-session-persistence-provider` feature, the SSE reader
 * loop runs inside `ChatSessionProvider` (rendered from the root layout),
 * not inside the route-scoped `ChatShell`. Sidebar navigation no longer
 * tears down the reader loop, so "client.stream.user-abort" should only
 * fire when the user explicitly clicks Stop. If it starts firing on plain
 * view switches again, something has regressed the provider hoisting.
 * HMR in dev can still reset the provider module — that is expected.
 *
 * Read via the dev-only `GET /api/diagnostics/chat-streams` endpoint.
 * The buffer is process-local — a server restart clears it, which is fine
 * for dev diagnostics and avoids adding a persistence layer that would
 * itself need testing.
 */

export type TerminationReason =
  | "stream.completed"
  | "stream.aborted.signal"
  | "stream.aborted.client"
  | "stream.finalized.error"
  | "stream.abandoned"
  | "stream.reconciled.stale";

export interface TerminationEvent {
  reason: TerminationReason;
  conversationId: string | null;
  messageId: string | null;
  durationMs: number | null;
  error?: string;
  timestamp: number;
}

/** Ring buffer capacity — ~500 events is ~50KB, negligible for a dev tool. */
const CAPACITY = 500;

/**
 * Module-level circular buffer. Newer events overwrite older ones once
 * capacity is reached. Writes are O(1), reads copy-out in order.
 *
 * Next.js dev HMR may re-import this module and reset the buffer — that
 * is expected behavior and not a bug. The buffer is intentionally not
 * persisted; its purpose is "what happened in the last N minutes of this
 * process", not forensic logging.
 */
const buffer: TerminationEvent[] = new Array(CAPACITY);
let writeIndex = 0;
let writeCount = 0;

export function recordTermination(event: Omit<TerminationEvent, "timestamp">): void {
  const full: TerminationEvent = { ...event, timestamp: Date.now() };
  buffer[writeIndex] = full;
  writeIndex = (writeIndex + 1) % CAPACITY;
  writeCount++;
}

/**
 * Return all recorded events in chronological order (oldest → newest).
 * Copies out of the ring buffer so callers can't mutate internal state.
 */
export function readTerminations(): TerminationEvent[] {
  const count = Math.min(writeCount, CAPACITY);
  if (count === 0) return [];
  const result: TerminationEvent[] = new Array(count);
  // Start at the oldest slot. When the buffer is full, the oldest is at
  // writeIndex (the next slot to be overwritten). When not full, it's at 0.
  const start = writeCount > CAPACITY ? writeIndex : 0;
  for (let i = 0; i < count; i++) {
    result[i] = buffer[(start + i) % CAPACITY]!;
  }
  return result;
}

/**
 * Aggregate event counts by reason code for the last `windowMs` milliseconds.
 * Pass 0 or omit to get counts across the entire buffer.
 */
export function countTerminations(windowMs = 0): Record<TerminationReason, number> {
  const counts: Record<TerminationReason, number> = {
    "stream.completed": 0,
    "stream.aborted.signal": 0,
    "stream.aborted.client": 0,
    "stream.finalized.error": 0,
    "stream.abandoned": 0,
    "stream.reconciled.stale": 0,
  };
  const cutoff = windowMs > 0 ? Date.now() - windowMs : 0;
  for (const event of readTerminations()) {
    if (event.timestamp >= cutoff) {
      counts[event.reason]++;
    }
  }
  return counts;
}

/**
 * Reset the buffer. Intended for tests — do not call in production code.
 */
export function __resetForTesting(): void {
  for (let i = 0; i < CAPACITY; i++) buffer[i] = undefined as never;
  writeIndex = 0;
  writeCount = 0;
}
