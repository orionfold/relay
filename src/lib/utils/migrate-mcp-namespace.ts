import type Database from "better-sqlite3";

const OLD_PREFIX = "mcp__ainative__";
const NEW_PREFIX = "mcp__relay__";

export interface McpNamespaceMigrationReport {
  /** Rows in agent_profiles whose allowed_tools were rewritten. */
  profilesUpdated: number;
  /** 1 if the permissions.allow settings row was rewritten, else 0. */
  permissionsUpdated: number;
  errors: string[];
}

/**
 * Rewrites the chat/compose MCP tool namespace from the legacy `mcp__ainative__`
 * prefix to `mcp__relay__` in persisted data. Companion to the `engine.ts`
 * server-key flip: that change makes the runtime *publish* tools as
 * `mcp__relay__*`; this migration makes previously-saved allow-lists and
 * "Always Allow" records match the new names, which are compared by exact
 * string (see `permissions.ts:matchesPermission`).
 *
 * Backing stores rewritten:
 *   1. `settings` row `key='permissions.allow'` — a JSON array stored as a
 *      string. This is the store that actually carries the namespace today
 *      (saved "Always Allow" records). A string-level REPLACE is safe: it
 *      rewrites the substring inside the serialized array without parsing it.
 *   2. `agent_profiles.allowed_tools` — a JSON array column. NOTE: in current
 *      Relay, profiles are file-based (profile.yaml on disk) and there is no
 *      `agent_profiles` table, so this branch is a defensive no-op (guarded by
 *      a table-exists check). It is kept so that if a DB-backed profile store
 *      is ever reintroduced, the namespace hop is already covered. Shipped
 *      profile files carry no `mcp__ainative__` strings (verified), so no file
 *      rewrite is needed.
 *
 * Idempotent (a second run matches nothing) and never throws — a missing
 * table (fresh/partial schema) is an expected no-op, not an error. Any real
 * SQL failure is collected in `report.errors` so boot continues visibly.
 *
 * Takes the DB handle explicitly so it can be unit-tested against an in-memory
 * database; production passes the live `sqlite` export.
 */
export function migrateMcpNamespace(
  db: Database.Database,
): McpNamespaceMigrationReport {
  const report: McpNamespaceMigrationReport = {
    profilesUpdated: 0,
    permissionsUpdated: 0,
    errors: [],
  };

  if (!tableExists(db, "agent_profiles")) {
    // Fresh install — nothing to migrate.
  } else {
    try {
      const r = db
        .prepare(
          `UPDATE agent_profiles
             SET allowed_tools = REPLACE(allowed_tools, ?, ?)
           WHERE allowed_tools LIKE '%' || ? || '%'`,
        )
        .run(OLD_PREFIX, NEW_PREFIX, OLD_PREFIX);
      report.profilesUpdated = r.changes;
    } catch (err) {
      // allowed_tools column may be absent in an older schema — record, don't crash.
      report.errors.push(`agent_profiles rewrite failed: ${String(err)}`);
    }
  }

  if (!tableExists(db, "settings")) {
    // Fresh install — no saved permissions yet.
  } else {
    try {
      const r = db
        .prepare(
          `UPDATE settings
             SET value = REPLACE(value, ?, ?)
           WHERE key = 'permissions.allow' AND value LIKE '%' || ? || '%'`,
        )
        .run(OLD_PREFIX, NEW_PREFIX, OLD_PREFIX);
      report.permissionsUpdated = r.changes;
    } catch (err) {
      report.errors.push(`settings permissions.allow rewrite failed: ${String(err)}`);
    }
  }

  return report;
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return row !== undefined;
}
