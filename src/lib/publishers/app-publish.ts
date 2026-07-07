import { createHash } from "node:crypto";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { deployments, publishTargets, type DeploymentRow, type PublishTargetRow } from "@/lib/db/schema";
import { getApp, type AppDetail, type ViewConfig } from "@/lib/apps/registry";
import { getTable, listRows } from "@/lib/data/tables";
import { getGeneratorAdapter } from "@/lib/generators/registry";
import { getPublisherAdapter } from "@/lib/publishers/registry";
import { maskPublishTarget } from "@/lib/publishers/types";
import {
  loadPreviewArtifact,
  PreviewStoreError,
  storePreviewArtifact,
} from "@/lib/publishers/preview-store";

export type AppPublishErrorCode =
  | "APP_NOT_FOUND"
  | "APP_GENERATE_NOT_CONFIGURED"
  | "APP_PUBLISH_NOT_CONFIGURED"
  | "PUBLISH_TARGET_NOT_FOUND"
  | "PUBLISH_TARGET_TYPE_MISMATCH"
  | "PUBLISH_TARGET_CONFIG_INVALID"
  | "GENERATE_TABLE_NOT_FOUND"
  | "GENERATE_ROW_INVALID"
  | "PREVIEW_NOT_FOUND"
  | "PREVIEW_EXPIRED"
  | "PREVIEW_APP_MISMATCH"
  | "PREVIEW_HASH_INVALID"
  | "PREVIEW_PATH_INVALID"
  | "PREVIEW_STALE"
  | "PUBLISH_FAILED";

export class AppPublishError extends Error {
  readonly code: AppPublishErrorCode;
  readonly statusCode: number;

  constructor(code: AppPublishErrorCode, message: string, statusCode = 400) {
    super(message);
    this.name = "AppPublishError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface CreatePublishTargetInput {
  targetType: "github-pages";
  config: Record<string, unknown>;
}

export interface TriggerPublishResult {
  deployment: DeploymentRow;
}

export interface CreatePreviewResult {
  artifactId: string;
  url: string;
  hash: string;
  createdAt: string;
  expiresAt: string;
}

export interface PreviewStatusResult {
  artifactId: string;
  hash: string;
  createdAt: string;
  expiresAt: string;
  stale: boolean;
}

type GenerateBinding = NonNullable<ViewConfig["bindings"]["generate"]>;

function requireApp(appId: string): AppDetail {
  const app = getApp(appId);
  if (!app) {
    throw new AppPublishError("APP_NOT_FOUND", "App not found", 404);
  }
  return app;
}

function parseTargetConfig(target: PublishTargetRow): Record<string, unknown> {
  try {
    const parsed = JSON.parse(target.config) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("config is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new AppPublishError(
      "PUBLISH_TARGET_CONFIG_INVALID",
      `Publish target config is invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

function deploymentError(err: unknown): string {
  if (err instanceof AppPublishError) {
    return `${err.code}: ${err.message}`;
  }
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return `UNKNOWN_ERROR: ${String(err)}`;
}

function appPublishErrorFromPreviewStore(err: PreviewStoreError): AppPublishError {
  const status =
    err.code === "PREVIEW_NOT_FOUND"
      ? 404
      : err.code === "PREVIEW_EXPIRED"
        ? 409
        : 400;
  return new AppPublishError(err.code, err.message, status);
}

function sourceFingerprint(input: {
  generate: GenerateBinding;
  rows: Record<string, unknown>[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        generatorType: input.generate.generatorType,
        table: input.generate.table,
        siteTitle: input.generate.siteTitle ?? null,
        rows: input.rows,
      })
    )
    .digest("hex");
}

async function generateArtifactForBinding(generate: GenerateBinding) {
  const rows = await loadGenerateRows(generate.table);
  const generator = getGeneratorAdapter(generate.generatorType);
  return {
    rows,
    artifact: await generator.generate(rows, { siteTitle: generate.siteTitle }),
  };
}

export function listPublishTargets(appId: string): PublishTargetRow[] {
  requireApp(appId);
  return db
    .select()
    .from(publishTargets)
    .where(eq(publishTargets.appId, appId))
    .orderBy(desc(publishTargets.createdAt))
    .all()
    .map(maskPublishTarget);
}

export function createPublishTarget(
  appId: string,
  input: CreatePublishTargetInput
): PublishTargetRow {
  requireApp(appId);
  getPublisherAdapter(input.targetType);

  const id = crypto.randomUUID();
  const now = new Date();
  db.insert(publishTargets)
    .values({
      id,
      appId,
      targetType: input.targetType,
      config: JSON.stringify(input.config),
      createdAt: now,
    })
    .run();

  const created = db
    .select()
    .from(publishTargets)
    .where(eq(publishTargets.id, id))
    .get();
  if (!created) {
    throw new AppPublishError(
      "PUBLISH_TARGET_NOT_FOUND",
      "Created publish target could not be reloaded",
      500
    );
  }
  return maskPublishTarget(created);
}

function getPublishTargetForApp(appId: string, targetId: string): PublishTargetRow {
  const target = db
    .select()
    .from(publishTargets)
    .where(and(eq(publishTargets.id, targetId), eq(publishTargets.appId, appId)))
    .get();
  if (!target) {
    throw new AppPublishError("PUBLISH_TARGET_NOT_FOUND", "Publish target not found", 404);
  }
  return target;
}

export async function testPublishTarget(appId: string, targetId: string) {
  requireApp(appId);
  const target = getPublishTargetForApp(appId, targetId);
  const adapter = getPublisherAdapter(target.targetType);
  return adapter.testConnection(parseTargetConfig(target));
}

export function listDeployments(appId: string): DeploymentRow[] {
  requireApp(appId);
  return db
    .select()
    .from(deployments)
    .where(eq(deployments.appId, appId))
    .orderBy(desc(deployments.startedAt))
    .all();
}

export function getDeployment(appId: string, deploymentId: string): DeploymentRow | null {
  requireApp(appId);
  return (
    db
      .select()
      .from(deployments)
      .where(and(eq(deployments.id, deploymentId), eq(deployments.appId, appId)))
      .get() ?? null
  );
}

export async function loadGenerateRows(tableId: string): Promise<Record<string, unknown>[]> {
  const table = await getTable(tableId);
  if (!table) {
    throw new AppPublishError(
      "GENERATE_TABLE_NOT_FOUND",
      `Generate table not found: ${tableId}`,
      400
    );
  }

  const rows = await listRows(tableId, { limit: 10_000 });
  return rows.map((row) => {
    try {
      const parsed = JSON.parse(row.data) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("row data is not an object");
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      throw new AppPublishError(
        "GENERATE_ROW_INVALID",
        `Generate row ${row.id} contains invalid JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
        500
      );
    }
  });
}

