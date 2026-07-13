import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, schedules, userTableRows } from "@/lib/db/schema";
import type { KpiContext } from "./evaluate-kpi";
import type { KpiPrimitive } from "./format-kpi";

/**
 * Returns the inclusive start-of-window Date for `mtd`/`qtd`/`ytd`. Computed
 * in local time so windows align with calendar boundaries the user sees.
 *
 * Exported because Phase 3 `data.ts` and Phase 5 reporting tiles reuse the
 * same boundary logic — a single source of truth keeps Inflow/Outflow/Net
 * tiles consistent across surfaces.
 */
export function windowStart(window: "mtd" | "qtd" | "ytd"): Date {
  const now = new Date();
  if (window === "mtd") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (window === "qtd") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), q, 1);
  }
  // ytd
  return new Date(now.getFullYear(), 0, 1);
}

/**
 * DB-backed KpiContext used by `loadRuntimeState` in production. Tests inject
 * mock contexts directly into `evaluateKpi`. Kept separate from the engine so
 * the engine stays runtime-agnostic.
 *
 * Window math note: 7d/30d windows are computed from `Date.now()` at call
 * time. Caching of the resulting tiles happens upstream via `unstable_cache`
 * in `data.ts`.
 */
export function createKpiContext(): KpiContext {
  return {
    async tableCount(tableId, where) {
      try {
        if (where) {
          // `where` is a column name — interpret as `data.<col>` truthy filter.
          // Drizzle has no direct JSON predicate, so fall back to raw SQL.
          const path = "$." + where;
          const rows = db
            .select({ value: count() })
            .from(userTableRows)
            .where(
              and(
                eq(userTableRows.tableId, tableId),
                sql`json_extract(${userTableRows.data}, ${path}) = 1
                    OR json_extract(${userTableRows.data}, ${path}) = 'true'`
              )
            )
            .all();
          return rows[0]?.value ?? 0;
        }
        const rows = db
          .select({ value: count() })
          .from(userTableRows)
          .where(eq(userTableRows.tableId, tableId))
          .all();
        return rows[0]?.value ?? 0;
      } catch {
        return null;
      }
    },

    async tableSum(tableId, column) {
      try {
        const path = "$." + column;
        const rows = db
          .select({
            value: sql<number>`COALESCE(SUM(CAST(json_extract(${userTableRows.data}, ${path}) AS REAL)), 0)`,
          })
          .from(userTableRows)
          .where(eq(userTableRows.tableId, tableId))
          .all();
        return rows[0]?.value ?? 0;
      } catch {
        return null;
      }
    },

    async tableSumWindowed(tableId, column, sign, window) {
      try {
        const path = "$." + column;
        const conditions = [eq(userTableRows.tableId, tableId)];

        if (sign === "positive") {
          conditions.push(
            sql`CAST(json_extract(${userTableRows.data}, ${path}) AS REAL) > 0`
          );
        } else if (sign === "negative") {
          conditions.push(
            sql`CAST(json_extract(${userTableRows.data}, ${path}) AS REAL) < 0`
          );
        }

        if (window) {
          const since = windowStart(window);
          conditions.push(gte(userTableRows.createdAt, since));
        }

        const rows = db
          .select({
            value: sql<number>`COALESCE(SUM(CAST(json_extract(${userTableRows.data}, ${path}) AS REAL)), 0)`,
          })
          .from(userTableRows)
          .where(and(...conditions))
          .all();
        return rows[0]?.value ?? 0;
      } catch {
        return null;
      }
    },

    async tableSumWindowedSeries(tableId, column, sign, window) {
      try {
        const path = "$." + column;
        const conditions = [eq(userTableRows.tableId, tableId)];

        if (sign === "positive") {
          conditions.push(
            sql`CAST(json_extract(${userTableRows.data}, ${path}) AS REAL) > 0`
          );
        } else if (sign === "negative") {
          conditions.push(
            sql`CAST(json_extract(${userTableRows.data}, ${path}) AS REAL) < 0`
          );
        }

        const since = windowStart(window);
        conditions.push(gte(userTableRows.createdAt, since));

        // Drizzle's SQLite `timestamp` mode persists epoch seconds. Dividing
        // by 1000 here collapsed every real date into January 1970, so a
        // multi-day pack ledger produced a one-point series and the KPI tile
        // silently omitted its trend/spark. Bucket the stored seconds
        // directly, matching SQLite's `unixepoch` contract.
        const bucket = sql<string>`date(${userTableRows.createdAt}, 'unixepoch')`;
        const rows = db
          .select({
            date: bucket,
            value: sql<number>`COALESCE(SUM(CAST(json_extract(${userTableRows.data}, ${path}) AS REAL)), 0)`,
          })
          .from(userTableRows)
          .where(and(...conditions))
          .groupBy(bucket)
          .orderBy(sql`${bucket} ASC`)
          .all();
        return rows.map((r) => r.value ?? 0);
      } catch {
        return [];
      }
    },

    async tableLatest(tableId, column) {
      try {
        const path = "$." + column;
        const row = db
          .select({
            value: sql<KpiPrimitive>`json_extract(${userTableRows.data}, ${path})`,
          })
          .from(userTableRows)
          .where(eq(userTableRows.tableId, tableId))
          .orderBy(desc(userTableRows.createdAt))
          .limit(1)
          .get();
        return (row?.value ?? null) as KpiPrimitive;
      } catch {
        return null;
      }
    },

    async blueprintRunCount(blueprint, window) {
      try {
        const ms = window === "30d" ? 30 * 86_400_000 : 7 * 86_400_000;
        const since = new Date(Date.now() - ms);
        // Tasks aren't directly tagged with blueprint id; we approximate by
        // matching `assignedAgent` or `agentProfile` containing the blueprint
        // string. Phase 5 will add a first-class blueprintId column.
        const rows = db
          .select({ value: count() })
          .from(tasks)
          .where(
            and(
              gte(tasks.createdAt, since),
              sql`(${tasks.assignedAgent} = ${blueprint}
                   OR ${tasks.agentProfile} = ${blueprint})`
            )
          )
          .all();
        return rows[0]?.value ?? 0;
      } catch {
        return null;
      }
    },

    async scheduleNextFire(scheduleId) {
      try {
        const row = db
          .select({ value: schedules.nextFireAt })
          .from(schedules)
          .where(eq(schedules.id, scheduleId))
          .get();
        return row?.value ? row.value.getTime() : null;
      } catch {
        return null;
      }
    },
  };
}
