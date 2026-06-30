import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

// Override the apps dir before importing the registry — same pattern used
// elsewhere in the project: each test gets a fresh tmp dir, the helper
// scopes the registry to it via the `appsDir` argument exposed on the
// registry functions. The chat tools call `getApp` / `writeAppManifest`
// without passing the dir, so we route them through the env override.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-app-view-tools-test-"));
process.env.RELAY_DATA_DIR = tmp;

import { appViewTools } from "../app-view-tools";
import { invalidateAppsCache } from "@/lib/apps/registry";

function seedHabitTracker(): void {
  const appDir = path.join(tmp, "apps", "habit-tracker");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(
    path.join(appDir, "manifest.yaml"),
    yaml.dump({
      id: "habit-tracker",
      name: "Habit Tracker",
      version: "0.1.0",
      profiles: [],
      blueprints: [],
      tables: [
        { id: "habits", columns: ["name", "streak"] },
        { id: "checkins", columns: ["habit_id", "date"] },
      ],
      schedules: [],
    }),
    "utf-8"
  );
}

function readManifest() {
  const text = fs.readFileSync(
    path.join(tmp, "apps", "habit-tracker", "manifest.yaml"),
    "utf-8"
  );
  return yaml.load(text) as Record<string, unknown>;
}

function callTool(toolName: string, args: Record<string, unknown>) {
  const tools = appViewTools({});
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) throw new Error(`Tool not found: ${toolName}`);
  return tool.handler(args);
}

function parseToolResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return {
    data: JSON.parse(result.content[0].text),
    isError: Boolean(result.isError),
  };
}

beforeEach(() => {
  // Wipe + reseed each test so they are independent.
  fs.rmSync(path.join(tmp, "apps"), { recursive: true, force: true });
  invalidateAppsCache();
  seedHabitTracker();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("appViewTools — set_app_view_kit", () => {
  it("happy path: sets kit and returns the new effective kit", async () => {
    const res = parseToolResult(
      await callTool("set_app_view_kit", {
        appId: "habit-tracker",
        kit: "workflow-hub",
      })
    );
    expect(res.isError).toBe(false);
    expect(res.data.kit).toBe("workflow-hub");

    const m = readManifest();
    expect((m.view as Record<string, unknown>).kit).toBe("workflow-hub");
  });

  it("returns ToolError when app does not exist", async () => {
    const res = parseToolResult(
      await callTool("set_app_view_kit", {
        appId: "ghost-app",
        kit: "tracker",
      })
    );
    expect(res.isError).toBe(true);
    expect(res.data.error).toMatch(/App not found/);
  });

  it("preserves existing bindings when only changing kit", async () => {
    // Seed with bindings already present.
    fs.writeFileSync(
      path.join(tmp, "apps", "habit-tracker", "manifest.yaml"),
      yaml.dump({
        id: "habit-tracker",
        name: "Habit Tracker",
        profiles: [],
        blueprints: [],
        tables: [{ id: "habits" }],
        schedules: [],
        view: {
          kit: "tracker",
          bindings: { hero: { table: "habits" } },
          hideManifestPane: false,
        },
      }),
      "utf-8"
    );
    invalidateAppsCache();

    await callTool("set_app_view_kit", {
      appId: "habit-tracker",
      kit: "workflow-hub",
    });

    const m = readManifest();
    const view = m.view as Record<string, unknown>;
    expect(view.kit).toBe("workflow-hub");
    expect(view.bindings).toEqual({ hero: { table: "habits" } });
  });
});

describe("appViewTools — set_app_view_bindings", () => {
  it("happy path: sets bindings and preserves existing kit", async () => {
    // Seed with kit already present.
    fs.writeFileSync(
      path.join(tmp, "apps", "habit-tracker", "manifest.yaml"),
      yaml.dump({
        id: "habit-tracker",
        name: "Habit Tracker",
        profiles: [],
        blueprints: [],
        tables: [{ id: "habits" }, { id: "checkins" }],
        schedules: [],
        view: { kit: "tracker", bindings: {}, hideManifestPane: false },
      }),
      "utf-8"
    );
    invalidateAppsCache();

    const res = parseToolResult(
      await callTool("set_app_view_bindings", {
        appId: "habit-tracker",
        bindings: {
          hero: { table: "habits" },
          secondary: [{ table: "checkins" }],
        },
      })
    );
    expect(res.isError).toBe(false);

    const m = readManifest();
    const view = m.view as Record<string, unknown>;
    expect(view.kit).toBe("tracker");
    expect(view.bindings).toEqual({
      hero: { table: "habits" },
      secondary: [{ table: "checkins" }],
    });
  });
});

describe("appViewTools — set_app_view_kpis", () => {
  it("happy path: sets kpis and merges with existing bindings", async () => {
    fs.writeFileSync(
      path.join(tmp, "apps", "habit-tracker", "manifest.yaml"),
      yaml.dump({
        id: "habit-tracker",
        name: "Habit Tracker",
        profiles: [],
        blueprints: [],
        tables: [{ id: "habits" }],
        schedules: [],
        view: {
          kit: "tracker",
          bindings: { hero: { table: "habits" } },
          hideManifestPane: false,
        },
      }),
      "utf-8"
    );
    invalidateAppsCache();

    const res = parseToolResult(
      await callTool("set_app_view_kpis", {
        appId: "habit-tracker",
        kpis: [
          {
            id: "active",
            label: "Active habits",
            source: { kind: "tableCount", table: "habits" },
            format: "int",
          },
        ],
      })
    );
    expect(res.isError).toBe(false);
    expect(res.data.kpis).toHaveLength(1);

    const m = readManifest();
    const view = m.view as Record<string, unknown>;
    const bindings = view.bindings as Record<string, unknown>;
    // Hero is preserved; kpis is added.
    expect(bindings.hero).toEqual({ table: "habits" });
    expect((bindings.kpis as unknown[]).length).toBe(1);
  });

  it("rejects > 6 kpis at the input boundary", async () => {
    const tooMany = Array.from({ length: 7 }, (_, i) => ({
      id: `k${i}`,
      label: `K${i}`,
      source: { kind: "tableCount", table: "habits" },
      format: "int",
    }));
    // Calling the handler directly bypasses the SDK validation layer that
    // would normally enforce the input schema. Simulate that layer by
    // running the zod schema explicitly.
    const tools = appViewTools({});
    const tool = tools.find((t) => t.name === "set_app_view_kpis");
    expect(tool).toBeDefined();
    // Re-validate the payload against the tool's stored shape.
    const { z } = await import("zod");
    const schema = z.object(tool!.zodShape);
    const parsed = schema.safeParse({ appId: "habit-tracker", kpis: tooMany });
    expect(parsed.success).toBe(false);
  });
});
