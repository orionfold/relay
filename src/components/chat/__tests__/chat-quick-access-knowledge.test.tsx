import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatQuickAccess } from "../chat-quick-access";
import { ChatMessage } from "../chat-message";
import { parseQuickAccessItems } from "@/lib/chat/types";
import type { ChatMessageRow } from "@/lib/db/schema";

vi.mock("../chat-session-provider", () => ({
  useChatSession: () => ({ branchingEnabled: false, conversations: [] }),
}));

describe("ChatQuickAccess knowledge affordances", () => {
  it("distinguishes a non-link versioned source from a safe product action", () => {
    render(
      <ChatQuickAccess
        items={[
          {
            kind: "knowledge-source",
            sourceId: "guide:02-packs-and-licenses",
            sectionId: "run-the-work-carefully",
            sourceKind: "guide",
            heading: "Run The Work Carefully",
            releaseVersion: "0.41.0",
            label: "Guide · Run The Work Carefully · Relay 0.41.0",
          },
          {
            kind: "knowledge-action",
            sourceId: "guide:02-packs-and-licenses",
            label: "Open Packs",
            href: "/packs",
          },
        ]}
      />
    );
    expect(screen.getByLabelText(/Source: Guide/)).not.toHaveAttribute("href");
    expect(screen.getByRole("link", { name: "Open Packs in Relay" })).toHaveAttribute("href", "/packs");
  });

  it("keeps historical entity items and drops unsafe persisted actions", () => {
    expect(
      parseQuickAccessItems([
        { entityType: "task", entityId: "t1", label: "Task", href: "/tasks/t1" },
        {
          kind: "knowledge-action",
          sourceId: "guide:01-get-started",
          label: "Open trap",
          href: "https://example.com",
        },
        {
          kind: "knowledge-action",
          sourceId: "guide:01-get-started",
          label: "Open escape",
          href: "/../settings",
        },
        {
          kind: "knowledge-action",
          sourceId: "api:tasks",
          label: "Call tasks API",
          href: "/api/tasks",
        },
      ])
    ).toEqual([{ entityType: "task", entityId: "t1", label: "Task", href: "/tasks/t1" }]);
  });

  it("does not expose persisted affordances before the assistant message completes", () => {
    const message = {
      id: "a1",
      conversationId: "c1",
      role: "assistant",
      content: "partial",
      status: "streaming",
      metadata: JSON.stringify({
        quickAccess: [{
          kind: "knowledge-action",
          sourceId: "guide:01-get-started",
          label: "Open Settings",
          href: "/settings",
        }],
      }),
      rewoundAt: null,
      createdAt: new Date(),
    } as ChatMessageRow;
    render(<ChatMessage message={message} isStreaming conversationId="c1" />);
    expect(screen.queryByRole("link", { name: /Open Settings/ })).toBeNull();
  });
});
