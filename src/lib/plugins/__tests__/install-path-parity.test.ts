// src/lib/plugins/__tests__/install-path-parity.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { reloadPlugins } from "../registry";

function setupDataDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, "plugins", "demo"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "plugins", "demo", "plugin.yaml"),
    yaml.dump({ id: "demo", version: "0.1.0", apiVersion: "0.14", kind: "primitives-bundle" })
  );
  // T13: extend fixture with a schedules/ dir to exercise M2 schedule loading.
  fs.mkdirSync(path.join(dir, "plugins", "demo", "schedules"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "plugins", "demo", "schedules", "weekly-report.yaml"),
    yaml.dump({
      id: "weekly-report",
      name: "Weekly Report",
      version: "1.0.0",
      type: "scheduled",
      cronExpression: "0 9 * * 1",
      prompt: "Generate the weekly report",
      recurs: true,
    })
  );
  return dir;
}

describe("install-path parity", () => {
  let npxLikeDir: string;
  let cloneLikeDir: string;

  beforeEach(() => {
    npxLikeDir = setupDataDir("npx-data-");      // simulates ~/.ainative-folder/
    cloneLikeDir = setupDataDir("clone-data-");  // simulates ~/.ainative/
  });

  afterEach(() => {
    fs.rmSync(npxLikeDir, { recursive: true, force: true });
    fs.rmSync(cloneLikeDir, { recursive: true, force: true });
    delete process.env.RELAY_DATA_DIR;
  });

  it("loader output is identical (modulo paths) across both data dirs", async () => {
    process.env.RELAY_DATA_DIR = npxLikeDir;
    const npxResult = (await reloadPlugins()).map((p) => ({
      ...p, rootDir: "<dir>",
    }));

    process.env.RELAY_DATA_DIR = cloneLikeDir;
    const cloneResult = (await reloadPlugins()).map((p) => ({
      ...p, rootDir: "<dir>",
    }));

    expect(npxResult).toEqual(cloneResult);
    // Explicit guard: ensures schedules aren't vacuously equal via empty arrays.
    expect(npxResult[0].schedules).toContain("plugin:demo:weekly-report");
  });
});
