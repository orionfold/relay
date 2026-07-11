import type { Artifact, PublisherAdapter, PublishResult } from "./types";
import {
  githubHeaders,
  inspectGitHubRepository,
  resolveGitHubToken,
} from "./github-connection";

const GITHUB_API = "https://api.github.com";
const FILES_MARKER = ".relay-pack-files.json";

interface GitHubRepoConfig {
  owner: string;
  repo: string;
  branch: string;
  directory: string;
}

interface GitHubRepoResponse {
  default_branch?: string;
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean };
}

function normalizeDirectory(value: unknown): string | { error: string } {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return { error: "directory must be a string" };
  const normalized = value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return { error: "directory must be a safe repository-relative path" };
  }
  return normalized;
}

function parseConfig(
  config: Record<string, unknown>
): GitHubRepoConfig | { error: string } {
  const { owner, repo } = config;
  const missing = [
    ["owner", owner],
    ["repo", repo],
  ]
    .filter(([, value]) => typeof value !== "string" || value.length === 0)
    .map(([key]) => key);
  if (missing.length > 0) {
    return { error: `Missing required config field(s): ${missing.join(", ")}` };
  }
  const githubName = /^[A-Za-z0-9_.-]+$/;
  if (!githubName.test(owner as string) || !githubName.test(repo as string)) {
    return { error: "owner and repo must be valid GitHub names" };
  }
  const directory = normalizeDirectory(config.directory);
  if (typeof directory !== "string") return directory;
  const branch =
    typeof config.branch === "string" && config.branch.length > 0
      ? config.branch
      : "main";
  if (
    !/^[A-Za-z0-9._/-]+$/.test(branch) ||
    branch.includes("..") ||
    branch.includes("@{") ||
    branch.endsWith(".lock")
  ) {
    return { error: "branch is not a valid Git reference name" };
  }
  return {
    owner: owner as string,
    repo: repo as string,
    branch,
    directory,
  };
}

function isPackPath(filePath: string): boolean {
  if (filePath === "pack.yaml") return true;
  if (!filePath.startsWith("base/")) return false;
  return !filePath
    .split("/")
    .some((part) => part === "" || part === "." || part === "..");
}

function canPush(repo: GitHubRepoResponse): boolean {
  return Boolean(repo.permissions?.admin || repo.permissions?.maintain || repo.permissions?.push);
}

function repoPath(directory: string, filePath: string): string {
  return directory ? `${directory}/${filePath}` : filePath;
}

async function githubJson<T>(
  url: string,
  init: RequestInit,
  expected: readonly number[] = [200, 201]
): Promise<T> {
  const response = await fetch(url, init);
  if (!expected.includes(response.status)) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `GitHub API ${init.method ?? "GET"} ${url} failed: ${response.status}${
        detail ? ` — ${detail.slice(0, 300)}` : ""
      }`
    );
  }
  return (await response.json()) as T;
}

