/**
 * Manifest-driven trigger dispatcher.
 *
 * Called from `addRows` (`src/lib/data/tables.ts`) alongside the existing
 * `evaluateTriggers` (UI-configured triggers). Reads cached manifests,
 * filters subscriptions by table id, and instantiates + executes the
 * named blueprint asynchronously.
 *
 * Tasks created by row-triggered blueprints carry:
 *   - `tasks.context_row_id = <row-id>`  (via workflow definition._contextRowId)
 *   - `tasks.project_id = <appId>`       (via instantiateBlueprint projectId arg)
 *
 * Failures (unknown blueprint, missing required variable, filesystem
 * fault) write a `notifications` row and log to console; one failing
 * subscription does not block other matching apps.
 *
 * Use `await import()` for engine.ts to avoid module-load cycles per
 * CLAUDE.md "smoke-test budget" rule.
 */

import { listAppsWithManifestsCached } from "./registry";
import type { AppManifest } from "./registry";
import { getBlueprint } from "@/lib/workflows/blueprints/registry";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export async function evaluateManifestTriggers(
  tableId: string,
  rowId: string,
  rowData: Record<string, unknown>
): Promise<void> {
  // listAppsWithManifestsCached returns AppDetail[] with `manifest` hydrated,
  // so findMatchingSubscriptions can read manifest.blueprints at runtime.
  let apps: ReturnType<typeof listAppsWithManifestsCached>;
  try {
    apps = listAppsWithManifestsCached();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[manifest-trigger-dispatch] listAppsWithManifestsCached failed:`, err);
    try {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        taskId: null,
        type: "task_failed",
        title: "Manifest scan failed",
        body: `Could not read app manifests for row-insert dispatch on table "${tableId}": ${message}`,
        read: false,
        createdAt: new Date(),
      });
    } catch {
      // Last-resort: log only
    }
    return;
  }

  const matches = findMatchingSubscriptions(apps, tableId);

  for (const { appId, blueprintId } of matches) {
    await dispatchBlueprintForRow({
      appId,
      blueprintId,
      tableId,
      rowId,
      rowData,
    });
  }
}

/**
 * Shared row-triggered blueprint dispatch.
 *
 * Single chokepoint for all paths that fire a blueprint in response to a
 * row event: manifest-driven subscriptions (`evaluateManifestTriggers`)
 * AND UI-configured triggers stored in `user_table_triggers`
 * (`trigger-evaluator.ts:fireAction` for `actionType=run_workflow` with
 * `config.blueprintId`).
 *
 * Centralizing this means error handling, notification writes, and
 * variable construction stay consistent — and any future trigger source
 * (cron, webhook, etc.) can call the same helper.
 *
 * Returns `{ workflowId }` on success, `null` on failure (failure already
 * logged + recorded in `notifications` so callers don't need to re-handle).
 */
export async function dispatchBlueprintForRow(input: {
  appId: string;
  blueprintId: string;
  tableId: string;
  rowId: string;
  rowData: Record<string, unknown>;
}): Promise<{ workflowId: string } | null> {
  const { appId, blueprintId, tableId, rowId, rowData } = input;
  try {
    const { instantiateBlueprint } = await import(
      "@/lib/workflows/blueprints/instantiator"
    );
    const { executeWorkflow } = await import("@/lib/workflows/engine");

    const variables = buildVariables(blueprintId, rowData);

    const { workflowId } = await instantiateBlueprint(
      blueprintId,
      variables,
      appId,
      { _contextRowId: rowId }
    );

    // Fire-and-forget — workflow may run for minutes
    executeWorkflow(workflowId).catch((err) => {
      console.error(
        `[manifest-trigger-dispatch] executeWorkflow ${workflowId} failed:`,
        err
      );
    });

    return { workflowId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[manifest-trigger-dispatch] dispatch failed for app=${appId} blueprint=${blueprintId}:`,
      err
    );
    try {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        taskId: null,
        type: "task_failed",
        title: `Trigger failure in app "${appId}"`,
        body: `Blueprint "${blueprintId}" failed for table "${tableId}" row "${rowId}": ${message}`,
        read: false,
        createdAt: new Date(),
      });
    } catch (nerr) {
      console.error(`[manifest-trigger-dispatch] notification write failed:`, nerr);
    }
    return null;
  }
}

