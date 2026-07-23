/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  testConnection: vi.fn(),
  getSummary: vi.fn(),
}));

vi.mock("@/lib/agents/runtime", () => ({
  testRuntimeConnection: mocks.testConnection,
  getRuntimeSummary: mocks.getSummary,
}));

import { POST } from "../route";

function request(body: unknown) {
  return new Request("http://relay.test/api/settings/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSummary.mockImplementation((runtimeId: string) => ({
    runtime: { id: runtimeId },
    capabilities: { authHealthCheck: true },
  }));
});

describe("POST /api/settings/test boundary contract", () => {
  it("dispatches the exact explicit runtime and returns its capabilities", async () => {
    mocks.testConnection.mockResolvedValue({ connected: true, detail: "ready" });

    const response = await POST(request({ runtime: "ollama" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      connected: true,
      detail: "ready",
      runtime: "ollama",
      capabilities: { authHealthCheck: true },
      readiness: {
        phase: "verified",
        ready: true,
        endpointReachable: true,
      },
    });
    expect(mocks.testConnection).toHaveBeenCalledWith("ollama");
    expect(mocks.getSummary).toHaveBeenCalledWith("ollama");
  });

  it("uses the catalog default when the request omits runtime", async () => {
    mocks.testConnection.mockResolvedValue({ connected: true });

    const response = await POST(
      new Request("http://relay.test/api/settings/test", { method: "POST" })
    );

    expect(response.status).toBe(200);
    expect(mocks.testConnection).toHaveBeenCalledWith("claude-code");
  });

  it("rejects malformed JSON and shapes without probing", async () => {
    const malformed = await POST(request("{"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      connected: false,
      error: "Invalid JSON body",
    });

    const invalid = await POST(request({ runtime: 42 }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      connected: false,
      error: "Invalid runtime test request",
    });
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it("rejects an unknown runtime instead of probing the catalog fallback", async () => {
    const response = await POST(request({ runtime: "not-a-runtime" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      connected: false,
      error: "Invalid runtime test request",
    });
    expect(mocks.testConnection).not.toHaveBeenCalled();
    expect(mocks.getSummary).not.toHaveBeenCalled();
  });

  it("keeps provider refusal readable to the Settings client", async () => {
    mocks.testConnection.mockRejectedValue(new Error("Ollama connection refused"));

    const response = await POST(request({ runtime: "ollama" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      connected: false,
      error: "Ollama connection refused",
      readiness: {
        phase: "unreachable",
        ready: false,
        endpointReachable: false,
      },
    });
  });
});
