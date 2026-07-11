import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deployments, publishTargets } from "@/lib/db/schema";
import { buildAppPackArtifact } from "@/lib/packs/app-exporter";
import { inspectGitHubRepository } from "./github-connection";

const COMMUNITY_REVIEW_URL = "https://github.com/orionfold/relay/issues/new";

export class CommunityPackSubmissionError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CommunityPackSubmissionError";
    this.statusCode = statusCode;
  }
}

function parseObject(value: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new CommunityPackSubmissionError(`${label} is invalid JSON.`, 500);
  }
}

export async function prepareCommunityPackSubmission(
  appId: string,
  targetId: string,
  expectedHash: string
): Promise<{ url: string; repositoryUrl: string; packId: string; version: string }> {
  const target = db
    .select()
    .from(publishTargets)
    .where(and(eq(publishTargets.id, targetId), eq(publishTargets.appId, appId)))
    .get();
  if (!target || target.targetType !== "github-repo") {
    throw new CommunityPackSubmissionError("Select a Pack repository target first.", 404);
  }

  const deployment = db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.appId, appId),
        eq(deployments.targetId, targetId),
        eq(deployments.status, "success"),
        eq(deployments.artifactHash, expectedHash)
      )
    )
    .orderBy(desc(deployments.startedAt))
    .get();
  if (!deployment?.url) {
    throw new CommunityPackSubmissionError(
      "Publish this exact Pack preview to the selected repository before submitting it for community review.",
      409
    );
  }

  const targetConfig = parseObject(target.config, "Repository target config");
  const repository = await inspectGitHubRepository(targetConfig);
  if (repository.visibility !== "public") {
    throw new CommunityPackSubmissionError(
      "Relay Community listings must point to a public creator-owned repository. Your private repository remains available to collaborators.",
      409
    );
  }
  const directory = typeof targetConfig.directory === "string" ? targetConfig.directory.trim() : "";
  if (directory) {
    throw new CommunityPackSubmissionError(
      "Relay Community Packs must publish pack.yaml at the repository root so Git URL installs work.",
      409
    );
  }
  const branch =
    typeof targetConfig.branch === "string" && targetConfig.branch.trim()
      ? targetConfig.branch.trim()
      : repository.defaultBranch;
  if (branch !== repository.defaultBranch) {
    throw new CommunityPackSubmissionError(
      `Relay Community Packs must publish on the repository default branch (${repository.defaultBranch}) so Git URL installs work.`,
      409
    );
  }

  const deploymentConfig = deployment.generatorConfig
    ? parseObject(deployment.generatorConfig, "Pack deployment config")
    : {};
  const artifact = await buildAppPackArtifact(appId, {
    includeSampleData: deploymentConfig.includeSampleData === true,
    author: typeof deploymentConfig.author === "string" ? deploymentConfig.author : undefined,
  });
  if (artifact.hash !== expectedHash) {
    throw new CommunityPackSubmissionError(
      "The app changed after publication. Preview and publish the current Pack before submitting it.",
      409
    );
  }

  const title = `[Community Pack] ${artifact.packId} ${artifact.version}`;
  const body = [
    "## Relay Community Pack submission",
    "",
    `- **Pack:** \`${artifact.packId}\``,
    `- **Version:** \`${artifact.version}\``,
    `- **Repository:** ${deployment.url}`,
    `- **Commit:** \`${deployment.commit ?? "not recorded"}\``,
    `- **Artifact SHA-256:** \`${artifact.hash}\``,
    "",
    "## Creator confirmations",
    "",
    "- [ ] This repository is public and I control or am authorized to publish it.",
    "- [ ] The Pack uses synthetic or intentionally shared sample data only.",
    "- [ ] I understand direct Git installs remain `community · unverified` until Relay review/signing is complete.",
    "- [ ] I agree that the Relay index links to my repository; Orionfold does not host or take ownership of the Pack.",
    "",
    "## Reviewer notes",
    "",
    "Please validate format, portability, provenance, privacy, and install behavior before adding this repository to the canonical Pack index.",
  ].join("\n");
  const query = new URLSearchParams({ title, body });
  return {
    url: `${COMMUNITY_REVIEW_URL}?${query.toString()}`,
    repositoryUrl: deployment.url,
    packId: artifact.packId,
    version: artifact.version,
  };
}
