import { describe, expect, it, vi } from "vitest";

import {
  extractPlanTypeFromIdToken,
  readCodexAuthStateFromClient,
} from "@/lib/agents/runtime/openai-codex-auth";

describe("openai codex auth", () => {
  it("keeps a ChatGPT session connected when rate limit decoding fails", async () => {
    const client = {
      request: vi.fn(async (method: string) => {
        if (method === "account/read") {
          return {
            account: {
              type: "chatgpt",
              email: "customer@example.com",
              planType: "prolite",
            },
            requiresOpenaiAuth: false,
          };
        }

        if (method === "account/rateLimits/read") {
          throw new Error("unknown variant `prolite`");
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
    };

    const state = await readCodexAuthStateFromClient(client as never, {
      refreshToken: true,
    });

    expect(state.connected).toBe(true);
    expect(state.account).toEqual({
      type: "chatgpt",
      email: "customer@example.com",
      planType: "prolite",
    });
    expect(state.rateLimits).toBeNull();
    expect(state.authMode).toBe("chatgpt");
  });

  it("recovers the plan type from the rate limit error payload when account/read omits it", async () => {
    const client = {
      request: vi.fn(async (method: string) => {
        if (method === "account/read") {
          return {
            account: {
              type: "chatgpt",
              email: "customer@example.com",
              planType: null,
            },
            requiresOpenaiAuth: false,
          };
        }

        if (method === "account/rateLimits/read") {
          throw new Error('Decode error: body={ "plan_type": "prolite" }');
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
    };

    const state = await readCodexAuthStateFromClient(client as never);

    expect(state.connected).toBe(true);
    expect(state.account?.planType).toBe("prolite");
    expect(state.rateLimits).toBeNull();
  });

  it("treats account/read planType=unknown as missing and recovers the upstream plan", async () => {
    const client = {
      request: vi.fn(async (method: string) => {
        if (method === "account/read") {
          return {
            account: {
              type: "chatgpt",
              email: "customer@example.com",
              planType: "unknown",
            },
            requiresOpenaiAuth: false,
          };
        }

        if (method === "account/rateLimits/read") {
          throw new Error('Decode error: body={ "plan_type": "prolite" }');
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
    };

    const state = await readCodexAuthStateFromClient(client as never);

    expect(state.connected).toBe(true);
    expect(state.account?.planType).toBe("prolite");
    expect(state.rateLimits).toBeNull();
  });

  it("extracts the plan type from the stored id token payload", async () => {
    const payload = Buffer.from(
      JSON.stringify({
        "https://api.openai.com/auth": {
          chatgpt_plan_type: "prolite",
        },
      })
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    expect(extractPlanTypeFromIdToken(`header.${payload}.signature`)).toBe("prolite");
  });
});
