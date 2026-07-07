import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { bootstrapAinativeDatabase } from "../bootstrap";
import { db } from "@/lib/db";
import { publishTargets, deployments } from "@/lib/db/schema";
import { clearAllData } from "@/lib/data/clear";

describe("publish substrate bootstrap (fresh-DB path)", () => {
  let tempDir: string;
  let sqlite: Database.Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "relay-publish-substrate-"));
    sqlite = new Database(join(tempDir, "relay.db"));
    sqlite.pragma("foreign_keys = ON");
    bootstrapAinativeDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates publish_targets with the expected columns", () => {
    const cols = (
      sqlite.prepare(`PRAGMA table_info(publish_targets)`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "app_id", "target_type", "config", "created_at"])
    );
  });

  it("creates deployments with the expected columns", () => {
    const cols = (
      sqlite.prepare(`PRAGMA table_info(deployments)`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "app_id",
        "target_id",
        "status",
        "url",
        "commit_sha",
        "artifact_hash",
        "started_at",
        "finished_at",
        "error",
      ])
    );
  });

  it("enforces the deployments → publish_targets foreign key", () => {
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO deployments (id, app_id, target_id, status, started_at)
           VALUES ('d-orphan', 'app-1', 'no-such-target', 'pending', 0)`
        )
        .run()
    ).toThrow(/FOREIGN KEY/);
  });
});

describe("publish substrate round-trip + clear ordering", () => {
  it("inserts a target + deployment, reads them back, and clears FK-safely", () => {
    const now = new Date();

    db.insert(publishTargets)
      .values({
        id: "pt-roundtrip",
        appId: "app-roundtrip",
        targetType: "github-pages",
        config: JSON.stringify({ owner: "acme", repo: "acme-site" }),
        createdAt: now,
      })
      .run();

    db.insert(deployments)
      .values({
        id: "dep-roundtrip",
        appId: "app-roundtrip",
        targetId: "pt-roundtrip",
        status: "success",
        url: "https://acme.github.io/acme-site/",
        commit: "c1",
        artifactHash: "abc123",
        startedAt: now,
        finishedAt: now,
      })
      .run();

    const targets = db.select().from(publishTargets).all();
    const deps = db.select().from(deployments).all();
    expect(targets.some((t) => t.id === "pt-roundtrip")).toBe(true);
    const dep = deps.find((d) => d.id === "dep-roundtrip");
    expect(dep?.targetId).toBe("pt-roundtrip");
    expect(dep?.status).toBe("success");

    // deployments references publish_targets — clearAllData must delete
    // children first or SQLite raises FOREIGN KEY constraint failed.
    const summary = clearAllData() as Record<string, number>;
    expect(summary.deployments).toBeGreaterThanOrEqual(1);
    expect(summary.publishTargets).toBeGreaterThanOrEqual(1);
    expect(db.select().from(publishTargets).all()).toHaveLength(0);
    expect(db.select().from(deployments).all()).toHaveLength(0);
  });
});
