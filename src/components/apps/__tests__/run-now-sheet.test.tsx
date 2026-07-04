import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RunNowSheet } from "../run-now-sheet";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const variables: BlueprintVariable[] = [
  { id: "asset", type: "text", label: "Asset", required: true },
  {
    id: "horizon",
    type: "select",
    label: "Horizon",
    required: false,
    default: "long",
    options: [
      { value: "short", label: "Short" },
      { value: "long", label: "Long" },
    ],
  },
];

describe("RunNowSheet", () => {
  it("opens via trigger and renders fields", () => {
    render(<RunNowSheet blueprintId="bp1" variables={variables} />);
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    expect(screen.getByText(/asset/i)).toBeInTheDocument();
    expect(screen.getByText(/horizon/i)).toBeInTheDocument();
  });

  it("blocks submit when required field is empty", async () => {
    render(<RunNowSheet blueprintId="bp1" variables={variables} />);
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => {
      expect(screen.getByText(/asset is required/i)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits to /api/blueprints/{id}/instantiate on valid input", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ taskId: "t1" }) });
    render(<RunNowSheet blueprintId="bp1" variables={variables} />);
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    const assetInput = screen.getByRole("textbox");
    fireEvent.change(assetInput, { target: { value: "NVDA" } });
    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/blueprints/bp1/instantiate",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("NVDA"),
        })
      )
    );
  });

  it("shows field-level error when API returns 400 with field+message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ field: "asset", message: "Asset not recognized" }),
    });
    render(<RunNowSheet blueprintId="bp1" variables={variables} />);
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    const assetInput = screen.getByRole("textbox");
    fireEvent.change(assetInput, { target: { value: "INVALID" } });
    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => {
      expect(screen.getByText(/asset not recognized/i)).toBeInTheDocument();
    });
  });

  it("preserves input on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<RunNowSheet blueprintId="bp1" variables={variables} />);
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    const assetInput = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(assetInput, { target: { value: "NVDA" } });
    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("NVDA");
    });
  });
});
