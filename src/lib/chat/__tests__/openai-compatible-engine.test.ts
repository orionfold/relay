import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ResolvedExecutionTarget } from "@/lib/agents/runtime/execution-target";

const compatible = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  streamCompletion: vi.fn(),
}));

vi.mock("@/lib/agents/runtime/openai-compatible", () => ({
  resolveOpenAICompatibleModel: compatible.resolveModel,
  streamOpenAICompatibleCompletion: compatible.streamCompletion,
  getOpenAICompatibleRuntimeConfig: vi.fn(async (runtimeId: string) => ({
    runtimeId,
    configured: true,
    apiKey: null,
    apiKeySource: "unknown",
  })),
}));

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "relay-compatible-chat-"));
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
  compatible.resolveModel.mockResolvedValue("effective-model");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

function target(runtimeId: "litellm" | "lmstudio"): ResolvedExecutionTarget {
  return {
    requestedRuntimeId: runtimeId,
    effectiveRuntimeId: runtimeId,
    requestedModelId: `${runtimeId}:requested-model`,
    effectiveModelId: "requested-model",
    fallbackApplied: false,
    fallbackReason: null,
    selectionMode: "chat",
    selectionReason: "test",
  };
}

async function drain(generator: AsyncGenerator<unknown>) {
  const events: unknown[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe("sendOpenAICompatibleMessage", () => {
  it("persists a streamed LiteLLM turn with effective model, usage, and reported cost", async () => {
    compatible.streamCompletion.mockImplementation(
      async ({ onDelta }: { onDelta: (delta: string) => Promise<void> }) => {
        await onDelta("Hello ");
        await onDelta("world");
        return {
          text: "Hello world",
          modelId: "upstream/model-v2",
          usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 },
          reportedCostMicros: 125,
          responseId: "chatcmpl-compatible",
        };
      }
    );
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOpenAICompatibleMessage } = await import(
      "../openai-compatible-engine"
    );
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "LiteLLM chat",
      runtimeId: "litellm",
      modelId: "litellm:requested-model",
    });

    const events = await drain(
      sendOpenAICompatibleMessage(
        "litellm",
        conversation.id,
        "hi",
        undefined,
        target("litellm")
      )
    );

    expect(events).toContainEqual({ type: "delta", content: "Hello " });
    expect(events).toContainEqual({ type: "delta", content: "world" });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      modelId: "upstream/model-v2",
    });
    expect(
      (await db.select().from(chatMessages)).find(
        (message) => message.role === "assistant"
      )
    ).toMatchObject({
      status: "complete",
      content: "Hello world",
      metadata: expect.stringContaining('"responseId":"chatcmpl-compatible"'),
    });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({
        runtimeId: "litellm",
        providerId: "litellm",
        modelId: "upstream/model-v2",
        inputTokens: 8,
        outputTokens: 2,
        totalTokens: 10,
        costMicros: 125,
        status: "completed",
      }),
    ]);
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.completed",
    ]);
  });

  it("persists a named LM Studio stream failure and never leaves a streaming row", async () => {
    compatible.streamCompletion.mockImplementation(
      async ({ onDelta }: { onDelta: (delta: string) => Promise<void> }) => {
        await onDelta("partial");
        throw new Error("LM Studio stream disconnected");
      }
    );
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOpenAICompatibleMessage } = await import(
      "../openai-compatible-engine"
    );
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "LM Studio failure",
      runtimeId: "lmstudio",
      modelId: "lmstudio:requested-model",
    });

    const events = await drain(
      sendOpenAICompatibleMessage(
        "lmstudio",
        conversation.id,
        "hi",
        undefined,
        target("lmstudio")
      )
    );

    expect(events).toContainEqual({ type: "delta", content: "partial" });
    expect(events).toContainEqual({
      type: "error",
      message: "LM Studio stream disconnected",
    });
    expect(
      (await db.select().from(chatMessages)).find(
        (message) => message.role === "assistant"
      )
    ).toMatchObject({
      status: "error",
      content: expect.stringContaining("LM Studio stream disconnected"),
    });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({
        runtimeId: "lmstudio",
        costMicros: null,
        status: "failed",
      }),
    ]);
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.finalized.error",
    ]);
  });

  it("records an explicit signal abort as cancelled", async () => {
    compatible.streamCompletion.mockRejectedValue(
      new DOMException("aborted", "AbortError")
    );
    const { createConversation } = await import("@/lib/data/chat");
    const { sendOpenAICompatibleMessage } = await import(
      "../openai-compatible-engine"
    );
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const conversation = await createConversation({
      title: "Compatible abort",
      runtimeId: "litellm",
      modelId: "litellm:requested-model",
    });
    const controller = new AbortController();
    controller.abort();

    const events = await drain(
      sendOpenAICompatibleMessage(
        "litellm",
        conversation.id,
        "hi",
        controller.signal,
        target("litellm")
      )
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
});
