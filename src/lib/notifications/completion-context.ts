import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, tasks } from "@/lib/db/schema";

export const COMPLETION_RESULT_PREVIEW_LIMIT = 4_000;

export interface NotificationOutputDocument {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  version: number;
  direction: "output";
}

export async function attachCompletionContext<
  T extends { taskId: string | null; type: string },
>(rows: T[]): Promise<Array<T & {
  outputDocuments: NotificationOutputDocument[];
  completionResultPreview: string | null;
}>> {
  const taskIds = Array.from(new Set(
    rows
      .filter((row) => row.type === "task_completed" && row.taskId)
      .map((row) => row.taskId as string),
  ));
  if (taskIds.length === 0) {
    return rows.map((row) => ({
      ...row,
      outputDocuments: [],
      completionResultPreview: null,
    }));
  }

  const [outputRows, taskRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        taskId: documents.taskId,
        originalName: documents.originalName,
        mimeType: documents.mimeType,
        size: documents.size,
        version: documents.version,
        direction: documents.direction,
      })
      .from(documents)
      .where(and(
        inArray(documents.taskId, taskIds),
        eq(documents.direction, "output"),
      )),
    db
      .select({ id: tasks.id, result: tasks.result })
      .from(tasks)
      .where(inArray(tasks.id, taskIds)),
  ]);
  const byTask = new Map<string, NotificationOutputDocument[]>();
  for (const doc of outputRows) {
    if (!doc.taskId || doc.direction !== "output") continue;
    const taskDocuments = byTask.get(doc.taskId) ?? [];
    taskDocuments.push({ ...doc, direction: "output" });
    byTask.set(doc.taskId, taskDocuments);
  }
  const resultByTask = new Map(taskRows.map((task) => [
    task.id,
    task.result?.slice(0, COMPLETION_RESULT_PREVIEW_LIMIT) ?? null,
  ]));

  return rows.map((row) => {
    const completedTaskId = row.type === "task_completed" ? row.taskId : null;
    return {
      ...row,
      outputDocuments: completedTaskId ? (byTask.get(completedTaskId) ?? []) : [],
      completionResultPreview: completedTaskId
        ? (resultByTask.get(completedTaskId) ?? null)
        : null,
    };
  });
}
