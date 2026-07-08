import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ChatMessage } from "../chat-message";
import type { ChatMessageRow } from "@/lib/db/schema";

vi.mock("../chat-session-provider", () => ({
  useChatSession: () => ({
    branchingEnabled: false,
    branchConversation: vi.fn(),
    conversations: [],
    activeId: "conv-1",
  }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("should not be called")))
  );
});

function makeMessage(metadata: object): ChatMessageRow {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "assistant",
    content: "I can scaffold a plugin for that. Here's what I'd generate:",
    status: "complete",
    metadata: JSON.stringify(metadata),
    createdAt: new Date(),
  } as ChatMessageRow;
}

describe("ChatMessage — extensionFallback metadata", () => {
  it("renders ExtensionFallbackCard when metadata.extensionFallback is present", () => {
    const message = makeMessage({
      modelId: "sonnet",
      extensionFallback: {
        plugin: {
          id: "github-mine",
          name: "GitHub",
          description: "d",
          capabilities: [],
          transport: "stdio",
          language: "python",
          tools: [{ name: "fetch_items", description: "d" }],
        },
        rationale: "Matched integration noun 'github'",
        composeAltPrompt: "Compose a pack without a plugin for: ...",
        explanation: "github access requires an external API call",
      },
    });
    const { container } = render(
      <ChatMessage
        message={message}
        isStreaming={false}
        conversationId="conv-1"
      />
    );
    expect(
      container.querySelector('[data-slot="extension-fallback-card"]')
    ).not.toBeNull();
  });

  it("does NOT render ExtensionFallbackCard when metadata.extensionFallback is absent", () => {
    const message = makeMessage({ modelId: "sonnet" });
    const { container } = render(
      <ChatMessage
        message={message}
        isStreaming={false}
        conversationId="conv-1"
      />
    );
    expect(
      container.querySelector('[data-slot="extension-fallback-card"]')
    ).toBeNull();
  });
});
