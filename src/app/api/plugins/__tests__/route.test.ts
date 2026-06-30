// src/app/api/plugins/__tests__/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { GET } from "../route";

let tmpDir: string;

describe("GET /api/plugins", () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "api-plugins-"));
    fs.mkdirSync(path.join(tmpDir, "plugins", "demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "plugins", "demo", "plugin.yaml"),
      yaml.dump({ id: "demo", version: "0.1.0", apiVersion: "0.14", kind: "primitives-bundle" })
    );
    process.env.RELAY_DATA_DIR = tmpDir;
    // Reset registry cache so the env-var change takes effect for the first scan.
    const { reloadPlugins } = await import("@/lib/plugins/registry");
    await reloadPlugins();
  });
  afterEach(async () => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const { reloadPlugins } = await import("@/lib/plugins/registry");
    await reloadPlugins();
  });

  it("returns the plugins list as JSON", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.plugins).toBeInstanceOf(Array);
    expect(body.plugins.find((p: { id: string }) => p.id === "demo")).toBeTruthy();
  });

  it("includes schedules field in plugin entry", async () => {
    // Add a schedules/ subdir with one valid schedule (no agentProfile → cross-ref passes trivially).
    fs.mkdirSync(path.join(tmpDir, "plugins", "demo", "schedules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "plugins", "demo", "schedules", "weekly-report.yaml"),
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

    const res = await GET();
    const body = await res.json();
    const demo = body.plugins.find((p: { id: string; schedules?: string[] }) => p.id === "demo");
    expect(demo).toBeTruthy();
    expect(demo.schedules).toContain("plugin:demo:weekly-report");
  });
});
