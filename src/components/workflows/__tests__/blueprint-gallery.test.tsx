import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BlueprintGallery } from "../blueprint-gallery";
import type { WorkflowBlueprint } from "@/lib/workflows/blueprints/types";

// Router push is captured so we can assert a card-body click navigates while a
// Run/Create-workflow click does NOT (propagation must stop at the buttons).
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// RunNowButton pulls in the server action + sonner; stub it to a marker with
// its own click so we can assert both that it renders and that clicking it
// does not bubble to the card's navigate handler.
vi.mock("@/components/apps/run-now-button", () => ({
  RunNowButton: ({ blueprintId }: { blueprintId: string }) => (
    <button
      type="button"
      data-testid={`run-${blueprintId}`}
      onClick={(e) => e.stopPropagation()}
    >
      Run
    </button>
  ),
}));

const BP: WorkflowBlueprint = {
  id: "bp-report",
  name: "Weekly Report",
  description: "Summarize the week",
  domain: "work",
  pattern: "sequential",
  tags: ["report"],
  steps: [{ id: "s1" }] as WorkflowBlueprint["steps"],
  variables: [],
} as WorkflowBlueprint;

function mockFetch(blueprints: WorkflowBlueprint[], apps: unknown[] = []) {
  global.fetch = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () => (url.includes("/api/blueprints") ? blueprints : apps),
    })
  ) as unknown as typeof fetch;
}

describe("BlueprintGallery — one-click Run on list cards (FEAT-6)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    push.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("renders a RunNowButton on each blueprint list card", async () => {
    mockFetch([BP]);
    render(<BlueprintGallery />);
    await waitFor(() =>
      expect(screen.getByTestId("run-bp-report")).toBeInTheDocument()
    );
  });

  it("clicking the card body navigates to the blueprint detail", async () => {
    mockFetch([BP]);
    render(<BlueprintGallery />);
    await waitFor(() => screen.getByText("Weekly Report"));
    fireEvent.click(screen.getByText("Weekly Report"));
    expect(push).toHaveBeenCalledWith("/blueprints/bp-report");
  });

  it("clicking Run does NOT navigate (propagation stops at the button)", async () => {
    mockFetch([BP]);
    render(<BlueprintGallery />);
    await waitFor(() => screen.getByTestId("run-bp-report"));
    fireEvent.click(screen.getByTestId("run-bp-report"));
    expect(push).not.toHaveBeenCalled();
  });
});
