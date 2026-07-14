/**
 * installSchedulesFromSpecs — state-preserving upsert for schedule specs.
 *
 * Inserts each spec as a new DB row on first load. On subsequent loads
 * (restart, reload, plugin re-activation), only CONFIG fields are updated;
 * all scheduler-owned runtime state columns are preserved unchanged.
 *
 * Column categorization:
 *   CONFIG  — fields the spec author controls: name, prompt, cronExpression,
 *             agentProfile, assignedAgent, recurs, maxFirings, expiresAt,
 *             type, heartbeatChecklist, activeHoursStart, activeHoursEnd,
 *             activeTimezone, heartbeatBudgetPerDay, deliveryChannels,
 *             maxTurns, maxRunDurationSec, successCriteria, updatedAt
 *   STATE   — scheduler-owned at runtime (NOT touched on reload):
 *             status, firingCount, lastFiredAt, nextFireAt, suppressionCount,
 *             lastActionAt, heartbeatSpentToday, heartbeatBudgetResetAt,
 *             avgTurnsPerFiring, lastTurnCount, failureStreak, lastFailureReason,
 *             maxTurnsSetAt, turnBudgetBreachStreak, createdAt
 *   DB-ONLY — projectId (user-set via UI; never set by loader, treated as STATE)
 *
 * IMPLEMENTATION NOTE: The .set() clause is intentionally verbose — every
 * column listed explicitly. Do NOT refactor to Object.keys reflection; the
 * verbosity is a safety invariant (T8 enforces it with a column-coverage test).
 */

import { db } from "@/lib/db";
import { schedules as schedulesTable } from "@/lib/db/schema";
import { and, like, notInArray } from "drizzle-orm";
import { parseInterval, computeNextFireTime } from "./interval-parser";
import type { ScheduleSpec } from "@/lib/validators/schedule-spec";

const PLUGIN_SCHEDULE_PREFIX = "plugin:";

function pluginScheduleId(pluginId: string, scheduleId: string): string {
  return `${PLUGIN_SCHEDULE_PREFIX}${pluginId}:${scheduleId}`;
}

/**
 * Resolve the cron expression from a spec.
 * - If spec.cronExpression is set, use it directly (already a valid 5-field cron).
 * - If spec.interval is set, convert via parseInterval().
 * Zod's cross-field refine guarantees exactly one is set, so no null-handling needed.
 */
function resolveCron(spec: ScheduleSpec): string {
  if (spec.cronExpression) {
    return spec.cronExpression;
  }
  // spec.interval must be set (Zod refine guarantees exactly one of the two)
  return parseInterval(spec.interval!);
}

/**
 * Install (or reconcile) a batch of schedule specs into the DB.
 *
 * @param specs    - Validated ScheduleSpec objects (from YAML parse + Zod).
 * @param opts     - Optional context. opts.pluginId is accepted but not yet
 *                   used for composite-id mapping (T9 adds that).
 */
