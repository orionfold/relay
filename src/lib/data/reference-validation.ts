import "server-only";

import { inArray, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers, documents, projects, tasks } from "@/lib/db/schema";

export async function projectReferenceExists(projectId: string): Promise<boolean> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId));
  return Boolean(project);
}

export async function customerReferenceExists(customerId: string): Promise<boolean> {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId));
  return Boolean(customer);
}

export async function taskReferenceExists(taskId: string): Promise<boolean> {
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  return Boolean(task);
}

export async function findMissingDocumentReferences(
  documentIds: string[]
): Promise<string[]> {
  const uniqueIds = [...new Set(documentIds)];
  if (uniqueIds.length === 0) return [];

  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(inArray(documents.id, uniqueIds));
  const existingIds = new Set(rows.map((row) => row.id));
  return uniqueIds.filter((id) => !existingIds.has(id));
}
