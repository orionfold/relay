// src/lib/plugins/__tests__/profile-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { reloadPlugins } from "../registry";
import { getProfile, clearAllPluginProfiles } from "@/lib/agents/profiles/registry";

let tmpDir: string;

function writeBundle(pluginId: string, profiles: Array<{ id: string; name: string; skill: string }>) {
  const root = path.join(tmpDir, "plugins", pluginId);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "plugin.yaml"),
    yaml.dump({ id: pluginId, version: "0.1.0", apiVersion: "0.14", kind: "primitives-bundle" })
  );
  for (const p of profiles) {
    const dir = path.join(root, "profiles", p.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "profile.yaml"), yaml.dump({
      id: p.id, name: p.name, domain: "personal", tags: [], allowedTools: [],
      mcpServers: {}, version: "0.1.0",
    }));
    fs.writeFileSync(path.join(dir, "SKILL.md"), p.skill);
  }
}

describe("plugin loader → profile integration", () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-profiles-"));
    process.env.RELAY_DATA_DIR = tmpDir;
    clearAllPluginProfiles();
    await reloadPlugins();
  });
  afterEach(async () => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearAllPluginProfiles();
    await reloadPlugins();
  });

  it("registers plugin profiles under <plugin-id>/<profile-id>", async () => {
    writeBundle("finance-pack", [{ id: "personal-cfo", name: "Personal CFO", skill: "# CFO" }]);
    const result = await reloadPlugins();
    expect(result[0].profiles).toEqual(["finance-pack/personal-cfo"]);
    expect(getProfile("finance-pack/personal-cfo")?.name).toBe("Personal CFO");
  });

  it("skips profiles with broken YAML, loads the rest", async () => {
    writeBundle("mixed-pack", [{ id: "good", name: "Good", skill: "" }]);
    const badDir = path.join(tmpDir, "plugins", "mixed-pack", "profiles", "bad");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "profile.yaml"), "::: not yaml :::");
    const result = await reloadPlugins();
    expect(result[0].status).toBe("loaded");
    expect(result[0].profiles).toEqual(["mixed-pack/good"]);
  });

  it("clears prior plugin profiles on reload", async () => {
    writeBundle("v1", [{ id: "p", name: "v1", skill: "" }]);
    await reloadPlugins();
    expect(getProfile("v1/p")?.name).toBe("v1");

    fs.rmSync(path.join(tmpDir, "plugins", "v1"), { recursive: true, force: true });
    await reloadPlugins();
    expect(getProfile("v1/p")).toBeUndefined();
  });
});