export async function createAppPreview(appId: string): Promise<CreatePreviewResult> {
  const app = requireApp(appId);
  const generate = app.manifest.view?.bindings.generate;
  if (!generate) {
    throw new AppPublishError(
      "APP_GENERATE_NOT_CONFIGURED",
      "App manifest does not declare view.bindings.generate"
    );
  }

  const { rows, artifact } = await generateArtifactForBinding(generate);
  const metadata = await storePreviewArtifact({
    appId,
    generatorType: generate.generatorType,
    sourceTable: generate.table,
    sourceFingerprint: sourceFingerprint({ generate, rows }),
    artifact,
  });
  const encodedId = encodeURIComponent(appId);
  const encodedArtifact = encodeURIComponent(metadata.artifactId);
  return {
    artifactId: metadata.artifactId,
    url: `/api/apps/${encodedId}/previews/${encodedArtifact}`,
    hash: metadata.hash,
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
  };
}

export async function getAppPreviewStatus(
  appId: string,
  artifactId: string
): Promise<PreviewStatusResult> {
  const app = requireApp(appId);
  const generate = app.manifest.view?.bindings.generate;
  if (!generate) {
    throw new AppPublishError(
      "APP_GENERATE_NOT_CONFIGURED",
      "App manifest does not declare view.bindings.generate"
    );
  }

  try {
    const preview = await loadPreviewArtifact(appId, artifactId);
    if (
      preview.metadata.generatorType !== generate.generatorType ||
      preview.metadata.sourceTable !== generate.table
    ) {
      throw new AppPublishError(
        "PREVIEW_APP_MISMATCH",
        "Preview artifact does not match the app generate binding"
      );
    }

    const rows = await loadGenerateRows(generate.table);
    const currentFingerprint = sourceFingerprint({ generate, rows });
    return {
      artifactId: preview.metadata.artifactId,
      hash: preview.metadata.hash,
      createdAt: preview.metadata.createdAt,
      expiresAt: preview.metadata.expiresAt,
      stale: preview.metadata.sourceFingerprint !== currentFingerprint,
    };
  } catch (err) {
    if (err instanceof PreviewStoreError) {
      throw appPublishErrorFromPreviewStore(err);
    }
    throw err;
  }
}

