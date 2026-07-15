import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Every chat turn must land in usage_ledger — including $0 local Ollama turns,
// which are exactly the rows that prove blended-cost savings on /costs
// (fix-chat-spend-metering-diagnose root cause (a): sendOllamaMessage routed
// around the main engine's ledger writes and metered nothing).

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-ollama-metering-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

function ndjsonStream(lines: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }
      controller.close();
    },
  });
}

function textStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function drain(gen: AsyncGenerator<unknown>) {
  const events: unknown[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe("sendOllamaMessage metering", () => {
  it("writes a completed $0 chat_turn ledger row with Ollama's token counts", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { usageLedger } = await import("@/lib/db/schema");
    const { chatMessages } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");

    const conversation = await createConversation({ title: "Ollama test", runtimeId: "ollama", modelId: "ollama:llama3.2" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          ndjsonStream([
            { message: { content: "Hello " } },
            {
              message: { content: "world" },
              done: true,
              prompt_eval_count: 42,
              eval_count: 7,
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    await drain(sendOllamaMessage(conversation.id, "hi there"));

    const rows = await db.select().from(usageLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        activityType: "chat_turn",
        runtimeId: "ollama",
        providerId: "ollama",
        status: "completed",
        inputTokens: 42,
        outputTokens: 7,
        totalTokens: 49,
        costMicros: 0,
      }),
    );
    expect(rows[0]?.modelId).toBeTruthy();
    const messages = await db.select().from(chatMessages);
    expect(messages.find((message) => message.role === "assistant")).toMatchObject({
      status: "complete",
      content: "Hello world",
    });
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.completed",
    ]);
  });

  it("passes and persists the shared knowledge-turn contract", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const conversation = await createConversation({ runtimeId: "ollama", modelId: "ollama:llama3.2" });
    let requestBody: { messages: { content: string }[] } | null = null;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return new Response(ndjsonStream([{ message: { content: "Grounded" }, done: true }]));
    }));
    const knowledgeTurn = {
      status: "ready" as const,
      prompt: "\n\n## Verified current Relay knowledge\nPassage",
      receipt: { status: "ready" as const, releaseVersion: "0.41.0", sections: [] },
      quickAccess: [{
        kind: "knowledge-action" as const,
        sourceId: "guide:01-get-started",
        label: "Open Settings",
        href: "/settings",
      }],
    };
    const events = await drain(sendOllamaMessage(conversation.id, "help", undefined, knowledgeTurn));
    expect(requestBody?.messages[0].content).toContain("Verified current Relay knowledge");
    const { db } = await import("@/lib/db");
    const { chatMessages } = await import("@/lib/db/schema");
    const assistant = (await db.select().from(chatMessages)).find((row) => row.role === "assistant");
    expect(assistant?.metadata).toContain('"releaseVersion":"0.41.0"');
    expect(events.at(-1)).toMatchObject({ quickAccess: [expect.objectContaining({ href: "/settings" })] });
  });

  it("writes a failed chat_turn row when Ollama is unreachable (no silent drop)", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { usageLedger } = await import("@/lib/db/schema");
    const { chatMessages } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");

    const conversation = await createConversation({ title: "Ollama down", runtimeId: "ollama", modelId: "ollama:llama3.2" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434")),
    );

    const events = await drain(sendOllamaMessage(conversation.id, "hi"));
    expect(events.some((e) => (e as { type: string }).type === "error")).toBe(true);

    const rows = await db.select().from(usageLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        activityType: "chat_turn",
        runtimeId: "ollama",
        providerId: "ollama",
        status: "failed",
      }),
    );
    const messages = await db.select().from(chatMessages);
    expect(messages.find((message) => message.role === "assistant")).toMatchObject({
      status: "error",
      content: expect.stringContaining("ECONNREFUSED"),
    });
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.finalized.error",
    ]);
  });

  it("names an empty provider response and leaves no streaming row", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "Ollama empty",
      runtimeId: "ollama",
      modelId: "ollama:llama3.2",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(ndjsonStream([{ message: { content: "" }, done: true }]), {
          status: 200,
        })
      )
    );

    const events = await drain(sendOllamaMessage(conversation.id, "hi"));
    expect(events).toContainEqual({
      type: "error",
      message: "Ollama returned an empty response",
    });
    expect(
      (await db.select().from(chatMessages)).find(
        (message) => message.role === "assistant"
      )
    ).toMatchObject({
      status: "error",
      content: "Ollama returned an empty response",
    });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.finalized.error",
    ]);
  });

  it("names a nil provider body instead of silently ending the stream", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { chatMessages } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "Ollama nil body",
      runtimeId: "ollama",
      modelId: "ollama:llama3.2",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const events = await drain(sendOllamaMessage(conversation.id, "hi"));
    expect(events).toContainEqual({
      type: "error",
      message: "No response stream from Ollama",
    });
    expect(
      (await db.select().from(chatMessages)).find(
        (message) => message.role === "assistant"
      )
    ).toMatchObject({
      status: "error",
      content: "No response stream from Ollama",
    });
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.finalized.error",
    ]);
  });

  it("rejects a delta stream that reaches EOF without a terminal frame", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "Ollama truncated",
      runtimeId: "ollama",
      modelId: "ollama:llama3.2",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          textStream([
            `${JSON.stringify({ message: { content: "partial" } })}\n`,
          ]),
          { status: 200 }
        )
      )
    );

    const events = await drain(sendOllamaMessage(conversation.id, "hi"));
    expect(events).toContainEqual({ type: "delta", content: "partial" });
    expect(events).toContainEqual({
      type: "error",
      message: "Ollama stream ended before its terminal frame",
    });
    expect(events.some((event) => (event as { type: string }).type === "done")).toBe(
      false
    );
    expect(
      (await db.select().from(chatMessages)).find(
        (message) => message.role === "assistant"
      )
    ).toMatchObject({
      status: "error",
      content: expect.stringContaining("terminal frame"),
    });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.finalized.error",
    ]);
  });

  it("rejects malformed trailing NDJSON after a streamed delta", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { chatMessages } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "Ollama malformed",
      runtimeId: "ollama",
      modelId: "ollama:llama3.2",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          textStream([
            `${JSON.stringify({ message: { content: "partial" } })}\n`,
            "{not-json}\n",
          ]),
          { status: 200 }
        )
      )
    );

    const events = await drain(sendOllamaMessage(conversation.id, "hi"));
    expect(events).toContainEqual({
      type: "error",
      message: "Ollama returned malformed streaming data",
    });
    expect(
      (await db.select().from(chatMessages)).find(
        (message) => message.role === "assistant"
      )
    ).toMatchObject({
      status: "error",
      content: expect.stringContaining("malformed streaming data"),
    });
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.finalized.error",
    ]);
  });

  it("records a signal abort and persists a named cancelled outcome", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "Ollama abort",
      runtimeId: "ollama",
      modelId: "ollama:llama3.2",
    });
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"))
    );

    const events = await drain(
      sendOllamaMessage(conversation.id, "hi", controller.signal)
    );
    expect(events).toContainEqual({ type: "error", message: "Request cancelled" });
    expect(
      (await db.select().from(chatMessages)).find(
        (message) => message.role === "assistant"
      )
    ).toMatchObject({ status: "error", content: "Request cancelled" });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({ status: "cancelled" }),
    ]);
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.aborted.signal",
    ]);
  });

  it("finalizes and records iterator abandonment after a streamed delta", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { chatMessages } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "Ollama abandoned",
      runtimeId: "ollama",
      modelId: "ollama:llama3.2",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          ndjsonStream([
            { message: { content: "partial response" } },
            { message: { content: " that should not remain streaming" }, done: true },
          ]),
          { status: 200 }
        )
      )
    );

    const generator = sendOllamaMessage(conversation.id, "hi");
    expect((await generator.next()).value).toMatchObject({ phase: "preparing" });
    expect((await generator.next()).value).toMatchObject({ phase: "streaming" });
    expect((await generator.next()).value).toEqual({
      type: "delta",
      content: "partial response",
    });
    await generator.return(undefined);

    expect(
      (await db.select().from(chatMessages)).find(
        (message) => message.role === "assistant"
      )
    ).toMatchObject({ status: "error", content: "partial response" });
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.abandoned",
    ]);
  });

  it("records a named termination when the initial conversation lookup fails", async () => {
    vi.doMock("@/lib/data/chat", async () => {
      const actual = await vi.importActual<typeof import("@/lib/data/chat")>(
        "@/lib/data/chat"
      );
      return {
        ...actual,
        getConversation: vi
          .fn()
          .mockRejectedValue(new Error("conversation lookup failed")),
      };
    });
    try {
      const { sendOllamaMessage } = await import("../ollama-engine");
      const { readTerminations } = await import("../stream-telemetry");

      const events = await drain(sendOllamaMessage("missing", "hi"));
      expect(events).toContainEqual({
        type: "error",
        message: "conversation lookup failed",
      });
      expect(readTerminations().map((event) => event.reason)).toEqual([
        "stream.finalized.error",
      ]);
    } finally {
      vi.doUnmock("@/lib/data/chat");
    }
  });
});
