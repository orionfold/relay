import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAinativePluginsDir, getAinativePluginExamplesDir, getAinativeSchedulesDir } from "../ainative-paths";
import path from "node:path";

describe("plugin path helpers", () => {
  let originalDataDir: string | undefined;
  beforeEach(() => {
    originalDataDir = process.env.RELAY_DATA_DIR;
    process.env.RELAY_DATA_DIR = "/tmp/test-ainative";
  });
  afterEach(() => {
    if (originalDataDir === undefined) delete process.env.RELAY_DATA_DIR;
    else process.env.RELAY_DATA_DIR = originalDataDir;
  });

  it("getAinativePluginsDir returns <dataDir>/plugins", () => {
    expect(getAinativePluginsDir()).toBe(path.join("/tmp/test-ainative", "plugins"));
  });

  it("getAinativePluginExamplesDir resolves to an absolute path under the package src tree", () => {
    const dir = getAinativePluginExamplesDir();
    // Tighten beyond regex tail-match so a getAppRoot fallback to process.cwd()
    // (or any cwd that happens to satisfy the suffix pattern) cannot pass.
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir.endsWith(path.join("src", "lib", "plugins", "examples"))).toBe(true);
  });

  it("getAinativeSchedulesDir returns <dataDir>/schedules", () => {
    process.env.RELAY_DATA_DIR = "/tmp/test-ainative-m2";
    expect(getAinativeSchedulesDir()).toBe(path.join("/tmp/test-ainative-m2", "schedules"));
  });
});
