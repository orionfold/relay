import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SampleDataPanel } from "../sample-data-panel";

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast }));

const summary = {
  appId: "relay-agency",
  untouchedRows: 34,
  editedRows: 1,
  untouchedCustomers: 5,
  editedCustomers: 1,
  tableCounts: [
    {
      tableId: "clients",
      tableName: "Clients",
      untouched: 5,
      edited: 1,
    },
    {
      tableId: "engagements",
      tableName: "Engagements",
      untouched: 25,
      edited: 0,
    },
  ],
};

describe("SampleDataPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("previews and cancels without issuing a destructive request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<SampleDataPanel initialSummary={summary} />);

    expect(screen.getByText("Synthetic")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use my own data" }));
    expect(screen.getByText("Remove untouched samples?")).toBeInTheDocument();
    expect(screen.getByText(/Edited samples and everything you created stay/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Remove untouched samples?")
    ).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("confirms removal and reports preserved edited data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...summary,
          untouchedRows: 0,
          untouchedCustomers: 0,
          removedRows: 34,
          removedCustomers: 5,
          protectedCustomers: 0,
          tableCounts: summary.tableCounts.map((table) => ({
            ...table,
            untouched: 0,
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    render(<SampleDataPanel initialSummary={summary} />);

    fireEvent.click(screen.getByRole("button", { name: "Use my own data" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove untouched samples" })
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Removed 34 untouched sample rows. Your own and edited data was kept."
      )
    );
    expect(screen.getByText(/2 edited samples protected/)).toBeInTheDocument();
    expect(screen.getByText("Untouched samples removed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use my own data" })
    ).not.toBeInTheDocument();
  });

  it("keeps the retry path visible when removal fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Temporary database failure." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
    render(<SampleDataPanel initialSummary={summary} />);

    fireEvent.click(screen.getByRole("button", { name: "Use my own data" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove untouched samples" })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Temporary database failure.")
    );
    expect(
      screen.getByRole("button", { name: "Remove untouched samples" })
    ).toBeEnabled();
  });
});
