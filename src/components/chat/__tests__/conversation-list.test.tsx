import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ConversationRow } from "@/lib/db/schema";
import { ConversationList } from "../conversation-list";

const conversation = (id: string, title: string): ConversationRow => ({
  id,
  projectId: null,
  title,
  runtimeId: "claude",
  modelId: null,
  status: "active",
  sessionId: null,
  contextScope: null,
  activeSkillId: null,
  activeSkillIds: [],
  parentConversationId: null,
  branchedFromMessageId: null,
  createdAt: new Date("2026-07-14T10:00:00.000Z"),
  updatedAt: new Date("2026-07-14T10:00:00.000Z"),
});

describe("ConversationList row highlights", () => {
  it("uses the fill-only list contract without changing selection", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ConversationList
        conversations={[
          conversation("active", "Active chat"),
          conversation("other", "Other chat"),
        ]}
        activeId="active"
        onSelect={onSelect}
        onNewChat={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    const rows = container.querySelectorAll(
      '[role="button"][data-interactive-surface]',
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveClass("interactive-list-item");
      expect(row).toHaveAttribute("data-interactive-outline", "preserve");
    }
    expect(rows[0]).toHaveClass("bg-accent");
    expect(rows[1]).not.toHaveClass("bg-accent");

    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith("other");
  });
});
