import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  deployments: { appId: "appId", targetId: "targetId", status: "status", artifactHash: "artifactHash", startedAt: "startedAt" },
  publishTargets: { id: "id", appId: "appId" },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const value = state.rows.shift();
      const builder = {
        from: () => builder,
        where: () => builder,
        orderBy: () => builder,
        get: () => value,
      };
      return builder;
    }),
  },
}));

vi.mock("@/lib/packs/app-exporter", () => ({ buildAppPackArtifact: vi.fn() }));
vi.mock("../github-connection", () => ({ inspectGitHubRepository: vi.fn() }));

import { buildAppPackArtifact } from "@/lib/packs/app-exporter";
import { inspectGitHubRepository } from "../github-connection";
import { prepareCommunityPackSubmission } from "../community-pack-submission";

const hash = "a".repeat(64);
const target = {
  id: "target-1",
  appId: "app-1",
  targetType: "github-repo",
  config: JSON.stringify({ owner: "maker", repo: "pack", branch: "main" }),
};
const deployment = {
  url: "https://github.com/maker/pack",
  commit: "abc123",
  generatorConfig: JSON.stringify({ kind: "relay-pack", includeSampleData: false }),
};

describe("community Pack submission", () => {
  beforeEach(() => {
    state.rows = [target, deployment];
    vi.clearAllMocks();
    vi.mocked(buildAppPackArtifact).mockResolvedValue({
      packId: "maker-pack",
      version: "1.2.0",
      hash,
      entryPoint: "pack.yaml",
      sampleRowsIncluded: 0,
      files: [],
    });
    vi.mocked(inspectGitHubRepository).mockResolvedValue({
      owner: "maker",
      repo: "pack",
      fullName: "maker/pack",
      visibility: "public",
      defaultBranch: "main",
      canPush: true,
    });
  });

  it("builds a review request that links to the creator-owned public repository", async () => {
    const result = await prepareCommunityPackSubmission("app-1", "target-1", hash);
    expect(result.repositoryUrl).toBe("https://github.com/maker/pack");
    expect(result.url).toContain("github.com/orionfold/relay/issues/new");
    expect(new URL(result.url).searchParams.get("body")).toContain("community · unverified");
  });

  it("refuses to submit a private repository without changing its publishability", async () => {
    vi.mocked(inspectGitHubRepository).mockResolvedValue({
      owner: "maker",
      repo: "pack",
      fullName: "maker/pack",
      visibility: "private",
      defaultBranch: "main",
      canPush: true,
    });
    await expect(prepareCommunityPackSubmission("app-1", "target-1", hash))
      .rejects.toThrow("must point to a public creator-owned repository");
  });

  it("requires an exact successful publication before review", async () => {
    state.rows = [target, undefined];
    await expect(prepareCommunityPackSubmission("app-1", "target-1", hash))
      .rejects.toThrow("Publish this exact Pack preview");
  });

  it("refuses layouts the Git URL installer cannot resolve", async () => {
    state.rows = [{ ...target, config: JSON.stringify({ owner: "maker", repo: "pack", branch: "preview", directory: "packs/demo" }) }, deployment];
    await expect(prepareCommunityPackSubmission("app-1", "target-1", hash))
      .rejects.toThrow("repository root");

    state.rows = [{ ...target, config: JSON.stringify({ owner: "maker", repo: "pack", branch: "preview" }) }, deployment];
    await expect(prepareCommunityPackSubmission("app-1", "target-1", hash))
      .rejects.toThrow("default branch");
  });
});
