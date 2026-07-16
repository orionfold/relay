import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivationChecklist } from "@/components/onboarding/activation-checklist";

describe("ActivationChecklist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders compact milestone progress without navigation shortcuts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          completedCount: 1,
          totalCount: 2,
          milestones: [
            { id: "project", label: "Create a project", completed: true },
            { id: "task", label: "Run a task", completed: false },
          ],
        }),
      })
    );

    render(<ActivationChecklist />);

    expect(await screen.findByText("Create a project")).toBeInTheDocument();
    expect(screen.getByText("Run a task")).toBeInTheDocument();
    expect(screen.queryByText("Quick Navigation")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "1 of 2 activation milestones complete",
      })
    ).toBeInTheDocument();
  });

  it("shows a named failure instead of silently disappearing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      })
    );

    render(<ActivationChecklist />);

    expect(
      await screen.findByText("Activation progress could not be loaded.")
    ).toBeInTheDocument();
  });
});
