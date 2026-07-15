/** @vitest-environment node */

import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/chat/engine", () => ({
  sendMessage: sendMessageMock,
}));

const tempDir = mkdtempSync(join(tmpdir(), "relay-chat-sse-contract-"));
process.env.RELAY_DATA_DIR = tempDir;

// eslint-disable-next-line import/first
import { NextRequest } from "next/server";
// eslint-disable-next-line import/first
import { POST } from "../route";
// eslint-disable-next-line import/first
import { createConversation } from "@/lib/data/chat";
// eslint-disable-next-line import/first
import { db } from "@/lib/db";
// eslint-disable-next-line import/first
import { chatMessages, conversations, usageLedger } from "@/lib/db/schema";
// eslint-disable-next-line import/first
import {
  __resetForTesting,
  readTerminations,
} from "@/lib/chat/stream-telemetry";
import type { ChatStreamEvent } from "@/lib/chat/types";

async function* events(values: ChatStreamEvent[]) {
  for (const value of values) yield value;
}

function request(conversationId: string) {
  return new NextRequest(
    `http://relay.test/api/chat/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "SSE contract" }),
    }
  );
}

async function invoke() {
  const conversation = await createConversation({ runtimeId: "claude-code" });
  const response = await POST(request(conversation.id), {
    params: Promise.resolve({ id: conversation.id }),
  });
  return response.text();
}

beforeEach(() => {
  db.delete(usageLedger).run();
  db.delete(chatMessages).run();
  db.delete(conversations).run();
  __resetForTesting();
  sendMessageMock.mockReset();
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Chat route SSE contract", () => {
  it("rejects malformed JSON before engine dispatch", async () => {
    const conversation = await createConversation({ runtimeId: "claude-code" });
    const response = await POST(
      new NextRequest(
        `http://relay.test/api/chat/conversations/${conversation.id}/messages`,
        { method: "POST", body: "{" }
      ),
      { params: Promise.resolve({ id: conversation.id }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing conversation without engine dispatch", async () => {
    const response = await POST(request("missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("streams deltas and stops after the first successful terminal", async () => {
    sendMessageMock.mockImplementation(() =>
      events([
        { type: "delta", content: "hello" },
        { type: "done", messageId: "assistant-1", quickAccess: [] },
        { type: "error", message: "must not escape" },
      ])
    );

    const body = await invoke();

    expect(body).toContain('"type":"delta"');
    expect(body).toContain('"type":"done"');
    expect(body).not.toContain("must not escape");
  });

  it("preserves an explicit engine error as the only terminal", async () => {
    sendMessageMock.mockImplementation(() =>
      events([{ type: "error", message: "named provider failure" }])
    );

    const body = await invoke();

    expect(body).toContain("named provider failure");
    expect(body).not.toContain('"type":"done"');
    expect(readTerminations()).toEqual([]);
  });

  it("turns unexpected generator EOF into a named terminal error", async () => {
    sendMessageMock.mockImplementation(() =>
      events([{ type: "delta", content: "partial" }])
    );

    const body = await invoke();

    expect(body).toContain("partial");
    expect(body).toContain("Chat stream ended without a terminal event");
    expect(readTerminations()).toEqual([
      expect.objectContaining({ reason: "stream.finalized.error" }),
    ]);
  });

  it("turns an unexpected generator throw into a named terminal error", async () => {
    sendMessageMock.mockImplementation(async function* () {
      yield { type: "delta", content: "partial" } as ChatStreamEvent;
      throw new Error("generator exploded");
    });

    const body = await invoke();

    expect(body).toContain("generator exploded");
    expect(readTerminations()).toEqual([
      expect.objectContaining({
        reason: "stream.finalized.error",
        error: "generator exploded",
      }),
    ]);
  });
});
