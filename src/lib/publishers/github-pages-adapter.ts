import type { PublisherAdapter, PublishResult } from "./types";
import {
  githubHeaders,
  inspectGitHubRepository,
  resolveGitHubToken,
} from "./github-connection";

/**
 * Publishes an Artifact to the customer's own GitHub Pages repo via the
 * GitHub Contents API (per-file PUT — no git binary, no child_process).
 * Config: { owner, repo, branch? } — branch defaults to gh-pages. The token
 * resolves from the shared encrypted GitHub connection (legacy target fallback
 * is handled centrally during migration).
 */

const GITHUB_API = "https://api.github.com";

interface GitHubPagesConfig {
  owner: string;
  repo: string;
  branch: string;
}

function parseConfig(config: Record<string, unknown>): GitHubPagesConfig | { error: string } {
  const { owner, repo } = config;
  const missing = [
    ["owner", owner],
    ["repo", repo],
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
    branch,
  };
}

async function resolveFinalUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res && typeof res.url === "string" && res.url !== "" && res.url !== url) {
      return res.url;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export const githubPagesAdapter: PublisherAdapter = {
  targetType: "github-pages",

  async testConnection(config) {
    const parsed = parseConfig(config);
    if ("error" in parsed) {
      return { ok: false, error: parsed.error };
    }
    try {
      const details = await inspectGitHubRepository(config);
      if (!details.canPush) {
        return {
          ok: false,
          error:
            "GitHub token needs Contents: Read and write permission for this repository before Relay can publish.",
        };
      }
      return {
        ok: true,
        details: { visibility: details.visibility, fullName: details.fullName },
      };
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
    let lastCommit: string | undefined;

    try {
      const resolved = await resolveGitHubToken(config);
      const headers = githubHeaders(resolved.githubToken);
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

      const url = `https://${owner}.github.io/${repo}/`;
      const finalUrl = await resolveFinalUrl(url);

      return {
        success: true,
        url,
        finalUrl,
        commit: lastCommit,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
