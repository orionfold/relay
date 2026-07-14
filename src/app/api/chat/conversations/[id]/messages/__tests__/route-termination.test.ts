/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { chatMessages, conversations, usageLedger } from "@/lib/db/schema";
import { createConversation } from "@/lib/data/chat";
import {
  __resetForTesting,
  readTerminations,
} from "@/lib/chat/stream-telemetry";
import { POST } from "../route";

beforeEach(() => {
  db.delete(usageLedger).run();
  db.delete(chatMessages).run();
  db.delete(conversations).run();
  __resetForTesting();
  vi.restoreAllMocks();
});

function request(conversationId: string, signal?: AbortSignal) {
  return new NextRequest(
    `http://relay.test/api/chat/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "route termination smoke" }),
      signal,
    }
  );
}

async function waitForReason(reason: string) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (readTerminations().some((event) => event.reason === reason)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${reason}`);
}

describe("Chat message SSE termination", () => {
  it("surfaces an Ollama transport error and records finalized.error", async () => {
    const conversation = await createConversation({
      runtimeId: "ollama",
      modelId: "ollama:relay-smoke",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        if (String(url).endsWith("/api/tags")) {
          return Promise.resolve(
            Response.json({ models: [{ name: "relay-smoke" }] })
          );
        }
        return Promise.reject(new Error("fake upstream failed"));
      })
    );

    const response = await POST(request(conversation.id), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const body = await response.text();

    expect(body).toContain("fake upstream failed");
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.finalized.error",
    ]);
    expect(
      db
        .select()
        .from(chatMessages)
        .all()
        .find((message) => message.role === "assistant")
    ).toMatchObject({ status: "error", content: "fake upstream failed" });
  });

  it("propagates outer client cancellation into the generator signal", async () => {
    const conversation = await createConversation({
      runtimeId: "ollama",
      modelId: "ollama:relay-smoke",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, options: RequestInit) => {
        const signal = options.signal;
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                const abort = () =>
                  controller.error(new DOMException("aborted", "AbortError"));
                if (signal?.aborted) abort();
                else signal?.addEventListener("abort", abort, { once: true });
              },
            }),
            { status: 200 }
          )
        );
      })
    );

    const response = await POST(request(conversation.id), {
      params: Promise.resolve({ id: conversation.id }),
    });
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"phase":"preparing"');
    const second = new TextDecoder().decode((await reader.read()).value);
    expect(second).toContain('"phase":"streaming"');
    await reader.cancel("test client disconnected");
    await waitForReason("stream.aborted.signal");

    const reasons = readTerminations().map((event) => event.reason);
    expect(reasons).toContain("stream.aborted.client");
    expect(reasons).toContain("stream.aborted.signal");
    expect(
      db
        .select()
        .from(chatMessages)
        .all()
        .find((message) => message.role === "assistant")
    ).toMatchObject({ status: "error", content: "Request cancelled" });
  });
});
