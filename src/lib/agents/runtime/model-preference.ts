import { getRuntimeCatalogEntry, type AgentRuntimeId } from "./catalog";
import { getModelPreference } from "@/lib/settings/helpers";

/**
 * Resolve the concrete model a claude-code (or any catalog) execution should
 * run on, honoring the user's onboarding model preference
 * (`chat.modelPreference`) outside chat. Order:
 *
 *   1. an explicit profile/step pin (`pinnedModelId`) — the user said exactly
 *      what to run, the preference never overrides it;
 *   2. the preference mapped to the runtime's tier ("balanced" → Sonnet,
 *      "cost" → fast/Haiku, "quality" → Opus);
 *   3. the runtime's quality tier / catalog default — the pre-existing
 *      behavior when no preference is recorded.
 *
 * "privacy" is a runtime-level preference (route to Ollama), not a model tier
 * within a cloud runtime — it resolves as "no within-runtime opinion".
 *
 * The `source` field keeps the routing inspectable: surfaces can say WHY a
 * model was chosen instead of silently swapping tiers.
 */
export interface ResolvedPreferredModel {
  modelId: string;
  source: "pin" | "preference" | "default";
}

export async function resolvePreferredModel(
  runtimeId: AgentRuntimeId,
  options?: { pinnedModelId?: string | null },
): Promise<ResolvedPreferredModel> {
  if (options?.pinnedModelId) {
    return { modelId: options.pinnedModelId, source: "pin" };
  }

  const models = getRuntimeCatalogEntry(runtimeId).models;
  const preference = await getModelPreference();
  const tierModel =
    preference === "balanced"
      ? models.tiers?.balanced
      : preference === "cost"
        ? models.tiers?.fast
        : preference === "quality"
          ? models.tiers?.quality
          : undefined;

  if (tierModel) {
    return { modelId: tierModel, source: "preference" };
  }

  return {
    modelId: models.tiers?.quality ?? models.default,
    source: "default",
  };
}
