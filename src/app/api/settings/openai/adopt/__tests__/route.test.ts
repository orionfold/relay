import { describe, expect, it, vi } from "vitest";

const { mockAdoptExistingCodexSession } = vi.hoisted(() => ({
  mockAdoptExistingCodexSession: vi.fn(),
}));

vi.mock("@/lib/settings/codex-session-adoption", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/settings/codex-session-adoption")
    >();
  return {
    ...actual,
    adoptExistingCodexSession: mockAdoptExistingCodexSession,
  };
});

vi.mock("@/lib/settings/runtime-routing-status", () => ({
  clearRuntimeRoutingStatusCache: vi.fn(),
}));

import { CodexSessionAdoptionError } from "@/lib/settings/codex-session-adoption";
import { POST } from "../route";

describe("POST /api/settings/openai/adopt", () => {
  it("returns privacy-safe verified session metadata", async () => {
    mockAdoptExistingCodexSession.mockResolvedValueOnce({
      connected: true,
      account: {
        type: "chatgpt",
        email: "customer@example.com",
        planType: "pro",
      },
      rateLimits: null,
      secret: "must-not-leak",
    });

    const response = await POST();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      connected: true,
      account: {
        type: "chatgpt",
        email: "customer@example.com",
        planType: "pro",
      },
      rateLimits: null,
    });
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
  });

  it("preserves named conflict status", async () => {
    mockAdoptExistingCodexSession.mockRejectedValueOnce(
      new CodexSessionAdoptionError("Nothing was overwritten.", 409),
    );
    const response = await POST();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      connected: false,
      error: "Nothing was overwritten.",
    });
  });

  it("does not expose unexpected internal failure details", async () => {
    mockAdoptExistingCodexSession.mockRejectedValueOnce(
      new Error("secret process detail"),
    );
    const response = await POST();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      connected: false,
      error: "Relay could not adopt the existing Codex sign-in.",
    });
    expect(JSON.stringify(body)).not.toContain("secret process detail");
  });
});
