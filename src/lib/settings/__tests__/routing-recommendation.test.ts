import { describe, expect, it } from "vitest";
import { recommendForRouting } from "../routing-recommendation";
import { getRuntimeCatalogEntry } from "@/lib/agents/runtime/catalog";
import { CHAT_MODELS } from "@/lib/chat/types";

// Resolve expected model IDs live from the same catalog the helper uses, so
// these tests stay green as the catalog rotates.
const anthDirectFast = getRuntimeCatalogEntry("anthropic-direct").models.tiers?.fast;
const openaiDirectFast = getRuntimeCatalogEntry("openai-direct").models.tiers?.fast;
const claudeCodeQuality = getRuntimeCatalogEntry("claude-code").models.tiers?.quality;
const codexQuality = getRuntimeCatalogEntry("openai-codex-app-server").models.tiers?.quality;
const ollamaDefault = getRuntimeCatalogEntry("ollama").models.default;

const chatFastAnthropic = CHAT_MODELS.find((m) => m.provider === "anthropic" && m.tier === "Fast")?.id;
const chatQualityAnthropic = CHAT_MODELS.find((m) => m.provider === "anthropic" && m.tier === "Best")?.id;

describe("recommendForRouting", () => {
  const ollamaOff = { ollamaAvailable: false };
  const ollamaOn = {
    ollamaAvailable: true,
    ollamaDefaultModel: "llama3",
    ollamaNoUsageCostConfirmed: true,
  };

  it("Manual returns null regardless of Ollama state", () => {
    expect(recommendForRouting("manual", ollamaOff)).toBeNull();
    expect(recommendForRouting("manual", ollamaOn)).toBeNull();
  });

  it("Latency → catalog's fast tier for direct APIs + fast chat model, no Ollama", () => {
    const rec = recommendForRouting("latency", ollamaOff)!;
    expect(rec.anthropic).toEqual({ auth: "api_key", runtimeId: "anthropic-direct", model: anthDirectFast });
    expect(rec.openai).toEqual({ auth: "api_key", runtimeId: "openai-direct", model: openaiDirectFast });
    expect(rec.chatModel).toBe(chatFastAnthropic);
    expect(rec.useOllama).toBe(false);
    expect(rec.ollamaModel).toBeUndefined();
  });

  it("Latency ignores Ollama availability", () => {
    const rec = recommendForRouting("latency", ollamaOn)!;
    expect(rec.useOllama).toBe(false);
  });

  it("Cost with Ollama offline → fast tier, no Ollama branch", () => {
    const rec = recommendForRouting("cost", ollamaOff)!;
    expect(rec.anthropic.model).toBe(anthDirectFast);
    expect(rec.openai.model).toBe(openaiDirectFast);
    expect(rec.chatModel).toBe(chatFastAnthropic);
    expect(rec.useOllama).toBe(false);
  });

  it("Cost with Ollama connected → surfaces Ollama as primary, keeps cloud fallbacks", () => {
    const rec = recommendForRouting("cost", ollamaOn)!;
    expect(rec.useOllama).toBe(true);
    expect(rec.ollamaModel).toBe("llama3");
    expect(rec.anthropic.model).toBe(anthDirectFast);
    expect(rec.openai.model).toBe(openaiDirectFast);
  });

  it("does not infer zero cost from a reachable Ollama endpoint", () => {
    const rec = recommendForRouting("cost", {
      ollamaAvailable: true,
      ollamaDefaultModel: "cloud-model",
    })!;
    expect(rec.useOllama).toBe(false);
    expect(rec.ollamaModel).toBeUndefined();
  });

  it("Cost falls back to catalog's Ollama default when ollamaDefaultModel is missing", () => {
    const rec = recommendForRouting("cost", {
      ollamaAvailable: true,
      ollamaNoUsageCostConfirmed: true,
    })!;
    expect(rec.ollamaModel).toBe(ollamaDefault);
  });

  it("Quality → OAuth + SDK runtime's quality tier + best chat model, no Ollama", () => {
    const rec = recommendForRouting("quality", ollamaOff)!;
    expect(rec.anthropic).toEqual({ auth: "oauth", runtimeId: "claude-code", model: claudeCodeQuality });
    expect(rec.openai).toEqual({ auth: "oauth", runtimeId: "openai-codex-app-server", model: codexQuality });
    expect(rec.chatModel).toBe(chatQualityAnthropic);
    expect(rec.useOllama).toBe(false);
  });

  it("Quality ignores Ollama availability", () => {
    const rec = recommendForRouting("quality", ollamaOn)!;
    expect(rec.useOllama).toBe(false);
    expect(rec.anthropic.auth).toBe("oauth");
  });
});
