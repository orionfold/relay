import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskRunHistory } from "../task-run-history";
import type { TaskRunHistory as TaskRunHistoryData } from "@/lib/tasks/run-history";

const emptyHistory: TaskRunHistoryData = {
  runs: [],
  totalRuns: 0,
  omittedRuns: 0,
  logsTruncated: false,
  historyUnavailable: false,
};

describe("TaskRunHistory", () => {
  it("renders distinct never-run and unavailable-history states", () => {
    const { rerender } = render(
      <TaskRunHistory taskId="task-1" history={emptyHistory} />,
    );
    expect(screen.getByText("No runs yet")).toBeInTheDocument();

    rerender(
      <TaskRunHistory
        taskId="task-1"
        history={{ ...emptyHistory, historyUnavailable: true }}
      />,
    );
    expect(screen.getByText("Run history unavailable")).toBeInTheDocument();
  });

  it("shows a running attempt, monitor link, historical failure, and pruned-log state", () => {
    const history: TaskRunHistoryData = {
      runs: [
        {
          id: "current",
          status: "running",
          activityType: "current_run",
          startedAt: "2026-07-12T16:00:00.000Z",
          finishedAt: null,
          runtimeId: "ollama",
          modelId: "llama3.2",
          totalTokens: null,
          costMicros: null,
          usageCompleteness: "unavailable",
          logs: [],
          logsUnavailable: false,
          current: true,
        },
        {
          id: "failed",
          status: "failed",
          activityType: "task_run",
          startedAt: "2026-07-12T15:00:00.000Z",
          finishedAt: "2026-07-12T15:01:00.000Z",
          runtimeId: "claude-code",
          modelId: "claude-sonnet-4",
          totalTokens: 1200,
          costMicros: null,
          usageCompleteness: "complete",
          logs: [],
          logsUnavailable: true,
          current: false,
        },
      ],
      totalRuns: 2,
      omittedRuns: 0,
      logsTruncated: false,
      historyUnavailable: false,
    };

    const { rerender } = render(<TaskRunHistory taskId="task-42" history={history} />);
    expect(screen.getByRole("link", { name: /open live monitor/i })).toHaveAttribute(
      "href",
      "/monitor?taskId=task-42",
    );
    expect(screen.getByText("Current run")).toBeInTheDocument();
    expect(screen.getByText("Waiting for the first recorded event…")).toBeInTheDocument();
    expect(screen.getByText("Failed", { selector: "[data-slot='badge']" })).toBeInTheDocument();
    expect(screen.getByText(/Detailed logs are unavailable/)).toBeInTheDocument();

    const currentSummary = screen.getByText("Current run").closest("summary");
    const currentDetails = currentSummary?.closest("details");
    expect(currentDetails).toHaveAttribute("open");
    fireEvent.click(currentSummary!);
    expect(currentDetails).not.toHaveAttribute("open");
    rerender(<TaskRunHistory taskId="task-42" history={history} />);
    expect(currentDetails).not.toHaveAttribute("open");
    fireEvent.keyDown(currentSummary!, { key: "Enter" });
    expect(currentDetails).toHaveAttribute("open");
    fireEvent.keyDown(currentSummary!, { key: " " });
    expect(currentDetails).not.toHaveAttribute("open");
  });

  it("surfaces refresh failures and truncation notices", () => {
    render(
      <TaskRunHistory
        taskId="task-1"
        history={{ ...emptyHistory, omittedRuns: 2, logsTruncated: true }}
        error="Run history request failed (500)"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Run history request failed (500)");
    expect(screen.getByText(/2 older runs omitted/)).toHaveTextContent(
      "Only the most recent semantic events are shown; Monitor retains raw diagnostics.",
    );
  });

  it("renders semantic event labels and exposes Monitor for terminal runs", () => {
    render(
      <TaskRunHistory
        taskId="terminal-task"
        history={{
          ...emptyHistory,
          totalRuns: 1,
          runs: [{
            id: "run-1",
            status: "completed",
            activityType: "task_run",
            startedAt: "2026-07-12T15:00:00.000Z",
            finishedAt: "2026-07-12T15:01:00.000Z",
            runtimeId: "claude-code",
            modelId: "claude-opus-4",
            totalTokens: 100,
            costMicros: 10,
            usageCompleteness: "complete",
            current: false,
            logsUnavailable: false,
            logs: [
              {
                id: "runtime-1",
                agentType: "runtime-router",
                event: "runtime_selected",
                payload:
                  '{"selectionReason":"Profile preferred Claude Code","effectiveRuntimeId":"claude-code"}',
                timestamp: "2026-07-12T15:00:01.000Z",
              },
              {
                id: "response-1",
                agentType: "general",
                event: "response_progress",
                eventCount: 48,
                payloadTruncated: true,
                payload: '{"message":"Generated response content"}',
                timestamp: "2026-07-12T15:00:30.000Z",
              },
            ],
          }],
        }}
      />,
    );

    const responseLabel = screen.getByText("Response");
    expect(responseLabel).toHaveTextContent("×48trimmed");
    const responseSummary = responseLabel.closest("summary");
    const responseDetails = responseSummary?.closest("details");
    fireEvent.keyDown(responseSummary!, { key: "Enter" });
    expect(responseDetails).toHaveAttribute("open");
    expect(screen.getByText("Runtime selected")).toBeInTheDocument();
    expect(screen.getByText("Profile preferred Claude Code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view monitor logs/i })).toHaveAttribute(
      "href",
      "/monitor?taskId=terminal-task",
    );
  });
});
