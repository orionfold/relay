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
  profileCount: 1,
  blueprintCount: 1,
  scheduleCount: 1,
  fileCount: 1,
};

async function openDeleteConfirm() {
  // The toolbar renders "Remove pack" as a direct button (no kebab menu).
  // Clicking it opens the confirm dialog, which has its own "Remove pack"
  // confirm button — so before opening there is exactly one such button.
  const trigger = screen.getByRole("button", { name: /^Remove pack$/i });
  fireEvent.click(trigger);
}

describe("AppDetailActions — remove button", () => {
  it("renders the Remove pack button directly, not behind a kebab menu", () => {
    render(<AppDetailActions {...baseProps} />);
    expect(screen.getByRole("button", { name: /^Remove pack$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /App actions/i })).toBeNull();
  });
});

describe("AppDetailActions — removal and retention copy", () => {
  it("uses singular table copy when tableCount === 1", async () => {
    render(<AppDetailActions {...baseProps} />);
    await openDeleteConfirm();
    expect(
      screen.getByText(/1 table and its rows, columns, and triggers/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/durable customers and customer attribution/i)).toBeInTheDocument();
  });

  it("uses plural table copy when tableCount > 1", async () => {
    render(<AppDetailActions {...baseProps} tableCount={3} />);
    await openDeleteConfirm();
    expect(
      screen.getByText(/3 tables and their rows, columns, and triggers/i)
    ).toBeInTheDocument();
  });

  it("pluralizes removed schedules and installed-pack files independently", async () => {
    render(
      <AppDetailActions
        {...baseProps}
        tableCount={0}
        scheduleCount={2}
        fileCount={2}
      />
    );
    await openDeleteConfirm();
    expect(screen.getByText(/deletes 2 schedules and 2 installed-pack files/i)).toBeInTheDocument();
  });

  it("still explains retention when the manifest reports no primitives", async () => {
    render(
      <AppDetailActions
        {...baseProps}
        tableCount={0}
        scheduleCount={0}
        fileCount={0}
      />
    );
    await openDeleteConfirm();
    expect(screen.getByText(/removes Wealth Tracker from Installed packs\./)).toBeInTheDocument();
    expect(screen.getByText(/any tables and their rows, columns, and triggers/i)).toBeInTheDocument();
  });
});

describe("AppDetailActions — toast paths", () => {
  it("on success: shows toast, navigates to /apps, refreshes", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          manifestRemoved: true,
          schedulesRemoved: 1,
          retained: { tables: 1, profiles: 1, blueprints: 1, customersAndAttribution: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<AppDetailActions {...baseProps} />);
    await openDeleteConfirm();
    fireEvent.click(
      screen.getByRole("button", { name: /^Remove pack$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        "Removed Wealth Tracker; retained business data is unchanged."
      );
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
      new Response(JSON.stringify({ error: "Failed to remove pack" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<AppDetailActions {...baseProps} />);
    await openDeleteConfirm();
    fireEvent.click(
      screen.getByRole("button", { name: /^Remove pack$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to remove pack");
    });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("on network error: shows toast.error with the thrown message", async () => {
    fetchSpy.mockRejectedValue(new Error("Network down"));

    render(<AppDetailActions {...baseProps} />);
    await openDeleteConfirm();
    fireEvent.click(
      screen.getByRole("button", { name: /^Remove pack$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Network down");
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
