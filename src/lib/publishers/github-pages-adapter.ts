import type { PublisherAdapter, PublishResult } from "./types";

/**
 * Publishes an Artifact to the customer's own GitHub Pages repo via the
 * GitHub Contents API (per-file PUT — no git binary, no child_process).
 * Config: { owner, repo, githubToken, branch? } — branch defaults to gh-pages.
 */

const GITHUB_API = "https://api.github.com";

interface GitHubPagesConfig {
  owner: string;
  repo: string;
  githubToken: string;
  branch: string;
}

function parseConfig(config: Record<string, unknown>): GitHubPagesConfig | { error: string } {
  const { owner, repo, githubToken } = config;
  const missing = [
    ["owner", owner],
    ["repo", repo],
    ["githubToken", githubToken],
  ]
    .filter(([, val]) => typeof val !== "string" || val === "")
    .map(([key]) => key);
  if (missing.length > 0) {
    return { error: `Missing required config field(s): ${missing.join(", ")}` };
  }
  const branch =
    typeof config.branch === "string" && config.branch !== "" ? config.branch : "gh-pages";
  return {
    owner: owner as string,
    repo: repo as string,
    githubToken: githubToken as string,
    branch,
  };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "relay",
  };
}

export const githubPagesAdapter: PublisherAdapter = {
  targetType: "github-pages",

  async testConnection(config) {
    const parsed = parseConfig(config);
    if ("error" in parsed) {
      return { ok: false, error: parsed.error };
    }
    try {
      const res = await fetch(`${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}`, {
        headers: githubHeaders(parsed.githubToken),
      });
      if (!res.ok) {
        return { ok: false, error: `GitHub repo check failed: ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(artifact, config): Promise<PublishResult> {
    const parsed = parseConfig(config);
    if ("error" in parsed) {
      return { success: false, error: parsed.error };
    }
    const { owner, repo, branch } = parsed;
    const headers = githubHeaders(parsed.githubToken);
    let lastCommit: string | undefined;

    try {
      for (const file of artifact.files) {
        const contentsUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${file.path}`;

        // Updating an existing file requires its blob sha; 404 means new file.
        const existing = await fetch(`${contentsUrl}?ref=${encodeURIComponent(branch)}`, {
          headers,
        });
        let sha: string | undefined;
        if (existing.ok) {
          const body = (await existing.json()) as { sha?: string };
          sha = body.sha;
        }

        const content = Buffer.isBuffer(file.content)
          ? file.content.toString("base64")
          : Buffer.from(file.content, "utf-8").toString("base64");

        const put = await fetch(contentsUrl, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message: `Publish ${file.path} (artifact ${artifact.hash})`,
            content,
            branch,
            ...(sha ? { sha } : {}),
          }),
        });
        if (!put.ok) {
          return {
            success: false,
            error: `GitHub Contents PUT failed for ${file.path}: ${put.status}`,
          };
        }
        const putBody = (await put.json()) as { commit?: { sha?: string } };
        lastCommit = putBody.commit?.sha ?? lastCommit;
      }

      return {
        success: true,
        url: `https://${owner}.github.io/${repo}/`,
        commit: lastCommit,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
