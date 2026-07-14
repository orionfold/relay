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

vi.mock("@/components/notifications/permission-action", () => ({
  PermissionAction: () => <button type="button">Allow Once</button>,
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

  it("opens task details from header, body, whitespace, result preview, and keyboard", () => {
    push.mockClear();
    const { unmount } = render(
      <NotificationItem
        notification={{
          id: "notif-navigation",
          taskId: "task-stable",
          type: "task_completed",
          title: "Research completed",
          body: "Completion body",
          completionResultPreview: "# Research answer\n\nEvidence is current.",
          read: true,
          toolName: null,
          toolInput: null,
          response: null,
          respondedAt: null,
          createdAt: "2026-07-12T20:00:00.000Z",
        }}
        onUpdated={vi.fn()}
      />
    );

    const container = screen.getByRole("article", {
      name: "Open task details: Research completed",
    });
    fireEvent.click(screen.getByText("Research completed"));
    fireEvent.click(screen.getByRole("heading", { name: "Research answer" }));
    fireEvent.click(container);
    fireEvent.keyDown(container, { key: "Enter" });
    fireEvent.keyDown(container, { key: " " });
    expect(push).toHaveBeenNthCalledWith(1, "/tasks/task-stable");
    expect(push).toHaveBeenCalledTimes(5);

    unmount();
    push.mockClear();
    render(
      <NotificationItem
        notification={{
          id: "notif-failed-navigation",
          taskId: "task-stable",
          type: "task_failed",
          title: "Research failed",
          body: "Failure details remain readable.",
          read: true,
          toolName: null,
          toolInput: null,
          response: null,
          respondedAt: null,
          createdAt: "2026-07-12T20:00:00.000Z",
        }}
        onUpdated={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Failure details remain readable."));
    expect(push).toHaveBeenCalledWith("/tasks/task-stable");
  });

  it("isolates nested links, buttons, permission actions, downloads, and text selection", () => {
    push.mockClear();
    const { unmount } = render(
      <NotificationItem
        notification={{
          id: "notif-nested-actions",
          taskId: "task-1",
          type: "task_completed",
          title: "Research completed",
          body: null,
          completionResultPreview: `# Result\n\n${"Long detail. ".repeat(30)}`,
          read: true,
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
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    const documentLink = screen.getByRole("link", { name: "View research.md" });
    const downloadLink = screen.getByRole("link", { name: "Download research.md" });
    documentLink.addEventListener("click", (event) => event.preventDefault());
    downloadLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(documentLink);
    fireEvent.click(downloadLink);
    expect(push).not.toHaveBeenCalled();

    push.mockClear();
    fireEvent.click(screen.getByText("research.md").closest("div.group")!);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/documents/doc-1");
    push.mockClear();

    const selection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "Research completed",
    } as Selection);
    fireEvent.click(screen.getByText("Research completed"));
    expect(push).not.toHaveBeenCalled();
    selection.mockRestore();

    unmount();
    render(
      <NotificationItem
        notification={{
          id: "notif-permission",
          taskId: "task-1",
          type: "permission_required",
          title: "Permission required",
          body: null,
          read: true,
          toolName: "Bash",
          toolInput: JSON.stringify({ command: "npm test" }),
          response: null,
          respondedAt: null,
          createdAt: "2026-07-12T20:00:00.000Z",
        }}
        onUpdated={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow Once" }));
    expect(push).not.toHaveBeenCalled();
  });
});
