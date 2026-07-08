import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppCardDeleteButton } from "../app-card-delete-button";

const refreshSpy = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshSpy }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const fetchSpy = vi.fn();

beforeEach(() => {
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
  tableCount: 2,
  scheduleCount: 1,
  fileCount: 1,
};

describe("AppCardDeleteButton — pluralization", () => {
  it("uses plural table copy when tableCount > 1 (their rows)", () => {
    render(<AppCardDeleteButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Delete Wealth Tracker/i })
    );
    expect(
      screen.getByText(/2 tables \(and their rows, columns, triggers\)/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/and its rows/i)).toBeNull();
  });

  it("uses singular table copy when tableCount === 1 (its rows)", () => {
    render(<AppCardDeleteButton {...baseProps} tableCount={1} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Delete Wealth Tracker/i })
    );
    expect(
      screen.getByText(/1 table \(and its rows, columns, triggers\)/i)
    ).toBeInTheDocument();
  });
});

describe("AppCardDeleteButton — click behavior + toast paths", () => {
  it("trash button click does not navigate to the link (defensive stopPropagation)", () => {
    // Surrounding click handler should NOT fire when the trash button is clicked.
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <AppCardDeleteButton {...baseProps} />
      </div>
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Delete Wealth Tracker/i })
    );
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("on success: shows toast, refreshes (no navigation away)", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, filesRemoved: true, projectRemoved: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<AppCardDeleteButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Delete Wealth Tracker/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Delete pack$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Deleted Wealth Tracker");
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/apps/wealth-tracker",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(refreshSpy).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("on server error: shows toast.error with the server message", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "Failed to delete pack" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<AppCardDeleteButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Delete Wealth Tracker/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Delete pack$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to delete pack");
    });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("appId is URL-encoded in the request path", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, filesRemoved: true, projectRemoved: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(
      <AppCardDeleteButton
        {...baseProps}
        appId="weird id with spaces"
        appName="Weird"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Delete Weird/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /^Delete pack$/, hidden: false })
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/apps/weird%20id%20with%20spaces",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});
