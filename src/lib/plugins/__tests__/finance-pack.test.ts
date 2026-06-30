// src/lib/plugins/__tests__/finance-pack.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { reloadPlugins } from "../registry";
import { getAinativePluginExamplesDir } from "@/lib/utils/ainative-paths";

let tmpDir: string;

describe("finance-pack bundle", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-pack-"));
    fs.mkdirSync(path.join(tmpDir, "plugins"), { recursive: true });
    // Copy the example bundle into place
    const src = path.join(getAinativePluginExamplesDir(), "finance-pack");
    fs.cpSync(src, path.join(tmpDir, "plugins", "finance-pack"), { recursive: true });
    process.env.RELAY_DATA_DIR = tmpDir;
  });
  afterEach(() => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads as a Kind 5 plugin with one profile, one blueprint, one table", async () => {
    const [plugin] = await reloadPlugins();
    expect(plugin.status).toBe("loaded");
    expect(plugin.profiles).toContain("finance-pack/personal-cfo");
    expect(plugin.blueprints).toContain("finance-pack/monthly-close");
    expect(plugin.tables).toContain("plugin:finance-pack:transactions");
  });
});
