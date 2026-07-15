import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowList } from "@/components/workflows/workflow-list";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const workflow = {
  id: "wf-1",
  name: "Weekly Report",
  status: "draft",
  projectId: null,
  definition: JSON.stringify({
    pattern: "sequence",
    steps: [{ id: "s1", prompt: "Summarize the week" }],
  }),
  createdAt: "2026-07-07T00:00:00.000Z",
  updatedAt: "2026-07-07T00:00:00.000Z",
};

describe("WorkflowList card interactions", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    push.mockClear();
    global.fetch = vi.fn((url: string) => {
      if (url === "/api/workflows") {
        return Promise.resolve({
          ok: true,
          json: async () => [workflow],
        });
      }
      if (url === "/api/workflows/wf-1/execute") {
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: "unexpected request" }),
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("opens workflow details when the card body is clicked", async () => {
    render(<WorkflowList projects={[]} />);

    await waitFor(() => screen.getByText("Weekly Report"));
    fireEvent.click(screen.getByText("Weekly Report"));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/workflows/wf-1");
  });

  it("opens the target review from the explicit run shortcut without starting execution", async () => {
    render(<WorkflowList projects={[]} />);

    const runButton = await screen.findByRole("button", {
      name: "Review & run workflow Weekly Report",
    });
    fireEvent.click(runButton);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/workflows/wf-1");
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/workflows/wf-1/execute",
      expect.anything()
    );
  });
});
