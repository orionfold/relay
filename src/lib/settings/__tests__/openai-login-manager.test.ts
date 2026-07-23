import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeClient = {
  request: vi.fn(),
  close: vi.fn(async () => {}),
  onProcessError: undefined as ((error: Error) => void) | undefined,
  onNotification: undefined as
    | ((notification: { method: string; params?: unknown }) => void)
    | undefined,
};

vi.mock("@/lib/agents/runtime/openai-codex-auth", () => ({
  connectCodexClient: vi.fn(async () => fakeClient),
  initializeCodexClient: vi.fn(async () => {}),
  readCodexAuthState: vi.fn(async () => ({
    connected: false,
    account: null,
    rateLimits: null,
  })),
}));

vi.mock("@/lib/settings/openai-auth", () => ({
  clearOpenAIOAuthStatus: vi.fn(async () => {}),
}));

describe("openai login manager", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fakeClient.request.mockImplementation(async (method: string) => {
      if (method === "account/login/start") {
        return {
          type: "chatgpt",
          loginId: "login-1",
          authUrl: "https://auth.openai.com/log-in",
        };
      }

      if (method === "account/login/cancel") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    });
  });

  it("returns a cancelled state when the active ChatGPT login is cancelled", async () => {
    const {
      startOpenAIChatGPTLogin,
      cancelOpenAIChatGPTLogin,
      getOpenAILoginState,
    } = await import("@/lib/settings/openai-login-manager");

    const started = await startOpenAIChatGPTLogin();
    expect(started.phase).toBe("pending");

    const cancelled = await cancelOpenAIChatGPTLogin();

    expect(cancelled.phase).toBe("cancelled");
    expect(cancelled.error).toBeNull();
    expect(fakeClient.close).toHaveBeenCalledTimes(1);
    expect(getOpenAILoginState().phase).toBe("cancelled");
  });

  it("turns an abandoned pending login into a named timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T00:00:00.000Z"));
    try {
      const {
        startOpenAIChatGPTLogin,
        getOpenAILoginState,
      } = await import("@/lib/settings/openai-login-manager");

      await startOpenAIChatGPTLogin();
      vi.setSystemTime(new Date("2026-07-23T00:05:01.000Z"));

      expect(getOpenAILoginState()).toMatchObject({
        phase: "failed",
        error: expect.stringContaining("timed out"),
      });
      expect(fakeClient.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
