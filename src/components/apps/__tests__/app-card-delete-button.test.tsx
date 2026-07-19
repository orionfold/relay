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
  profileCount: 2,
  blueprintCount: 1,
  scheduleCount: 1,
  fileCount: 1,
};

describe("AppCardDeleteButton — retention copy", () => {
  it("names retained tables, reusable primitives, customers, and the Cell boundary", () => {
    render(<AppCardDeleteButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Remove Wealth Tracker/i })
    );
    expect(
      screen.getByText(/2 tables and their rows, columns, and triggers/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/2 reusable profiles/i)).toBeInTheDocument();
    expect(screen.getByText(/1 reusable blueprint/i)).toBeInTheDocument();
    expect(screen.getByText(/durable customers and customer attribution/i)).toBeInTheDocument();
    expect(screen.getByText(/does not delete a Relay Cell/i)).toBeInTheDocument();
  });

  it("uses singular table ownership copy when tableCount is one", () => {
    render(<AppCardDeleteButton {...baseProps} tableCount={1} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Remove Wealth Tracker/i })
    );
    expect(
      screen.getByText(/1 table and its rows, columns, and triggers/i)
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
      screen.getByRole("button", { name: /Remove Wealth Tracker/i })
    );
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("on success: shows toast, refreshes (no navigation away)", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          manifestRemoved: true,
          schedulesRemoved: 1,
          retained: { tables: 2, profiles: 2, blueprints: 1, customersAndAttribution: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<AppCardDeleteButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Remove Wealth Tracker/i })
    );
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

    render(<AppCardDeleteButton {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Remove Wealth Tracker/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Remove pack$/, hidden: false })
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to remove pack");
    });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("appId is URL-encoded in the request path", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          manifestRemoved: true,
          schedulesRemoved: 0,
          retained: { tables: 2, profiles: 2, blueprints: 1, customersAndAttribution: true },
        }),
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
    fireEvent.click(screen.getByRole("button", { name: /Remove Weird/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /^Remove pack$/, hidden: false })
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/apps/weird%20id%20with%20spaces",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});
