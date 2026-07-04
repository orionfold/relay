import { render, screen } from "@testing-library/react";
import { TaskCreatePanel } from "@/components/tasks/task-create-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const projects = [
  { id: "proj-1", name: "Alpha Project" },
  { id: "proj-2", name: "Beta Project" },
];

describe("TaskCreatePanel defaultProjectId", () => {
  beforeEach(() => {
    // Mock the /api/agents fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pre-selects project when defaultProjectId is provided", () => {
    render(
      <TaskCreatePanel projects={projects} defaultProjectId="proj-1" />
    );

    // The select-value span should show the project name
    const selectValues = screen.getAllByText("Alpha Project");
    const triggerValue = selectValues.find(
      (el) => el.getAttribute("data-slot") === "select-value"
    );
    expect(triggerValue).toBeDefined();
  });

  it("shows 'None' when no defaultProjectId is provided", () => {
    render(
      <TaskCreatePanel projects={projects} />
    );

    // The select-value span should show "None"
    const noneElements = screen.getAllByText("None");
    const triggerValue = noneElements.find(
      (el) => el.getAttribute("data-slot") === "select-value"
    );
    expect(triggerValue).toBeDefined();
  });
});
