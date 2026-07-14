import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PendingApprovalHost } from "@/components/notifications/pending-approval-host";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
  usePathname: () => "/tasks",
}));

class EventSourceMock {
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor() {
    latestEventSource = this;
  }

  close() {}
}

let latestEventSource: EventSourceMock | null = null;

const approvals = [
  {
    channel: "in_app" as const,
    notificationId: "notif-1",
    taskId: "task-1",
    workflowId: "workflow-1",
    toolName: "Bash",
    permissionLabel: "Bash",
    compactSummary: "npm run build",
    deepLink: "/tasks/task-1",
    supportedActionIds: ["allow_once", "always_allow", "deny", "open_inbox"],
    title: "Permission required",
    body: "The agent wants to run the build before publishing.",
    taskTitle: "Review workspace",
    workflowName: "Workspace sync",
    toolInput: { command: "npm run build" },
    createdAt: "2026-03-12T15:00:00.000Z",
    read: false,
  },
  {
    channel: "in_app" as const,
    notificationId: "notif-2",
    taskId: "task-2",
    workflowId: null,
    toolName: "Write",
    permissionLabel: "Write",
    compactSummary: "/tmp/report.md",
    deepLink: "/tasks/task-2",
    supportedActionIds: ["allow_once", "always_allow", "deny", "open_inbox"],
    title: "Permission required",
    body: null,
    taskTitle: "Write release brief",
    workflowName: null,
    toolInput: { path: "/tmp/report.md" },
    createdAt: "2026-03-12T14:59:00.000Z",
    read: false,
  },
];

describe("pending approval host", () => {
  beforeEach(() => {
    latestEventSource = null;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );

    vi.stubGlobal("EventSource", EventSourceMock);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(approvals),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows the primary approval toast and exposes overflow requests in the detail dialog", async () => {
    render(<PendingApprovalHost />);

    await screen.findByText("Workspace sync · Review workspace");
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.getByText("npm run build")).toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: /Workspace sync · Review workspace/i,
    });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Permission required");
    expect(dialog).toHaveTextContent("Also pending");
    expect(dialog).toHaveTextContent("Write release brief");

    fireEvent.click(screen.getByRole("button", { name: /Write release brief/i }));

    await waitFor(() => {
      expect(dialog).toHaveTextContent("/tmp/report.md");
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("does not resurrect a locally resolved approval from a stale stream snapshot", async () => {
    render(<PendingApprovalHost />);

    await screen.findByText("Workspace sync · Review workspace");
    window.dispatchEvent(
      new CustomEvent("relay:approval-resolved", { detail: "notif-1" })
    );

    await screen.findByText("Write release brief");
    latestEventSource?.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(approvals) })
    );

    await waitFor(() => {
      expect(
        screen.queryByText("Workspace sync · Review workspace")
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText("+1 more")).not.toBeInTheDocument();
  });
});
