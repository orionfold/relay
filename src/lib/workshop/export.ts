import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { and, asc, eq } from "drizzle-orm";
import { dataDir } from "@/lib/config/env";
import { db } from "@/lib/db";
import {
  documents,
  operationsReceipts,
  workshopRuns,
} from "@/lib/db/schema";
import { buildAppPackArtifact } from "@/lib/packs/app-exporter";
import { WorkshopError } from "@/lib/workshop/errors";
import { markWorkshopRetained } from "@/lib/workshop/runs";

const FIXED_ZIP_DATE = new Date("2000-01-01T00:00:00.000Z");

function hash(content: Buffer | string): string {
  return crypto
    .createHash("sha256")
    .update(Buffer.isBuffer(content) ? content : Buffer.from(content))
    .digest("hex");
}

function safeArchiveSegment(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "output";
}

function assertRedacted(files: Array<{ path: string; content: Buffer | string }>) {
  const forbidden = [
    /\/Users\//,
    /\\Users\\/,
    /(?:api[_-]?key|token|secret)\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  for (const file of files) {
    const text = Buffer.isBuffer(file.content)
      ? file.content.toString("utf8")
      : file.content;
    if (forbidden.some((pattern) => pattern.test(text))) {
      throw new WorkshopError(
        "redaction_failed",
        `Completion export blocked because "${file.path}" contains a secret or local-path pattern.`,
        "Remove or redact the sensitive value, then export again."
      );
    }
  }
}

export async function buildWorkshopCompletionBundle(id: string): Promise<Buffer> {
  const [run] = await db.select().from(workshopRuns).where(eq(workshopRuns.id, id));
  if (!run?.appId || !run.receiptId || !run.projectId) {
    throw new WorkshopError(
      "evidence_unavailable",
      "Workshop completion evidence is not terminal yet.",
      "Complete a workflow run or deterministic rehearsal before exporting."
    );
  }
  const [receipt] = await db
    .select()
    .from(operationsReceipts)
    .where(eq(operationsReceipts.id, run.receiptId));
  if (!receipt) {
    throw new WorkshopError(
      "evidence_unavailable",
      "The Operations Receipt is missing.",
      "Reconcile the terminal workflow receipt and retry."
    );
  }
  const appArtifact = await buildAppPackArtifact(run.appId, {
    includeSampleData: true,
  });
  const outputRows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.projectId, run.projectId),
        eq(documents.direction, "output")
      )
    )
    .orderBy(asc(documents.createdAt));

  const files: Array<{ path: string; content: Buffer | string }> = [];
  const manifest = {
    schemaVersion: 1,
    workshop: {
      editionId: run.editionId,
      editionVersion: run.editionVersion,
      editionHash: run.editionHash,
      runId: run.id,
      status: receipt.verdict === "passed" ? "completed" : "at_risk",
      fallbackUsed: run.fallbackUsed,
    },
    relay: {
      appId: run.appId,
      projectId: run.projectId,
      workflowId: run.workflowId,
      receiptId: receipt.id,
    },
    limitations: [
      ...(run.fallbackUsed
        ? ["A deterministic rehearsal was used; no model/provider call occurred."]
        : []),
      "Bundle excludes credentials, absolute local paths, unrelated workspace data and unselected transcripts.",
    ],
  };
  files.push({
    path: "completion/manifest.json",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  files.push({
    path: "completion/operations-receipt.json",
    content: `${JSON.stringify(
      {
        id: receipt.id,
        sourceKey: receipt.sourceKey,
        verdict: receipt.verdict,
        criteria: JSON.parse(receipt.criteriaSnapshot),
        evidence: JSON.parse(receipt.evidence),
        summary: receipt.summary,
        nextAction: receipt.nextAction,
        startedAt: receipt.startedAt?.toISOString() ?? null,
        finishedAt: receipt.finishedAt.toISOString(),
      },
      null,
      2
    )}\n`,
  });
  for (const artifactFile of appArtifact.files) {
    files.push({
      path: `capstone-pack/${artifactFile.path}`,
      content: artifactFile.content,
    });
  }

  const root = fs.realpathSync(path.resolve(dataDir()));
  const skippedOutputs: string[] = [];
  const usedOutputNames = new Set<string>();
  for (const output of outputRows) {
    const resolved = path.resolve(output.storagePath);
    let realPath: string | null = null;
    try {
      const stat = fs.lstatSync(resolved);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        skippedOutputs.push(output.originalName);
        continue;
      }
      realPath = fs.realpathSync(resolved);
    } catch {
      realPath = null;
    }
    if (
      !realPath ||
      !realPath.startsWith(`${root}${path.sep}`) ||
      !fs.statSync(realPath).isFile()
    ) {
      skippedOutputs.push(output.originalName);
      continue;
    }
    const baseName = safeArchiveSegment(path.basename(output.originalName));
    const archiveName = usedOutputNames.has(baseName)
      ? `${safeArchiveSegment(output.id)}-${baseName}`
      : baseName;
    usedOutputNames.add(archiveName);
    files.push({
      path: `outputs/${archiveName}`,
      content: fs.readFileSync(realPath),
    });
  }
  files.push({
    path: "completion/limitations.md",
    content: [
      "# Limitations",
      "",
      ...(manifest.limitations.map((item) => `- ${item}`)),
      ...(skippedOutputs.length > 0
        ? [
            `- ${skippedOutputs.length} output(s) were omitted because their stored path was unavailable or outside Relay's data directory.`,
          ]
        : []),
      "",
    ].join("\n"),
  });
  assertRedacted(files);
  const hashes = Object.fromEntries(
    files
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => [file.path, hash(file.content)])
  );
  files.push({
    path: "completion/hashes.json",
    content: `${JSON.stringify(hashes, null, 2)}\n`,
  });

  const zip = new JSZip();
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    zip.file(file.path, file.content, {
      date: FIXED_ZIP_DATE,
      createFolders: false,
    });
  }
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
  await markWorkshopRetained(id);
  return buffer;
}
