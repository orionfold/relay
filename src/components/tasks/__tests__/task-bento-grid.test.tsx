import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskBentoGrid } from "../task-bento-grid";
import type { TaskItem } from "../task-card";

function makeTask(usage: NonNullable<TaskItem["usage"]>): TaskItem {
  return {
    id: "task-1",
    title: "Usage receipt",
    description: null,
    status: "completed",
    priority: 1,
    assignedAgent: "claude-code",
    agentProfile: "researcher",
    projectId: null,
    workflowId: null,
    scheduleId: null,
    sourceType: "manual",
    result: "done",
    sessionId: null,
    resumeCount: 0,
    createdAt: "2026-07-12T08:00:00.000Z",
    updatedAt: "2026-07-12T08:05:00.000Z",
    usage,
  };
}

describe("TaskBentoGrid usage receipts", () => {
  it("labels known minimums instead of presenting partial usage as complete", () => {
    render(
      <TaskBentoGrid
        task={makeTask({
          inputTokens: 6,
          outputTokens: 1,
          totalTokens: 7,
          costMicros: 55,
          modelId: "claude-opus-4-7",
          startedAt: "2026-07-12T08:00:00.000Z",
          finishedAt: "2026-07-12T08:05:00.000Z",
          completeness: "partial",
          providerReportedCost: false,
        })}
        docs={[]}
      />
    );

    expect(screen.getByText("Usage Receipt")).toBeInTheDocument();
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getByText("Known Cost")).toBeInTheDocument();
    expect(screen.getByText("≥6")).toBeInTheDocument();
    expect(screen.getByText(/delegated usage may be missing/i)).toBeInTheDocument();
  });

  it("identifies an authoritative runtime-reported cost without a warning", () => {
    render(
      <TaskBentoGrid
        task={makeTask({
          inputTokens: 120_000,
          outputTokens: 8_000,
          totalTokens: 128_000,
          costMicros: 1_530_000,
          modelId: "claude-opus-4-7",
          startedAt: "2026-07-12T08:00:00.000Z",
          finishedAt: "2026-07-12T08:05:00.000Z",
          completeness: "complete",
          providerReportedCost: true,
        })}
        docs={[]}
      />
    );

    expect(screen.getByText("Reported Cost")).toBeInTheDocument();
    expect(screen.queryByText("Usage Receipt")).not.toBeInTheDocument();
    expect(screen.getByText("120.0K")).toBeInTheDocument();
  });
});
