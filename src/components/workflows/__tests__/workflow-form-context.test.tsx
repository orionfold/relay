import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowFormView } from "../workflow-form-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("WorkflowFormView project context", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );
  });

  it("shows the persisted project immediately when editing", async () => {
    render(
      <WorkflowFormView
        workflow={{
          id: "workflow-context",
          name: "Context workflow",
          projectId: "project-context",
          definition: JSON.stringify({
            pattern: "sequence",
            steps: [{ id: "draft", name: "Draft", prompt: "Write" }],
          }),
          successCriteria: [],
        }}
        projects={[{ id: "project-context", name: "Foundation account" }]}
        profiles={[]}
      />
    );

    await waitFor(() => {
      const projectSelector = screen.getAllByRole("combobox")[0];
      expect(projectSelector).toHaveTextContent("Foundation account");
      expect(projectSelector).not.toHaveTextContent("None");
    });
  });
});
