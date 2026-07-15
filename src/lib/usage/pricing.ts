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

  // Ollama may be local, LAN-hosted, or the authenticated cloud API. Provider
  // identity is not enough evidence for a zero price, so retain unknown pricing
  // until the endpoint reports cost or Relay gains an operator-owned tariff.
  if (input.providerId === "ollama") {
    return { costMicros: null, pricingVersion: null };
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
