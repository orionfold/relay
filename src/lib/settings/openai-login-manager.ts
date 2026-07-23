import {
  connectCodexClient,
  initializeCodexClient,
  readCodexAuthState,
} from "@/lib/agents/runtime/openai-codex-auth";
import { clearOpenAIOAuthStatus } from "./openai-auth";
import type { CodexAppServerClient } from "@/lib/agents/runtime/codex-app-server-client";
import type {
  OpenAIAccountInfo,
  OpenAIRateLimitInfo,
} from "./openai-auth";

type LoginPhase =
  | "idle"
  | "pending"
  | "connected"
  | "cancelled"
  | "failed";

const LOGIN_TIMEOUT_MS = 5 * 60_000;

export interface OpenAILoginState {
  phase: LoginPhase;
  loginId: string | null;
  authUrl: string | null;
  account: OpenAIAccountInfo | null;
  rateLimits: OpenAIRateLimitInfo | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string;
}

interface LoginAttempt {
  client: CodexAppServerClient;
  state: OpenAILoginState;
  cancelRequested: boolean;
}

const idleState = (): OpenAILoginState => ({
  phase: "idle",
  loginId: null,
  authUrl: null,
  account: null,
  rateLimits: null,
  error: null,
  startedAt: null,
  updatedAt: new Date().toISOString(),
});

let activeAttempt: LoginAttempt | null = null;
let lastKnownState: OpenAILoginState = idleState();

function updateState(
  next: Partial<OpenAILoginState> & Pick<OpenAILoginState, "phase">
): OpenAILoginState {
  lastKnownState = {
    ...lastKnownState,
    ...next,
    updatedAt: new Date().toISOString(),
  };
  if (next.phase === "idle") {
    lastKnownState = idleState();
  }
  return lastKnownState;
}

async function closeAttempt() {
  const attempt = activeAttempt;
  activeAttempt = null;
  if (attempt) {
    await attempt.client.close();
  }
}

export function getOpenAILoginState(): OpenAILoginState {
  if (
    activeAttempt?.state.phase === "pending" &&
    activeAttempt.state.startedAt &&
    Date.now() - Date.parse(activeAttempt.state.startedAt) >= LOGIN_TIMEOUT_MS
  ) {
    const attempt = activeAttempt;
    activeAttempt = null;
    void attempt.client.close();
    return updateState({
      phase: "failed",
      loginId: attempt.state.loginId,
      authUrl: attempt.state.authUrl,
      account: null,
      rateLimits: null,
      error:
        "ChatGPT sign-in timed out. Confirm Codex App Server is installed, then try again.",
      startedAt: attempt.state.startedAt,
    });
  }
  return activeAttempt?.state ?? lastKnownState;
}

export async function startOpenAIChatGPTLogin(): Promise<OpenAILoginState> {
  if (activeAttempt) {
    return activeAttempt.state;
  }

  try {
    const current = await readCodexAuthState({ refreshToken: false });
    if (current.connected) {
      return updateState({
        phase: "connected",
        loginId: null,
        authUrl: null,
        account: current.account,
        rateLimits: current.rateLimits,
        error: null,
        startedAt: null,
      });
    }
  } catch {
    await clearOpenAIOAuthStatus();
  }

  const client = await connectCodexClient();
  await initializeCodexClient(client);

  const startedAt = new Date().toISOString();
  const state = updateState({
    phase: "pending",
    loginId: null,
    authUrl: null,
    account: null,
    rateLimits: null,
    error: null,
    startedAt,
  });
  const attempt: LoginAttempt = { client, state, cancelRequested: false };
  activeAttempt = attempt;

  client.onProcessError = (error) => {
    void closeAttempt();
    updateState({
      phase: "failed",
      error: error.message,
      loginId: state.loginId,
      authUrl: state.authUrl,
      account: null,
      rateLimits: null,
      startedAt,
    });
  };

  client.onNotification = (notification) => {
    if (notification.method !== "account/login/completed") return;
    const params = notification.params as
      | { loginId?: string | null; success?: boolean; error?: string | null }
      | undefined;

    const completedLoginId = params?.loginId ?? state.loginId;
    if (params?.success) {
      void (async () => {
        try {
          const current = await readCodexAuthState({ refreshToken: true });
          updateState({
            phase: "connected",
            loginId: completedLoginId ?? null,
            authUrl: state.authUrl,
            account: current.account,
            rateLimits: current.rateLimits,
            error: null,
            startedAt,
          });
        } catch (error) {
          updateState({
            phase: "failed",
            loginId: completedLoginId ?? null,
            authUrl: state.authUrl,
            account: null,
            rateLimits: null,
            error: error instanceof Error ? error.message : String(error),
            startedAt,
          });
        } finally {
          await closeAttempt();
        }
      })();
      return;
    }

    void (async () => {
      const cancelled =
        attempt.cancelRequested ||
        params?.error?.toLowerCase().includes("cancel") ||
        params?.error === "Login was not completed";
      updateState({
        phase: cancelled ? "cancelled" : "failed",
        loginId: completedLoginId ?? null,
        authUrl: state.authUrl,
        account: null,
        rateLimits: null,
        error: cancelled ? null : params?.error ?? "ChatGPT login failed",
        startedAt,
      });
      await clearOpenAIOAuthStatus();
      await closeAttempt();
    })();
  };

  try {
    const result = (await client.request("account/login/start", {
      type: "chatgpt",
    })) as {
      type: "chatgpt";
      loginId: string;
      authUrl: string;
    };

    const next = updateState({
      phase: "pending",
      loginId: result.loginId,
      authUrl: result.authUrl,
      account: null,
      rateLimits: null,
      error: null,
      startedAt,
    });
    if (activeAttempt) {
      activeAttempt.state = next;
    }
    return next;
  } catch (error) {
    await clearOpenAIOAuthStatus();
    await closeAttempt();
    return updateState({
      phase: "failed",
      loginId: null,
      authUrl: null,
      account: null,
      rateLimits: null,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
    });
  }
}

export async function cancelOpenAIChatGPTLogin(): Promise<OpenAILoginState> {
  const attempt = activeAttempt;
  if (!attempt?.state.loginId) {
    return getOpenAILoginState();
  }

  attempt.cancelRequested = true;

  try {
    await attempt.client.request("account/login/cancel", {
      loginId: attempt.state.loginId,
    });
    const next = updateState({
      phase: "cancelled",
      loginId: attempt.state.loginId,
      authUrl: attempt.state.authUrl,
      account: null,
      rateLimits: null,
      error: null,
      startedAt: attempt.state.startedAt,
    });
    attempt.state = next;
    await clearOpenAIOAuthStatus();
    await closeAttempt();
    return next;
  } catch (error) {
    updateState({
      phase: "failed",
      loginId: attempt.state.loginId,
      authUrl: attempt.state.authUrl,
      account: null,
      rateLimits: null,
      error: error instanceof Error ? error.message : String(error),
      startedAt: attempt.state.startedAt,
    });
    await closeAttempt();
  }

  return getOpenAILoginState();
}
