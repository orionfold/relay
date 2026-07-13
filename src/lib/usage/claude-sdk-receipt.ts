import type { UsageCompleteness, UsageSnapshot } from "./ledger";

interface ClaudeModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
}

export interface ClaudeSdkUsageReceipt {
  usage: UsageSnapshot;
  reportedCostMicros: number | null;
  completeness: UsageCompleteness;
  source: "claude-agent-sdk-result" | "claude-agent-sdk-stream";
  details: Record<string, unknown>;
  warning: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function tokenCount(value: unknown): number | null {
  const parsed = nonNegativeNumber(value);
  return parsed == null ? null : Math.round(parsed);
}

function normalizeModelUsage(value: unknown): Record<string, ClaudeModelUsage> {
  if (!isRecord(value)) return {};

  const normalized: Record<string, ClaudeModelUsage> = {};
  for (const [modelId, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue;
    const inputTokens = tokenCount(candidate.inputTokens);
    const outputTokens = tokenCount(candidate.outputTokens);
    const costUSD = nonNegativeNumber(candidate.costUSD);
    if (inputTokens == null || outputTokens == null || costUSD == null) continue;

    normalized[modelId] = {
      inputTokens,
      outputTokens,
      cacheReadInputTokens: tokenCount(candidate.cacheReadInputTokens) ?? 0,
      cacheCreationInputTokens:
        tokenCount(candidate.cacheCreationInputTokens) ?? 0,
      webSearchRequests: tokenCount(candidate.webSearchRequests) ?? 0,
      costUSD,
    };
  }
  return normalized;
}

/**
 * Convert the Claude Agent SDK terminal result into one billing receipt.
 * `modelUsage` and `total_cost_usd` are the SDK's cumulative, authoritative
 * fields and include subagent/model work. Stream-level `usage` is only a
 * fallback because it may represent a parent message rather than the run.
 */
export function extractClaudeSdkUsageReceipt(
  value: unknown,
  fallback: UsageSnapshot = {}
): ClaudeSdkUsageReceipt {
  const node = isRecord(value) ? value : {};
  const modelUsage = normalizeModelUsage(node.modelUsage);
  const modelEntries = Object.entries(modelUsage);
  const reportedCostUsd = nonNegativeNumber(node.total_cost_usd);

  if (node.type === "result" && modelEntries.length > 0 && reportedCostUsd != null) {
    const inputTokens = modelEntries.reduce(
      (total, [, usage]) => total + usage.inputTokens,
      0
    );
    const outputTokens = modelEntries.reduce(
      (total, [, usage]) => total + usage.outputTokens,
      0
    );
    const modelId = modelEntries.length === 1 ? modelEntries[0][0] : fallback.modelId;

    return {
      usage: {
        modelId: modelId ?? null,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      reportedCostMicros: Math.round(reportedCostUsd * 1_000_000),
      completeness: "complete",
      source: "claude-agent-sdk-result",
      details: {
        includesDelegatedUsage: true,
        totalCostUsd: reportedCostUsd,
        modelUsage,
      },
      warning: null,
    };
  }

  const hasFallbackUsage =
    fallback.inputTokens != null ||
    fallback.outputTokens != null ||
    fallback.totalTokens != null;

  return {
    usage: fallback,
    reportedCostMicros:
      node.type === "result" && reportedCostUsd != null
        ? Math.round(reportedCostUsd * 1_000_000)
        : null,
    completeness: hasFallbackUsage || reportedCostUsd != null ? "partial" : "unavailable",
    source: "claude-agent-sdk-stream",
    details: {
      includesDelegatedUsage: false,
      totalCostUsd: reportedCostUsd,
      modelUsage,
      reason:
        node.type === "result"
          ? "Terminal result omitted a valid cumulative modelUsage breakdown."
          : "No terminal SDK result was available.",
    },
    warning:
      "Usage accounting is partial because the runtime did not provide a valid cumulative model breakdown; delegated work may be missing.",
  };
}
