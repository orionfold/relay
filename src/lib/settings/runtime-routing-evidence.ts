import {
  getRuntimeCatalogEntry,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { getSetting } from "./helpers";

/**
 * Return a comparable combined input + output price in micros per million
 * tokens. Only explicit per-token model rows qualify. Subscription prices and
 * provider fallback rows are not comparable task prices, and unknown endpoint
 * economics remain null.
 */
export async function getComparableRuntimeCost(input: {
  runtimeId: AgentRuntimeId;
  modelId?: string | null;
}): Promise<number | null> {
  if (
    input.runtimeId !== "anthropic-direct" &&
    input.runtimeId !== "openai-direct"
  ) {
    return null;
  }
  const providerId =
    input.runtimeId === "anthropic-direct" ? "anthropic" : "openai";
  const configuredModel = await getSetting(
    input.runtimeId === "anthropic-direct"
      ? SETTINGS_KEYS.ANTHROPIC_DIRECT_MODEL
      : SETTINGS_KEYS.OPENAI_DIRECT_MODEL,
  );
  const modelId =
    input.modelId ??
    configuredModel ??
    getRuntimeCatalogEntry(input.runtimeId).models.default;
  const { getPricingRegistry } = await import("@/lib/usage/pricing-registry");
  const registry = await getPricingRegistry();
  const row = registry.providers[providerId].rows.find(
    (candidate) =>
      candidate.kind === "api_model" &&
      candidate.key !== `${providerId}-fallback` &&
      candidate.matchPrefixes.some((prefix) => modelId.startsWith(prefix)),
  );
  if (
    row?.inputCostPerMillionMicros == null ||
    row.outputCostPerMillionMicros == null
  ) {
    return null;
  }
  return row.inputCostPerMillionMicros + row.outputCostPerMillionMicros;
}
