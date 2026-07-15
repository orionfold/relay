/**
 * In-memory permission bridge for chat conversations.
 *
 * When the SDK's canUseTool callback fires during a chat turn,
 * we can't yield SSE events directly (different async context).
 * Instead, canUseTool pushes events to an AsyncQueue and blocks
 * on a Promise. The SSE bridge drains the queue and the respond
 * API endpoint resolves the Promise.
 */

import type { ChatStreamEvent } from "./types";
import { updateMessageStatus } from "@/lib/data/chat";

// ── Types ────────────────────────────────────────────────────────────

export interface ToolPermissionResponse {
  behavior: "allow" | "deny";
  updatedInput?: Record<string, unknown>;
  message?: string;
}

interface PendingRequest {
  resolve: (response: ToolPermissionResponse) => void;
  reject: (reason: Error) => void;
  conversationId: string;
  messageId?: string;
}

// ── In-memory stores ─────────────────────────────────────────────────

/** Pending permission/question requests awaiting user response */
const pendingRequests = new Map<string, PendingRequest>();

// ── AsyncQueue: side-channel for canUseTool → SSE bridge ─────────────

/**
 * Simple async queue that allows pushing from one async context
 * and pulling from another. Used to bridge canUseTool events into
 * the SSE generator.
 */
export class AsyncQueue<T> {
  private buffer: T[] = [];
  private waiters: Array<(value: T | undefined) => void> = [];
  private closed = false;

  push(item: T) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
    } else {
      this.buffer.push(item);
    }
  }

  /** Drain all currently buffered items without waiting */
  drain(): T[] {
    const items = [...this.buffer];
    this.buffer = [];
    return items;
  }

  /**
   * Block until the next item is available, then resolve with it.
   *
   * This is the wake-signal the Claude chat engine races against the SDK
   * iterator: when `canUseTool` pauses the SDK (no more SDK events until a
   * gate resolves), a pull() that began awaiting before the next
   * `emitSideChannelEvent` still resolves the moment that event is pushed —
   * so a second permission gate surfaces immediately instead of stalling
   * until the 120s auto-deny. Resolves with `undefined` (not a rejection)
   * when the queue closes, so a losing race branch never throws.
   */
  pull(): Promise<T | undefined> {
    if (this.buffer.length > 0) {
      return Promise.resolve(this.buffer.shift());
    }
    if (this.closed) {
      return Promise.resolve(undefined);
    }
    return new Promise<T | undefined>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Close the queue — any pending waiters resolve with the `undefined` sentinel */
  close() {
    this.closed = true;
    this.buffer = [];
    for (const waiter of this.waiters) {
      waiter(undefined);
    }
    this.waiters = [];
  }

  isClosed() {
    return this.closed;
  }

  get length() {
    return this.buffer.length;
  }
}

/** Active side-channel queues, keyed by conversationId */
const sideChannels = new Map<string, AsyncQueue<ChatStreamEvent>>();

// ── Public API ───────────────────────────────────────────────────────

/**
 * Create a side-channel queue for a conversation turn.
 * The SSE bridge should call this before starting the SDK query.
 */
export function createSideChannel(conversationId: string): AsyncQueue<ChatStreamEvent> {
  // Close any existing channel
  const existing = sideChannels.get(conversationId);
  if (existing) existing.close();

  const queue = new AsyncQueue<ChatStreamEvent>();
  sideChannels.set(conversationId, queue);
  return queue;
}

/**
 * Push an event to the conversation's side channel.
 * Called from canUseTool inside the SDK's async context.
 */
export function emitSideChannelEvent(conversationId: string, event: ChatStreamEvent) {
  const queue = sideChannels.get(conversationId);
  if (queue) {
    queue.push(event);
  }
}

/**
 * Create a pending request that blocks until the user responds.
 * Returns a Promise that resolves when `resolvePendingRequest` is called.
 */
export function createPendingRequest(
  requestId: string,
  conversationId: string,
  messageId?: string
): Promise<ToolPermissionResponse> {
  return new Promise<ToolPermissionResponse>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject, conversationId, messageId });

    // Auto-deny after 120 seconds (safety net)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        const pending = pendingRequests.get(requestId)!;
        pendingRequests.delete(requestId);
        resolve({ behavior: "deny", message: "Permission request timed out" });
        // Update DB so the message shows as expired on reload
        if (pending.messageId) {
          updateMessageStatus(pending.messageId, "error").catch(() => {});
        }
      }
    }, 120_000);
  });
}

/**
 * Resolve a pending request with the user's response.
 * Called from the respond API endpoint.
 */
export function resolvePendingRequest(
  requestId: string,
  response: ToolPermissionResponse,
  conversationId?: string,
  messageId?: string
): boolean {
  const pending = pendingRequests.get(requestId);
  if (!pending) return false;
  if (conversationId && pending.conversationId !== conversationId) return false;
  if (messageId && pending.messageId !== messageId) return false;

  pending.resolve(response);
  pendingRequests.delete(requestId);
  return true;
}

/**
 * Check if a pending request exists.
 */
export function hasPendingRequest(
  requestId: string,
  conversationId?: string,
  messageId?: string
): boolean {
  const pending = pendingRequests.get(requestId);
  return Boolean(
    pending &&
      (!conversationId || pending.conversationId === conversationId) &&
      (!messageId || pending.messageId === messageId)
  );
}

/**
 * Clean up all pending requests and side channels for a conversation.
 * Called when a conversation turn ends or the connection drops.
 */
export function cleanupConversation(conversationId: string) {
  // Reject all pending requests for this conversation
  for (const [id, pending] of pendingRequests) {
    if (pending.conversationId === conversationId) {
      pending.resolve({ behavior: "deny", message: "Conversation ended" });
      pendingRequests.delete(id);
      // Update DB so the message shows as expired on reload
      if (pending.messageId) {
        updateMessageStatus(pending.messageId, "error").catch(() => {});
      }
    }
  }

  // Close and remove the side channel
  const channel = sideChannels.get(conversationId);
  if (channel) {
    channel.close();
    sideChannels.delete(conversationId);
  }
}