/**
 * Cron-fired blueprint dispatch for app-manifest schedules
 * (`manifest.schedules[].runs`). The schedule-side sibling of
 * `dispatchBlueprintForRow` — same instantiate → execute chokepoint, same
 * notification-on-failure contract, but with no row context: variables come
 * entirely from the blueprint's declared defaults, so a pack author must
 * give every required variable a default for a scheduled blueprint.
 *
 * Returns `{ workflowId }` on success, `null` on failure (already logged +
 * recorded in `notifications`).
 */
export async function dispatchScheduledBlueprint(input: {
  appId: string;
  blueprintId: string;
  scheduleId: string;
}): Promise<{ workflowId: string } | null> {
  const { appId, blueprintId, scheduleId } = input;
  try {
    const { instantiateBlueprint } = await import(
      "@/lib/workflows/blueprints/instantiator"
    );
    const { executeWorkflow } = await import("@/lib/workflows/engine");

    const { workflowId } = await instantiateBlueprint(blueprintId, {}, appId);

    // Fire-and-forget — workflow may run for minutes
    executeWorkflow(workflowId).catch((err) => {
      console.error(
        `[manifest-trigger-dispatch] executeWorkflow ${workflowId} failed:`,
        err
      );
    });

    return { workflowId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[manifest-trigger-dispatch] scheduled dispatch failed for app=${appId} blueprint=${blueprintId}:`,
      err
    );
    try {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        taskId: null,
        type: "task_failed",
        title: `Schedule failure in app "${appId}"`,
        body: `Blueprint "${blueprintId}" failed for schedule "${scheduleId}": ${message}`,
        read: false,
        createdAt: new Date(),
      });
    } catch (nerr) {
      console.error(`[manifest-trigger-dispatch] notification write failed:`, nerr);
    }
    return null;
  }
}

interface MatchingSubscription {
  appId: string;
  blueprintId: string;
}

function findMatchingSubscriptions(
  apps: ReadonlyArray<{ id: string; manifest?: AppManifest }>,
  tableId: string
): MatchingSubscription[] {
  const out: MatchingSubscription[] = [];
  for (const app of apps) {
    for (const bp of app.manifest?.blueprints ?? []) {
      const t = (bp as { trigger?: { kind?: string; table?: string } }).trigger;
      if (t?.kind === "row-insert" && t.table === tableId) {
        out.push({ appId: app.id, blueprintId: bp.id });
      }
    }
  }
  return out;
}

const ROW_PLACEHOLDER = /^\{\{\s*row\.([a-zA-Z0-9_-]+)\s*\}\}$/;

/**
 * Build the variables object passed to `instantiateBlueprint`:
 *   1. Start with provided `rowData` (each column becomes a variable named after the column).
 *   2. For each blueprint variable whose `default` is `{{row.<col>}}`,
 *      resolve to `rowData[col]` so the variable has a concrete value
 *      even if `rowData[col]` is missing from step 1's column-name passthrough.
 *   3. Required variables left unresolved → instantiator throws → caller catches.
 *
 * Exported for tests: this is the exact seam where the row-insert var-mapping
 * gap lived (a required var with no `{{row.col}}` default could not be filled
 * from the row and threw "Missing required variables" at dispatch). The
 * install-time guard (install.ts block 2d) now refuses such packs, but the
 * bundle template test also asserts this function fills the required var end
 * to end.
 */
export function buildVariables(
  blueprintId: string,
  rowData: Record<string, unknown>
): Record<string, unknown> {
  const blueprint = getBlueprint(blueprintId);
  const vars: Record<string, unknown> = { ...rowData };

  if (!blueprint) {
    return vars; // unknown blueprint case; instantiator will throw
  }

  for (const varDef of blueprint.variables) {
    const defStr = typeof varDef.default === "string" ? varDef.default : null;
    if (!defStr) continue;
    const m = ROW_PLACEHOLDER.exec(defStr);
    if (m) {
      const col = m[1];
      if (vars[varDef.id] === undefined && rowData[col] !== undefined) {
        vars[varDef.id] = rowData[col];
      }
    }
  }

  return vars;
}
