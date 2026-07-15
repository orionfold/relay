/** @vitest-environment node */

import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedExecutionTarget } from "@/lib/agents/runtime/execution-target";

const mocks = vi.hoisted(() => ({
  resolveAuth: vi.fn(),
  ensureAuth: vi.fn(),
  enforceBudget: vi.fn(),
  buildContext: vi.fn(),
  detectEntities: vi.fn(),
  deduplicate: vi.fn(),
}));

vi.mock("@/lib/agents/runtime/openai-codex-auth", () => ({
  resolveOpenAICodexAuthContext: mocks.resolveAuth,
  ensureOpenAICodexClientAuthenticated: mocks.ensureAuth,
}));
vi.mock("@/lib/settings/budget-guardrails", () => ({
  enforceBudgetGuardrails: mocks.enforceBudget,
}));
vi.mock("../context-builder", () => ({
  buildChatContext: mocks.buildContext,
}));
vi.mock("../entity-detector", () => ({
  detectEntities: mocks.detectEntities,
  deduplicateByEntityId: mocks.deduplicate,
}));
vi.mock("@/lib/environment/workspace-context", () => ({
  getWorkspaceContext: () => ({ cwd: "/tmp/relay-codex-chat" }),
}));

type Notification = { method: string; params?: unknown };
type MockClient = {
  onNotification: ((notification: Notification) => void) | null;
  onProcessError: ((error: Error) => void) | null;
  onRequest: ((request: never) => void) | null;
  request: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  reject: ReturnType<typeof vi.fn>;
  respond: ReturnType<typeof vi.fn>;
};

let tempDir: string;

function target(): ResolvedExecutionTarget {
  return {
    requestedRuntimeId: "openai-codex-app-server",
    effectiveRuntimeId: "openai-codex-app-server",
    requestedModelId: "gpt-5.3-codex",
    effectiveModelId: "gpt-5.3-codex",
    fallbackApplied: false,
    fallbackReason: null,
    selectionMode: "chat",
    selectionReason: "test",
  };
}

function createClient(
  behavior:
    | { kind: "completed"; text?: string }
    | { kind: "failed"; message: string }
    | { kind: "interrupted" }
    | { kind: "process-error"; message: string }
    | { kind: "pending" },
  models: string[] = ["gpt-5.3-codex"]
): MockClient {
  const client: MockClient = {
    onNotification: null,
    onProcessError: null,
    onRequest: null,
    request: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    reject: vi.fn(),
    respond: vi.fn(),
  };
  client.request.mockImplementation(async (method: string) => {
    if (method === "model/list") {
      return { models: models.map((id) => ({ id })) };
    }
    if (method === "thread/start") {
      return { thread: { id: "thread-1" } };
    }
    if (method === "turn/start") {
      queueMicrotask(() => {
        client.onNotification?.({
          method: "turn/started",
          params: { turn: { id: "turn-1" } },
        });
        if (behavior.kind === "completed") {
          if (behavior.text !== undefined) {
            client.onNotification?.({
              method: "item/agentMessage/delta",
              params: { delta: behavior.text },
            });
          }
          client.onNotification?.({
            method: "turn/completed",
            params: { turn: { status: "completed" } },
          });
        } else if (behavior.kind === "failed") {
          client.onNotification?.({
            method: "turn/completed",
            params: {
              turn: {
                status: "failed",
                error: { message: behavior.message },
              },
            },
          });
        } else if (behavior.kind === "interrupted") {
          client.onNotification?.({
            method: "turn/completed",
            params: { turn: { status: "interrupted" } },
          });
        } else if (behavior.kind === "process-error") {
          client.onProcessError?.(new Error(behavior.message));
        }
      });
      return { turn: { id: "turn-1" } };
    }
    if (method === "turn/interrupt") return {};
    throw new Error(`Unexpected Codex request ${method}`);
  });
  return client;
}

async function drain(generator: AsyncGenerator<unknown>) {
  const values: unknown[] = [];
  for await (const value of generator) values.push(value);
  return values;
}

