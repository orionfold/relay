import { randomUUID } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { documents, workflowDocumentInputs, workflows } from "@/lib/db/schema";
import { PUT } from "../route";

function request(workflowId: string, documentIds: string[]) {
  return new NextRequest(`http://relay.test/api/workflows/${workflowId}/documents`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentIds }),
  });
}

describe("PUT /api/workflows/[id]/documents", () => {
  const workflowIds: string[] = [];
  const documentIds: string[] = [];

  afterEach(() => {
    if (workflowIds.length > 0) {
      db.delete(workflowDocumentInputs)
        .where(inArray(workflowDocumentInputs.workflowId, workflowIds))
        .run();
      db.delete(workflows).where(inArray(workflows.id, workflowIds)).run();
    }
    if (documentIds.length > 0) {
      db.delete(documents).where(inArray(documents.id, documentIds)).run();
    }
    workflowIds.length = 0;
    documentIds.length = 0;
  });

  function insertWorkflow() {
    const id = randomUUID();
    workflowIds.push(id);
    const now = new Date();
    db.insert(workflows)
      .values({
        id,
        name: "Binding workflow",
        definition: JSON.stringify({
          pattern: "sequence",
          steps: [{ id: "one", name: "One", prompt: "Run" }],
        }),
        status: "draft",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertDocument(name: string) {
    const id = randomUUID();
    documentIds.push(id);
    const now = new Date();
    db.insert(documents)
      .values({
        id,
        filename: `${id}.txt`,
        originalName: name,
        mimeType: "text/plain",
        size: 1,
        storagePath: `/tmp/${id}.txt`,
        direction: "input",
        status: "ready",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  it("replaces and explicitly clears workflow-level bindings", async () => {
    const workflowId = insertWorkflow();
    const first = insertDocument("first.txt");
    const second = insertDocument("second.txt");

    const initial = await PUT(request(workflowId, [first]), {
      params: Promise.resolve({ id: workflowId }),
    });
    expect(initial.status).toBe(200);

    const replaced = await PUT(request(workflowId, [second]), {
      params: Promise.resolve({ id: workflowId }),
    });
    expect(replaced.status).toBe(200);
    expect(
      db.select({ documentId: workflowDocumentInputs.documentId })
        .from(workflowDocumentInputs)
        .where(eq(workflowDocumentInputs.workflowId, workflowId))
        .all()
    ).toEqual([{ documentId: second }]);

    const cleared = await PUT(request(workflowId, []), {
      params: Promise.resolve({ id: workflowId }),
    });
    expect(cleared.status).toBe(200);
    expect(
      db.select().from(workflowDocumentInputs)
        .where(eq(workflowDocumentInputs.workflowId, workflowId))
        .all()
    ).toEqual([]);
  });

  it("refuses a missing document without disturbing existing bindings", async () => {
    const workflowId = insertWorkflow();
    const existing = insertDocument("existing.txt");
    await PUT(request(workflowId, [existing]), {
      params: Promise.resolve({ id: workflowId }),
    });

    const missingId = randomUUID();
    const refused = await PUT(request(workflowId, [missingId]), {
      params: Promise.resolve({ id: workflowId }),
    });
    expect(refused.status).toBe(404);
    expect(
      db.select({ documentId: workflowDocumentInputs.documentId })
        .from(workflowDocumentInputs)
        .where(eq(workflowDocumentInputs.workflowId, workflowId))
        .all()
    ).toEqual([{ documentId: existing }]);
  });
});
