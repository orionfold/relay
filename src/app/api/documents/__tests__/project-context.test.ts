/** @vitest-environment node */

import { randomUUID } from "crypto";
import { rmSync, writeFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { documents, projects, tasks } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({ processDocument: vi.fn() }));
vi.mock("@/lib/documents/processor", () => ({
  processDocument: mocks.processDocument,
}));

import { POST as UPLOAD } from "../../uploads/route";
import { POST as UPLOAD_PATH } from "../route";
import { PATCH as PATCH_DOCUMENT } from "../[id]/route";

function patchRequest(id: string, body: unknown) {
  return new NextRequest(`http://relay.test/api/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("document project context", () => {
  const projectIds: string[] = [];
  const taskIds: string[] = [];
  const documentIds: string[] = [];
  const temporaryPaths: string[] = [];

  beforeEach(() => {
    mocks.processDocument.mockReset();
    mocks.processDocument.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (documentIds.length > 0) {
      db.delete(documents).where(inArray(documents.id, documentIds)).run();
    }
    if (taskIds.length > 0) {
      db.delete(tasks).where(inArray(tasks.id, taskIds)).run();
    }
    if (projectIds.length > 0) {
      db.delete(projects).where(inArray(projects.id, projectIds)).run();
    }
    projectIds.length = 0;
    taskIds.length = 0;
    documentIds.length = 0;
    for (const path of temporaryPaths) rmSync(path, { force: true });
    temporaryPaths.length = 0;
  });

  function insertProject(name: string) {
    const id = randomUUID();
    projectIds.push(id);
    const now = new Date();
    db.insert(projects)
      .values({ id, name, status: "active", createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertTask(projectId: string) {
    const id = randomUUID();
    taskIds.push(id);
    const now = new Date();
    db.insert(tasks)
      .values({
        id,
        projectId,
        title: "Document task",
        status: "planned",
        priority: 2,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertDocument(projectId: string | null = null) {
    const id = randomUUID();
    documentIds.push(id);
    const now = new Date();
    db.insert(documents)
      .values({
        id,
        projectId,
        filename: `${id}.txt`,
        originalName: "context.txt",
        mimeType: "text/plain",
        size: 7,
        storagePath: `/tmp/${id}.txt`,
        direction: "input",
        status: "ready",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  it("persists a validated project on multipart upload", async () => {
    const projectId = insertProject("Upload project");
    const form = new FormData();
    form.append(
      "file",
      new File(["context"], "../../context.txt", { type: "text/plain" })
    );
    form.append("projectId", projectId);

    const response = await UPLOAD(
      new NextRequest("http://relay.test/api/uploads", { method: "POST", body: form })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    documentIds.push(body.id);
    expect(body.projectId).toBe(projectId);
    const row = db.select().from(documents)
      .where(inArray(documents.id, [body.id]))
      .get();
    expect(row).toMatchObject({ projectId, originalName: "context.txt" });
    expect(row?.filename).toMatch(new RegExp(`^${body.id}\\.txt$`));
    if (row?.storagePath) temporaryPaths.push(row.storagePath);
    expect(mocks.processDocument).toHaveBeenCalledWith(body.id);
  });

  it("refuses a missing upload project before creating a document", async () => {
    const missingId = randomUUID();
    const form = new FormData();
    form.append("file", new File(["context"], "context.txt", { type: "text/plain" }));
    form.append("projectId", missingId);

    const response = await UPLOAD(
      new NextRequest("http://relay.test/api/uploads", { method: "POST", body: form })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: `Project not found: ${missingId}` });
    expect(mocks.processDocument).not.toHaveBeenCalled();
  });

  it("validates and persists project context for file-path uploads", async () => {
    const projectId = insertProject("File path project");
    const sourcePath = `/tmp/g097-${randomUUID()}.txt`;
    temporaryPaths.push(sourcePath);
    writeFileSync(sourcePath, "project context", "utf8");

    const response = await UPLOAD_PATH(
      new NextRequest("http://relay.test/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: sourcePath, projectId, direction: "input" }),
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    documentIds.push(body.documentId);
    const row = db.select().from(documents)
      .where(inArray(documents.id, [body.documentId]))
      .get();
    expect(row).toMatchObject({ projectId, originalName: sourcePath.split("/").at(-1) });
    if (row?.storagePath) temporaryPaths.push(row.storagePath);

    const missingId = randomUUID();
    const refused = await UPLOAD_PATH(
      new NextRequest("http://relay.test/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: sourcePath, projectId: missingId }),
      })
    );
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: `Project not found: ${missingId}` });
  });

  it("validates project/task reassignment and preserves explicit null clearing", async () => {
    const projectId = insertProject("Destination project");
    const taskId = insertTask(projectId);
    const documentId = insertDocument();

    const linked = await PATCH_DOCUMENT(
      patchRequest(documentId, { projectId, taskId }),
      { params: Promise.resolve({ id: documentId }) }
    );
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({ projectId, taskId });

    const missingId = randomUUID();
    const refused = await PATCH_DOCUMENT(
      patchRequest(documentId, { projectId: missingId }),
      { params: Promise.resolve({ id: documentId }) }
    );
    expect(refused.status).toBe(404);

    const cleared = await PATCH_DOCUMENT(
      patchRequest(documentId, { projectId: null, taskId: null }),
      { params: Promise.resolve({ id: documentId }) }
    );
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({ projectId: null, taskId: null });
  });
});
