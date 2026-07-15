/** @vitest-environment node */

import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveTarget: vi.fn(),
  enforceBudget: vi.fn(),
  buildContext: vi.fn(),
  getSetting: vi.fn(),
  detectEntities: vi.fn(),
  extractEntities: vi.fn(),
  deduplicate: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: mocks.query }));
vi.mock("@/lib/agents/runtime/execution-target", () => ({
  resolveChatExecutionTarget: mocks.resolveTarget,
}));
vi.mock("@/lib/settings/budget-guardrails", () => ({
  enforceBudgetGuardrails: mocks.enforceBudget,
}));
vi.mock("../context-builder", () => ({ buildChatContext: mocks.buildContext }));
vi.mock("@/lib/settings/helpers", () => ({ getSetting: mocks.getSetting }));
vi.mock("@/lib/settings/auth", () => ({ getAuthEnv: vi.fn(async () => ({})) }));
vi.mock("../ainative-tools", () => ({
  createToolServer: () => ({ asMcpServer: () => ({}) }),
}));
vi.mock("@/lib/agents/browser-mcp", () => ({
  getBrowserMcpServers: vi.fn(async () => ({})),
  getBrowserAllowedToolPatterns: vi.fn(async () => []),
  getExternalMcpServers: vi.fn(async () => ({})),
  getExternalAllowedToolPatterns: vi.fn(async () => []),
  isBrowserTool: () => false,
  isBrowserReadOnly: () => false,
  isExaTool: () => false,
  isExaReadOnly: () => false,
}));
vi.mock("@/lib/settings/permissions", () => ({
  isToolAllowed: vi.fn(async () => false),
}));
vi.mock("@/lib/environment/workspace-context", () => ({
  getLaunchCwd: () => "/tmp/relay-claude-chat",
  getWorkspaceContext: () => ({ cwd: "/tmp/relay-claude-chat" }),
}));
vi.mock("../entity-detector", () => ({
  detectEntities: mocks.detectEntities,
  extractToolResultEntities: mocks.extractEntities,
  deduplicateByEntityId: mocks.deduplicate,
}));
vi.mock("@/lib/apps/composition-detector", () => ({
  detectComposedApp: () => null,
}));

let tempDir: string;

async function* sdkEvents(values: Record<string, unknown>[]) {
  for (const value of values) yield value;
}

function delta(text: string) {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text },
    },
  };
}

async function drain(generator: AsyncGenerator<unknown>) {
  const values: unknown[] = [];
  for await (const value of generator) values.push(value);
  return values;
}

async function run(values: Record<string, unknown>[]) {
  mocks.query.mockReturnValue(sdkEvents(values));
  const { createConversation } = await import("@/lib/data/chat");
  const conversation = await createConversation({
    runtimeId: "claude-code",
    modelId: "sonnet",
  });
  const { sendMessage } = await import("../engine");
  const events = await drain(sendMessage(conversation.id, "hello contract"));
  const { db } = await import("@/lib/db");
  const { chatMessages, usageLedger } = await import("@/lib/db/schema");
  const { readTerminations } = await import("../stream-telemetry");
  return {
    events,
    messages: await db.select().from(chatMessages),
    ledger: await db.select().from(usageLedger),
    terminations: readTerminations(),
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "relay-claude-chat-contract-"));
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
  mocks.resolveTarget.mockResolvedValue({
    requestedRuntimeId: "claude-code",
    effectiveRuntimeId: "claude-code",
    requestedModelId: "sonnet",
    effectiveModelId: "sonnet",
    fallbackApplied: false,
    fallbackReason: null,
    selectionMode: "chat",
    selectionReason: "test",
  });
  mocks.enforceBudget.mockResolvedValue(undefined);
  mocks.buildContext.mockResolvedValue({ systemPrompt: "system", history: [] });
  mocks.getSetting.mockResolvedValue(null);
  mocks.detectEntities.mockResolvedValue([]);
  mocks.extractEntities.mockReturnValue([]);
  mocks.deduplicate.mockReturnValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Claude SDK Chat provider contract", () => {
  it("persists a non-empty successful result before done", async () => {
    const result = await run([
      delta("Claude answer"),
      { type: "result", is_error: false, result: "Claude answer" },
    ]);

    expect(result.events).toContainEqual({
      type: "delta",
      content: "Claude answer",
    });
    expect(result.events.at(-1)).toMatchObject({
      type: "done",
      modelId: "sonnet",
    });
    expect(result.messages.find((row) => row.role === "assistant")).toMatchObject({
      status: "complete",
      content: "Claude answer",
      metadata: expect.stringContaining('"runtimeId":"claude-code"'),
    });
    expect(result.ledger).toEqual([
      expect.objectContaining({
        runtimeId: "claude-code",
        providerId: "anthropic",
        modelId: "sonnet",
        status: "completed",
      }),
    ]);
    expect(result.terminations.map((event) => event.reason)).toEqual([
      "stream.completed",
    ]);
  });

  it("preserves substantial partial text while keeping an SDK error failed", async () => {
    const partial = "A useful partial response that is intentionally longer than fifty characters.";
    const result = await run([
      delta(partial),
      {
        type: "result",
        is_error: true,
        subtype: "error_during_execution",
        errors: ["provider terminal failed"],
      },
    ]);

    expect(result.events.at(-1)).toEqual({
      type: "error",
      message: "provider terminal failed",
    });
    expect(result.events.some((event) => (event as { type?: string }).type === "done")).toBe(false);
    expect(result.messages.find((row) => row.role === "assistant")).toMatchObject({
      status: "error",
      content: expect.stringContaining(partial),
    });
    expect(result.ledger).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
    expect(result.terminations).toEqual([
      expect.objectContaining({ reason: "stream.finalized.error" }),
    ]);
  });

  it("names a successful terminal with no assistant output", async () => {
    const result = await run([
      { type: "result", is_error: false, result: "" },
    ]);

    expect(result.events.at(-1)).toEqual({
      type: "error",
      message: "Claude Agent SDK completed without assistant output",
    });
    expect(result.messages.find((row) => row.role === "assistant")).toMatchObject({
      status: "error",
      content: "Claude Agent SDK completed without assistant output",
    });
  });

  it("treats max-turns as a failed terminal instead of success", async () => {
    const result = await run([
      {
        type: "result",
        is_error: true,
        subtype: "error_max_turns",
        result: "Partial result from the final allowed turn",
      },
    ]);

    expect(result.events.at(-1)).toEqual({
      type: "error",
      message: "Claude Agent SDK reached the configured turn limit",
    });
    expect(result.ledger).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
  });
});
