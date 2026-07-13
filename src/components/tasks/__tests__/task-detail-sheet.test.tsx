import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskDetailSheet } from "../task-detail-sheet";

const useTaskRunHistoryMock = vi.fn(() => ({
  history: {
    runs: [],
    totalRuns: 0,
    omittedRuns: 0,
    logsTruncated: false,
    historyUnavailable: false,
  },
  error: null,
  refresh: vi.fn(),
}));

vi.mock("@/hooks/use-task-run-history", () => ({
  useTaskRunHistory: (options: unknown) => useTaskRunHistoryMock(options),
}));

vi.mock("@/hooks/use-task-detail", () => ({
  useTaskDetail: () => ({
    task: {
      id: "task-1",
      title: "Inspect history",
      status: "completed",
      createdAt: "2026-07-12T15:00:00.000Z",
      updatedAt: "2026-07-12T15:01:00.000Z",
    },
    docs: [],
    loaded: true,
    loading: false,
    error: null,
    fetchDocs: vi.fn(),
    handleStatusChange: vi.fn(),
    handleExecute: vi.fn(),
    handleResume: vi.fn(),
    handleCancel: vi.fn(),
    handleDelete: vi.fn(),
    confirmCancel: false,
    setConfirmCancel: vi.fn(),
    confirmDelete: false,
    setConfirmDelete: vi.fn(),
    editOpen: false,
    setEditOpen: vi.fn(),
    performCancel: vi.fn(),
    performDelete: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../task-chip-bar", () => ({ TaskChipBar: () => null }));
vi.mock("../task-bento-grid", () => ({ TaskBentoGrid: () => null }));
vi.mock("../task-edit-dialog", () => ({ TaskEditDialog: () => null }));

describe("TaskDetailSheet", () => {
  it("renders the shared run history and enables its lifecycle only while open", () => {
    render(
      <TaskDetailSheet
        taskId="task-1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Run history")).toBeInTheDocument();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(useTaskRunHistoryMock).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      enabled: true,
      taskStatus: "completed",
    }));
  });
});
