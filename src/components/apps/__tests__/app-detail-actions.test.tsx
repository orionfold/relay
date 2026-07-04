import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppDetailActions } from "../app-detail-actions";

const pushSpy = vi.fn();
const refreshSpy = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy, refresh: refreshSpy }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const fetchSpy = vi.fn();

beforeEach(() => {
  pushSpy.mockClear();
  refreshSpy.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseProps = {
  appId: "wealth-tracker",
  appName: "Wealth Tracker",
  tableCount: 1,
  scheduleCount: 1,
  fileCount: 1,
};

async function openDeleteConfirm() {
  // The toolbar renders "Delete app" as a direct button (no kebab menu).
  // Clicking it opens the confirm dialog, which has its own "Delete app"
  // confirm button — so before opening there is exactly one such button.
  const trigger = screen.getByRole("button", { name: /^Delete app$/i });
  fireEvent.click(trigger);
}

describe("AppDetailActions — delete button", () => {
  it("renders the Delete app button directly, not behind a kebab menu", () => {
    render(<AppDetailActions {...baseProps} />);
    expect(screen.getByRole("button", { name: /^Delete app$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /App actions/i })).toBeNull();
  });
});

describe("AppDetailActions — pluralization", () => {
  it("uses singular table copy when tableCount === 1", async () => {
    render(<AppDetailActions {...baseProps} />);
    await openDeleteConfirm();
    expect(
      screen.getByText(/1 table \(and its rows, columns, triggers\)/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/their rows/i)).toBeNull();
  });

  it("uses plural table copy when tableCount > 1", async () => {
    render(<AppDetailActions {...baseProps} tableCount={3} />);
    await openDeleteConfirm();
    expect(
      screen.getByText(/3 tables \(and their rows, columns, triggers\)/i)
    ).toBeInTheDocument();
  });

  it("pluralizes schedules and manifest files independently", async () => {
    render(
      <AppDetailActions
        {...baseProps}
        tableCount={0}
        scheduleCount={2}
        fileCount={2}
      />
    );
    await openDeleteConfirm();
    expect(screen.getByText(/2 schedules/)).toBeInTheDocument();
    expect(screen.getByText(/2 manifest files/)).toBeInTheDocument();
  });

  it("falls back to 'its manifest' when all counts are zero", async () => {
    render(
      <AppDetailActions
        {...baseProps}
        tableCount={0}
        scheduleCount={0}
        fileCount={0}
      />
    );
    await openDeleteConfirm();
    expect(screen.getByText(/and its manifest\./)).toBeInTheDocument();
  });
});

describe("AppDetailActions — toast paths", () => {
  it("on success: shows toast, navigates to /apps, refreshes", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, filesRemoved: true, projectRemoved: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<AppDetailActions {...baseProps} />);
    await openDeleteConfirm();
    fireEvent.click(
      screen.getByRole("button", { name: /^Delete app$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Deleted Wealth Tracker");
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/apps/wealth-tracker",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(pushSpy).toHaveBeenCalledWith("/apps");
    expect(refreshSpy).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("on server error: shows toast.error with the server message", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "Failed to delete app" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<AppDetailActions {...baseProps} />);
    await openDeleteConfirm();
    fireEvent.click(
      screen.getByRole("button", { name: /^Delete app$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to delete app");
    });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("on network error: shows toast.error with the thrown message", async () => {
    fetchSpy.mockRejectedValue(new Error("Network down"));

    render(<AppDetailActions {...baseProps} />);
    await openDeleteConfirm();
    fireEvent.click(
      screen.getByRole("button", { name: /^Delete app$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Network down");
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
