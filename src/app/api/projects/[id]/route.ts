import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  projects,
  projectDocumentDefaults,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateProjectSchema } from "@/lib/validators/project";
import { deleteProjectCascade } from "@/lib/data/delete-project";
import {
  customerReferenceExists,
  findMissingDocumentReferences,
} from "@/lib/data/reference-validation";
import { z } from "zod/v4";

const projectDocumentIdsSchema = z.array(z.string().trim().min(1));

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  // Extract documentIds before validation (not a project column)
  const { documentIds: rawDocumentIds, ...projectBody } = body as Record<string, unknown>;
  const parsed = updateProjectSchema.safeParse(projectBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const parsedDocumentIds =
    rawDocumentIds === undefined
      ? null
      : projectDocumentIdsSchema.safeParse(rawDocumentIds);
  if (parsedDocumentIds && !parsedDocumentIds.success) {
    return NextResponse.json(
      { error: "documentIds must be an array of non-empty IDs" },
      { status: 400 }
    );
  }
  const documentIds = parsedDocumentIds?.data;

  const [existingProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id));
  if (!existingProject) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    parsed.data.customerId &&
    !(await customerReferenceExists(parsed.data.customerId))
  ) {
    return NextResponse.json(
      { error: `Customer not found: ${parsed.data.customerId}` },
      { status: 404 }
    );
  }

  if (documentIds) {
    const missing = await findMissingDocumentReferences(documentIds);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Documents not found: ${missing.join(", ")}` },
        { status: 404 }
      );
    }
  }

  const now = new Date();
  db.transaction((tx) => {
    tx.update(projects)
      .set({ ...parsed.data, updatedAt: now })
      .where(eq(projects.id, id))
      .run();

    if (documentIds !== undefined) {
      tx
        .delete(projectDocumentDefaults)
        .where(eq(projectDocumentDefaults.projectId, id))
        .run();
      for (const docId of new Set(documentIds)) {
        tx.insert(projectDocumentDefaults)
          .values({
            id: crypto.randomUUID(),
            projectId: id,
            documentId: docId,
            createdAt: now,
          })
          .run();
      }
    }
  });

  const [updated] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const deleted = deleteProjectCascade(id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Project delete failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}
