import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataManagementSection } from "@/components/settings/data-management-section";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataManagementSection", () => {
  it("hides the seed/clear controls with an explanation when data ops are disallowed", () => {
    render(<DataManagementSection allowed={false} />);
    expect(
      screen.getByText(/staging-only tools/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Seed Sample Data/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Clear All Data/i })).toBeNull();
  });

  it("surfaces the route's explanatory reason on a gated 403 — NOT 'Network error' (BUG-5)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error:
            "Sample data seeding is a staging-only tool and is disabled on this build.",
        }),
      }))
    );

    // allowed=true here simulates a stale client / direct hit where the button
    // is present but the server route still gates the request.
    render(<DataManagementSection allowed />);
    fireEvent.click(screen.getByRole("button", { name: /Seed Sample Data/i }));
    // ConfirmDialog "Seed Data" confirm button fires the handler.
    fireEvent.click(screen.getByRole("button", { name: /^Seed Data$/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Sample data seeding is a staging-only tool and is disabled on this build."
      );
    });
    // The disguised-network-error path must NOT fire.
    expect(toastError).not.toHaveBeenCalledWith(
      expect.stringMatching(/Network error/i)
    );
  });

  it("still reports a real network failure as 'Network error'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    render(<DataManagementSection allowed />);
    fireEvent.click(screen.getByRole("button", { name: /Seed Sample Data/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Seed Data$/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Seed failed. Network error");
    });
  });
});
