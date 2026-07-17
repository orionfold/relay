import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { basename, extname, join } from "path";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processDocument } from "@/lib/documents/processor";
import { getAinativeUploadsDir } from "@/lib/utils/ainative-paths";
import {
  projectReferenceExists,
  taskReferenceExists,
} from "@/lib/data/reference-validation";

const UPLOAD_DIR = getAinativeUploadsDir();

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }
  const file = formData.get("file");
  const rawTaskId = formData.get("taskId");
  const rawProjectId = formData.get("projectId");
  const taskId = typeof rawTaskId === "string" && rawTaskId.trim() ? rawTaskId.trim() : null;
  const projectId =
    typeof rawProjectId === "string" && rawProjectId.trim()
      ? rawProjectId.trim()
      : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
  }

  if (taskId && !(await taskReferenceExists(taskId))) {
    return NextResponse.json(
      { error: `Task not found: ${taskId}` },
      { status: 404 }
    );
  }

  if (projectId && !(await projectReferenceExists(projectId))) {
    return NextResponse.json(
      { error: `Project not found: ${projectId}` },
      { status: 404 }
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const id = crypto.randomUUID();
  const originalName = basename(file.name) || "upload";
  const ext = extname(originalName).toLowerCase();
  const safeExt = /^\.[a-z0-9]{1,16}$/.test(ext) ? ext : "";
  const filename = `${id}${safeExt}`;
  const filepath = join(UPLOAD_DIR, filename);

  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(filepath, bytes);

  // Create document record in DB
  await db.insert(documents).values({
    id,
    taskId: taskId ?? null,
    projectId,
    filename,
    originalName,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    storagePath: filepath,
    direction: "input",
    status: "uploaded",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Fire-and-forget: trigger async document processing
  processDocument(id).catch(async (err) => {
    console.error(`[upload] Processing failed for ${id}:`, err);
    // Ensure document doesn't stay stuck in "processing" state
    try {
      await db
        .update(documents)
        .set({
          status: "error",
          processingError: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, id));
    } catch (dbErr) {
      console.error(`[upload] Failed to update error status for ${id}:`, dbErr);
    }
  });

  return NextResponse.json(
    {
      id,
      filename,
      originalName,
      size: file.size,
      type: file.type,
      taskId,
      projectId,
    },
    { status: 201 }
  );
}
