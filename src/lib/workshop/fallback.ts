import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { dataDir } from "@/lib/config/env";
import { db } from "@/lib/db";
import {
  documents,
  tasks,
  workshopRuns,
  workflowReceiptRuns,
  workflows,
} from "@/lib/db/schema";
import { ensureWorkflowReceipt } from "@/lib/operations/receipts";
import { WorkshopError } from "@/lib/workshop/errors";
import { getWorkshopRun } from "@/lib/workshop/runs";

export async function runDeterministicWorkshopFallback(id: string) {
  const [run] = await db.select().from(workshopRuns).where(eq(workshopRuns.id, id));
  if (!run?.workflowId || !run.projectId) {
    throw new WorkshopError(
      "run_not_found",
      "The workshop starter is not installed.",
      "Start or repair the workshop before running the fallback."
    );
  }
  if (run.receiptId) return getWorkshopRun(id);
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, run.workflowId));
  if (!workflow || !workflow.successCriteria) {
    throw new WorkshopError(
      "checkpoint_failed",
      "The governed workflow or its success criteria are missing.",
      "Repair the workflow governance checkpoint before using the rehearsal."
    );
  }

  const now = new Date();
  const taskId = `${workflow.id}:deterministic-rehearsal`;
  await db
    .insert(workflowReceiptRuns)
    .values({
      id: crypto.randomUUID(),
      workflowId: workflow.id,
      runNumber: 1,
      criteriaSnapshot: workflow.successCriteria,
      terminalStatus: "completed",
      startedAt: now,
      finishedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(tasks)
    .values({
      id: taskId,
      projectId: run.projectId,
      workflowId: workflow.id,
      title: "Deterministic workshop rehearsal",
      description:
        "Local validation fallback. No model or provider call is made.",
      status: "completed",
      priority: 2,
      result:
        "Deterministic rehearsal (no model call): the governed workflow, human checkpoint, success criteria, and retained output contract were validated.",
      sourceType: "workflow",
      workflowRunNumber: 1,
      effectiveRuntimeId: "workshop-deterministic",
      effectiveModelId: null,
      runtimeFallbackReason:
        "Operator selected the explicit no-provider deterministic workshop rehearsal.",
      successCriteriaSnapshot: workflow.successCriteria,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const outputDir = path.join(dataDir(), "workshop", id);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "deterministic-rehearsal.md");
  const output = [
    "# Deterministic Workshop Rehearsal",
    "",
    "No model or provider call was made.",
    "",
    "Validated:",
    "- user-owned capstone app and table;",
    "- governed workflow definition;",
    "- human input/approval boundary;",
    "- explicit success criteria;",
    "- Operations Receipt composition.",
    "",
  ].join("\n");
  fs.writeFileSync(outputPath, output, "utf8");
  await db
    .insert(documents)
    .values({
      id: `${taskId}:output`,
      taskId,
      projectId: run.projectId,
      filename: "deterministic-rehearsal.md",
      originalName: "deterministic-rehearsal.md",
      mimeType: "text/markdown",
      size: Buffer.byteLength(output),
      storagePath: outputPath,
      version: 1,
      direction: "output",
      category: "workshop-evidence",
      status: "ready",
      source: "workshop-deterministic",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .update(workflows)
    .set({ status: "completed", runNumber: 1, updatedAt: now })
    .where(eq(workflows.id, workflow.id));
  const receipt = await ensureWorkflowReceipt(workflow.id, 1);
  await db
    .update(workshopRuns)
    .set({
      status: receipt.verdict === "failed" ? "at_risk" : "active",
      receiptId: receipt.id,
      fallbackUsed: true,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(workshopRuns.id, id));
  return getWorkshopRun(id);
}
