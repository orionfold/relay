// src/lib/plugins/__tests__/schedule-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schedules as schedulesTable } from "@/lib/db/schema";
import { reloadPlugins } from "../registry";
import { getSchedule, clearAllPluginSchedules } from "@/lib/schedules/registry";
import { listInstalledPluginScheduleIds, removePluginSchedules } from "@/lib/schedules/installer";
import { clearAllPluginProfiles } from "@/lib/agents/profiles/registry";

let tmpDir: string;

/**
 * Write a minimal plugin bundle to tmpDir/plugins/<pluginId>.
 *
 * opts.profiles  — array of { id, name } entries; each becomes a profile subdir
 * opts.schedules — array of schedule YAML objects to write as schedules/<id>.yaml
 */
function writeBundle(
  pluginId: string,
  opts: {
    profiles?: Array<{ id: string; name: string }>;
    schedules?: Array<Record<string, unknown>>;
  }
) {
  const root = path.join(tmpDir, "plugins", pluginId);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "plugin.yaml"),
    yaml.dump({ id: pluginId, version: "0.1.0", apiVersion: "0.14", kind: "primitives-bundle" })
  );
  for (const p of opts.profiles ?? []) {
    const dir = path.join(root, "profiles", p.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "profile.yaml"), yaml.dump({
      id: p.id, name: p.name, domain: "personal", tags: [], allowedTools: [],
      mcpServers: {}, version: "0.1.0",
    }));
    fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${p.name}`);
  }
  if (opts.schedules && opts.schedules.length > 0) {
    fs.mkdirSync(path.join(root, "schedules"), { recursive: true });
    for (const s of opts.schedules) {
      fs.writeFileSync(
        path.join(root, "schedules", `${s.id as string}.yaml`),
        yaml.dump(s)
      );
    }
  }
}

/** Minimal valid scheduled-type spec fixture. */
function makeScheduleFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "weekly-report",
    name: "Weekly Report",
    version: "0.1.0",
    type: "scheduled",
    prompt: "Generate a weekly report",
    interval: "7d",
    ...overrides,
  };
}

describe("plugin loader → schedule integration", () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-schedules-"));
    process.env.RELAY_DATA_DIR = tmpDir;
    clearAllPluginProfiles();
    clearAllPluginSchedules();
    removePluginSchedules("test-pack");
    removePluginSchedules("alpha");
    removePluginSchedules("beta");
    await reloadPlugins();
  });
  afterEach(async () => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearAllPluginProfiles();
    clearAllPluginSchedules();
    removePluginSchedules("test-pack");
    removePluginSchedules("alpha");
    removePluginSchedules("beta");
    await reloadPlugins();
  });

  // ── (a) Positive case: sibling profile ref resolves ────────────────────────
  it("(a) loads schedule with sibling profile ref — both cache + DB populated", async () => {
    writeBundle("test-pack", {
      profiles: [{ id: "analyst", name: "Analyst" }],
      schedules: [
        makeScheduleFixture({
          id: "weekly-report",
          agentProfile: "test-pack/analyst",
        }),
      ],
    });

    const [plugin] = await reloadPlugins();

    // LoadedPlugin record contains the composite id
    expect(plugin.status).toBe("loaded");
    expect(plugin.schedules).toEqual(["plugin:test-pack:weekly-report"]);

    // In-memory registry cache has the schedule under the namespaced id
    const cached = getSchedule("test-pack/weekly-report");
    expect(cached).toBeTruthy();
    expect(cached?.name).toBe("Weekly Report");

    // DB row exists with composite id
    const dbIds = listInstalledPluginScheduleIds("test-pack");
    expect(dbIds).toEqual(["plugin:test-pack:weekly-report"]);
  });

  // ── (b) Cross-plugin ref rejection ────────────────────────────────────────
  it("(b) skips schedule with cross-plugin profile ref; sibling schedule still loads", async () => {
    writeBundle("alpha", {
      profiles: [{ id: "helper", name: "Helper" }],
      schedules: [
        // This one references a profile from a different plugin → should be skipped
        makeScheduleFixture({
          id: "bad-schedule",
          agentProfile: "beta/some-profile",
        }),
        // This one has no profile constraint → should still load
        makeScheduleFixture({
          id: "good-schedule",
          agentProfile: undefined,
        }),
      ],
    });

    const [plugin] = await reloadPlugins();

    // Bundle itself is still loaded
    expect(plugin.status).toBe("loaded");

    // Only the valid schedule makes it through
    expect(plugin.schedules).toEqual(["plugin:alpha:good-schedule"]);
    expect(plugin.schedules).not.toContain("plugin:alpha:bad-schedule");

    // DB mirrors LoadedPlugin record
    const dbIds = listInstalledPluginScheduleIds("alpha");
    expect(dbIds).toContain("plugin:alpha:good-schedule");
    expect(dbIds).not.toContain("plugin:alpha:bad-schedule");
  });

  // ── (c) Removal case: delete bundle dir, reload, DB row gone ──────────────
  it("(c) removes DB rows and cache entries when bundle directory is deleted", async () => {
    writeBundle("test-pack", {
      schedules: [makeScheduleFixture()],
    });

    await reloadPlugins();
    // Sanity: row exists before deletion
    expect(listInstalledPluginScheduleIds("test-pack")).toEqual(["plugin:test-pack:weekly-report"]);

    // Delete the bundle directory and reload
    fs.rmSync(path.join(tmpDir, "plugins", "test-pack"), { recursive: true, force: true });
    await reloadPlugins();

    // DB row gone
    expect(listInstalledPluginScheduleIds("test-pack")).toEqual([]);

    // In-memory cache entry gone
    expect(getSchedule("test-pack/weekly-report")).toBeUndefined();
  });

  // ── (d) State preservation: runtime state survives reload ─────────────────
  it("(d) preserves runtime state (status, firingCount) across reloadPlugins", async () => {
    writeBundle("test-pack", {
      schedules: [makeScheduleFixture({ id: "monthly-close" })],
    });

    // First load — creates the DB row
    await reloadPlugins();

    // Simulate user pausing the schedule + some fire history
    db.update(schedulesTable)
      .set({ status: "paused", firingCount: 17 })
      .where(eq(schedulesTable.id, "plugin:test-pack:monthly-close"))
      .run();

    // Reload — must preserve runtime state, not reset it
    await reloadPlugins();

    const row = db
      .select()
      .from(schedulesTable)
      .where(eq(schedulesTable.id, "plugin:test-pack:monthly-close"))
      .get();
    expect(row?.status).toBe("paused");
    expect(row?.firingCount).toBe(17);
  });

  // ── (e) Orphan cleanup: removed spec drops its DB row ─────────────────────
  it("(e) deletes schedule rows for specs removed from the bundle (orphan cleanup)", async () => {
    // Install bundle with two schedules
    writeBundle("test-pack", {
      schedules: [
        makeScheduleFixture({ id: "keep-me" }),
        makeScheduleFixture({ id: "drop-me" }),
      ],
    });

    await reloadPlugins();

    // Both rows present
    const idsBefore = listInstalledPluginScheduleIds("test-pack").sort();
    expect(idsBefore).toEqual([
      "plugin:test-pack:drop-me",
      "plugin:test-pack:keep-me",
    ]);

    // Remove drop-me.yaml from disk to simulate spec deletion from bundle
    fs.rmSync(path.join(tmpDir, "plugins", "test-pack", "schedules", "drop-me.yaml"));

    await reloadPlugins();

    const idsAfter = listInstalledPluginScheduleIds("test-pack");
    expect(idsAfter).toEqual(["plugin:test-pack:keep-me"]);
    expect(idsAfter).not.toContain("plugin:test-pack:drop-me");
  });
});
