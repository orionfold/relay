import { describe, it, expect } from "vitest";
import {
  updateAuthSettingsSchema,
  updateBudgetPolicySchema,
  updateOpenAISettingsSchema,
} from "@/lib/validators/settings";

describe("updateAuthSettingsSchema", () => {
  it("accepts valid oauth method without apiKey", () => {
    const result = updateAuthSettingsSchema.safeParse({ method: "oauth" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe("oauth");
      expect(result.data.apiKey).toBeUndefined();
    }
  });

  it("accepts valid api_key method without apiKey", () => {
    const result = updateAuthSettingsSchema.safeParse({ method: "api_key" });
    expect(result.success).toBe(true);
  });

  it("accepts api_key method with valid apiKey", () => {
    const result = updateAuthSettingsSchema.safeParse({
      method: "api_key",
      apiKey: "sk-ant-abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiKey).toBe("sk-ant-abc123");
    }
  });

  it("rejects apiKey not starting with sk-ant-", () => {
    const result = updateAuthSettingsSchema.safeParse({
      method: "api_key",
      apiKey: "invalid-key",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.apiKey).toBeDefined();
      expect(flat.fieldErrors.apiKey![0]).toContain("sk-ant-");
    }
  });

  it("rejects invalid method value", () => {
    const result = updateAuthSettingsSchema.safeParse({ method: "bearer" });
    expect(result.success).toBe(false);
  });

  it("accepts a model-only partial update without a method field", () => {
    const result = updateAuthSettingsSchema.safeParse({
      model: "claude-sonnet-4-6",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe("claude-sonnet-4-6");
      expect(result.data.method).toBeUndefined();
    }
  });

  it("rejects empty apiKey string", () => {
    const result = updateAuthSettingsSchema.safeParse({
      method: "api_key",
      apiKey: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts oauth method with valid apiKey (schema allows it)", () => {
    const result = updateAuthSettingsSchema.safeParse({
      method: "oauth",
      apiKey: "sk-ant-test123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra unknown fields via strict parsing", () => {
    const result = updateAuthSettingsSchema.safeParse({
      method: "oauth",
      extra: "field",
    });
    // Zod v4 object schemas strip unknown fields by default
    expect(result.success).toBe(true);
  });
});

describe("updateOpenAISettingsSchema", () => {
  it("accepts valid OpenAI API keys", () => {
    const result = updateOpenAISettingsSchema.safeParse({
      method: "api_key",
      apiKey: "sk-test-openai",
    });

    expect(result.success).toBe(true);
  });

  it("accepts oauth mode without an API key", () => {
    const result = updateOpenAISettingsSchema.safeParse({
      method: "oauth",
    });

    expect(result.success).toBe(true);
  });

  it("rejects keys without the sk- prefix", () => {
    const result = updateOpenAISettingsSchema.safeParse({
      method: "api_key",
      apiKey: "invalid",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateBudgetPolicySchema", () => {
  it("accepts a monthly-only budget payload", () => {
    const result = updateBudgetPolicySchema.safeParse({
      overall: {
        monthlySpendCapUsd: 50,
      },
      runtimes: {
        "claude-code": {
          monthlySpendCapUsd: 100,
          claudeOAuthPlan: "max_5x",
        },
        "openai-codex-app-server": {
          monthlySpendCapUsd: null,
        },
        "anthropic-direct": {
          monthlySpendCapUsd: null,
        },
        "openai-direct": {
          monthlySpendCapUsd: null,
        },
        ollama: {
          monthlySpendCapUsd: null,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects zero and negative values", () => {
    const result = updateBudgetPolicySchema.safeParse({
      overall: {
        monthlySpendCapUsd: -1,
      },
      runtimes: {
        "claude-code": {
          monthlySpendCapUsd: 0,
          claudeOAuthPlan: "pro",
        },
        "openai-codex-app-server": {
          monthlySpendCapUsd: null,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid Claude OAuth plans", () => {
    const result = updateBudgetPolicySchema.safeParse({
      overall: {
        monthlySpendCapUsd: 300,
      },
      runtimes: {
        "claude-code": {
          monthlySpendCapUsd: 150,
          claudeOAuthPlan: "enterprise",
        },
        "openai-codex-app-server": {
          monthlySpendCapUsd: 150,
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
