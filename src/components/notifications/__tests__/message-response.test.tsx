import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MessageResponse } from "@/components/notifications/message-response";

const { toastError, toastInfo } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    info: toastInfo,
  },
}));

describe("message response", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("dismisses an SDK question only after a validated acknowledgement", async () => {
    const onResponded = vi.fn();
    const questions = [
      { question: "Which release channel?", header: "Channel" },
    ];
    render(
      <MessageResponse
        taskId="task-question"
        notificationId="notification-question"
        toolInput={{ questions }}
        responded={false}
        response={null}
        onResponded={onResponded}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Type your answer"), {
      target: { value: "stable" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/tasks/task-question/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId: "notification-question",
          behavior: "allow",
          updatedInput: {
            questions,
            answers: { "Which release channel?": "stable" },
          },
        }),
      });
      expect(onResponded).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the question actionable when persistence fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({
        code: "APPROVAL_PERSISTENCE_FAILED",
        error: "The reply is still pending.",
      }),
    } as unknown as Response);

    render(
      <MessageResponse
        taskId="task-question"
        notificationId="notification-question-failure"
        toolInput={{
          questions: [{ question: "Continue?", header: "Decision" }],
        }}
        responded={false}
        response={null}
        onResponded={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Type your answer"), {
      target: { value: "yes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reply failed: The reply is still pending."
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });
});
