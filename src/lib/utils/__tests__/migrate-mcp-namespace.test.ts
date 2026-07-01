import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { migrateMcpNamespace } from "../migrate-mcp-namespace";

/**
 * These tests drive an in-memory SQLite DB so the migration can be exercised
 * without touching ~/.relay. The migration operates on the live `sqlite`
 * handle in production (see instrumentation-node.ts); here we inject a fixture.
 */
describe("migrateMcpNamespace", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`CREATE TABLE agent_profiles (id TEXT PRIMARY KEY, allowed_tools TEXT)`);
    db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER)`);
  });

  afterEach(() => {
    db.close();
  });

  it("rewrites mcp__ainative__ → mcp__relay__ in agent_profiles.allowed_tools", () => {
    db.prepare("INSERT INTO agent_profiles VALUES (?, ?)").run(
      "p1",
      JSON.stringify(["mcp__ainative__create_task", "mcp__ainative__list_projects"]),
    );

    const report = migrateMcpNamespace(db);

    const row = db
      .prepare("SELECT allowed_tools FROM agent_profiles WHERE id = ?")
      .get("p1") as { allowed_tools: string };
    expect(row.allowed_tools).toContain("mcp__relay__create_task");
    expect(row.allowed_tools).toContain("mcp__relay__list_projects");
    expect(row.allowed_tools).not.toContain("mcp__ainative__");
    expect(report.profilesUpdated).toBe(1);
  });

  it("rewrites mcp__ainative__ → mcp__relay__ inside the permissions.allow settings JSON", () => {
    db.prepare("INSERT INTO settings VALUES (?, ?, ?)").run(
      "permissions.allow",
      JSON.stringify(["mcp__ainative__upload_document", "Read", "Bash(command:git *)"]),
      0,
    );

    const report = migrateMcpNamespace(db);

    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("permissions.allow") as { value: string };
    const parsed = JSON.parse(row.value);
    expect(parsed).toContain("mcp__relay__upload_document");
    expect(parsed).toContain("Read"); // untouched entries preserved
    expect(parsed).toContain("Bash(command:git *)");
    expect(row.value).not.toContain("mcp__ainative__");
    expect(report.permissionsUpdated).toBe(1);
  });

  it("leaves non-ainative tool names untouched", () => {
    db.prepare("INSERT INTO agent_profiles VALUES (?, ?)").run(
      "p1",
      JSON.stringify(["mcp__relay__create_task", "Read", "mcp__exa__search"]),
    );

    migrateMcpNamespace(db);

    const row = db
      .prepare("SELECT allowed_tools FROM agent_profiles WHERE id = ?")
      .get("p1") as { allowed_tools: string };
    expect(row.allowed_tools).toContain("mcp__relay__create_task");
    expect(row.allowed_tools).toContain("mcp__exa__search");
    expect(row.allowed_tools).toContain("Read");
  });

  it("is idempotent — a second run changes nothing", () => {
    db.prepare("INSERT INTO agent_profiles VALUES (?, ?)").run(
      "p1",
      JSON.stringify(["mcp__ainative__create_task"]),
    );
    db.prepare("INSERT INTO settings VALUES (?, ?, ?)").run(
      "permissions.allow",
      JSON.stringify(["mcp__ainative__upload_document"]),
      0,
    );

    migrateMcpNamespace(db);
    const second = migrateMcpNamespace(db);

    expect(second.profilesUpdated).toBe(0);
    expect(second.permissionsUpdated).toBe(0);
  });

  it("is a no-op when there is nothing to migrate", () => {
    const report = migrateMcpNamespace(db);
    expect(report.profilesUpdated).toBe(0);
    expect(report.permissionsUpdated).toBe(0);
    expect(report.errors).toEqual([]);
  });

  it("never throws when a table is missing — records nothing, no crash", () => {
    const bare = new Database(":memory:");
    // no agent_profiles, no settings
    const report = migrateMcpNamespace(bare);
    bare.close();
    expect(report.profilesUpdated).toBe(0);
    expect(report.permissionsUpdated).toBe(0);
    // Missing tables are an expected shape (fresh/partial schema), not an error.
    expect(report.errors).toEqual([]);
  });
});
