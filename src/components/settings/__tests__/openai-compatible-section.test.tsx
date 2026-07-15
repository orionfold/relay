import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleSection } from "@/components/settings/openai-compatible-section";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

function response(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

function settings(runtimeId: "litellm" | "lmstudio") {
  return {
    runtimeId,
    configured: true,
    baseUrl: runtimeId === "litellm" ? "https://gateway.example/v1" : "http://localhost:1234/v1",
    defaultModel: runtimeId === "litellm" ? "support" : "loaded-model",
    allowInsecureRemote: false,
    hasApiKey: runtimeId === "litellm",
    apiKeySource: runtimeId === "litellm" ? "env" : "unknown",
  };
}

function cardFor(name: string): HTMLElement {
  return screen.getByRole("heading", { name }).closest("[data-slot=card]") as HTMLElement;
}

describe("OpenAICompatibleSection", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("shows consistent forms plus truthful provider-specific acquisition guidance", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/litellm")) return response(true, settings("litellm"));
      if (url.endsWith("/lmstudio")) return response(true, settings("lmstudio"));
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<OpenAICompatibleSection />);
    expect(await screen.findByDisplayValue("https://gateway.example/v1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://localhost:1234/v1")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Server base URL")).toHaveLength(2);
    expect(screen.getAllByLabelText("API key (optional)")).toHaveLength(2);
    expect(screen.getAllByLabelText("Default model or alias")).toHaveLength(2);
    expect(screen.getAllByRole("switch", { name: "Allow insecure remote HTTP" })).toHaveLength(2);
    expect(within(cardFor("LiteLLM")).getByText("Gateway-managed models")).toBeInTheDocument();
    expect(within(cardFor("LiteLLM")).getByRole("button", { name: "Refresh models" })).toBeEnabled();
    expect(within(cardFor("LM Studio")).getByLabelText("Download a model")).toBeInTheDocument();
  });

  it("preserves the save-before-test order and displays LiteLLM model metadata", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (method === "GET" && url.endsWith("/litellm") && url.includes("/settings/")) return response(true, settings("litellm"));
      if (method === "GET" && url.endsWith("/lmstudio") && url.includes("/settings/")) return response(true, settings("lmstudio"));
      if (method === "PUT" && url.endsWith("/litellm")) {
        return response(true, { ...settings("litellm"), allowInsecureRemote: true });
      }
      if (url === "/api/settings/test") return response(true, { connected: true });
      if (url === "/api/runtimes/openai-compatible/litellm") {
        return response(true, {
          runtimeId: "litellm",
          models: [{
            id: "support",
            name: "support",
            upstreamModel: "openai/gpt-5.4",
            maxInputTokens: 128000,
            inputCostPerToken: 0,
            mode: "chat",
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }));

    render(<OpenAICompatibleSection />);
    await screen.findByDisplayValue("https://gateway.example/v1");
    const card = cardFor("LiteLLM");
    fireEvent.click(within(card).getByRole("switch", { name: "Allow insecure remote HTTP" }));
    fireEvent.click(within(card).getByRole("button", { name: "Test and discover models" }));

    expect(await within(card).findByText("Connected · 1 model")).toBeInTheDocument();
    expect(calls.slice(-3)).toEqual([
      "PUT /api/settings/openai-compatible/litellm",
      "POST /api/settings/test",
      "GET /api/runtimes/openai-compatible/litellm",
    ]);
    expect(within(card).getByText("Upstream openai/gpt-5.4")).toBeInTheDocument();
    expect(within(card).getByText("128,000 input tokens")).toBeInTheDocument();
    expect(within(card).getByText("$0.000 / input token")).toBeInTheDocument();
  });

  it("persists displayed defaults before the first test", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (method === "GET" && url.endsWith("/litellm") && url.includes("/settings/")) {
        return response(true, { ...settings("litellm"), configured: false });
      }
      if (method === "GET" && url.endsWith("/lmstudio") && url.includes("/settings/")) {
        return response(true, settings("lmstudio"));
      }
      if (method === "PUT" && url.endsWith("/litellm")) {
        return response(true, settings("litellm"));
      }
      if (url === "/api/settings/test") return response(true, { connected: true });
      if (url === "/api/runtimes/openai-compatible/litellm") {
        return response(true, { runtimeId: "litellm", models: [] });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }));

    render(<OpenAICompatibleSection />);
    const card = cardFor("LiteLLM");
    await within(card).findByDisplayValue("https://gateway.example/v1");
    fireEvent.click(within(card).getByRole("button", { name: "Test and discover models" }));

    await waitFor(() => expect(calls.slice(-3)).toEqual([
      "PUT /api/settings/openai-compatible/litellm",
      "POST /api/settings/test",
      "GET /api/runtimes/openai-compatible/litellm",
    ]));
  });

  it("starts an LM Studio download once and refreshes models after completion", async () => {
    let downloadCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("/settings/") && url.endsWith("/litellm")) return response(true, settings("litellm"));
      if (method === "GET" && url.includes("/settings/") && url.endsWith("/lmstudio")) return response(true, settings("lmstudio"));
      if (url === "/api/runtimes/openai-compatible/lmstudio" && method === "POST") {
        downloadCalls += 1;
        return response(true, { status: "completed", jobId: "download-1" });
      }
      if (url === "/api/runtimes/openai-compatible/lmstudio" && method === "GET") {
        return response(true, {
          runtimeId: "lmstudio",
          models: [{
            id: "new-model",
            name: "New model",
            loaded: false,
            loadedInstanceCount: 0,
            vision: false,
            trainedForToolUse: false,
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }));

    render(<OpenAICompatibleSection />);
    await screen.findByDisplayValue("http://localhost:1234/v1");
    const card = cardFor("LM Studio");
    fireEvent.change(within(card).getByLabelText("Download a model"), { target: { value: "publisher/new-model" } });
    const download = within(card).getByRole("button", { name: "Download" });
    fireEvent.click(download);
    fireEvent.click(download);

    expect(await within(card).findByText("New model")).toBeInTheDocument();
    expect(downloadCalls).toBe(1);
    expect(within(card).getByText("Not loaded")).toBeInTheDocument();
    expect(within(card).getByText("0 loaded instances")).toBeInTheDocument();
    expect(within(card).getByText("No vision")).toBeInTheDocument();
    expect(within(card).getByText("No tool training")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("LM Studio model download completed");
    await waitFor(() => expect(within(card).getByRole("button", { name: "Download" })).toBeDisabled());
  });
});
