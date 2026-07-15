import { db } from "@/lib/db";
import { projects, tasks, workflows, documents, schedules } from "@/lib/db/schema";
import type { EntityQuickAccessItem } from "./types";

/** Captured tool result from an MCP server callback */
export interface ToolResultCapture {
  toolName: string;
  result: unknown;
}

/**
 * Scan assistant response text for references to known entities.
 * Returns QuickAccessItem[] for rendering as navigation pills.
 *
 * Detection strategy: search for entity names/titles in the response text.
 * This is a lightweight heuristic — not NLP entity extraction.
 */
export async function detectEntities(
  text: string,
  projectId?: string | null
): Promise<EntityQuickAccessItem[]> {
  const items: EntityQuickAccessItem[] = [];
  const lowerText = text.toLowerCase();

  // Fetch candidate entities (scoped to project if available, else global recent)
  const [projectRows, taskRows, workflowRows, documentRows, scheduleRows] =
    await Promise.all([
      db.select({ id: projects.id, name: projects.name }).from(projects).limit(20),
      db.select({ id: tasks.id, title: tasks.title }).from(tasks).limit(30),
      db.select({ id: workflows.id, name: workflows.name }).from(workflows).limit(20),
      db.select({ id: documents.id, name: documents.originalName }).from(documents).limit(20),
      db.select({ id: schedules.id, name: schedules.name }).from(schedules).limit(20),
    ]);

  // Check each entity for a name match in the response
  for (const p of projectRows) {
    if (p.name.length >= 3 && lowerText.includes(p.name.toLowerCase())) {
      items.push({
        entityType: "project",
        entityId: p.id,
        label: p.name,
        href: `/projects/${p.id}`,
      });
    }
  }

  for (const t of taskRows) {
    if (t.title.length >= 3 && lowerText.includes(t.title.toLowerCase())) {
      items.push({
        entityType: "task",
        entityId: t.id,
        label: t.title,
        href: `/tasks/${t.id}`,
      });
    }
  }

  for (const w of workflowRows) {
    if (w.name.length >= 3 && lowerText.includes(w.name.toLowerCase())) {
      items.push({
        entityType: "workflow",
        entityId: w.id,
        label: w.name,
        href: `/workflows/${w.id}`,
      });
    }
  }

  for (const d of documentRows) {
    if (d.name.length >= 3 && lowerText.includes(d.name.toLowerCase())) {
      items.push({
        entityType: "document",
        entityId: d.id,
        label: d.name,
        href: `/documents/${d.id}`,
      });
    }
  }

  for (const s of scheduleRows) {
    if (s.name.length >= 3 && lowerText.includes(s.name.toLowerCase())) {
      items.push({
        entityType: "schedule",
        entityId: s.id,
        label: s.name,
        href: `/schedules`,
      });
    }
  }

  return deduplicateByEntityTypeAndLabel(deduplicateByEntityId(items));
}

/**
 * Extract Quick Access links from CRUD tool results.
 * Deterministic — uses exact entity IDs from tool return values.
 */
export function extractToolResultEntities(
  captures: ToolResultCapture[]
): EntityQuickAccessItem[] {
  const items: EntityQuickAccessItem[] = [];

  for (const { toolName, result } of captures) {
    if (!result || typeof result !== "object") continue;
    const entity = result as Record<string, unknown>;

    if (
      toolName === "create_task" ||
      toolName === "update_task" ||
      toolName === "get_task"
    ) {
      const id = entity.id as string;
      const title = (entity.title as string) ?? "Task";
      items.push({
        entityType: "task",
        entityId: id,
        label: title,
        href: `/tasks/${id}`,
      });
      items.push({
        entityType: "task",
        entityId: `tasks-${id}`,
        label: "Tasks",
        href: "/tasks",
      });
      if (entity.projectId) {
        items.push({
          entityType: "project",
          entityId: entity.projectId as string,
          label: "View Project",
          href: `/projects/${entity.projectId}`,
        });
      }
    } else if (toolName === "create_project") {
      const id = entity.id as string;
      const name = (entity.name as string) ?? "Project";
      items.push({
        entityType: "project",
        entityId: id,
        label: name,
        href: `/projects/${id}`,
      });
      items.push({
        entityType: "project",
        entityId: `dashboard-${id}`,
        label: "Dashboard",
        href: "/",
      });
    } else if (
      toolName === "create_workflow" ||
      toolName === "update_workflow" ||
      toolName === "get_workflow" ||
      toolName === "get_workflow_status" ||
      toolName === "execute_workflow"
    ) {
      const id = (entity.id ?? entity.workflowId) as string;
      const name = (entity.name as string) ?? "Workflow";
      if (id) {
        items.push({
          entityType: "workflow",
          entityId: id,
          label: name,
          href: `/workflows/${id}`,
        });
      }
    } else if (
      toolName === "create_schedule" ||
      toolName === "update_schedule" ||
      toolName === "get_schedule"
    ) {
      const id = entity.id as string;
      const name = (entity.name as string) ?? "Schedule";
      if (id) {
        items.push({
          entityType: "schedule",
          entityId: id,
          label: name,
          href: `/schedules`,
        });
      }
    } else if (toolName === "get_document") {
      const id = entity.id as string;
      const name = (entity.originalName as string) ?? "Document";
      if (id) {
        items.push({
          entityType: "document",
          entityId: id,
          label: name,
          href: `/documents`,
        });
      }
    } else if (toolName === "execute_task") {
      const id = (entity.taskId ?? entity.id) as string;
      const title = (entity.title as string) ?? "Task";
      if (id) {
        items.push({
          entityType: "task",
          entityId: id,
          label: title,
          href: `/tasks/${id}`,
        });
      }
    }
  }

  return deduplicateByEntityId(items);
}

/** Remove duplicate Quick Access items by entityId (first occurrence wins) */
export function deduplicateByEntityId(
  items: EntityQuickAccessItem[]
): EntityQuickAccessItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.entityId)) return false;
    seen.add(item.entityId);
    return true;
  });
}

/**
 * Remove items that share an (entityType, lowercased label) with an earlier
 * item — first occurrence wins. Different entity types may share a label
 * (a project "Foo" + a task "Foo" both render with their own icons), so the
 * dedup key is type-scoped.
 *
 * Fixes F7: a chat response mentioning an app name finds both the slug-id
 * composed-app project AND a same-named pre-existing project, emitting two
 * pills with identical labels. F8's manifest-name resolution made these
 * collisions more frequent because composed-app projects now use the same
 * canonical name a user is likely to type. We keep the first match (which
 * iteration order makes deterministic) and suppress later same-label dups.
 */
export function deduplicateByEntityTypeAndLabel(
  items: EntityQuickAccessItem[]
): EntityQuickAccessItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.entityType}|${item.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
