import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// The onboarding model preference (chat.modelPreference) must reach task and
// workflow execution, not just chat — a "balanced" user was silently billed
// Opus because the claude-code task path never passed a model to the SDK
// (fix-workflow-model-preference-propagation). Resolution order:
// profile pin > preference tier > catalog quality default.

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-model-preference-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function loadModules() {
  const helpers = await import("@/lib/settings/helpers");
  const resolver = await import("../model-preference");
  return { ...helpers, ...resolver };
}

describe("resolvePreferredModel (claude-code)", () => {
  it("keeps the quality-tier default when no preference is recorded", async () => {
    const { resolvePreferredModel } = await loadModules();
    const resolved = await resolvePreferredModel("claude-code");
    expect(resolved).toEqual({ modelId: "opus", source: "default" });
  });

  it("maps the balanced preference to the Sonnet tier", async () => {
    const { setModelPreference, resolvePreferredModel } = await loadModules();
    await setModelPreference("balanced");
    const resolved = await resolvePreferredModel("claude-code");
    expect(resolved).toEqual({
      modelId: "sonnet",
      source: "preference",
    });
  });

  it("maps the cost preference to the fast tier", async () => {
    const { setModelPreference, resolvePreferredModel } = await loadModules();
    await setModelPreference("cost");
    const resolved = await resolvePreferredModel("claude-code");
    expect(resolved).toEqual({
      modelId: "haiku",
      source: "preference",
    });
  });

  it("treats privacy as runtime-level routing, not a model tier — falls to the default", async () => {
    const { setModelPreference, resolvePreferredModel } = await loadModules();
    await setModelPreference("privacy");
    const resolved = await resolvePreferredModel("claude-code");
    expect(resolved).toEqual({ modelId: "opus", source: "default" });
  });

  it("lets an explicit profile pin win over the preference", async () => {
    const { setModelPreference, resolvePreferredModel } = await loadModules();
    await setModelPreference("balanced");
    const resolved = await resolvePreferredModel("claude-code", {
      pinnedModelId: "opus-pinned-explicitly",
    });
    expect(resolved).toEqual({ modelId: "opus-pinned-explicitly", source: "pin" });
  });

  it("ignores a cleared preference (empty-string sentinel row)", async () => {
    const { setModelPreference, resolvePreferredModel } = await loadModules();
    await setModelPreference("balanced");
    await setModelPreference(null);
    const resolved = await resolvePreferredModel("claude-code");
    expect(resolved).toEqual({ modelId: "opus", source: "default" });
  });
});
