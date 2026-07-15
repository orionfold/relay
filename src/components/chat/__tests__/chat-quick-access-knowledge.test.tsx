import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ChatQuickAccess } from "../chat-quick-access";
import { ChatMessage } from "../chat-message";
import { parseQuickAccessItems } from "@/lib/chat/types";
import type { ChatMessageRow } from "@/lib/db/schema";

vi.mock("../chat-session-provider", () => ({
  useChatSession: () => ({ branchingEnabled: false, conversations: [] }),
}));

describe("ChatQuickAccess knowledge affordances", () => {
  it("links a verified public source separately above a safe product action", () => {
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
            href: "https://orionfold.com/relay/docs/use-packs-and-licenses/",
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
    const sourceGroup = screen.getByRole("group", { name: "Sources" });
    const actionGroup = screen.getByRole("group", { name: "Related Relay actions" });
    const source = within(sourceGroup).getByRole("link", { name: /Source: Guide.*opens in a new tab/ });
    expect(source).toHaveAttribute("href", "https://orionfold.com/relay/docs/use-packs-and-licenses/");
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(source.querySelectorAll("svg")).toHaveLength(2);
    expect(within(actionGroup).getByRole("link", { name: "Open Packs in Relay" })).toHaveAttribute("href", "/packs");
    expect(sourceGroup.compareDocumentPosition(actionGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps missing or unsafe public source destinations as truthful non-links", () => {
    const parsed = parseQuickAccessItems([
      {
        kind: "knowledge-source",
        sourceId: "guide:01-get-started",
        sectionId: "overview",
        sourceKind: "guide",
        heading: "Overview",
        releaseVersion: "0.41.0",
        label: "Guide · Get started · Relay 0.41.0",
        href: "https://example.com/trap",
      },
      {
        kind: "knowledge-source",
        sourceId: "api:01-overview-local-api",
        sectionId: "overview",
        sourceKind: "api",
        heading: "Overview",
        releaseVersion: "0.41.0",
        label: "API · Overview · Relay 0.41.0",
      },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed.every((item) => item.kind === "knowledge-source" && item.href === undefined)).toBe(true);
    render(<ChatQuickAccess items={parsed} />);
    const sources = screen.getByRole("group", { name: "Sources" });
    expect(within(sources).queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Related Relay actions" })).toBeNull();
  });

  it("omits empty groups and keeps source-first grouping for mixed wrapping content", () => {
    const { rerender } = render(
      <ChatQuickAccess items={[{
        kind: "knowledge-action",
        sourceId: "guide:01-get-started",
        label: "Open Settings",
        href: "/settings",
      }]} />
    );
    expect(screen.queryByRole("group", { name: "Sources" })).toBeNull();
    expect(screen.getByRole("group", { name: "Related Relay actions" })).toBeInTheDocument();

    rerender(
      <ChatQuickAccess items={[
        {
          kind: "knowledge-action",
          sourceId: "guide:01-get-started",
          label: "Open Settings",
          href: "/settings",
        },
        {
          kind: "knowledge-source",
          sourceId: "guide:01-get-started",
          sectionId: "overview",
          sourceKind: "guide",
          heading: "Overview",
          releaseVersion: "0.41.0",
          label: "Guide · Get started · Relay 0.41.0",
          href: "https://orionfold.com/relay/docs/get-started-with-relay/",
        },
      ]} />
    );
    const groups = screen.getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Sources",
      "Related Relay actions",
    ]);
    expect(groups.every((group) => group.className.includes("flex-wrap"))).toBe(true);
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
        {
          kind: "knowledge-action",
          sourceId: "guide:01-get-started",
          label: "Open stale Runtime settings",
          href: "/settings#runtime",
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
