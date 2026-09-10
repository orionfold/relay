import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ContextProposalReview } from "@/components/profiles/context-proposal-review";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe("context proposal review", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("keeps a namespaced profile id in one path segment", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(
      <ContextProposalReview
        notificationId="notif-1"
        profileId="reading-radar/reader-coach"
        proposedAdditions="Prefers short chapter summaries."
        onResponded={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^Approve$/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = String(fetchMock.mock.calls[0][0]);
    // The route declares one dynamic segment. An unencoded id would add
    // another and match nothing, so the id must survive as a single segment.
    expect(url.split("/")).toHaveLength(
      "/api/agents/reader-coach/context".split("/").length
    );
    expect(decodeURIComponent(url)).toBe(
      "/api/agents/reading-radar/reader-coach/context"
    );
  });

  it("does not send a request when the proposal names no profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const onResponded = vi.fn();

    render(
      <ContextProposalReview
        notificationId="notif-2"
        profileId={null}
        proposedAdditions="Prefers short chapter summaries."
        onResponded={onResponded}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^Approve$/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onResponded).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /does not name an agent profile/
    );
  });
});