function createDeploymentRow(appId: string, targetId: string): DeploymentRow {
  const id = crypto.randomUUID();
  const now = new Date();
  db.insert(deployments)
    .values({
      id,
      appId,
      targetId,
      status: "pending",
      startedAt: now,
    })
    .run();

  const deployment = db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
    .get();
  if (!deployment) {
    throw new AppPublishError("PUBLISH_FAILED", "Deployment could not be created", 500);
  }
  return deployment;
}

export async function runDeployment(
  deploymentId: string,
  artifactId?: string
): Promise<DeploymentRow> {
  const deployment = db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .get();
  if (!deployment) {
    throw new AppPublishError("PUBLISH_FAILED", "Deployment not found", 404);
  }

  try {
    db.update(deployments)
      .set({ status: "publishing" })
      .where(eq(deployments.id, deploymentId))
      .run();

    const app = requireApp(deployment.appId);
    const generate = app.manifest.view?.bindings.generate;
    const publish = app.manifest.view?.bindings.publish;
    if (!generate) {
      throw new AppPublishError(
        "APP_GENERATE_NOT_CONFIGURED",
        "App manifest does not declare view.bindings.generate"
      );
    }
    if (!publish) {
      throw new AppPublishError(
        "APP_PUBLISH_NOT_CONFIGURED",
        "App manifest does not declare view.bindings.publish"
      );
    }

    const target = getPublishTargetForApp(deployment.appId, deployment.targetId);
    if (target.targetType !== publish.targetType) {
      throw new AppPublishError(
        "PUBLISH_TARGET_TYPE_MISMATCH",
        `Publish target type ${target.targetType} does not match manifest target ${publish.targetType}`
      );
    }

    let artifact;
    if (artifactId) {
      try {
        const preview = await loadPreviewArtifact(deployment.appId, artifactId);
        if (
          preview.metadata.generatorType !== generate.generatorType ||
          preview.metadata.sourceTable !== generate.table
        ) {
          throw new AppPublishError(
            "PREVIEW_APP_MISMATCH",
            "Preview artifact does not match the app generate binding"
          );
        }
        const rows = await loadGenerateRows(generate.table);
        const currentFingerprint = sourceFingerprint({ generate, rows });
        if (preview.metadata.sourceFingerprint !== currentFingerprint) {
          throw new AppPublishError(
            "PREVIEW_STALE",
            "Preview artifact is stale; generate a new preview before publishing",
            409
          );
        }
        artifact = preview.artifact;
      } catch (err) {
        if (err instanceof PreviewStoreError) {
          throw appPublishErrorFromPreviewStore(err);
        }
        throw err;
      }
    } else {
      artifact = (await generateArtifactForBinding(generate)).artifact;
    }
    const publisher = getPublisherAdapter(target.targetType);
    const result = await publisher.publish(artifact, parseTargetConfig(target));
    const finishedAt = new Date();

    if (!result.success) {
      throw new AppPublishError(
        "PUBLISH_FAILED",
        result.error ?? "Publisher returned failure",
        502
      );
    }

    db.update(deployments)
      .set({
        status: "success",
        url: result.url ?? null,
        finalUrl: result.finalUrl ?? null,
        commit: result.commit ?? null,
        artifactHash: artifact.hash,
        finishedAt,
        error: null,
      })
      .where(eq(deployments.id, deploymentId))
      .run();
  } catch (err) {
    db.update(deployments)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: deploymentError(err),
      })
      .where(eq(deployments.id, deploymentId))
      .run();
  }

  return db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .get()!;
}

export function triggerAppPublish(
  appId: string,
  targetId: string
): TriggerPublishResult {
  requireApp(appId);
  getPublishTargetForApp(appId, targetId);
  const deployment = createDeploymentRow(appId, targetId);
  return { deployment };
}