async function setup(
  behavior: Parameters<typeof createClient>[0],
  models?: string[]
) {
  const client = createClient(behavior, models);
  mocks.resolveAuth.mockResolvedValue({
    connect: vi.fn().mockResolvedValue(client),
  });
  const { createConversation } = await import("@/lib/data/chat");
  const conversation = await createConversation({
    runtimeId: "openai-codex-app-server",
    modelId: "gpt-5.3-codex",
  });
  const { sendCodexMessage } = await import("../codex-engine");
  return { client, conversation, sendCodexMessage };
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "relay-codex-chat-contract-"));
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
  mocks.enforceBudget.mockResolvedValue(undefined);
  mocks.ensureAuth.mockResolvedValue(undefined);
  mocks.buildContext.mockResolvedValue({ systemPrompt: "system", history: [] });
  mocks.detectEntities.mockResolvedValue([]);
  mocks.deduplicate.mockReturnValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Codex Chat provider contract", () => {
  it("persists completed state before exposing done", async () => {
    const { client, conversation, sendCodexMessage } = await setup({
      kind: "completed",
      text: "Codex answer",
    });

    const values = await drain(
      sendCodexMessage(conversation.id, "hello", undefined, target())
    );
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");
    const { getActiveChatStreamCount } = await import("../active-streams");

    expect(values).toContainEqual({ type: "delta", content: "Codex answer" });
    expect(values.at(-1)).toMatchObject({
      type: "done",
      modelId: "gpt-5.3-codex",
    });
    expect(
      (await db.select().from(chatMessages)).find((row) => row.role === "assistant")
    ).toMatchObject({
      status: "complete",
      content: "Codex answer",
      metadata: expect.stringContaining('"runtimeId":"openai-codex-app-server"'),
    });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({
        runtimeId: "openai-codex-app-server",
        providerId: "openai",
        modelId: "gpt-5.3-codex",
        status: "completed",
      }),
    ]);
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.completed",
    ]);
    expect(getActiveChatStreamCount()).toBe(0);
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("uses and persists the shared knowledge-turn contract", async () => {
    const { client, conversation, sendCodexMessage } = await setup({
      kind: "completed",
      text: "Grounded answer",
    });
    const knowledgeTurn = {
      status: "ready" as const,
      prompt: "\n\n## Verified current Relay knowledge\nGrounded passage",
      receipt: {
        status: "ready" as const,
        releaseVersion: "0.41.0",
        sections: [],
      },
      quickAccess: [
        {
          kind: "knowledge-source" as const,
          sourceId: "guide:04-chat-agents-runtimes",
          sectionId: "run-the-work-carefully",
          sourceKind: "guide" as const,
          heading: "Run The Work Carefully",
          releaseVersion: "0.41.0",
          label: "Guide · Run The Work Carefully · Relay 0.41.0",
        },
      ],
    };
    const events = await drain(
      sendCodexMessage(conversation.id, "help", undefined, target(), knowledgeTurn)
    );
    const startCall = client.request.mock.calls.find(([method]) => method === "thread/start");
    expect(startCall?.[1]?.developerInstructions).toContain("Verified current Relay knowledge");
    const { db } = await import("@/lib/db");
    const { chatMessages } = await import("@/lib/db/schema");
    const assistant = (await db.select().from(chatMessages)).find((row) => row.role === "assistant");
    expect(assistant?.metadata).toContain('"releaseVersion":"0.41.0"');
    expect(events.at(-1)).toMatchObject({
      type: "done",
      quickAccess: [expect.objectContaining({ kind: "knowledge-source" })],
    });
  });

  it("persists a failed provider terminal and never emits done", async () => {
    const { conversation, sendCodexMessage } = await setup({
      kind: "failed",
      message: "Codex provider failed",
    });

    const values = await drain(
      sendCodexMessage(conversation.id, "hello", undefined, target())
    );
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");

    expect(values.at(-1)).toEqual({
      type: "error",
      message: "Codex provider failed",
    });
    expect(values).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "done" })])
    );
    expect(
      (await db.select().from(chatMessages)).find((row) => row.role === "assistant")
    ).toMatchObject({ status: "error", content: "Codex provider failed" });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
    expect(readTerminations()).toEqual([
      expect.objectContaining({ reason: "stream.finalized.error" }),
    ]);
  });

  it("treats provider interruption as cancellation, never completion", async () => {
    const { conversation, sendCodexMessage } = await setup({ kind: "interrupted" });

    const values = await drain(
      sendCodexMessage(conversation.id, "hello", undefined, target())
    );
    const { db } = await import("@/lib/db");
    const { chatMessages, usageLedger } = await import("@/lib/db/schema");

    expect(values.at(-1)).toEqual({ type: "error", message: "Request cancelled" });
    expect(
      (await db.select().from(chatMessages)).find((row) => row.role === "assistant")
    ).toMatchObject({ status: "error", content: "Request cancelled" });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({ status: "cancelled" }),
    ]);
  });

  it("names a completed terminal with no assistant output", async () => {
    const { conversation, sendCodexMessage } = await setup({
      kind: "completed",
      text: undefined,
    });

    const values = await drain(
      sendCodexMessage(conversation.id, "hello", undefined, target())
    );

    expect(values.at(-1)).toEqual({
      type: "error",
      message: "Codex completed without assistant output",
    });
  });

  it("names process failure and persists it as failed", async () => {
    const { conversation, sendCodexMessage } = await setup({
      kind: "process-error",
      message: "Codex process died",
    });

    const values = await drain(
      sendCodexMessage(conversation.id, "hello", undefined, target())
    );
    const { db } = await import("@/lib/db");
    const { usageLedger } = await import("@/lib/db/schema");

    expect(values.at(-1)).toEqual({
      type: "error",
      message: "Codex process died",
    });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
  });

  it("rejects an unavailable requested model instead of silently using a default", async () => {
    const { client, conversation, sendCodexMessage } = await setup(
      { kind: "completed", text: "wrong model answer" },
      []
    );

    const values = await drain(
      sendCodexMessage(conversation.id, "hello", undefined, target())
    );
    const { db } = await import("@/lib/db");
    const { usageLedger } = await import("@/lib/db/schema");

    expect(values.at(-1)).toEqual({
      type: "error",
      message:
        'Requested Codex model "gpt-5.3-codex" is not available for this account.',
    });
    expect(client.request).not.toHaveBeenCalledWith(
      "turn/start",
      expect.anything()
    );
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({
        modelId: "gpt-5.3-codex",
        status: "failed",
      }),
    ]);
  });

  it("forwards request abort to turn/interrupt and persists cancellation", async () => {
    const { client, conversation, sendCodexMessage } = await setup({ kind: "pending" });
    const controller = new AbortController();
    const result = drain(
      sendCodexMessage(conversation.id, "hello", controller.signal, target())
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort("operator stopped");

    const values = await result;
    const { db } = await import("@/lib/db");
    const { usageLedger } = await import("@/lib/db/schema");
    const { readTerminations } = await import("../stream-telemetry");

    expect(values.at(-1)).toEqual({ type: "error", message: "Request cancelled" });
    expect(client.request).toHaveBeenCalledWith("turn/interrupt", {
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(await db.select().from(usageLedger)).toEqual([
      expect.objectContaining({ status: "cancelled" }),
    ]);
    expect(readTerminations()).toEqual([
      expect.objectContaining({ reason: "stream.aborted.signal" }),
    ]);
  });
});
