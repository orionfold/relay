import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationItem } from "@/components/notifications/notification-item";

const { push, contextReviewSpy, batchReviewSpy } = vi.hoisted(() => ({
  push: vi.fn(),
  contextReviewSpy: vi.fn(),
  batchReviewSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/profiles/context-proposal-review", () => ({
  ContextProposalReview: (props: {
    notificationId: string;
    profileId: string;
    proposedAdditions: string;
    onResponded: () => void;
  }) => {
    contextReviewSpy(props);
    return <div>Context proposal review</div>;
  },
}));

vi.mock("@/components/notifications/batch-proposal-review", () => ({
  BatchProposalReview: (props: {
    proposalIds: string[];
    profileIds: string[];
    body: string;
    onResponded?: () => void;
  }) => {
    batchReviewSpy(props);
    return <div>Batch proposal review</div>;
  },
}));

describe("notification item", () => {
  it("renders context proposal review actions using the full additions payload", () => {
    render(
      <NotificationItem
        notification={{
          id: "notif-1",
          taskId: null,
          type: "context_proposal",
          title: "Context proposal",
          body: "truncated body",
          read: false,
          toolName: "general",
          toolInput: JSON.stringify({
            profileId: "general",
            additions: "Full learned additions",
          }),
          response: null,
          respondedAt: null,
          createdAt: "2026-04-10T00:00:00.000Z",
        }}
        onUpdated={vi.fn()}
      />
    );

    expect(screen.getByText("Context proposal review")).toBeInTheDocument();
    expect(contextReviewSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notif-1",
        profileId: "general",
        proposedAdditions: "Full learned additions",
      })
    );
  });

  it("renders batch proposal review actions for workflow learning notifications", () => {
    render(
      <NotificationItem
        notification={{
          id: "notif-2",
          taskId: null,
          type: "context_proposal_batch",
          title: "Workflow learning batch",
          body: "Batch summary",
          read: false,
          toolName: "workflow-context-batch",
          toolInput: JSON.stringify({
            proposalIds: ["p1", "p2"],
            profileIds: ["general", "researcher"],
          }),
          response: null,
          respondedAt: null,
          createdAt: "2026-04-10T00:00:00.000Z",
        }}
        onUpdated={vi.fn()}
      />
    );

    expect(screen.getByText("Batch proposal review")).toBeInTheDocument();
    expect(batchReviewSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalIds: ["p1", "p2"],
        profileIds: ["general", "researcher"],
        body: "Batch summary",
      })
    );
  });

  it("renders completion markdown, Insight callouts, and generated-document navigation", () => {
    push.mockClear();
    render(
      <NotificationItem
        notification={{
          id: "notif-completed",
          taskId: "task-1",
          type: "task_completed",
          title: "Research completed",
          body: "truncated notification body",
          completionResultPreview: `# Research answer\n\n\`★ Insight ─────────\`\n- Evidence is current.\n\`────────────────────\`\n\n${"More detail. ".repeat(20)}`,
          read: false,
          toolName: null,
          toolInput: null,
          response: null,
          respondedAt: null,
          createdAt: "2026-07-12T20:00:00.000Z",
          outputDocuments: [{
            id: "doc-1",
            originalName: "research.md",
            mimeType: "text/markdown",
            size: 1024,
            version: 1,
            direction: "output",
          }],
        }}
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 5, name: "Research answer" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Insight" })).toHaveTextContent("Evidence is current.");
    expect(screen.getByRole("link", { name: "View research.md" })).toHaveAttribute(
      "href",
      "/documents/doc-1",
    );
    const showMore = screen.getByRole("button", { name: "Show more" });
    fireEvent.click(showMore);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
