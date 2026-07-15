import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleSection } from "@/components/settings/openai-compatible-section";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

function response(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

function settings(runtimeId: "litellm" | "lmstudio") {
  return {
    runtimeId,
    configured: true,
    baseUrl:
      runtimeId === "litellm"
        ? "https://gateway.example/v1"
        : "http://localhost:1234/v1",
    defaultModel: runtimeId === "litellm" ? "support" : "loaded-model",
    allowInsecureRemote: false,
    hasApiKey: runtimeId === "litellm",
    apiKeySource: runtimeId === "litellm" ? "env" : "unknown",
  };
}

describe("OpenAICompatibleSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads both identities without exposing a saved or environment secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/litellm")) return response(true, settings("litellm"));
        if (url.endsWith("/lmstudio")) return response(true, settings("lmstudio"));
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    render(<OpenAICompatibleSection />);
    expect(await screen.findByDisplayValue("https://gateway.example/v1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://localhost:1234/v1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/LITELLM_API_KEY/)).toHaveValue("");
    expect(screen.queryByDisplayValue(/secret|key/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Requests originate from the Relay server, not from this browser.")
    ).toHaveLength(2);
  });

  it("saves explicit remote-HTTP consent with the endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/litellm")) {
        return response(true, settings("litellm"));
      }
      if (method === "GET" && url.endsWith("/lmstudio")) {
        return response(true, settings("lmstudio"));
      }
      if (method === "PUT" && url.endsWith("/litellm")) {
        return response(true, {
          ...settings("litellm"),
          baseUrl: "http://192.168.1.20:4000/v1",
          allowInsecureRemote: true,
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OpenAICompatibleSection />);
    const liteLLMHeading = await screen.findByRole("heading", { name: "LiteLLM" });
    const card = liteLLMHeading.closest(".surface-card") as HTMLElement;
    fireEvent.change(within(card).getByLabelText("Server base URL"), {
      target: { value: "http://192.168.1.20:4000/v1" },
    });
    fireEvent.click(within(card).getByRole("switch", { name: "Allow insecure remote HTTP" }));
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("LiteLLM settings saved")
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/openai-compatible/litellm",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"allowInsecureRemote":true'),
      })
    );
  });

  it("tests each runtime independently and shows discovered model count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          (init?.method ?? "GET") === "GET" &&
          url === "/api/settings/openai-compatible/litellm"
        ) {
          return response(true, settings("litellm"));
        }
        if (
          (init?.method ?? "GET") === "GET" &&
          url === "/api/settings/openai-compatible/lmstudio"
        ) {
          return response(true, settings("lmstudio"));
        }
        if (url === "/api/settings/test") {
          return response(true, { connected: true });
        }
        if (url === "/api/runtimes/openai-compatible/lmstudio") {
          return response(true, {
            models: [{ id: "loaded-model" }, { id: "embedding-model" }],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    render(<OpenAICompatibleSection />);
    const heading = await screen.findByRole("heading", { name: "LM Studio" });
    const card = heading.closest(".surface-card") as HTMLElement;
    fireEvent.click(
      within(card).getByRole("button", { name: "Test and discover models" })
    );
    expect(await within(card).findByText("Connected · 2 models")).toBeInTheDocument();
    expect(within(card).getByDisplayValue("loaded-model")).toHaveAttribute(
      "list",
      "lmstudio-models"
    );
  });
});
