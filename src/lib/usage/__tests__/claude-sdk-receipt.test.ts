import { describe, expect, it } from "vitest";
import { extractClaudeSdkUsageReceipt } from "../claude-sdk-receipt";

describe("Claude SDK usage receipts", () => {
  it("sums every model, including delegated-agent work, and trusts reported cost", () => {
    const receipt = extractClaudeSdkUsageReceipt({
      type: "result",
      total_cost_usd: 1.53,
      usage: { input_tokens: 6, output_tokens: 1 },
      modelUsage: {
        "claude-opus-4-7": {
          inputTokens: 20_000,
          outputTokens: 2_000,
          cacheReadInputTokens: 1_000,
          cacheCreationInputTokens: 500,
          webSearchRequests: 0,
          costUSD: 0.45,
        },
        "claude-sonnet-4-6": {
          inputTokens: 100_000,
          outputTokens: 6_000,
          cacheReadInputTokens: 10_000,
          cacheCreationInputTokens: 2_000,
          webSearchRequests: 5,
          costUSD: 1.08,
        },
      },
    });

    expect(receipt).toEqual(
      expect.objectContaining({
        usage: {
          modelId: null,
          inputTokens: 120_000,
          outputTokens: 8_000,
          totalTokens: 128_000,
        },
        reportedCostMicros: 1_530_000,
        completeness: "complete",
        source: "claude-agent-sdk-result",
        warning: null,
      })
    );
    expect(receipt.details).toEqual(
      expect.objectContaining({ includesDelegatedUsage: true })
    );
  });

  it("marks a malformed terminal breakdown partial instead of claiming completeness", () => {
    const receipt = extractClaudeSdkUsageReceipt(
      {
        type: "result",
        total_cost_usd: 0.25,
        modelUsage: {},
      },
      { inputTokens: 6, outputTokens: 1, totalTokens: 7 }
    );

    expect(receipt.completeness).toBe("partial");
    expect(receipt.reportedCostMicros).toBe(250_000);
    expect(receipt.usage.totalTokens).toBe(7);
    expect(receipt.warning).toMatch(/delegated work may be missing/i);
  });

  it("marks usage unavailable when the stream ends without accountable data", () => {
    const receipt = extractClaudeSdkUsageReceipt(null);
    expect(receipt.completeness).toBe("unavailable");
    expect(receipt.reportedCostMicros).toBeNull();
    expect(receipt.usage).toEqual({});
  });
});
