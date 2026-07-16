import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapAinativeDatabase } from "../bootstrap";

const repoRoot = process.cwd();
const seedScript = join(
  repoRoot,
  "_ASSETS",
  "seed",
  "scripts",
  "seed-relay-demo.mjs"
);

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function runSeed(dataDir: string, reset = false) {
  execFileSync(
    process.execPath,
    [
      seedScript,
      "--data-dir",
      dataDir,
      "--repo-root",
      repoRoot,
      ...(reset ? ["--reset-demo"] : []),
    ],
    { stdio: "pipe" }
  );
}

describe("demo reset", () => {
  it("clears and reseeds the same used database twice with foreign keys enabled", () => {
    tempDir = mkdtempSync(join(tmpdir(), "relay-demo-reset-"));
    const dbPath = join(tempDir, "relay.db");
    const sqlite = new Database(dbPath);
    bootstrapAinativeDatabase(sqlite);
    sqlite.close();

    runSeed(tempDir);
    runSeed(tempDir, true);
    expect(() => runSeed(tempDir, true)).not.toThrow();

    const verified = new Database(dbPath);
    verified.pragma("foreign_keys = ON");
    const foreignKeyViolations = verified
      .prepare("PRAGMA foreign_key_check")
      .all();
    const taskCount = (
      verified
        .prepare("SELECT COUNT(*) AS count FROM tasks WHERE id LIKE 'demo_%'")
        .get() as { count: number }
    ).count;
    const tableCount = (
      verified
        .prepare(
          "SELECT COUNT(*) AS count FROM user_tables WHERE id LIKE 'demo_%'"
        )
        .get() as { count: number }
    ).count;
    verified.close();

    expect(foreignKeyViolations).toEqual([]);
    expect(taskCount).toBeGreaterThan(0);
    expect(tableCount).toBeGreaterThan(0);
  });
});
