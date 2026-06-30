import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { mkdirSync } from "fs";
import { dataDir as getDataDir, dbPath as getDbPath } from "@/lib/config/env";
import { bootstrapAinativeDatabase } from "./bootstrap";

const dataDir = getDataDir();
mkdirSync(dataDir, { recursive: true });
const dbPath = getDbPath();

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Bootstrap creates tables with IF NOT EXISTS + adds columns.
// Drizzle migrations (DROP TABLE, CREATE INDEX, etc.) run separately
// at server startup in instrumentation-node.ts to avoid SQLITE_BUSY
// conflicts during next build.
bootstrapAinativeDatabase(sqlite);

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Lazy seed: table templates (idempotent — checks before inserting)
import("@/lib/data/seed-data/table-templates").then(({ seedTableTemplates }) => {
  seedTableTemplates().catch(() => {
    // Template seeding is non-critical — log and continue
    console.warn("[db] table template seeding failed");
  });
});
