import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { BatchProposalReview } from "@/components/notifications/batch-proposal-review";

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
  },
}));

describe("batch proposal review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the batch actionable until the server confirms durable resolution", async () => {
    const onResponded = vi.fn();
    let resolveFetch: ((value: Response) => void) | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    render(
      <BatchProposalReview
        notificationId="batch-1"
        proposalIds={["p1", "p2"]}
        profileIds={["general"]}
        body="Batch summary"
        onResponded={onResponded}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /approve all/i }));

    expect(onResponded).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /approving/i })).toBeDisabled();

    resolveFetch?.(
      new Response(JSON.stringify({ success: true, action: "approve", count: 2 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await waitFor(() => {
      expect(onResponded).toHaveBeenCalledTimes(1);
      expect(screen.getByText("2 proposals approved")).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith("/api/context/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId: "batch-1",
        proposalIds: ["p1", "p2"],
        action: "approve",
      }),
    });
  });

  it("keeps a failed batch visible with named retry guidance", async () => {
    const onResponded = vi.fn();
    const onRequestFailed = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Batch approval failed"))
    );

    render(
      <BatchProposalReview
        notificationId="batch-1"
        proposalIds={["p1", "p2"]}
        profileIds={["general"]}
        body="Batch summary"
        onResponded={onResponded}
        onRequestFailed={onRequestFailed}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /approve all/i }));

    expect(onResponded).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(onRequestFailed).toHaveBeenCalledTimes(1);
    });
    expect(toastError).toHaveBeenCalledWith("Batch approval failed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Batch decision failed: Batch approval failed"
    );
    expect(
      screen.getByRole("button", { name: /approve all \(2\)/i })
    ).toBeInTheDocument();
  });
});
