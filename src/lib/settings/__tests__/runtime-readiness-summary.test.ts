import { describe, expect, it } from "vitest";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import type { RuntimeRoutingStatus } from "../runtime-routing-status";
import { summarizeRuntimeReadiness } from "../runtime-readiness-summary";

function status(
  runtimeId: AgentRuntimeId,
  label: string,
  configured: boolean,
  ready: boolean,
): RuntimeRoutingStatus {
  return {
    runtimeId,
    label,
    configured,
    ready,
    health: ready ? "healthy" : configured ? "unhealthy" : "unconfigured",
    healthReason: ready ? null : configured ? "Connection refused" : "Not configured",
    checkedAt: configured ? "2026-07-23T12:00:00.000Z" : null,
    readiness: ready ? "verified" : configured ? "unreachable" : "not-configured",
    credentialSource: "unknown",
    endpointReachable: ready ? true : configured ? false : null,
    modelId: ready ? "model-a" : null,
    comparableCostPerMillionMicros: null,
    capabilitySummary: [],
    capabilityLimits: [],
  };
}

const statuses = [
  status("ollama", "Ollama", true, true),
  status("lmstudio", "LM Studio", false, false),
  status("litellm", "LiteLLM", false, false),
];

describe("summarizeRuntimeReadiness", () => {
  it("reports one healthy configured local runtime as ready without penalizing unconfigured defaults", () => {
    expect(
      summarizeRuntimeReadiness(statuses, ["ollama", "lmstudio", "litellm"]),
    ).toMatchObject({
      state: "ready",
      label: "Ollama ready",
      readyRuntimeLabels: ["Ollama"],
      attentionRuntimeLabels: [],
    });
  });

  it("reports setup needed when no eligible runtime is configured", () => {
    expect(
      summarizeRuntimeReadiness(statuses, ["lmstudio", "litellm"]),
    ).toMatchObject({
      state: "setup-needed",
      label: "Setup needed",
    });
  });

  it("reports a named degraded fallback when only part of the configured pool is ready", () => {
    const mixed = [
      status("ollama", "Ollama", true, true),
      status("lmstudio", "LM Studio", true, false),
    ];
    expect(
      summarizeRuntimeReadiness(mixed, ["ollama", "lmstudio"]),
    ).toMatchObject({
      state: "degraded",
      label: "Ollama ready · fallback limited",
      readyRuntimeLabels: ["Ollama"],
      attentionRuntimeLabels: ["LM Studio"],
    });
  });

  it("reports the runtime by name when a previously configured runtime is unavailable", () => {
    const unavailable = [status("ollama", "Ollama", true, false)];
    expect(
      summarizeRuntimeReadiness(unavailable, ["ollama"]),
    ).toMatchObject({
      state: "degraded",
      label: "Ollama unavailable",
      attentionRuntimeLabels: ["Ollama"],
    });
  });
});
