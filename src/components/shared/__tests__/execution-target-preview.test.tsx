import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ExecutionTargetPreview } from "../execution-target-preview";

describe("ExecutionTargetPreview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the effective runtime, model, and Manual routing explanation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          kind: "task",
          ready: true,
          error: null,
          targets: [
            {
              key: "task-1",
              label: "Draft report",
              profileId: "document-writer",
              requestedRuntimeId: null,
              requestedRuntimeLabel: null,
              effectiveRuntimeId: "claude-code",
              effectiveRuntimeLabel: "Claude Code",
              requestedModelId: null,
              effectiveModelId: "sonnet",
              selectionMode: "manual-default",
              selectionReason:
                "Manual routing — auto-routing is off; using the default runtime",
              routingPreference: "manual",
              automaticFallbackEnabled: false,
              consideredRuntimeIds: ["claude-code"],
              skippedRuntimes: [],
            },
          ],
        }),
      })
    );

    render(<ExecutionTargetPreview kind="task" id="task-1" />);

    expect(await screen.findByText("Execution target")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("sonnet")).toBeInTheDocument();
    expect(screen.getByText(/Manual routing — auto-routing is off/)).toBeInTheDocument();
  });

  it("shows why automatic candidates were skipped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          kind: "task",
          ready: true,
          error: null,
          targets: [
            {
              key: "task-2",
              label: "Summarize",
              profileId: "general",
              requestedRuntimeId: null,
              requestedRuntimeLabel: null,
              effectiveRuntimeId: "anthropic-direct",
              effectiveRuntimeLabel: "Anthropic Direct API",
              requestedModelId: null,
              effectiveModelId: "claude-haiku-4-5",
              selectionMode: "automatic",
              selectionReason: "Lowest comparable configured-model token price",
              routingPreference: "cost",
              automaticFallbackEnabled: true,
              consideredRuntimeIds: ["anthropic-direct", "ollama"],
              skippedRuntimes: [
                { runtimeId: "ollama", reason: "Ollama endpoint is unavailable" },
              ],
            },
          ],
        }),
      }),
    );
    render(<ExecutionTargetPreview kind="task" id="task-2" />);
    expect(await screen.findByText("1 runtime skipped")).toBeInTheDocument();
    expect(screen.getByText(/Ollama endpoint is unavailable/)).toBeInTheDocument();
  });

  it("renders a named blocking state without inventing an alternative", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          kind: "workflow",
          ready: false,
          targets: [],
          error: {
            code: "runtime_capability_mismatch",
            message: "Ollama lacks filesystem tools required by document-writer.",
          },
        }),
      })
    );

    render(<ExecutionTargetPreview kind="workflow" id="workflow-1" />);

    expect(
      await screen.findByText("Execution target needs attention")
    ).toBeInTheDocument();
    expect(screen.getByText(/lacks filesystem tools/)).toBeInTheDocument();
    expect(screen.getByText("Edit the target before running.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Runs on")).not.toBeInTheDocument());
  });
});
