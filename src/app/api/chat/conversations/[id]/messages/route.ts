import { NextRequest, NextResponse } from "next/server";
import { getConversation, getMessages } from "@/lib/data/chat";
import { sendMessage } from "@/lib/chat/engine";
import { recordTermination } from "@/lib/chat/stream-telemetry";

/**
 * GET /api/chat/conversations/[id]/messages?after=xxx&limit=100
 * Fetch message history with optional cursor for reconnection.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const after = searchParams.get("after") ?? undefined;
  const limit = searchParams.get("limit")
    ? parseInt(searchParams.get("limit")!, 10)
    : undefined;

  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const messages = await getMessages(id, { after, limit });
  return NextResponse.json(messages);
}

/**
 * POST /api/chat/conversations/[id]/messages
 * Send a user message and stream the assistant response via SSE.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { content, mentions } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json(
      { error: "content is required and must be a string" },
      { status: 400 }
    );
  }

  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // Bridge the async generator to an SSE ReadableStream
  const encoder = new TextEncoder();
  const streamStartedAt = Date.now();
  const streamAbortController = new AbortController();
  const forwardRequestAbort = () =>
    streamAbortController.abort(req.signal.reason);
  if (req.signal.aborted) forwardRequestAbort();
  else req.signal.addEventListener("abort", forwardRequestAbort, { once: true });
  const stream = new ReadableStream({
    async start(controller) {
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Stream may be closed
          clearInterval(keepalive);
        }
      }, 15_000);
      let terminalSeen = false;

      try {
        for await (const event of sendMessage(
          id,
          content,
          streamAbortController.signal,
          mentions
        )) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));

          if (event.type === "done" || event.type === "error") {
            terminalSeen = true;
            break;
          }
        }
        if (!terminalSeen && !streamAbortController.signal.aborted) {
          const message = "Chat stream ended without a terminal event";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message })}\n\n`
            )
          );
          recordTermination({
            reason: "stream.finalized.error",
            conversationId: id,
            messageId: null,
            durationMs: Date.now() - streamStartedAt,
            error: message,
          });
        }
      } catch (error) {
        const errorEvent = {
          type: "error",
          message:
            error instanceof Error ? error.message : "Stream error",
        };
        if (!streamAbortController.signal.aborted) {
          recordTermination({
            reason: "stream.finalized.error",
            conversationId: id,
            messageId: null,
            durationMs: Date.now() - streamStartedAt,
            error: errorEvent.message.slice(0, 500),
          });
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
            );
          } catch {
            // The client may already have cancelled the outer SSE stream.
          }
        }
      } finally {
        clearInterval(keepalive);
        req.signal.removeEventListener("abort", forwardRequestAbort);
        try {
          controller.close();
        } catch {
          // Stream may already be closed by peer; safe to ignore
        }
      }
    },
    // Fires when the client disconnects mid-stream (browser tab closed,
    // user navigated away, or reader.cancel()). Record the client boundary,
    // then propagate cancellation into the provider generator so it does not
    // continue behind a closed SSE stream. A paired stream.aborted.signal event
    // from the engine is intentional: the two codes name different boundaries.
    cancel(reason) {
      streamAbortController.abort(reason);
      recordTermination({
        reason: "stream.aborted.client",
        conversationId: id,
        messageId: null,
        durationMs: Date.now() - streamStartedAt,
        error: reason ? String(reason).slice(0, 200) : undefined,
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
