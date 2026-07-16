import { render, screen } from "@testing-library/react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PriorityQueue } from "@/components/dashboard/priority-queue";

describe("dashboard accessibility surfaces", () => {
  it("marks the priority queue updates as a polite live region", () => {
    const { container } = render(
      <PriorityQueue
        tasks={[
          {
            id: "task-1",
            title: "Fix runtime mismatch",
            status: "failed",
            priority: 0,
            projectName: "ainative",
          },
        ]}
      />
    );

    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    const taskLink = screen.getByRole("link", { name: /Fix runtime mismatch/ });
    expect(taskLink).toHaveClass("interactive-list-item");
    expect(taskLink).toHaveAttribute("data-interactive-outline", "preserve");
  });

  it("marks the activity feed updates as a polite live region", () => {
    const { container } = render(
      <ActivityFeed
        entries={[
          {
            id: "entry-1",
            event: "completed",
            payload: "Wrote a summary",
            timestamp: new Date("2026-03-12T09:00:00.000Z").toISOString(),
            taskTitle: "Summarize roadmap",
          },
        ]}
      />
    );

    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
