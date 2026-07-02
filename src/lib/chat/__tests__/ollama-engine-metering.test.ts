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
  });

  it("writes a failed chat_turn row when Ollama is unreachable (no silent drop)", async () => {
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOllamaMessage } = await import("../ollama-engine");
    const { db } = await import("@/lib/db");
    const { usageLedger } = await import("@/lib/db/schema");

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
  });
});
