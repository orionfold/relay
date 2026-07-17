/**
 * Trigger evaluator — checks active triggers on row mutations
 * and fires matching actions (create task or start workflow).
 */

import { db } from "@/lib/db";
import { userTableTriggers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSelfBaseUrl } from "@/lib/http/self-base-url";
import { getInternalAuthHeaders } from "@/lib/http/internal-auth";
import type { FilterSpec } from "./types";

type TriggerEvent = "row_added" | "row_updated" | "row_deleted";

interface ActionConfig {
  /** Legacy: pre-instantiated workflow id. */
  workflowId?: string;
  /**
   * Modern: blueprint id, optionally `<appId>--<artifactId>` shape. When
   * present, the trigger instantiates the blueprint per row and starts
   * execution — same path as manifest-driven triggers.
   */
  blueprintId?: string;
  /** Optional app id (defaults to the slug derived from blueprintId). */
  appId?: string;
  title?: string;
  description?: string;
  projectId?: string;
}

/**
 * Evaluate and fire triggers for a table event.
 * Called from row mutation API routes after successful writes.
 */
export async function evaluateTriggers(
  tableId: string,
  event: TriggerEvent,
  rowData: Record<string, unknown>
): Promise<void> {
  // Find active triggers matching this event
  const triggers = db
    .select()
    .from(userTableTriggers)
    .where(
      and(
        eq(userTableTriggers.tableId, tableId),
        eq(userTableTriggers.triggerEvent, event),
        eq(userTableTriggers.status, "active")
      )
    )
    .all();

  if (triggers.length === 0) return;

  for (const trigger of triggers) {
    // Evaluate condition if present
    if (trigger.condition) {
      const condition = JSON.parse(trigger.condition) as FilterSpec;
      if (!matchesCondition(rowData, condition)) continue;
    }

    // Fire the action
    try {
      const config = JSON.parse(trigger.actionConfig) as ActionConfig;
      await fireAction(
        trigger.actionType as "run_workflow" | "create_task",
        config,
        rowData,
        { tableId, triggerId: trigger.id }
      );

      // Update fire count
      db.update(userTableTriggers)
        .set({
          fireCount: trigger.fireCount + 1,
          lastFiredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userTableTriggers.id, trigger.id))
        .run();
    } catch (err) {
      console.error(`[triggers] Failed to fire trigger ${trigger.id}:`, err);
    }
  }
}

/**
 * Check if row data matches a filter condition.
 * Reuses the same operator logic as the query builder.
 */
function matchesCondition(
  data: Record<string, unknown>,
  condition: FilterSpec
): boolean {
  const value = data[condition.column];
  const strValue = value == null ? "" : String(value);

  switch (condition.operator) {
    case "eq":
      return strValue === String(condition.value);
    case "neq":
      return strValue !== String(condition.value);
    case "gt":
      return Number(value) > Number(condition.value);
    case "gte":
      return Number(value) >= Number(condition.value);
    case "lt":
      return Number(value) < Number(condition.value);
    case "lte":
      return Number(value) <= Number(condition.value);
    case "contains":
      return strValue.toLowerCase().includes(String(condition.value).toLowerCase());
    case "starts_with":
      return strValue.toLowerCase().startsWith(String(condition.value).toLowerCase());
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(strValue);
    case "is_empty":
      // Whitespace-only counts as empty (matches SQL `is_empty` operator).
      return value == null || strValue.trim() === "";
    case "is_not_empty":
      return value != null && strValue.trim() !== "";
    default:
      return true;
  }
}

/**
 * Fire a trigger action — create a task or start a workflow / blueprint.
 *
 * `run_workflow` accepts two config shapes:
 *   - `config.blueprintId`: instantiate the blueprint with row data as
 *     variables and start it. This is the path the chat tool's
 *     `create_trigger` produces and is the modern surface.
 *   - `config.workflowId`: legacy path — start an already-instantiated
 *     workflow via the API.
 *
 * Any other shape (e.g. `run_workflow` with neither field) is logged as
 * an unhandled dispatch so the silent no-op surfaces in dev logs instead
 * of disappearing — the prior behavior masked F13 in HANDOFF.md.
 */
async function fireAction(
  actionType: "run_workflow" | "create_task",
  config: ActionConfig,
  rowData: Record<string, unknown>,
  meta: { tableId: string; triggerId: string }
): Promise<void> {
  if (actionType === "create_task") {
    const description = config.description
      ? `${config.description}\n\nTrigger data: ${JSON.stringify(rowData, null, 2)}`
      : `Triggered by table row change.\n\nData: ${JSON.stringify(rowData, null, 2)}`;

    await fetch(`${getSelfBaseUrl()}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalAuthHeaders() },
      body: JSON.stringify({
        title: config.title ?? "Triggered Task",
        description,
        // createTaskSchema wants `string | undefined`, not null — sending null
        // 400s the self-call and the task is never created. Omit when absent.
        ...(config.projectId ? { projectId: config.projectId } : {}),
      }),
    });
    return;
  }

  if (actionType === "run_workflow" && config.blueprintId) {
    const blueprintId = config.blueprintId;
    const appId = config.appId ?? deriveAppIdFromBlueprintId(blueprintId);
    if (!appId) {
      console.warn(
        `[triggers] run_workflow trigger ${meta.triggerId} has blueprintId="${blueprintId}" but no appId could be derived (no '--' in id and no config.appId). Dispatch skipped.`
      );
      return;
    }
    // We don't have a stable per-row id at this layer (evaluateTriggers
    // is called with rowData but no rowId). Synthesize a placeholder so
    // _contextRowId is still threaded for traceability; manifest-driven
    // triggers (which DO have a rowId) carry the real row id.
    const rowId = `trigger-${meta.triggerId}-${Date.now()}`;
    const { dispatchBlueprintForRow } = await import(
      "@/lib/apps/manifest-trigger-dispatch"
    );
    await dispatchBlueprintForRow({
      appId,
      blueprintId,
      tableId: meta.tableId,
      rowId,
      rowData,
    });
    return;
  }

  if (actionType === "run_workflow" && config.workflowId) {
    await fetch(`${getSelfBaseUrl()}/api/workflows/${config.workflowId}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalAuthHeaders() },
      body: JSON.stringify({
        context: `Table row data: ${JSON.stringify(rowData, null, 2)}`,
      }),
    });
    return;
  }

  // Catch-all: surface unhandled shapes so the trigger doesn't silently
  // no-op like F13. fireCount still increments at the call site so the
  // operator can see the trigger fired but produced nothing.
  console.warn(
    `[triggers] Unhandled action shape for trigger ${meta.triggerId} (table=${meta.tableId}): actionType=${actionType}, config keys=${JSON.stringify(Object.keys(config))}`
  );
}

/** Extract the app id prefix from a `<appId>--<artifactId>` blueprint id. */
function deriveAppIdFromBlueprintId(blueprintId: string): string | null {
  const idx = blueprintId.indexOf("--");
  if (idx <= 0) return null;
  return blueprintId.slice(0, idx);
}
