import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

// Tests manipulate RELAY_DATA_DIR; since the registry caches USER_DIR at
// module-load (mirroring blueprints/registry.ts), tests use vi.resetModules()
// for each case that depends on a fresh data dir. This is the project
// convention — blueprints' own pattern is captured-once.

describe("schedule registry", () => {
  let tmpDir: string;
  let origDataDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sched-reg-"));
    origDataDir = process.env.RELAY_DATA_DIR;
    process.env.RELAY_DATA_DIR = tmpDir;
    vi.resetModules(); // force registry to re-capture USER_DIR
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origDataDir === undefined) delete process.env.RELAY_DATA_DIR;
    else process.env.RELAY_DATA_DIR = origDataDir;
  });

  function writeUserSchedule(filename: string, data: Record<string, unknown>) {
    fs.mkdirSync(path.join(tmpDir, "schedules"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "schedules", filename), yaml.dump(data));
  }

  const minimal = {
    id: "daily-summary",
    name: "Daily Summary",
    version: "1.0.0",
    prompt: "Summarize today.",
    type: "scheduled",
    interval: "1d",
  };

  it("returns empty list when user dir doesn't exist", async () => {
    const { listSchedules } = await import("../registry");
    expect(listSchedules()).toEqual([]);
  });

  it("loads a valid user YAML into getSchedule(id)", async () => {
    writeUserSchedule("daily-summary.yaml", minimal);
    const { getSchedule, listSchedules } = await import("../registry");
    const spec = getSchedule("daily-summary");
    expect(spec?.type).toBe("scheduled");
    expect(spec?.name).toBe("Daily Summary");
    expect(listSchedules().length).toBe(1);
  });

  it("skips invalid YAML with a warning; valid siblings still load", async () => {
    writeUserSchedule("good.yaml", minimal);
    fs.writeFileSync(
      path.join(tmpDir, "schedules", "bad.yaml"),
      ":\n  not valid"
    );
    // Another invalid — schema failure (uppercase id fails kebab-case regex)
    writeUserSchedule("schema-bad.yaml", { ...minimal, id: "X", type: "scheduled" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { listSchedules } = await import("../registry");
    const list = listSchedules();
    expect(list.map((s: { id: string }) => s.id)).toEqual(["daily-summary"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reloadSchedules picks up a newly-written file", async () => {
    const { listSchedules, reloadSchedules } = await import("../registry");
    expect(listSchedules()).toEqual([]);
    writeUserSchedule("new.yaml", { ...minimal, id: "new", name: "New" });
    reloadSchedules();
    expect(listSchedules().map((s: { id: string }) => s.id)).toEqual(["new"]);
  });

  it("createScheduleFromYaml writes to user dir and reloads", async () => {
    const { createScheduleFromYaml, getSchedule } = await import("../registry");
    const ret = createScheduleFromYaml(yaml.dump(minimal));
    expect(ret.id).toBe("daily-summary");
    expect(getSchedule("daily-summary")?.name).toBe("Daily Summary");
    expect(
      fs.existsSync(path.join(tmpDir, "schedules", "daily-summary.yaml"))
    ).toBe(true);
  });

  it("createScheduleFromYaml throws on duplicate id", async () => {
    writeUserSchedule("daily-summary.yaml", minimal);
    const { createScheduleFromYaml } = await import("../registry");
    expect(() => createScheduleFromYaml(yaml.dump(minimal))).toThrow(
      /already exists/
    );
  });

  it("deleteSchedule removes the file; getSchedule returns undefined", async () => {
    writeUserSchedule("daily-summary.yaml", minimal);
    const { deleteSchedule, getSchedule } = await import("../registry");
    deleteSchedule("daily-summary");
    expect(getSchedule("daily-summary")).toBeUndefined();
    expect(
      fs.existsSync(path.join(tmpDir, "schedules", "daily-summary.yaml"))
    ).toBe(false);
  });

  // ── Plugin-injection surface (T5) ─────────────────────────────────────────

  it("mergePluginSchedules adds entries to the cache", async () => {
    const { mergePluginSchedules, getSchedule, listSchedules } =
      await import("../registry");
    const spec = {
      id: "plugin-sched-a",
      name: "Plugin Sched A",
      version: "1.0.0",
      prompt: "Do something.",
      type: "scheduled" as const,
      interval: "1h",
    };
    mergePluginSchedules([{ pluginId: "my-plugin", schedule: spec }]);
    expect(getSchedule("plugin-sched-a")?.name).toBe("Plugin Sched A");
    expect(listSchedules().map((s: { id: string }) => s.id)).toContain(
      "plugin-sched-a"
    );
  });

  it("clearPluginSchedules removes only entries for that plugin", async () => {
    const { mergePluginSchedules, clearPluginSchedules, getSchedule } =
      await import("../registry");
    const specA = {
      id: "plugin-sched-a",
      name: "Plugin Sched A",
      version: "1.0.0",
      prompt: "Do A.",
      type: "scheduled" as const,
      interval: "1h",
    };
    const specB = {
      id: "plugin-sched-b",
      name: "Plugin Sched B",
      version: "1.0.0",
      prompt: "Do B.",
      type: "scheduled" as const,
      interval: "2h",
    };
    mergePluginSchedules([{ pluginId: "plugin-1", schedule: specA }]);
    mergePluginSchedules([{ pluginId: "plugin-2", schedule: specB }]);
    clearPluginSchedules("plugin-1");
    expect(getSchedule("plugin-sched-a")).toBeUndefined();
    expect(getSchedule("plugin-sched-b")?.name).toBe("Plugin Sched B");
  });

  it("clearAllPluginSchedules removes entries for all plugins", async () => {
    const {
      mergePluginSchedules,
      clearAllPluginSchedules,
      getSchedule,
      listSchedules,
    } = await import("../registry");
    const specA = {
      id: "plugin-sched-a",
      name: "Plugin Sched A",
      version: "1.0.0",
      prompt: "Do A.",
      type: "scheduled" as const,
      interval: "1h",
    };
    const specB = {
      id: "plugin-sched-b",
      name: "Plugin Sched B",
      version: "1.0.0",
      prompt: "Do B.",
      type: "scheduled" as const,
      interval: "2h",
    };
    mergePluginSchedules([{ pluginId: "plugin-1", schedule: specA }]);
    mergePluginSchedules([{ pluginId: "plugin-2", schedule: specB }]);
    clearAllPluginSchedules();
    expect(getSchedule("plugin-sched-a")).toBeUndefined();
    expect(getSchedule("plugin-sched-b")).toBeUndefined();
    expect(listSchedules()).toEqual([]);
  });

  it("listPluginScheduleIds returns ids only for the given plugin", async () => {
    const { mergePluginSchedules, listPluginScheduleIds } =
      await import("../registry");
    const specA = {
      id: "plugin-sched-a",
      name: "Plugin Sched A",
      version: "1.0.0",
      prompt: "Do A.",
      type: "scheduled" as const,
      interval: "1h",
    };
    const specB = {
      id: "plugin-sched-b",
      name: "Plugin Sched B",
      version: "1.0.0",
      prompt: "Do B.",
      type: "scheduled" as const,
      interval: "2h",
    };
    mergePluginSchedules([
      { pluginId: "plugin-1", schedule: specA },
      { pluginId: "plugin-1", schedule: specB },
    ]);
    mergePluginSchedules([
      {
        pluginId: "plugin-2",
        schedule: {
          id: "plugin-sched-c",
          name: "Plugin Sched C",
          version: "1.0.0",
          prompt: "Do C.",
          type: "scheduled" as const,
          interval: "3h",
        },
      },
    ]);
    const ids = listPluginScheduleIds("plugin-1");
    expect(ids.sort()).toEqual(["plugin-sched-a", "plugin-sched-b"]);
    expect(listPluginScheduleIds("plugin-2")).toEqual(["plugin-sched-c"]);
    expect(listPluginScheduleIds("no-such-plugin")).toEqual([]);
  });
});
