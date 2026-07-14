import { fireEvent, render, screen } from "@testing-library/react";
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

const { taskState } = vi.hoisted(() => ({
  taskState: {
    current: {
      id: "task-1",
      title: "Inspect history",
      status: "completed",
      createdAt: "2026-07-12T15:00:00.000Z",
      updatedAt: "2026-07-12T15:01:00.000Z",
    },
  },
}));

vi.mock("@/hooks/use-task-run-history", () => ({
  useTaskRunHistory: (options: unknown) => useTaskRunHistoryMock(options),
}));

vi.mock("@/hooks/use-task-detail", () => ({
  useTaskDetail: () => ({
    task: taskState.current,
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
  afterEach(() => {
    taskState.current.status = "completed";
    vi.clearAllMocks();
  });

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

  it.each(["planned", "running", "completed", "failed"])(
    "identifies the panel and keeps the task-detail destination stable while %s",
    (status) => {
      taskState.current.status = status;
      render(
        <TaskDetailSheet
          taskId="task-1"
          open
          onOpenChange={vi.fn()}
        />
      );

      expect(
        screen.getByRole("heading", { name: "Task summary" })
      ).toBeInTheDocument();
      expect(screen.getByText("Inspect history")).toBeInTheDocument();
      const openDetails = screen.getByRole("link", {
        name: "Open task details",
      });
      expect(openDetails).toHaveAttribute("href", "/tasks/task-1");
      expect(openDetails).toHaveAttribute("title", "Open task details");
      expect(openDetails).toHaveClass("focus-visible:ring-[3px]");
    }
  );

  it("orders the open-details action before a distinct Close control", () => {
    const onOpenChange = vi.fn();
    render(
      <TaskDetailSheet
        taskId="task-1"
        open
        onOpenChange={onOpenChange}
      />
    );

    const openDetails = screen.getByRole("link", {
      name: "Open task details",
    });
    const close = screen.getByRole("button", { name: "Close task summary" });
    expect(
      openDetails.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(close).toHaveAttribute("title", "Close task summary");

    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
