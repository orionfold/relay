import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deployments, publishTargets, type DeploymentRow } from "@/lib/db/schema";
import { getApp } from "@/lib/apps/registry";
import { buildAppPackArtifact } from "@/lib/packs/app-exporter";
import { getPublisherAdapter } from "./registry";

export type PackPublishErrorCode =
  | "APP_NOT_FOUND"
  | "PACK_TARGET_NOT_FOUND"
  | "PACK_TARGET_TYPE_INVALID"
  | "PACK_TARGET_CONFIG_INVALID"
  | "PACK_PUBLISH_FAILED";

export class PackPublishError extends Error {
  readonly code: PackPublishErrorCode;
  readonly statusCode: number;

  constructor(code: PackPublishErrorCode, message: string, statusCode = 400) {
    super(message);
    this.name = "PackPublishError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface PackPublishOptions {
  includeSampleData?: boolean;
  author?: string;
}

export interface ConfirmedPackPublishOptions extends PackPublishOptions {
  /** Consent binds to the exact previewed artifact bytes. */
  expectedHash: string;
}

function requireTarget(appId: string, targetId: string) {
  if (!getApp(appId)) {
    throw new PackPublishError("APP_NOT_FOUND", `App not found: ${appId}`, 404);
  }
  const target = db
    .select()
    .from(publishTargets)
    .where(and(eq(publishTargets.id, targetId), eq(publishTargets.appId, appId)))
    .get();
  if (!target) {
    throw new PackPublishError(
      "PACK_TARGET_NOT_FOUND",
      "Pack repository target not found",
      404
    );
  }
  if (target.targetType !== "github-repo") {
    throw new PackPublishError(
      "PACK_TARGET_TYPE_INVALID",
      `Target ${targetId} is ${target.targetType}, not github-repo`
    );
  }
  return target;
}

function parseConfig(config: string): Record<string, unknown> {
  try {
    const value = JSON.parse(config) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new PackPublishError(
      "PACK_TARGET_CONFIG_INVALID",
      "Pack repository target config is invalid JSON",
      500
    );
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `UNKNOWN_ERROR: ${String(error)}`;
}

export function triggerPackPublish(
  appId: string,
  targetId: string,
  options: ConfirmedPackPublishOptions
): { deployment: DeploymentRow } {
  requireTarget(appId, targetId);
  const id = crypto.randomUUID();
  const now = new Date();
  db.insert(deployments)
    .values({
      id,
      appId,
      targetId,
      status: "pending",
      generatorConfig: JSON.stringify({
        kind: "relay-pack",
        includeSampleData: options.includeSampleData === true,
        ...(options.author ? { author: options.author } : {}),
        expectedHash: options.expectedHash,
      }),
      startedAt: now,
    })
    .run();
  return {
    deployment: db.select().from(deployments).where(eq(deployments.id, id)).get()!,
  };
}

function parseOptions(deployment: DeploymentRow): ConfirmedPackPublishOptions {
  if (!deployment.generatorConfig) {
    throw new PackPublishError(
      "PACK_PUBLISH_FAILED",
      "Pack deployment is missing its consent-bound generator config.",
      500
    );
  }
  try {
    const value = JSON.parse(deployment.generatorConfig) as Record<string, unknown>;
    if (
      value.kind !== "relay-pack" ||
      typeof value.expectedHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.expectedHash)
    ) {
      throw new Error("invalid pack deployment config");
    }
    return {
      includeSampleData: value.includeSampleData === true,
      author: typeof value.author === "string" ? value.author : undefined,
      expectedHash: value.expectedHash,
    };
  } catch {
    throw new PackPublishError(
      "PACK_PUBLISH_FAILED",
      "Pack deployment config is invalid; refusing to publish without a verified preview hash.",
      500
    );
  }
}

export async function runPackDeployment(deploymentId: string): Promise<DeploymentRow> {
  const deployment = db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .get();
  if (!deployment) {
    throw new PackPublishError("PACK_PUBLISH_FAILED", "Deployment not found", 404);
  }

  try {
    db.update(deployments)
      .set({ status: "publishing" })
      .where(eq(deployments.id, deploymentId))
      .run();
    const target = requireTarget(deployment.appId, deployment.targetId);
    const options = parseOptions(deployment);
    const artifact = await buildAppPackArtifact(
      deployment.appId,
      options
    );
    if (artifact.hash !== options.expectedHash) {
      throw new PackPublishError(
        "PACK_PUBLISH_FAILED",
        "The app changed after the pack preview. Preview the files again before publishing.",
        409
      );
    }
    const publisher = getPublisherAdapter("github-repo");
    const result = await publisher.publish(artifact, parseConfig(target.config));
    if (!result.success) {
      throw new PackPublishError(
        "PACK_PUBLISH_FAILED",
        result.error ?? "Repository publisher returned failure",
        502
      );
    }
    db.update(deployments)
      .set({
        status: "success",
        url: result.url ?? null,
        commit: result.commit ?? null,
        artifactHash: artifact.hash,
        finishedAt: new Date(),
        error: null,
      })
      .where(eq(deployments.id, deploymentId))
      .run();
  } catch (error) {
    db.update(deployments)
      .set({ status: "failed", finishedAt: new Date(), error: errorText(error) })
      .where(eq(deployments.id, deploymentId))
      .run();
  }

  return db.select().from(deployments).where(eq(deployments.id, deploymentId)).get()!;
}

export async function publishAppPackNow(
  appId: string,
  targetId: string,
  options: ConfirmedPackPublishOptions
): Promise<DeploymentRow> {
  const { deployment } = triggerPackPublish(appId, targetId, options);
  return runPackDeployment(deployment.id);
}
