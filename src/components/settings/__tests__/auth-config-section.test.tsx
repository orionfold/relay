import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthConfigSection } from "@/components/settings/auth-config-section";

vi.mock("@/lib/agents/runtime/catalog", () => ({
  DEFAULT_AGENT_RUNTIME: "claude-code",
  getRuntimeCatalogEntry: () => ({
    id: "claude-code",
    label: "Claude Code",
  }),
}));

describe("auth config section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/settings" && method === "GET") {
          return {
            ok: true,
            json: async () => ({
              method: "oauth",
              hasKey: false,
              apiKeySource: "unknown",
            }),
          };
        }

        if (url === "/api/settings/test" && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              connected: true,
              apiKeySource: "oauth",
            }),
          };
        }

        if (url === "/api/settings" && method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
          return {
            ok: true,
            json: async () => ({
              method: body.method ?? "oauth",
              hasKey: false,
              apiKeySource: "unknown",
            }),
          };
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders an OAuth test button and shows success feedback", async () => {
    render(<AuthConfigSection />);

    const testButton = await screen.findByRole("button", { name: "Test Connection" });
    expect(testButton).toBeInTheDocument();
    expect(screen.queryByText("Test OAuth connection")).not.toBeInTheDocument();

    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });
  });

  it("shows the returned error message when the OAuth test fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/settings" && method === "GET") {
          return {
            ok: true,
            json: async () => ({
              method: "oauth",
              hasKey: false,
              apiKeySource: "unknown",
            }),
          };
        }

        if (url === "/api/settings/test" && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              connected: false,
              error: "OAuth token expired",
            }),
          };
        }

        if (url === "/api/settings" && method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
          return {
            ok: true,
            json: async () => ({
              method: body.method ?? "oauth",
              hasKey: false,
              apiKeySource: "unknown",
            }),
          };
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      })
    );

    render(<AuthConfigSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(screen.getByText("OAuth token expired")).toBeInTheDocument();
      expect(screen.getByText("Not configured")).toBeInTheDocument();
    });
  });

  it("clears the inline test result when switching auth methods", async () => {
    render(<AuthConfigSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /API Key/i }));

    await waitFor(() => {
      expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    });
  });
});
