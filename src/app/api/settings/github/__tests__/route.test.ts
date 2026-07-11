import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publishers/github-connection", () => ({
  GitHubConnectionError: class GitHubConnectionError extends Error { statusCode = 401; },
  connectGitHub: vi.fn(),
  connectGitHubCli: vi.fn(),
  disconnectGitHub: vi.fn(),
  getGitHubCliStatus: vi.fn(),
  getGitHubConnectionStatus: vi.fn(),
  verifyGitHubConnection: vi.fn(),
}));

import { GET, POST } from "../route";
import {
  connectGitHub,
  connectGitHubCli,
  getGitHubCliStatus,
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGitHubCliStatus).mockResolvedValue({ installed: true });
  });

  it("returns only safe connection metadata", async () => {
    vi.mocked(getGitHubConnectionStatus).mockResolvedValue({ connected: true, login: "maker", source: "settings", tokenHint: "••••1234", verifiedAt: "2026-07-11T00:00:00.000Z", error: null });
    const response = await GET();
    expect(await response.json()).toEqual({ connected: true, login: "maker", source: "settings", tokenHint: "••••1234", verifiedAt: "2026-07-11T00:00:00.000Z", error: null, cli: { installed: true } });
  });

  it("connects with a token but never echoes it", async () => {
    vi.mocked(connectGitHub).mockResolvedValue({ connected: true, login: "maker", source: "settings", tokenHint: "••••1234", verifiedAt: "2026-07-11T00:00:00.000Z", error: null });
    const response = await POST(request({ token: "example-secret-1234" }));
    expect(connectGitHub).toHaveBeenCalledWith("example-secret-1234");
    expect(JSON.stringify(await response.json())).not.toContain("example-secret-1234");
  });

  it("uses an explicit verify action and rejects ambiguous bodies", async () => {
    vi.mocked(verifyGitHubConnection).mockResolvedValue({ connected: true, login: "maker", source: "settings", tokenHint: "••••1234", verifiedAt: "2026-07-11T00:00:00.000Z", error: null });
    expect((await POST(request({ verify: true }))).status).toBe(200);
    expect(verifyGitHubConnection).toHaveBeenCalled();
    expect((await POST(request({ verify: false }))).status).toBe(400);
  });

  it("explicitly selects GitHub CLI without accepting or returning a token", async () => {
    vi.mocked(connectGitHubCli).mockResolvedValue({ connected: true, login: "maker", source: "github-cli", tokenHint: null, verifiedAt: "2026-07-11T00:00:00.000Z", error: null });
    const response = await POST(request({ method: "github-cli" }));
    expect(connectGitHubCli).toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      connected: true,
      source: "github-cli",
      cli: { installed: true },
    });
  });
});