async function readPreviousFiles(
  config: GitHubRepoConfig,
  requestHeaders: Record<string, string>
): Promise<string[]> {
  const markerPath = repoPath(config.directory, FILES_MARKER);
  const response = await fetch(
    `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${markerPath}?ref=${encodeURIComponent(config.branch)}`,
    { headers: requestHeaders }
  );
  if (response.status === 404 || response.status === 409) return [];
  if (!response.ok) {
    throw new Error(`GitHub marker read failed: ${response.status}`);
  }
  const body = (await response.json()) as { content?: string };
  if (!body.content) return [];
  try {
    const parsed = JSON.parse(
      Buffer.from(body.content.replace(/\s/g, ""), "base64").toString("utf-8")
    ) as { files?: unknown };
    return Array.isArray(parsed.files)
      ? parsed.files.filter(
          (entry): entry is string => typeof entry === "string" && isPackPath(entry)
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * Atomic, repository-safe pack publisher. It creates one Git tree + commit,
 * overlays only Relay-owned pack paths, and removes stale paths recorded by
 * the prior publish marker. Unrelated repository content is never deleted.
 */
export const githubRepoAdapter: PublisherAdapter = {
  targetType: "github-repo",

  async testConnection(config) {
    const parsed = parseConfig(config);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    try {
      const details = await inspectGitHubRepository(config);
      if (!details.canPush) {
        return {
          ok: false,
          error:
            "GitHub token needs Contents: Read and write permission for this repository.",
        };
      }
      return {
        ok: true,
        details: { visibility: details.visibility, fullName: details.fullName },
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async publish(artifact: Artifact, config): Promise<PublishResult> {
    const parsed = parseConfig(config);
    if ("error" in parsed) return { success: false, error: parsed.error };
    const base = `${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}`;

    try {
      const resolved = await resolveGitHubToken(config);
      const requestHeaders = githubHeaders(resolved.githubToken);
      if (
        artifact.entryPoint !== "pack.yaml" ||
        artifact.files.length === 0 ||
        artifact.files.some((file) => !isPackPath(file.path)) ||
        !artifact.files.some((file) => file.path === "pack.yaml") ||
        !artifact.files.some((file) => file.path === "base/manifest.yaml")
      ) {
        return {
          success: false,
          error:
            "github-repo accepts only a Relay Pack artifact (pack.yaml plus base/manifest.yaml and base/** files).",
        };
      }
      const repo = await githubJson<GitHubRepoResponse>(base, { headers: requestHeaders });
      if (!canPush(repo)) {
        return {
          success: false,
          error:
            "GitHub token needs Contents: Read and write permission for this repository.",
        };
      }

      let baseCommitSha: string | undefined;
      let branchExists = false;
      let initializedEmptyRepo = false;
      const branchRef = await fetch(
        `${base}/git/ref/heads/${encodeURIComponent(parsed.branch)}`,
        { headers: requestHeaders }
      );
      if (branchRef.ok) {
        const body = (await branchRef.json()) as { object?: { sha?: string } };
        baseCommitSha = body.object?.sha;
        branchExists = true;
      } else if (branchRef.status !== 404 && branchRef.status !== 409) {
        throw new Error(`GitHub branch lookup failed: ${branchRef.status}`);
      } else if (repo.default_branch && repo.default_branch !== parsed.branch) {
        const defaultRef = await fetch(
          `${base}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`,
          { headers: requestHeaders }
        );
        if (defaultRef.ok) {
          const body = (await defaultRef.json()) as { object?: { sha?: string } };
          baseCommitSha = body.object?.sha;
        }
      }

      // GitHub does not allow creating a ref in an empty repository, even if
      // raw Git objects exist. Its documented bootstrap is one Contents API
      // write. Create a harmless init file, then remove it in the atomic pack
      // tree below; no partial pack is ever visible.
      if (!baseCommitSha) {
        if (repo.default_branch && repo.default_branch !== parsed.branch) {
          throw new Error(
            `Empty GitHub repositories must publish first to their default branch (${repo.default_branch}); configured branch is ${parsed.branch}.`
          );
        }
        await githubJson(
          `${base}/contents/.relay-pack-init`,
          {
            method: "PUT",
            headers: requestHeaders,
            body: JSON.stringify({
              message: "Initialize repository for Relay Pack publish",
              content: Buffer.from("Relay Pack repository\n", "utf-8").toString("base64"),
            }),
          }
        );
        const initializedRef = await githubJson<{ object?: { sha?: string } }>(
          `${base}/git/ref/heads/${encodeURIComponent(parsed.branch)}`,
          { headers: requestHeaders }
        );
        baseCommitSha = initializedRef.object?.sha;
        branchExists = true;
        initializedEmptyRepo = true;
        if (!baseCommitSha) {
          throw new Error("GitHub initialized the repository but returned no branch commit.");
        }
      }

      let baseTreeSha: string | undefined;
      if (baseCommitSha) {
        const commit = await githubJson<{ tree?: { sha?: string } }>(
          `${base}/git/commits/${baseCommitSha}`,
          { headers: requestHeaders }
        );
        baseTreeSha = commit.tree?.sha;
      }

      const existingPaths = new Set<string>();
      if (baseTreeSha) {
        const currentTree = await githubJson<{
          tree?: Array<{ path?: string }>;
        }>(`${base}/git/trees/${baseTreeSha}?recursive=1`, {
          headers: requestHeaders,
        });
        for (const entry of currentTree.tree ?? []) {
          if (entry.path) existingPaths.add(entry.path);
        }
      }

      const previousFiles = branchExists
        ? await readPreviousFiles(parsed, requestHeaders)
        : [];
      const nextFiles = artifact.files.map((file) => file.path).sort();
      const marker = JSON.stringify(
        {
          schema: "orionfold.relay-pack-publish/v1",
          artifactHash: artifact.hash,
          entryPoint: artifact.entryPoint,
          files: nextFiles,
        },
        null,
        2
      ) + "\n";
      const allFiles = [
        ...artifact.files,
        { path: FILES_MARKER, content: marker },
      ];

      const treeEntries: Array<Record<string, unknown>> = [];
      for (const file of allFiles) {
        const content = Buffer.isBuffer(file.content)
          ? file.content.toString("base64")
          : Buffer.from(file.content, "utf-8").toString("base64");
        const blob = await githubJson<{ sha: string }>(
          `${base}/git/blobs`,
          {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify({ content, encoding: "base64" }),
          }
        );
        treeEntries.push({
          path: repoPath(parsed.directory, file.path),
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
      }

      const nextSet = new Set(nextFiles);
      for (const stale of previousFiles) {
        const fullPath = repoPath(parsed.directory, stale);
        if (!nextSet.has(stale) && existingPaths.has(fullPath)) {
          treeEntries.push({
            path: fullPath,
            mode: "100644",
            type: "blob",
            sha: null,
          });
        }
      }
      if (initializedEmptyRepo) {
        treeEntries.push({
          path: ".relay-pack-init",
          mode: "100644",
          type: "blob",
          sha: null,
        });
      }

      const tree = await githubJson<{ sha: string }>(
        `${base}/git/trees`,
        {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({
            ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
            tree: treeEntries,
          }),
        }
      );
      const commit = await githubJson<{ sha: string }>(
        `${base}/git/commits`,
        {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({
            message: `Publish Relay Pack (${artifact.hash.slice(0, 12)})`,
            tree: tree.sha,
            ...(baseCommitSha ? { parents: [baseCommitSha] } : { parents: [] }),
          }),
        }
      );

      if (branchExists) {
        await githubJson(
          `${base}/git/refs/heads/${encodeURIComponent(parsed.branch)}`,
          {
            method: "PATCH",
            headers: requestHeaders,
            body: JSON.stringify({ sha: commit.sha, force: false }),
          }
        );
      } else {
        await githubJson(
          `${base}/git/refs`,
          {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify({ ref: `refs/heads/${parsed.branch}`, sha: commit.sha }),
          }
        );
      }

      const directorySuffix = parsed.directory ? `/tree/${parsed.branch}/${parsed.directory}` : "";
      return {
        success: true,
        url: `https://github.com/${parsed.owner}/${parsed.repo}${directorySuffix}`,
        commit: commit.sha,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
