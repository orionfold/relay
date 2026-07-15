import { describe, expect, it } from "vitest";
import {
  createDefaultRoutingPolicy,
  readRoutingPolicy,
  serializeRoutingPolicy,
} from "../routing-policy";

describe("routing policy v1", () => {
  it("defaults a missing value to all registered runtimes", () => {
    const result = readRoutingPolicy(null);
    expect(result.source).toBe("default");
    expect(result.needsPersistence).toBe(true);
    expect(result.policy.eligibleRuntimeIds).toHaveLength(7);
    expect(result.policy).toEqual(createDefaultRoutingPolicy());
  });

  it("round trips a valid ordered policy", () => {
    const policy = {
      ...createDefaultRoutingPolicy(),
      eligibleRuntimeIds: ["lmstudio", "ollama"],
      manualDefaultRuntimeId: "lmstudio",
      automaticFallback: false,
    } as const;
    expect(readRoutingPolicy(serializeRoutingPolicy(policy))).toEqual({
      policy,
      source: "stored",
      needsPersistence: false,
      repairReason: null,
    });
  });

  it("fails closed for malformed JSON", () => {
    const result = readRoutingPolicy("{");
    expect(result.source).toBe("repaired");
    expect(result.policy.eligibleRuntimeIds).toEqual([]);
    expect(result.policy.automaticFallback).toBe(false);
    expect(result.repairReason).toMatch(/not valid JSON/);
  });

  it("preserves recognized choices from a future version but disables fallback", () => {
    const result = readRoutingPolicy(
      JSON.stringify({
        version: 2,
        eligibleRuntimeIds: ["litellm", "future-runtime"],
        manualDefaultRuntimeId: "lmstudio",
        automaticFallback: true,
      }),
    );
    expect(result.policy).toMatchObject({
      version: 1,
      eligibleRuntimeIds: ["litellm"],
      manualDefaultRuntimeId: "lmstudio",
      automaticFallback: false,
    });
    expect(result.repairReason).toMatch(/not supported/);
  });

  it("removes duplicates and unknown ids without reordering recognized choices", () => {
    const result = readRoutingPolicy(
      JSON.stringify({
        version: 1,
        eligibleRuntimeIds: ["ollama", "unknown", "ollama", "openai-direct"],
        manualDefaultRuntimeId: "unknown",
        automaticFallback: true,
      }),
    );
    expect(result.policy.eligibleRuntimeIds).toEqual(["ollama", "openai-direct"]);
    expect(result.policy.manualDefaultRuntimeId).toBe("claude-code");
    expect(result.source).toBe("repaired");
    expect(result.repairReason).toMatch(/duplicate/);
  });

  it("disables fallback when its stored type is invalid", () => {
    const result = readRoutingPolicy(
      JSON.stringify({
        version: 1,
        eligibleRuntimeIds: ["claude-code"],
        manualDefaultRuntimeId: "claude-code",
        automaticFallback: "yes",
      }),
    );
    expect(result.policy.automaticFallback).toBe(false);
    expect(result.repairReason).toMatch(/fallback was invalid/);
  });
});
