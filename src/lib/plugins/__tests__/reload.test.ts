// src/lib/plugins/__tests__/reload.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { reloadPlugins, getPlugin, reloadPlugin } from "../registry";

let tmpDir: string;
function writePlugin(id: string, version: string) {
  const dir = path.join(tmpDir, "plugins", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.yaml"), yaml.dump({
    id, version, apiVersion: "0.14", kind: "primitives-bundle",
  }));
}

describe("plugin reload contract", () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-reload-"));
    process.env.RELAY_DATA_DIR = tmpDir;
    await reloadPlugins();
  });
  afterEach(async () => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await reloadPlugins();
  });

  it("add plugin → reload → present", async () => {
    writePlugin("a", "0.1.0");
    await reloadPlugins();
    expect(getPlugin("a")).toBeTruthy();
  });

  it("remove plugin directory → reload → absent", async () => {
    writePlugin("a", "0.1.0");
    await reloadPlugins();
    fs.rmSync(path.join(tmpDir, "plugins", "a"), { recursive: true, force: true });
    await reloadPlugins();
    expect(getPlugin("a")).toBeNull();
  });

  it("modify plugin manifest → reload → version change visible", async () => {
    writePlugin("a", "0.1.0");
    await reloadPlugins();
    expect(getPlugin("a")?.manifest.version).toBe("0.1.0");
    writePlugin("a", "0.2.0");
    await reloadPlugins();
    expect(getPlugin("a")?.manifest.version).toBe("0.2.0");
  });

  it("reloadPlugin(id) returns null for an id removed from disk", async () => {
    writePlugin("a", "0.1.0");
    await reloadPlugins();
    fs.rmSync(path.join(tmpDir, "plugins", "a"), { recursive: true, force: true });
    expect(await reloadPlugin("a")).toBeNull();
  });
});
