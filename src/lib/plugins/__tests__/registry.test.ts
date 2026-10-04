// src/lib/plugins/__tests__/registry.test.ts
import { CURRENT_PLUGIN_API_VERSION } from "@/lib/plugins/sdk/types";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import {
  loadPlugins,
  reloadPlugins,
  listPlugins,
  getPlugin,
} from "../registry";

// Pass-through mock: lets a test make one bundle's load throw.
const installerMocks = vi.hoisted(() => ({ failFor: null as string | null }));
vi.mock("@/lib/schedules/installer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schedules/installer")>();
  return {
    ...actual,
    removeOrphanSchedules: (pluginId: string, keepIds: string[]) => {
      if (pluginId === installerMocks.failFor) {
        throw new Error("FOREIGN KEY constraint failed");
      }
      return actual.removeOrphanSchedules(pluginId, keepIds);
    },
  };
});

let tmpDir: string;

function writePluginManifest(pluginId: string, manifest: Record<string, unknown>) {
  const dir = path.join(tmpDir, "plugins", pluginId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.yaml"), yaml.dump(manifest));
}

describe("plugin registry", () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-plugins-test-"));
    process.env.RELAY_DATA_DIR = tmpDir;
    await reloadPlugins();
  });

  afterEach(async () => {
    installerMocks.failFor = null;
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await reloadPlugins();
  });

  // Tests that write no plugins before scanning use loadPlugins() to verify
  // the cache-hit fast path. Tests that write plugins first use reloadPlugins()
  // to trigger a rescan (since beforeEach already populated the cache).

  it("returns empty list when plugins/ does not exist", async () => {
    expect(await loadPlugins()).toEqual([]);
  });

  it("returns empty list when plugins/ exists but is empty", async () => {
    fs.mkdirSync(path.join(tmpDir, "plugins"), { recursive: true });
    expect(await loadPlugins()).toEqual([]);
  });

  it("loads a valid bundle and reports status: loaded", async () => {
    writePluginManifest("finance-pack", {
      id: "finance-pack",
      version: "0.1.0",
      apiVersion: CURRENT_PLUGIN_API_VERSION,
      kind: "primitives-bundle",
    });
    // Must use reloadPlugins() since beforeEach already populated the cache.
    const plugins = await reloadPlugins();
    expect(plugins.length).toBe(1);
    expect(plugins[0].id).toBe("finance-pack");
    expect(plugins[0].status).toBe("loaded");
    expect(plugins[0].error).toBeUndefined();
  });

  it("disables a plugin with malformed manifest, continues boot", async () => {
    writePluginManifest("good", {
      id: "good", version: "0.1.0", apiVersion: CURRENT_PLUGIN_API_VERSION, kind: "primitives-bundle",
    });
    writePluginManifest("bad", {
      id: "bad", version: "not-semver", apiVersion: CURRENT_PLUGIN_API_VERSION, kind: "primitives-bundle",
    });
    const plugins = await reloadPlugins();
    expect(plugins.length).toBe(2);
    const bad = plugins.find((p) => p.id === "bad");
    const good = plugins.find((p) => p.id === "good");
    expect(bad?.status).toBe("disabled");
    expect(bad?.error).toMatch(/version|semver/);
    expect(good?.status).toBe("loaded");
  });

  it("disables a bundle whose load throws and still loads the bundles after it", async () => {
    writePluginManifest("a-broken", {
      id: "a-broken", version: "0.1.0", apiVersion: CURRENT_PLUGIN_API_VERSION, kind: "primitives-bundle",
    });
    writePluginManifest("b-good", {
      id: "b-good", version: "0.1.0", apiVersion: CURRENT_PLUGIN_API_VERSION, kind: "primitives-bundle",
    });
    installerMocks.failFor = "a-broken";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const plugins = await reloadPlugins();
      expect(plugins.map((p) => p.id)).toEqual(["a-broken", "b-good"]);
      const broken = plugins.find((p) => p.id === "a-broken");
      expect(broken?.status).toBe("disabled");
      expect(broken?.error).toMatch(/load_failed: FOREIGN KEY constraint failed/);
      expect(plugins.find((p) => p.id === "b-good")?.status).toBe("loaded");
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("disables a plugin with apiVersion outside compatibility window", async () => {
    writePluginManifest("future", {
      id: "future", version: "0.1.0", apiVersion: "9.99", kind: "primitives-bundle",
    });
    const plugin = (await reloadPlugins())[0];
    expect(plugin.status).toBe("disabled");
    expect(plugin.error).toMatch(/apiVersion_mismatch/);
  });

  it("handles two plugins with the same id by keeping the first and disabling the second", async () => {
    fs.mkdirSync(path.join(tmpDir, "plugins", "first-dir"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "plugins", "first-dir", "plugin.yaml"),
      yaml.dump({ id: "dup", version: "0.1.0", apiVersion: CURRENT_PLUGIN_API_VERSION, kind: "primitives-bundle" }),
    );
    fs.mkdirSync(path.join(tmpDir, "plugins", "second-dir"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "plugins", "second-dir", "plugin.yaml"),
      yaml.dump({ id: "dup", version: "0.2.0", apiVersion: CURRENT_PLUGIN_API_VERSION, kind: "primitives-bundle" }),
    );
    const plugins = (await reloadPlugins()).sort((a, b) => a.rootDir.localeCompare(b.rootDir));
    expect(plugins.length).toBe(2);
    const loaded = plugins.find((p) => p.status === "loaded");
    const disabled = plugins.find((p) => p.status === "disabled");
    expect(loaded?.id).toBe("dup");
    expect(disabled?.error).toMatch(/duplicate_plugin_id/);
  });

  it("getPlugin returns null for unknown id, plugin for known", async () => {
    writePluginManifest("known", {
      id: "known", version: "0.1.0", apiVersion: CURRENT_PLUGIN_API_VERSION, kind: "primitives-bundle",
    });
    // reloadPlugins to pick up the new file and populate cache for getPlugin.
    await reloadPlugins();
    expect(getPlugin("unknown")).toBeNull();
    expect(getPlugin("known")?.id).toBe("known");
  });

  it("listPlugins returns an array (sync, reads cache)", async () => {
    // After reloadPlugins in beforeEach, the cache is populated.
    expect(Array.isArray(listPlugins())).toBe(true);
  });
});
