import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  workflowDocumentInputs,
  documents,
  workflows,
} from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { findMissingDocumentReferences } from "@/lib/data/reference-validation";

type RouteContext = { params: Promise<{ id: string }> };

const documentBindingSchema = z.object({
  documentIds: z.array(z.string().trim().min(1)),
  stepId: z.string().trim().min(1).optional(),
});

/**
 * GET /api/workflows/[id]/documents
 * List all document bindings for a workflow, with document metadata.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { id: workflowId } = await context.params;

  try {
    const bindings = await db
      .select()
      .from(workflowDocumentInputs)
      .where(eq(workflowDocumentInputs.workflowId, workflowId));

    if (bindings.length === 0) {
      return NextResponse.json([]);
    }

    const docIds = bindings.map((b) => b.documentId);
    const docs = await db
      .select()
      .from(documents)
      .where(inArray(documents.id, docIds));

    const docMap = new Map(docs.map((d) => [d.id, d]));

    const result = bindings.map((binding) => {
      const doc = docMap.get(binding.documentId);
      return {
        bindingId: binding.id,
        documentId: binding.documentId,
        stepId: binding.stepId,
        createdAt: binding.createdAt,
        document: doc
          ? {
              id: doc.id,
              originalName: doc.originalName,
              filename: doc.filename,
              mimeType: doc.mimeType,
              size: doc.size,
              direction: doc.direction,
              status: doc.status,
              category: doc.category,
            }
          : null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[workflow-documents] GET failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow documents" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workflows/[id]/documents
 * Attach document IDs to a workflow.
 * Body: { documentIds: string[], stepId?: string }
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id: workflowId } = await context.params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const parsed = documentBindingSchema.safeParse(rawBody);
    if (!parsed.success || parsed.data.documentIds.length === 0) {
      return NextResponse.json(
        { error: "documentIds must be a non-empty array" },
        { status: 400 }
      );
    }
    const { stepId } = parsed.data;
    const documentIds = [...new Set(parsed.data.documentIds)];

    // Verify workflow exists
    const [workflow] = await db
      .select({ id: workflows.id, projectId: workflows.projectId })
      .from(workflows)
      .where(eq(workflows.id, workflowId));

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // Verify all documents exist
    const missing = await findMissingDocumentReferences(documentIds);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Documents not found: ${missing.join(", ")}` },
        { status: 404 }
      );
    }

    // Insert bindings (ignore duplicates via ON CONFLICT)
    const now = new Date();
    const values = documentIds.map((docId) => ({
      id: crypto.randomUUID(),
      workflowId,
      documentId: docId,
      stepId: stepId ?? null,
      createdAt: now,
    }));

    for (const value of values) {
      try {
        await db.insert(workflowDocumentInputs).values(value);
      } catch (err) {
        // Skip duplicates (unique constraint violation)
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("UNIQUE constraint")) throw err;
      }
    }

    return NextResponse.json(
      { attached: documentIds.length, workflowId, stepId: stepId ?? null },
      { status: 201 }
    );
  } catch (error) {
    console.error("[workflow-documents] POST failed:", error);
    return NextResponse.json(
      { error: "Failed to attach documents" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workflows/[id]/documents
 * Replace workflow-level document bindings. Step-scoped bindings are retained.
 * Body: { documentIds: string[] }
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const { id: workflowId } = await context.params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const parsed = documentBindingSchema.safeParse(rawBody);
    if (!parsed.success || parsed.data.stepId !== undefined) {
      return NextResponse.json(
        { error: "documentIds must be an array; stepId is not accepted for replacement" },
        { status: 400 }
      );
    }
    const documentIds = [...new Set(parsed.data.documentIds)];

    const [workflow] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.id, workflowId));
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const missing = await findMissingDocumentReferences(documentIds);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Documents not found: ${missing.join(", ")}` },
        { status: 404 }
      );
    }

    const now = new Date();
    db.transaction((tx) => {
      tx.delete(workflowDocumentInputs)
        .where(
          and(
            eq(workflowDocumentInputs.workflowId, workflowId),
            isNull(workflowDocumentInputs.stepId)
          )
        )
        .run();

      for (const documentId of documentIds) {
        tx.insert(workflowDocumentInputs)
          .values({
            id: crypto.randomUUID(),
            workflowId,
            documentId,
            stepId: null,
            createdAt: now,
          })
          .run();
      }
    });

    return NextResponse.json({ updated: documentIds.length, workflowId });
  } catch (error) {
    console.error("[workflow-documents] PUT failed:", error);
    return NextResponse.json(
      { error: "Failed to replace workflow documents" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workflows/[id]/documents
 * Remove document bindings from a workflow.
 * Body: { documentIds: string[], stepId?: string }
 * If no body, removes all bindings.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const { id: workflowId } = await context.params;

  try {
    let body: { documentIds?: string[]; stepId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body = remove all
    }

    const { documentIds, stepId } = body;

    if (documentIds && documentIds.length > 0) {
      // Remove specific bindings
      for (const docId of documentIds) {
        const conditions = [
          eq(workflowDocumentInputs.workflowId, workflowId),
          eq(workflowDocumentInputs.documentId, docId),
        ];
        if (stepId !== undefined) {
          conditions.push(eq(workflowDocumentInputs.stepId, stepId));
        }
        await db
          .delete(workflowDocumentInputs)
          .where(and(...conditions));
      }
    } else {
      // Remove all bindings for this workflow
      await db
        .delete(workflowDocumentInputs)
        .where(eq(workflowDocumentInputs.workflowId, workflowId));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[workflow-documents] DELETE failed:", error);
    return NextResponse.json(
      { error: "Failed to remove document bindings" },
      { status: 500 }
    );
  }
}
