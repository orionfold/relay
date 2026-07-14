import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppViewDiagnosticsSection } from "@/components/settings/app-view-diagnostics-section";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function response(ok: boolean, body: unknown) {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

describe("AppViewDiagnosticsSection", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("loads the persisted state and saves an enabled toggle", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/settings/apps" && (init?.method ?? "GET") === "GET") {
        return response(true, { showInferenceDiagnostics: false });
      }
      return response(true, { showInferenceDiagnostics: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AppViewDiagnosticsSection />);
    const toggle = await screen.findByRole("switch", { name: /view-kit diagnostics/i });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/apps",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ showInferenceDiagnostics: true }),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("App view diagnostics enabled");
  });

  it("restores the previous state and reports a named save failure", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return response(true, { showInferenceDiagnostics: false });
      }
      return response(false, { error: "write failed" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AppViewDiagnosticsSection />);
    const toggle = await screen.findByRole("switch", { name: /view-kit diagnostics/i });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("App diagnostics setting could not be saved"));
    expect(toggle).not.toBeChecked();
  });
});
