import { findPricingRowForModel } from "./pricing-registry";

export interface DerivedCost {
  costMicros: number | null;
  pricingVersion: string | null;
}

export async function deriveUsageCostMicros(input: {
  providerId: string;
  modelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): Promise<DerivedCost> {
  if (!input.modelId) {
    return { costMicros: null, pricingVersion: null };
  }

  // Local inference has no per-token billing: a known-free $0, not unknown
  // pricing. The $0 rows are the evidence for the blended-cost savings story —
  // null here would demote every local run to "unknown_pricing" and hide them.
  if (input.providerId === "ollama") {
    return { costMicros: 0, pricingVersion: "local-free" };
  }

  if (input.providerId !== "anthropic" && input.providerId !== "openai") {
    return { costMicros: null, pricingVersion: null };
  }

  const row = await findPricingRowForModel({
    providerId: input.providerId,
    modelId: input.modelId,
  });

  if (!row) {
    return { costMicros: null, pricingVersion: null };
  }

  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const inputCost =
    (inputTokens * (row.inputCostPerMillionMicros ?? 0)) / 1_000_000;
  const outputCost =
    (outputTokens * (row.outputCostPerMillionMicros ?? 0)) / 1_000_000;

  return {
    costMicros: Math.round(inputCost + outputCost),
    pricingVersion: row.key,
  };
}