export function installSchedulesFromSpecs(
  specs: ScheduleSpec[],
  opts?: { pluginId?: string }
): void {
  const now = new Date();
  const pluginId = opts?.pluginId;

  for (const spec of specs) {
    const id = pluginId ? pluginScheduleId(pluginId, spec.id) : spec.id;
    const displayName = pluginId ? `${spec.name} (${pluginId})` : spec.name;
    const resolvedCron = resolveCron(spec);

    db.insert(schedulesTable)
      .values({
        id,
        name: displayName,
        prompt: spec.prompt,
        cronExpression: resolvedCron,
        agentProfile: spec.agentProfile ?? null,
        assignedAgent: spec.assignedAgent ?? null,
        recurs: spec.recurs ?? true,
        maxFirings: spec.maxFirings ?? null,
        expiresAt: spec.expiresAt ? new Date(spec.expiresAt) : null,
        type: spec.type,
        heartbeatChecklist: spec.type === "heartbeat" ? JSON.stringify(spec.heartbeatChecklist ?? []) : null,
        activeHoursStart: spec.type === "heartbeat" ? (spec.activeHoursStart ?? null) : null,
        activeHoursEnd:   spec.type === "heartbeat" ? (spec.activeHoursEnd ?? null)   : null,
        activeTimezone:   spec.type === "heartbeat" ? (spec.activeTimezone ?? "UTC") : "UTC",
        heartbeatBudgetPerDay: spec.type === "heartbeat" ? (spec.heartbeatBudgetPerDay ?? null) : null,
        deliveryChannels: JSON.stringify(spec.deliveryChannels ?? []),
        maxTurns: spec.maxTurns ?? null,
        maxRunDurationSec: spec.maxRunDurationSec ?? null,
        successCriteria:
          spec.successCriteria && spec.successCriteria.length > 0
            ? JSON.stringify(spec.successCriteria)
            : null,
        // Defaults applied ONLY on first insert:
        status: "active",
        firingCount: 0,
        suppressionCount: 0,
        failureStreak: 0,
        heartbeatSpentToday: 0,
        turnBudgetBreachStreak: 0,
        nextFireAt: computeNextFireTime(resolvedCron),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schedulesTable.id,
        set: {
          // Config fields ONLY. Runtime state (firingCount, lastFiredAt,
          // suppressionCount, failureStreak, heartbeatSpentToday,
          // turnBudgetBreachStreak, avgTurnsPerFiring, lastTurnCount,
          // lastFailureReason, lastActionAt, heartbeatBudgetResetAt,
          // maxTurnsSetAt, createdAt, STATUS) is preserved.
          name: displayName,
          prompt: spec.prompt,
          cronExpression: resolvedCron,
          agentProfile: spec.agentProfile ?? null,
          assignedAgent: spec.assignedAgent ?? null,
          recurs: spec.recurs ?? true,
          maxFirings: spec.maxFirings ?? null,
          expiresAt: spec.expiresAt ? new Date(spec.expiresAt) : null,
          type: spec.type,
          heartbeatChecklist: spec.type === "heartbeat" ? JSON.stringify(spec.heartbeatChecklist ?? []) : null,
          activeHoursStart: spec.type === "heartbeat" ? (spec.activeHoursStart ?? null) : null,
          activeHoursEnd:   spec.type === "heartbeat" ? (spec.activeHoursEnd ?? null)   : null,
          activeTimezone:   spec.type === "heartbeat" ? (spec.activeTimezone ?? "UTC") : "UTC",
          heartbeatBudgetPerDay: spec.type === "heartbeat" ? (spec.heartbeatBudgetPerDay ?? null) : null,
          deliveryChannels: JSON.stringify(spec.deliveryChannels ?? []),
          maxTurns: spec.maxTurns ?? null,
          maxRunDurationSec: spec.maxRunDurationSec ?? null,
          successCriteria:
            spec.successCriteria && spec.successCriteria.length > 0
              ? JSON.stringify(spec.successCriteria)
              : null,
          updatedAt: now,
          // NOTE: `status` is NOT in this set. A user who pauses a schedule in
          // the UI keeps it paused across reloads. The loader never un-pauses.
          // NOTE: `nextFireAt` is also NOT here. Recomputing it on every reload
          // would shift fire windows. The scheduler engine already tolerates a
          // stale nextFireAt — it re-derives on the next tick from the current
          // cronExpression. See "Race with scheduler" in the spec.
        },
      })
      .run();
  }
}

/**
 * Install (or reconcile) a plugin's schedule specs, namespacing each id as
 * `plugin:<pluginId>:<spec.id>` and suffixing the display name with `(<pluginId>)`.
 */
export function installPluginSchedules(pluginId: string, specs: ScheduleSpec[]): void {
  installSchedulesFromSpecs(specs, { pluginId });
}

/**
 * Remove all DB rows whose id starts with `plugin:<pluginId>:`.
 * Only touches rows owned by this plugin; other plugins and user rows are unaffected.
 */
export function removePluginSchedules(pluginId: string): void {
  const pattern = `${PLUGIN_SCHEDULE_PREFIX}${pluginId}:%`;
  db.delete(schedulesTable).where(like(schedulesTable.id, pattern)).run();
}

/**
 * Delete schedule rows that belong to a plugin but are NOT in `keepIds`.
 *
 * Called after installPluginSchedules so that specs removed between reloads
 * have their DB rows cleaned up, while specs still present keep their runtime
 * state (status, firingCount, etc.) intact via the upsert in
 * installSchedulesFromSpecs.
 *
 * If `keepIds` is empty (all schedules removed from the bundle), this behaves
 * identically to removePluginSchedules — all rows for the plugin are deleted.
 *
 * @param pluginId - The plugin whose rows are candidates for deletion.
 * @param keepIds  - Composite ids (plugin:<pluginId>:<specId>) to retain.
 */
export function removeOrphanSchedules(pluginId: string, keepIds: string[]): void {
  const pattern = `${PLUGIN_SCHEDULE_PREFIX}${pluginId}:%`;
  if (keepIds.length === 0) {
    // Nothing to keep — delete all rows for this plugin
    db.delete(schedulesTable).where(like(schedulesTable.id, pattern)).run();
  } else {
    db.delete(schedulesTable)
      .where(and(like(schedulesTable.id, pattern), notInArray(schedulesTable.id, keepIds)))
      .run();
  }
}

/**
 * Return all composite ids currently installed for the given plugin.
 * Used for introspection and testing.
 */
export function listInstalledPluginScheduleIds(pluginId: string): string[] {
  const pattern = `${PLUGIN_SCHEDULE_PREFIX}${pluginId}:%`;
  return db
    .select({ id: schedulesTable.id })
    .from(schedulesTable)
    .where(like(schedulesTable.id, pattern))
    .all()
    .map((r: { id: string }) => r.id);
}
