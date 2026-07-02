import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  bootstrapAinativeDatabase,
  hasLegacyTables,
  hasMigrationHistory,
  markAllMigrationsApplied,
} from "../bootstrap";

const migrationsFolder = join(process.cwd(), "src", "lib", "db", "migrations");

describe("database bootstrap recovery", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "relay-db-bootstrap-"));
    dbPath = join(tempDir, "relay.db");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("recovers a bootstrapped database that has no drizzle migration history", () => {
    const bootstrapDb = new Database(dbPath);
    bootstrapAinativeDatabase(bootstrapDb);

    expect(hasLegacyTables(bootstrapDb)).toBe(true);
    expect(hasMigrationHistory(bootstrapDb)).toBe(false);

    markAllMigrationsApplied(bootstrapDb, migrationsFolder);
    expect(hasMigrationHistory(bootstrapDb)).toBe(true);
    bootstrapDb.close();

    const migratedDb = new Database(dbPath);
    const drizzleDb = drizzle(migratedDb);

    expect(() =>
      migrate(drizzleDb, {
        migrationsFolder,
      })
    ).not.toThrow();

    const migrationCount = migratedDb
      .prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations")
      .get() as { count: number };
    expect(migrationCount.count).toBe(12);
    migratedDb.close();
  });

  // #23: on a fresh DB some ALTERs legitimately run before their CREATE
  // ("no such table" — the later CREATE includes the column). That transient
  // must not print scary errors: it's the first console output a new
  // customer sees, and it reads as a broken install.
  it("fresh-DB bootstrap prints no ALTER TABLE failures (#23)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const bootstrapDb = new Database(dbPath);
      bootstrapAinativeDatabase(bootstrapDb);
      bootstrapDb.close();

      const alterFailures = errorSpy.mock.calls.filter((args) =>
        String(args[0]).includes("ALTER TABLE failed")
      );
      expect(alterFailures).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  // chat-conversation-branches v1: schema + bootstrap regression.
  it("bootstraps branching columns on a fresh DB", () => {
    const bootstrapDb = new Database(dbPath);
    bootstrapAinativeDatabase(bootstrapDb);

    const convCols = bootstrapDb
      .prepare(`PRAGMA table_info(conversations)`)
      .all() as Array<{ name: string }>;
    const convColNames = convCols.map((c) => c.name);
    expect(convColNames).toContain("parent_conversation_id");
    expect(convColNames).toContain("branched_from_message_id");

    const msgCols = bootstrapDb
      .prepare(`PRAGMA table_info(chat_messages)`)
      .all() as Array<{ name: string }>;
    expect(msgCols.map((c) => c.name)).toContain("rewound_at");

    const idx = bootstrapDb
      .prepare(`PRAGMA index_list(conversations)`)
      .all() as Array<{ name: string }>;
    expect(idx.map((i) => i.name)).toContain("idx_conversations_parent_id");

    bootstrapDb.close();
  });

  // chat-conversation-branches v1: legacy DB upgrade path. Simulates a DB
  // bootstrapped before branching columns existed by manually creating the
  // pre-feature CREATE TABLE shape, then re-running bootstrap and asserting
  // the addColumnIfMissing ALTERs added the new columns idempotently.
  it("adds branching columns to a legacy DB via addColumnIfMissing", () => {
    const legacy = new Database(dbPath);
    legacy
      .prepare(
        `CREATE TABLE conversations (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT,
          title TEXT,
          runtime_id TEXT NOT NULL,
          model_id TEXT,
          status TEXT DEFAULT 'active' NOT NULL,
          session_id TEXT,
          context_scope TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      )
      .run();
    legacy
      .prepare(
        `CREATE TABLE chat_messages (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          status TEXT DEFAULT 'complete' NOT NULL,
          created_at INTEGER NOT NULL
        )`
      )
      .run();

    bootstrapAinativeDatabase(legacy);

    const convColNames = (
      legacy.prepare(`PRAGMA table_info(conversations)`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    expect(convColNames).toContain("parent_conversation_id");
    expect(convColNames).toContain("branched_from_message_id");

    const msgColNames = (
      legacy.prepare(`PRAGMA table_info(chat_messages)`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    expect(msgColNames).toContain("rewound_at");

    legacy.close();
  });
});
