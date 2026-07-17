import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, tasks, projects, workflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { unlink } from "fs/promises";
import { z } from "zod/v4";

import { processDocument } from "@/lib/documents/processor";
import {
  projectReferenceExists,
  taskReferenceExists,
} from "@/lib/data/reference-validation";

const documentPatchSchema = z.object({
  taskId: z.string().trim().min(1).nullable().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  category: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  reprocess: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [doc] = await db
    .select({
      id: documents.id,
      taskId: documents.taskId,
      projectId: documents.projectId,
      filename: documents.filename,
      originalName: documents.originalName,
      mimeType: documents.mimeType,
      size: documents.size,
      storagePath: documents.storagePath,
      version: documents.version,
      direction: documents.direction,
      category: documents.category,
      status: documents.status,
      extractedText: documents.extractedText,
      processedPath: documents.processedPath,
      processingError: documents.processingError,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      taskTitle: tasks.title,
      projectName: projects.name,
      workflowId: workflows.id,
      workflowName: workflows.name,
      workflowRunNumber: tasks.workflowRunNumber,
    })
    .from(documents)
    .leftJoin(tasks, eq(documents.taskId, tasks.id))
    .leftJoin(workflows, eq(tasks.workflowId, workflows.id))
    .leftJoin(projects, eq(documents.projectId, projects.id))
    .where(eq(documents.id, id));

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json(doc);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = documentPatchSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const body = parsed.data;

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id));

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (
    body.taskId !== undefined &&
    body.taskId !== null &&
    !(await taskReferenceExists(body.taskId))
  ) {
    return NextResponse.json(
      { error: `Task not found: ${body.taskId}` },
      { status: 404 }
    );
  }

  if (
    body.projectId !== undefined &&
    body.projectId !== null &&
    !(await projectReferenceExists(body.projectId))
  ) {
    return NextResponse.json(
      { error: `Project not found: ${body.projectId}` },
      { status: 404 }
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if ("taskId" in body) updates.taskId = body.taskId;
  if ("projectId" in body) updates.projectId = body.projectId;
  if ("category" in body && typeof body.category === "string") updates.category = body.category;

  // Merge metadata into category field (JSON)
  if (body.metadata) {
    const existing = doc.category ? (() => { try { return JSON.parse(doc.category); } catch { return {}; } })() : {};
    updates.category = JSON.stringify({ ...existing, ...body.metadata });
  }

  // Reprocess: clear extracted fields and re-run
  if (body.reprocess) {
    updates.extractedText = null;
    updates.processedPath = null;
    updates.processingError = null;
    updates.status = "processing";
  }

  await db
    .update(documents)
    .set(updates)
    .where(eq(documents.id, id));

  if (body.reprocess) {
    processDocument(id).catch((error) => {
      console.error(`[documents] Reprocessing dispatch failed for ${id}:`, error);
    });
  }

  const [updated] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id));

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const cascadeDelete = url.searchParams.get("cascadeDelete") === "true";

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id));

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Cascade safety: if linked to a task and cascadeDelete not set, reject
  if (doc.taskId && !cascadeDelete) {
    return NextResponse.json(
      { error: `Document is linked to task ${doc.taskId}. Add ?cascadeDelete=true to confirm.` },
      { status: 409 }
    );
  }

  try {
    await unlink(doc.storagePath);
  } catch {
    // File may already be deleted
  }

  await db.delete(documents).where(eq(documents.id, id));

  return new NextResponse(null, { status: 204 });
}
