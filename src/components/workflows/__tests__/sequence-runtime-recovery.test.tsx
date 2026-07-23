import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SequencePatternView } from "../views/sequence-pattern-view";
import type { WorkflowStatusResponse } from "@/lib/workflows/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const data: Extract<WorkflowStatusResponse, { pattern: "sequence" }> = {
  pattern: "sequence",
  id: "workflow-1",
  name: "Customer onboarding",
  status: "paused",
  resumeAt: null,
  projectName: null,
  workflowState: null,
  steps: [
    {
      id: "done",
      name: "Completed setup",
      prompt: "prepare",
      state: { stepId: "done", status: "completed", result: "safe output" },
    },
    {
      id: "blocked",
      name: "Draft proposal",
      prompt: "draft",
      state: {
        stepId: "blocked",
        status: "blocked_runtime",
        error: "The runtime timed out. Your completed steps are safe.",
        recovery: {
          kind: "runtime_transient",
          reason: "timeout",
          attempts: 0,
          maxAttempts: 2,
          blockedAt: "2026-07-23T00:00:00.000Z",
          lastHealthCheck: "unavailable",
        },
      },
    },
  ],
};

describe("SequencePatternView runtime recovery", () => {
  const originalFetch = global.fetch;
  const onRefresh = vi.fn(async () => {});

  beforeEach(() => {
    onRefresh.mockClear();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "retry_started" }),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("explains prefix safety and resumes the exact blocked step", async () => {
    render(
      <SequencePatternView
        data={data}
        setData={vi.fn()}
        onRefresh={onRefresh}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Runtime paused")).toBeInTheDocument();
    expect(
      screen.getByText(/completed steps will not run again/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Recheck and resume" }),
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/workflows/workflow-1/steps/blocked/retry",
        { method: "POST" },
      ),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
