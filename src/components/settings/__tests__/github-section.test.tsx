import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubSection } from "@/components/settings/github-section";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GitHub settings section", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          expect(JSON.parse(String(init?.body))).toEqual({ method: "github-cli" });
          return json({
            connected: true,
            login: "maker",
            source: "github-cli",
            tokenHint: null,
            verifiedAt: "2026-07-11T00:00:00.000Z",
            error: null,
            cli: { installed: true },
          });
        }
        return json({
          connected: false,
          login: null,
          source: null,
          tokenHint: null,
          verifiedAt: null,
          error: null,
          cli: { installed: true },
        });
      })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("offers an installed CLI but waits for explicit selection", async () => {
    render(<GitHubSection />);

    const button = await screen.findByRole("button", { name: "Use GitHub CLI" });
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    fireEvent.click(button);

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/GitHub CLI session; no token stored by Relay/)).toBeInTheDocument();
  });

  it("keeps token setup available when GitHub CLI is not installed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          connected: false,
          login: null,
          source: null,
          tokenHint: null,
          verifiedAt: null,
          error: null,
          cli: { installed: false },
        })
      )
    );

    render(<GitHubSection />);

    expect(await screen.findByText(/was not found in Relay's PATH/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use GitHub CLI" })).toBeDisabled();
    expect(screen.getByLabelText("Fine-grained token")).toBeInTheDocument();
  });
});
