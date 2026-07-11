import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publishers/github-connection", () => ({
  GitHubConnectionError: class GitHubConnectionError extends Error { statusCode = 401; },
  connectGitHub: vi.fn(),
  disconnectGitHub: vi.fn(),
  getGitHubConnectionStatus: vi.fn(),
  verifyGitHubConnection: vi.fn(),
}));

import { GET, POST } from "../route";
import {
  connectGitHub,
  getGitHubConnectionStatus,
  verifyGitHubConnection,
} from "@/lib/publishers/github-connection";

function request(body: unknown) {
  return new Request("http://localhost/api/settings/github", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("GitHub settings API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only safe connection metadata", async () => {
    vi.mocked(getGitHubConnectionStatus).mockResolvedValue({ connected: true, login: "maker", source: "settings", tokenHint: "••••1234", verifiedAt: "2026-07-11T00:00:00.000Z" });
    const response = await GET();
    expect(await response.json()).toEqual({ connected: true, login: "maker", source: "settings", tokenHint: "••••1234", verifiedAt: "2026-07-11T00:00:00.000Z" });
  });

  it("connects with a token but never echoes it", async () => {
    vi.mocked(connectGitHub).mockResolvedValue({ connected: true, login: "maker", source: "settings", tokenHint: "••••1234", verifiedAt: "2026-07-11T00:00:00.000Z" });
    const response = await POST(request({ token: "example-secret-1234" }));
    expect(connectGitHub).toHaveBeenCalledWith("example-secret-1234");
    expect(JSON.stringify(await response.json())).not.toContain("example-secret-1234");
  });

  it("uses an explicit verify action and rejects ambiguous bodies", async () => {
    vi.mocked(verifyGitHubConnection).mockResolvedValue({ connected: true, login: "maker", source: "settings", tokenHint: "••••1234", verifiedAt: "2026-07-11T00:00:00.000Z" });
    expect((await POST(request({ verify: true }))).status).toBe(200);
    expect(verifyGitHubConnection).toHaveBeenCalled();
    expect((await POST(request({ verify: false }))).status).toBe(400);
  });
});
