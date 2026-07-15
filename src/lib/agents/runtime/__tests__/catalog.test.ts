import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AGENT_RUNTIME,
  getRuntimeCapabilities,
  getRuntimeCatalogEntry,
  getRuntimeFeatures,
  listRuntimeCatalog,
  resolveAgentRuntime,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";

describe("runtime catalog", () => {
  it("defaults to the Claude runtime", () => {
    expect(resolveAgentRuntime()).toBe(DEFAULT_AGENT_RUNTIME);
  });

  it("returns runtime metadata and capabilities", () => {
    const runtime = getRuntimeCatalogEntry("claude-code");
    const capabilities = getRuntimeCapabilities("claude-code");

    expect(runtime.label).toBe("Claude Code");
    expect(capabilities.resume).toBe(true);
    expect(capabilities.profileTests).toBe(true);
  });

  it("lists the OpenAI Codex runtime", () => {
    const runtimes = listRuntimeCatalog();

    expect(runtimes.some((runtime) => runtime.id === "openai-codex-app-server")).toBe(
      true
    );
    expect(getRuntimeCapabilities("openai-codex-app-server").resume).toBe(true);
  });

  it("falls back to default for unknown runtime ids with a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = resolveAgentRuntime("unknown-runtime");
    expect(result).toBe(DEFAULT_AGENT_RUNTIME);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown agent runtime")
    );
    warnSpy.mockRestore();
  });

  it("falls back to default for typo 'claude' instead of 'claude-code'", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = resolveAgentRuntime("claude");
    expect(result).toBe("claude-code");
    warnSpy.mockRestore();
  });

  it("exposes LLM-surface features via getRuntimeFeatures", () => {
    const features = getRuntimeFeatures("claude-code");
    expect(features.hasNativeSkills).toBe(true);
    expect(features.hasProgressiveDisclosure).toBe(true);
    expect(features.autoLoadsInstructions).toBe("CLAUDE.md");
    expect(features.ainativeInjectsSkills).toBe(false);
  });

  it("marks Ollama as requiring ainative-injected skills", () => {
    const features = getRuntimeFeatures("ollama");
    expect(features.hasNativeSkills).toBe(false);
    expect(features.ainativeInjectsSkills).toBe(true);
    expect(features.autoLoadsInstructions).toBeNull();
  });

  it("declares Codex auto-loads AGENTS.md", () => {
    expect(getRuntimeFeatures("openai-codex-app-server").autoLoadsInstructions).toBe("AGENTS.md");
  });

  it("every runtime declares every feature key (exhaustiveness guard)", () => {
    const runtimes = listRuntimeCatalog();
    const expectedKeys: Array<keyof ReturnType<typeof getRuntimeFeatures>> = [
      "hasNativeSkills",
      "hasProgressiveDisclosure",
      "hasFilesystemTools",
      "hasBash",
      "hasTodoWrite",
      "hasSubagentDelegation",
      "hasHooks",
      "autoLoadsInstructions",
      "ainativeInjectsSkills",
      "supportsSkillComposition",
      "maxActiveSkills",
      "supportsPluginMcpServers",
    ];

    // Guard against the "list grows stale" failure mode: if a new key is added
    // to RuntimeFeatures but not to expectedKeys above, this catches it.
    expect(expectedKeys.length).toBe(Object.keys(getRuntimeFeatures()).length);

    for (const runtime of runtimes) {
      for (const key of expectedKeys) {
        expect(
          runtime.features,
          `${runtime.id} missing feature "${key}"`
        ).toHaveProperty(key);
      }
    }
  });

  it("feature matrix snapshot matches declared values", () => {
    // Guard against silent regressions: the declared feature matrix must match
    // this snapshot exactly. Update intentionally when flipping a capability flag
    // (and reference the spec change in the commit message).
    const snapshot = listRuntimeCatalog().reduce<Record<string, unknown>>((acc, r) => {
      acc[r.id] = r.features;
      return acc;
    }, {});

    expect(snapshot).toMatchInlineSnapshot(`
      {
        "anthropic-direct": {
          "ainativeInjectsSkills": false,
          "autoLoadsInstructions": null,
          "hasBash": false,
          "hasFilesystemTools": false,
          "hasHooks": false,
          "hasNativeSkills": false,
          "hasProgressiveDisclosure": false,
          "hasSubagentDelegation": false,
          "hasTodoWrite": false,
          "maxActiveSkills": 3,
          "supportsPluginMcpServers": true,
          "supportsSkillComposition": true,
        },
        "claude-code": {
          "ainativeInjectsSkills": false,
          "autoLoadsInstructions": "CLAUDE.md",
          "hasBash": true,
          "hasFilesystemTools": true,
          "hasHooks": false,
          "hasNativeSkills": true,
          "hasProgressiveDisclosure": true,
          "hasSubagentDelegation": false,
          "hasTodoWrite": true,
          "maxActiveSkills": 3,
          "supportsPluginMcpServers": true,
          "supportsSkillComposition": true,
        },
        "litellm": {
          "ainativeInjectsSkills": true,
          "autoLoadsInstructions": null,
          "hasBash": false,
          "hasFilesystemTools": false,
          "hasHooks": false,
          "hasNativeSkills": false,
          "hasProgressiveDisclosure": false,
          "hasSubagentDelegation": false,
          "hasTodoWrite": false,
          "maxActiveSkills": 3,
          "supportsPluginMcpServers": false,
          "supportsSkillComposition": true,
        },
        "lmstudio": {
          "ainativeInjectsSkills": true,
          "autoLoadsInstructions": null,
          "hasBash": false,
          "hasFilesystemTools": false,
          "hasHooks": false,
          "hasNativeSkills": false,
          "hasProgressiveDisclosure": false,
          "hasSubagentDelegation": false,
          "hasTodoWrite": false,
          "maxActiveSkills": 3,
          "supportsPluginMcpServers": false,
          "supportsSkillComposition": true,
        },
        "ollama": {
          "ainativeInjectsSkills": true,
          "autoLoadsInstructions": null,
          "hasBash": false,
          "hasFilesystemTools": false,
          "hasHooks": false,
          "hasNativeSkills": false,
          "hasProgressiveDisclosure": false,
          "hasSubagentDelegation": false,
          "hasTodoWrite": false,
          "maxActiveSkills": 1,
          "supportsPluginMcpServers": false,
          "supportsSkillComposition": false,
        },
        "openai-codex-app-server": {
          "ainativeInjectsSkills": false,
          "autoLoadsInstructions": "AGENTS.md",
          "hasBash": true,
          "hasFilesystemTools": true,
          "hasHooks": false,
          "hasNativeSkills": true,
          "hasProgressiveDisclosure": true,
          "hasSubagentDelegation": false,
          "hasTodoWrite": true,
          "maxActiveSkills": 3,
          "supportsPluginMcpServers": true,
          "supportsSkillComposition": true,
        },
        "openai-direct": {
          "ainativeInjectsSkills": false,
          "autoLoadsInstructions": null,
          "hasBash": false,
          "hasFilesystemTools": false,
          "hasHooks": false,
          "hasNativeSkills": false,
          "hasProgressiveDisclosure": false,
          "hasSubagentDelegation": false,
          "hasTodoWrite": false,
          "maxActiveSkills": 3,
          "supportsPluginMcpServers": true,
          "supportsSkillComposition": true,
        },
      }
    `);
  });

  // T5 invariant — supportsPluginMcpServers declared values per TDR-035 §1.
  // Update this test intentionally if a runtime's MCP surface changes, and
  // reference the spec change in the commit message.
  it("T5 invariant: supportsPluginMcpServers values match TDR-035 §1 declarations", () => {
    const expected: Record<AgentRuntimeId, boolean> = {
      "claude-code": true,
      "openai-codex-app-server": true,
      "anthropic-direct": true,
      "openai-direct": true,
      "ollama": false,
      "litellm": false,
      "lmstudio": false,
    };
    for (const [runtimeId, expectedValue] of Object.entries(expected)) {
      expect(
        getRuntimeFeatures(runtimeId as AgentRuntimeId).supportsPluginMcpServers,
        `${runtimeId}.supportsPluginMcpServers should be ${expectedValue}`
      ).toBe(expectedValue);
    }
  });
});
