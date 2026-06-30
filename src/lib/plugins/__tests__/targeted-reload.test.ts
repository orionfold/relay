// src/lib/plugins/__tests__/targeted-reload.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { reloadPlugins, reloadPlugin, getPlugin } from "../registry";

let tmpDir: string;
function writePlugin(id: string, version = "0.1.0") {
  const dir = path.join(tmpDir, "plugins", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.yaml"), yaml.dump({
    id, version, apiVersion: "0.14", kind: "primitives-bundle",
  }));
}

describe("targeted reloadPlugin(id)", () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "targeted-reload-"));
    process.env.RELAY_DATA_DIR = tmpDir;
    await reloadPlugins();
  });
  afterEach(async () => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await reloadPlugins();
  });

  it("re-scans only the named plugin, leaving other plugins' cache entries untouched", async () => {
    writePlugin("a", "0.1.0");
    writePlugin("b", "0.1.0");
    await reloadPlugins();
    const bBefore = getPlugin("b");

    // Modify only a
    writePlugin("a", "0.2.0");
    const reloaded = await reloadPlugin("a");

    expect(reloaded?.manifest.version).toBe("0.2.0");
    // Object identity preserved for b — proves we did NOT clear/re-scan it
    expect(getPlugin("b")).toBe(bBefore);
  });

  it("returns null when the plugin directory was removed from disk", async () => {
    writePlugin("ghost", "0.1.0");
    await reloadPlugins();
    fs.rmSync(path.join(tmpDir, "plugins", "ghost"), { recursive: true, force: true });
    expect(await reloadPlugin("ghost")).toBeNull();
    expect(getPlugin("ghost")).toBeNull();
  });

  it("returns null and is a no-op if the id was never loaded", async () => {
    expect(await reloadPlugin("never-existed")).toBeNull();
  });
});
