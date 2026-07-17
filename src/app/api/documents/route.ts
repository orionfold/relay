import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, tasks, projects, workflows } from "@/lib/db/schema";
import { eq, and, like, or, desc } from "drizzle-orm";
import { access, stat, copyFile, mkdir } from "fs/promises";
import path, { basename, extname, join } from "path";
import { homedir } from "os";
import crypto from "crypto";
import { getAinativeUploadsDir } from "@/lib/utils/ainative-paths";
import { processDocument } from "@/lib/documents/processor";
import { z } from "zod/v4";
import {
  projectReferenceExists,
  taskReferenceExists,
} from "@/lib/data/reference-validation";

const VALID_DOC_STATUSES = ["uploaded", "processing", "ready", "error"] as const;
const VALID_DOC_DIRECTIONS = ["input", "output"] as const;
type DocStatus = typeof VALID_DOC_STATUSES[number];
type DocDirection = typeof VALID_DOC_DIRECTIONS[number];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const taskId = url.searchParams.get("taskId");
  const projectId = url.searchParams.get("projectId");
  const status = url.searchParams.get("status");
  const direction = url.searchParams.get("direction");
  const search = url.searchParams.get("search");

  if (status && !VALID_DOC_STATUSES.includes(status as DocStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_DOC_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  if (direction && !VALID_DOC_DIRECTIONS.includes(direction as DocDirection)) {
    return NextResponse.json(
      { error: `Invalid direction. Must be one of: ${VALID_DOC_DIRECTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const conditions = [];

  if (id) conditions.push(eq(documents.id, id));
  if (taskId) conditions.push(eq(documents.taskId, taskId));
  if (projectId) conditions.push(eq(documents.projectId, projectId));
  if (status) conditions.push(eq(documents.status, status as DocStatus));
  if (direction) conditions.push(eq(documents.direction, direction as DocDirection));

  if (search) {
    conditions.push(
      or(
        like(documents.originalName, `%${search}%`),
        like(documents.extractedText, `%${search}%`)
      )
    );
  }

  const result = await db
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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documents.createdAt));

  return NextResponse.json(result);
}

const MIME_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".csv": "text/csv",
  ".html": "text/html",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const uploadSchema = z.object({
  file_path: z.string().min(1),
  taskId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  direction: z.enum(["input", "output"]).optional().default("output"),
  metadata: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = uploadSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // Path traversal protection: resolve and validate the file path
  const resolvedPath = path.resolve(body.file_path);
  const home = homedir();
  const SENSITIVE_PREFIXES = ["/etc", "/var", "/proc", "/sys", "/dev", "/root"];
  const SENSITIVE_HOME_DIRS = [".ssh", ".gnupg", ".aws", ".config", ".env"];

  if (SENSITIVE_PREFIXES.some((prefix) => resolvedPath.startsWith(prefix))) {
    return NextResponse.json(
      { error: "Access denied: path points to a restricted system directory" },
      { status: 403 }
    );
  }

  if (resolvedPath.startsWith(home)) {
    const relativeToHome = resolvedPath.slice(home.length + 1);
    if (SENSITIVE_HOME_DIRS.some((dir) => relativeToHome.startsWith(dir))) {
      return NextResponse.json(
        { error: "Access denied: path points to a sensitive home directory" },
        { status: 403 }
      );
    }
  } else if (!resolvedPath.startsWith("/tmp")) {
    // Outside home and not /tmp — reject
    return NextResponse.json(
      { error: "Access denied: path must be under the user's home directory or /tmp" },
      { status: 403 }
    );
  }

  try {
    await access(resolvedPath);
  } catch {
    return NextResponse.json({ error: `File not found: ${body.file_path}` }, { status: 400 });
  }

  const stats = await stat(resolvedPath);
  if (!stats.isFile()) {
    return NextResponse.json({ error: `Not a file: ${body.file_path}` }, { status: 400 });
  }

  if (body.taskId && !(await taskReferenceExists(body.taskId))) {
    return NextResponse.json(
      { error: `Task not found: ${body.taskId}` },
      { status: 404 }
    );
  }

  if (body.projectId && !(await projectReferenceExists(body.projectId))) {
    return NextResponse.json(
      { error: `Project not found: ${body.projectId}` },
      { status: 404 }
    );
  }

  const originalName = basename(resolvedPath);
  const ext = extname(originalName).toLowerCase();
  const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";
  const id = crypto.randomUUID();
  const filename = `${id}${ext}`;

  const uploadsDir = getAinativeUploadsDir();
  await mkdir(uploadsDir, { recursive: true });
  const storagePath = join(uploadsDir, filename);
  await copyFile(resolvedPath, storagePath);

  const now = new Date();
  await db.insert(documents).values({
    id,
    taskId: body.taskId ?? null,
    projectId: body.projectId ?? null,
    filename,
    originalName,
    mimeType,
    size: stats.size,
    storagePath,
    version: 1,
    direction: body.direction,
    status: "uploaded",
    createdAt: now,
    updatedAt: now,
  });

  // Fire-and-forget preprocessing
  processDocument(id).catch((error) => {
    console.error(`[documents] Processing dispatch failed for ${id}:`, error);
  });

  return NextResponse.json(
    { documentId: id, status: "uploaded", processingStatus: "queued", originalName, mimeType, size: stats.size },
    { status: 201 }
  );
}
