import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OllamaSection } from "@/components/settings/ollama-section";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

type FetchResult = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function response(ok: boolean, body: unknown): FetchResult {
  return { ok, json: async () => body };
}

describe("OllamaSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows unavailable Test feedback and clears stale models", async () => {
    let probes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/settings/ollama") {
          return response(true, { baseUrl: "http://localhost:11434" });
        }
        if (url === "/api/runtimes/ollama") {
          probes += 1;
          if (probes === 1) {
            return response(true, {
              models: [{ name: "llama3.2", size: 2_000_000_000, modified_at: "now" }],
            });
          }
          return response(false, { error: "Ollama is not running" });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<OllamaSection />);
    const testButton = screen.getByRole("button", { name: "Test Connection" });
    fireEvent.click(testButton);
    expect(await screen.findByText("Connected. 1 model available")).toBeInTheDocument();
    expect(screen.getByText("llama3.2")).toBeInTheDocument();

    fireEvent.click(testButton);
    expect(await screen.findByText("Ollama is not running")).toBeInTheDocument();
    expect(screen.queryByText("llama3.2")).not.toBeInTheDocument();
  });

  it("shows available Test feedback with the returned model count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/settings/ollama") return response(true, {});
        if (url === "/api/runtimes/ollama") {
          return response(true, {
            models: [
              { name: "llama3.2", size: 2_000_000_000, modified_at: "now" },
              { name: "mistral", size: 4_000_000_000, modified_at: "now" },
            ],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<OllamaSection />);
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
    expect(await screen.findByText("Connected. 2 models available")).toBeInTheDocument();
  });

  it("shows Save success and re-tests the saved endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/settings/ollama" && method === "GET") return response(true, {});
      if (url === "/api/settings/ollama" && method === "POST") return response(true, { ok: true });
      if (url === "/api/runtimes/ollama") return response(true, { models: [] });
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OllamaSection />);
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "http://127.0.0.1:11435" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Ollama base URL saved");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/ollama",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ baseUrl: "http://127.0.0.1:11435" }),
      }),
    );
    expect(await screen.findByText("Connected. 0 models available")).toBeInTheDocument();
  });

  it("shows Save failure for HTTP and network errors and re-enables Save", async () => {
    let saveAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/api/settings/ollama" && method === "GET") return response(true, {});
        if (url === "/api/settings/ollama" && method === "POST") {
          saveAttempts += 1;
          if (saveAttempts === 1) return response(false, {});
          throw new TypeError("Failed to fetch");
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    render(<OllamaSection />);
    const saveButton = screen.getByRole("button", { name: "Save" });

    fireEvent.click(saveButton);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Failed to save base URL"));
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to save base URL: Failed to fetch");
    });
    expect(saveButton).toBeEnabled();
  });
});
