import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { documents, tasks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { dataDir } from "@/lib/config/env";
import { processDocument } from "./processor";

const TASK_OUTPUTS_DIR = path.join(dataDir(), "outputs");
const OUTPUT_ARCHIVE_DIR = path.join(dataDir(), "documents", "output");

const OUTPUT_MIME_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".csv": "text/csv",
  ".html": "text/html",
};

export function getTaskOutputDirectory(taskId: string): string {
  return path.join(TASK_OUTPUTS_DIR, taskId);
}

export async function prepareTaskOutputDirectory(
  taskId: string,
  options: { clearExisting?: boolean } = {}
): Promise<string> {
  const outputDir = getTaskOutputDirectory(taskId);

  if (options.clearExisting) {
    await fs.rm(outputDir, { recursive: true, force: true });
  }

  await fs.mkdir(outputDir, { recursive: true });
  return outputDir;
}

export function buildTaskOutputInstructions(taskId: string): string {
  const outputDir = getTaskOutputDirectory(taskId);
  return [
    "Generated file outputs:",
    `- Write any final files to ${outputDir}`,
    "- Files in .md, .json, .csv, .txt, and .html are automatically captured after completion",
    "- Keep the final filename stable if you want ainative to version rerun outputs cleanly",
  ].join("\n");
}

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursively(resolved);
      }
      return [resolved];
    })
  );

  return files.flat();
}

function resolveOutputMimeType(filename: string): string | null {
  return OUTPUT_MIME_TYPES[path.extname(filename).toLowerCase()] ?? null;
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}

function buildArchivedFilename(relativePath: string, version: number): string {
  const parsed = path.parse(relativePath);
  const sanitizedBase = parsed.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const nestedPrefix = parsed.dir
    ? `${parsed.dir.replace(/[\\/]+/g, "__")}__`
    : "";
  return `${nestedPrefix}${sanitizedBase || "output"}-v${version}${parsed.ext}`;
}

export async function scanTaskOutputDocuments(taskId: string): Promise<string[]> {
  const outputDir = getTaskOutputDirectory(taskId);
  const [task] = await db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId));

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  try {
    await fs.access(outputDir);
  } catch {
    return [];
  }

  const existingOutputDocs = await db
    .select({
      originalName: documents.originalName,
      version: documents.version,
    })
    .from(documents)
    .where(
      and(eq(documents.taskId, taskId), eq(documents.direction, "output"))
    );

  const versionMap = new Map<string, number>();
  existingOutputDocs.forEach((doc) => {
    versionMap.set(
      doc.originalName,
      Math.max(versionMap.get(doc.originalName) ?? 0, doc.version)
    );
  });

  const discoveredFiles = await listFilesRecursively(outputDir);
  const registeredDocumentIds: string[] = [];

  for (const sourcePath of discoveredFiles) {
    const relativePath = normalizeRelativePath(path.relative(outputDir, sourcePath));
    const mimeType = resolveOutputMimeType(relativePath);
    if (!mimeType) {
      continue;
    }

    const stats = await fs.stat(sourcePath);
    if (!stats.isFile()) {
      continue;
    }

    const nextVersion = (versionMap.get(relativePath) ?? 0) + 1;
    versionMap.set(relativePath, nextVersion);

    const archiveDir = path.join(OUTPUT_ARCHIVE_DIR, taskId);
    await fs.mkdir(archiveDir, { recursive: true });

    const archivedFilename = buildArchivedFilename(relativePath, nextVersion);
    const archivedPath = path.join(archiveDir, archivedFilename);
    await fs.copyFile(sourcePath, archivedPath);

    const documentId = crypto.randomUUID();
    const now = new Date();

    await db.insert(documents).values({
      id: documentId,
      taskId,
      projectId: task.projectId ?? null,
      filename: archivedFilename,
      originalName: relativePath,
      mimeType,
      size: stats.size,
      storagePath: archivedPath,
      version: nextVersion,
      direction: "output",
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    });

    await processDocument(documentId);
    registeredDocumentIds.push(documentId);
  }

  return registeredDocumentIds;
}
