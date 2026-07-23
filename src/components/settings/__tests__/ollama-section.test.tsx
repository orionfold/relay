import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaSection } from "@/components/settings/ollama-section";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

function response(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

const savedSettings = {
  runtimeId: "ollama",
  configured: true,
  baseUrl: "http://localhost:11434",
  defaultModel: "llama3.2",
  allowInsecureRemote: false,
  hasApiKey: true,
  apiKeySource: "db",
};

describe("OllamaSection", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("uses the shared setup controls without exposing the saved secret", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(true, savedSettings)));

    render(<OllamaSection />);

    expect(await screen.findByDisplayValue("http://localhost:11434")).toBeInTheDocument();
    expect(screen.getByLabelText("API key (optional)")).toHaveValue("");
    expect(screen.getByPlaceholderText("Configured via saved setting")).toHaveValue("");
    expect(screen.getByLabelText("Default model or alias")).toHaveValue("llama3.2");
    expect(screen.getByRole("switch", { name: "Allow insecure remote HTTP" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pull" })).toBeDisabled();
  });

  it("keeps provider-specific controls behind an accessible compact summary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(true, savedSettings)));

    render(<OllamaSection compact />);

    const summary = await screen.findByRole("button", {
      name: /Ollama/,
    });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Server base URL")).not.toBeInTheDocument();

    fireEvent.click(summary);

    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Server base URL")).toHaveValue(
      "http://localhost:11434",
    );
  });

  it("opens a compact card when setup loading fails so the error is visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(false, { error: "Settings unavailable" })),
    );

    render(<OllamaSection compact />);

    expect(await screen.findByText("Loading settings")).toBeInTheDocument();
    expect(screen.getByText("Settings unavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ollama/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("auto-saves edits before testing and renders discovered model details", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url === "/api/settings/ollama" && method === "GET") {
        return response(true, { ...savedSettings, hasApiKey: false, apiKeySource: "unknown" });
      }
      if (url === "/api/settings/ollama" && method === "PUT") {
        return response(true, {
          ...savedSettings,
          baseUrl: "http://127.0.0.1:11435",
          hasApiKey: false,
          apiKeySource: "unknown",
        });
      }
      if (url === "/api/settings/test") return response(true, { connected: true });
      if (url === "/api/runtimes/ollama") {
        return response(true, {
          runtimeId: "ollama",
          models: [{
            id: "llama3.2:latest",
            name: "llama3.2:latest",
            family: "llama",
            parameterSize: "3.2B",
            quantization: "Q4_K_M",
            sizeBytes: 2_000_000_000,
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OllamaSection />);
    fireEvent.change(await screen.findByLabelText("Server base URL"), {
      target: { value: "http://127.0.0.1:11435" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and discover models" }));

    expect(await screen.findByText("Connected · 1 model")).toBeInTheDocument();
    expect(calls.slice(-3)).toEqual([
      "PUT /api/settings/ollama",
      "POST /api/settings/test",
      "GET /api/runtimes/ollama",
    ]);
    expect(screen.getByText("llama3.2:latest")).toBeInTheDocument();
    expect(screen.getByText("3.2B")).toBeInTheDocument();
    expect(screen.getByText("Q4_K_M")).toBeInTheDocument();
    expect(screen.getByText("2.0 GB")).toBeInTheDocument();
  });

  it("names the acquisition phase and remains retryable after a pull failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/settings/ollama") return response(true, savedSettings);
      if (url === "/api/runtimes/ollama" && init?.method === "POST") {
        return response(false, { phase: "acquisition", error: "Model not found" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<OllamaSection />);
    const card = (await screen.findByRole("heading", { name: "Ollama" })).closest("[data-slot=card]") as HTMLElement;
    fireEvent.change(within(card).getByLabelText("Pull a model"), {
      target: { value: "missing/model" },
    });
    const pull = within(card).getByRole("button", { name: "Pull" });
    fireEvent.click(pull);

    expect(await within(card).findByText("Acquiring model")).toBeInTheDocument();
    expect(within(card).getByText("Model not found")).toBeInTheDocument();
    await waitFor(() => expect(pull).toBeEnabled());
    expect(toastError).toHaveBeenCalledWith("Model not found");
  });
});
