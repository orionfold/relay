import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-instance-settings-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function loadModule() {
  return await import("../settings");
}

describe("getInstanceConfig / setInstanceConfig", () => {
  it("returns null before any config is written", async () => {
    const { getInstanceConfig } = await loadModule();
    expect(getInstanceConfig()).toBeNull();
  });

  it("round-trips a config through set/get", async () => {
    const { setInstanceConfig, getInstanceConfig } = await loadModule();
    await setInstanceConfig({
      instanceId: "abc-123",
      branchName: "local",
      isPrivateInstance: false,
      createdAt: 1700000000,
    });
    const config = getInstanceConfig();
    expect(config).toEqual({
      instanceId: "abc-123",
      branchName: "local",
      isPrivateInstance: false,
      createdAt: 1700000000,
    });
  });

  it("returns null when stored value is corrupt JSON", async () => {
    const { setSetting } = await import("@/lib/settings/helpers");
    await setSetting("instance", "not-valid-json");
    const { getInstanceConfig } = await loadModule();
    expect(getInstanceConfig()).toBeNull();
  });
});

describe("getGuardrails / setGuardrails", () => {
  it("returns defaults before any guardrails are written", async () => {
    const { getGuardrails } = await loadModule();
    expect(getGuardrails()).toEqual({
      prePushHookInstalled: false,
      prePushHookVersion: "",
      pushRemoteBlocked: [],
      consentStatus: "not_yet",
      firstBootCompletedAt: null,
    });
  });

  it("round-trips guardrails through set/get", async () => {
    const { setGuardrails, getGuardrails } = await loadModule();
    await setGuardrails({
      prePushHookInstalled: true,
      prePushHookVersion: "1.0.0",
      pushRemoteBlocked: ["local", "wealth-mgr"],
      consentStatus: "enabled",
      firstBootCompletedAt: 1700000000,
    });
    expect(getGuardrails()).toEqual({
      prePushHookInstalled: true,
      prePushHookVersion: "1.0.0",
      pushRemoteBlocked: ["local", "wealth-mgr"],
      consentStatus: "enabled",
      firstBootCompletedAt: 1700000000,
    });
  });
});
