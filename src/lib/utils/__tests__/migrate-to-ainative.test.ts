import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  migrateLegacyData,
  shouldMigrateLegacyHomeData,
} from "../migrate-to-ainative";

function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), "ainative-migrate-test-"));
}

describe("migrateLegacyData", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempHome();
    vi.stubEnv("HOME", tempHome);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tempHome, { recursive: true, force: true });
  });

  describe("custom data-dir isolation", () => {
    it("runs home migration with no override or the exact default", () => {
      expect(shouldMigrateLegacyHomeData({
        home: tempHome,
        dataDirOverride: "",
      })).toBe(true);
      expect(shouldMigrateLegacyHomeData({
        home: tempHome,
        dataDirOverride: join(tempHome, ".relay"),
      })).toBe(true);
    });

    it("refuses to touch the default home data when a custom data dir is active", () => {
      expect(shouldMigrateLegacyHomeData({
        home: tempHome,
        dataDirOverride: join(tempHome, ".relay-customer-a"),
      })).toBe(false);
    });
  });

  it("chains ~/.stagent/ all the way to ~/.relay/ when only the oldest dir exists", async () => {
    const oldDir = join(tempHome, ".stagent");
    const finalDir = join(tempHome, ".relay");
    mkdirSync(oldDir, { recursive: true });
    writeFileSync(join(oldDir, "marker.txt"), "hello");

    const report = await migrateLegacyData({ home: tempHome });

    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(join(tempHome, ".ainative"))).toBe(false);
    expect(existsSync(finalDir)).toBe(true);
    expect(readFileSync(join(finalDir, "marker.txt"), "utf8")).toBe("hello");
    expect(report.dirMigrated).toBe(true);
  });

  it("migrates ~/.ainative/ (one hop behind) to ~/.relay/", async () => {
    const midDir = join(tempHome, ".ainative");
    const finalDir = join(tempHome, ".relay");
    mkdirSync(midDir, { recursive: true });
    writeFileSync(join(midDir, "marker.txt"), "hello");

    const report = await migrateLegacyData({ home: tempHome });

    expect(existsSync(midDir)).toBe(false);
    expect(existsSync(finalDir)).toBe(true);
    expect(readFileSync(join(finalDir, "marker.txt"), "utf8")).toBe("hello");
    expect(report.dirMigrated).toBe(true);
  });

  it("is idempotent — second call is a no-op", async () => {
    const oldDir = join(tempHome, ".stagent");
    mkdirSync(oldDir, { recursive: true });
    writeFileSync(join(oldDir, "marker.txt"), "hello");

    await migrateLegacyData({ home: tempHome });
    const secondReport = await migrateLegacyData({ home: tempHome });

    expect(secondReport.dirMigrated).toBe(false);
  });

  it("renames stagent.db + -shm + -wal all the way to relay.db inside the final dir", async () => {
    const oldDir = join(tempHome, ".stagent");
    mkdirSync(oldDir, { recursive: true });
    writeFileSync(join(oldDir, "stagent.db"), "db");
    writeFileSync(join(oldDir, "stagent.db-shm"), "shm");
    writeFileSync(join(oldDir, "stagent.db-wal"), "wal");

    const report = await migrateLegacyData({ home: tempHome });

    const finalDir = join(tempHome, ".relay");
    expect(existsSync(join(finalDir, "relay.db"))).toBe(true);
    expect(existsSync(join(finalDir, "relay.db-shm"))).toBe(true);
    expect(existsSync(join(finalDir, "relay.db-wal"))).toBe(true);
    // 3 files renamed on the .stagent->.ainative hop, then 3 on .ainative->.relay.
    expect(report.dbFilesRenamed).toBe(6);
  });

  it("rewrites mcp__stagent__ prefix in agent_profiles.allowed_tools", async () => {
    const oldDir = join(tempHome, ".stagent");
    mkdirSync(oldDir, { recursive: true });
    const dbPath = join(oldDir, "stagent.db");
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE agent_profiles (id TEXT PRIMARY KEY, allowed_tools TEXT)`);
    db.prepare("INSERT INTO agent_profiles VALUES (?, ?)").run(
      "test",
      JSON.stringify(["mcp__stagent__create_task", "mcp__stagent__list_projects"]),
    );
    db.close();

    await migrateLegacyData({ home: tempHome });

    const newDb = new Database(join(tempHome, ".relay", "relay.db"));
    const row = newDb.prepare("SELECT allowed_tools FROM agent_profiles WHERE id = ?").get("test") as { allowed_tools: string };
    newDb.close();

    // This shim performs the stagent->ainative prefix hop; the ainative->relay
    // hop runs later against the live DB (migrate-mcp-namespace.ts).
    expect(row.allowed_tools).toContain("mcp__ainative__create_task");
    expect(row.allowed_tools).not.toContain("mcp__stagent__");
  });

  it("rewrites sourceFormat stagent → ainative in import_meta", async () => {
    const oldDir = join(tempHome, ".stagent");
    mkdirSync(oldDir, { recursive: true });
    const dbPath = join(oldDir, "stagent.db");
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE agent_profiles (id TEXT PRIMARY KEY, import_meta TEXT)`);
    db.prepare("INSERT INTO agent_profiles VALUES (?, ?)").run(
      "test",
      JSON.stringify({ sourceFormat: "stagent" }),
    );
    db.close();

    await migrateLegacyData({ home: tempHome });

    const newDb = new Database(join(tempHome, ".relay", "relay.db"));
    const row = newDb.prepare("SELECT import_meta FROM agent_profiles WHERE id = ?").get("test") as { import_meta: string };
    newDb.close();

    expect(row.import_meta).toContain('"sourceFormat":"ainative"');
  });

  it("returns empty report when neither old nor new dir exists", async () => {
    const report = await migrateLegacyData({ home: tempHome });
    expect(report.dirMigrated).toBe(false);
    expect(report.dbFilesRenamed).toBe(0);
  });

  it("leaves the final ~/.relay/ dir untouched when it already exists", async () => {
    const finalDir = join(tempHome, ".relay");
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(join(finalDir, "keep.txt"), "keep");

    const report = await migrateLegacyData({ home: tempHome });

    expect(existsSync(join(finalDir, "keep.txt"))).toBe(true);
    expect(report.dirMigrated).toBe(false);
  });

  it("does not clobber ~/.relay/ when a legacy ~/.ainative/ also exists", async () => {
    // Both dirs present: the live dir wins, the stale legacy dir is left in
    // place (the hop guard requires the target NOT to exist).
    const midDir = join(tempHome, ".ainative");
    const finalDir = join(tempHome, ".relay");
    mkdirSync(midDir, { recursive: true });
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(join(midDir, "stale.txt"), "stale");
    writeFileSync(join(finalDir, "live.txt"), "live");

    const report = await migrateLegacyData({ home: tempHome });

    expect(readFileSync(join(finalDir, "live.txt"), "utf8")).toBe("live");
    expect(existsSync(join(midDir, "stale.txt"))).toBe(true);
    expect(report.dirMigrated).toBe(false);
  });

  describe("Step 6 — Profiles -> Agents on-disk rename", () => {
    it("renames profile.yaml -> agent.yaml in ~/.relay/profiles and ~/.claude/skills", async () => {
      const relayProfiles = join(tempHome, ".relay", "profiles", "my-agent");
      const skills = join(tempHome, ".claude", "skills", "code-reviewer");
      mkdirSync(relayProfiles, { recursive: true });
      mkdirSync(skills, { recursive: true });
      writeFileSync(join(relayProfiles, "profile.yaml"), "id: my-agent");
      writeFileSync(join(skills, "profile.yaml"), "id: code-reviewer");

      const report = await migrateLegacyData({ home: tempHome });

      expect(existsSync(join(relayProfiles, "agent.yaml"))).toBe(true);
      expect(existsSync(join(relayProfiles, "profile.yaml"))).toBe(false);
      expect(existsSync(join(skills, "agent.yaml"))).toBe(true);
      expect(existsSync(join(skills, "profile.yaml"))).toBe(false);
      expect(report.agentFilesRenamed).toBe(2);
    });

    it("is idempotent — a second run renames nothing", async () => {
      const dir = join(tempHome, ".relay", "profiles", "a");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "profile.yaml"), "id: a");

      await migrateLegacyData({ home: tempHome });
      const second = await migrateLegacyData({ home: tempHome });

      expect(existsSync(join(dir, "agent.yaml"))).toBe(true);
      expect(second.agentFilesRenamed).toBe(0);
    });

    it("leaves a dir untouched when agent.yaml already exists (never clobbers)", async () => {
      const dir = join(tempHome, ".relay", "profiles", "b");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "profile.yaml"), "id: legacy");
      writeFileSync(join(dir, "agent.yaml"), "id: current");

      const report = await migrateLegacyData({ home: tempHome });

      expect(readFileSync(join(dir, "agent.yaml"), "utf8")).toBe("id: current");
      // The legacy file is left in place (dual-read prefers agent.yaml anyway).
      expect(existsSync(join(dir, "profile.yaml"))).toBe(true);
      expect(report.agentFilesRenamed).toBe(0);
    });
  });
});
