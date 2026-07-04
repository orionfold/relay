import { execFileSync } from "node:child_process";
import { statSync, realpathSync } from "node:fs";
import { resolve, basename } from "node:path";

export interface FileSearchHit {
  /** Path relative to the resolved cwd. */
  path: string;
  sizeBytes: number;
  /** mtime in epoch ms. */
  mtime: number;
}

/**
 * Return up to `limit` files under `cwd` (respecting .gitignore) whose
 * path or basename contains `query` (case-insensitive). Filename matches
 * rank above directory-path matches; secondary sort by mtime desc.
 *
 * Uses `git ls-files --cached --others --exclude-standard` to honor
 * .gitignore natively — matches the subprocess pattern already in use
 * in `src/lib/environment/workspace-context.ts`. No npm dep required.
 * Returns [] if `cwd` is not inside a git repo or git is unavailable.
 *
 * Security: the caller is responsible for server-resolving `cwd` from
 * a trusted source (e.g., the active project's workingDirectory or
 * `getLaunchCwd()`). Never pass a client-controlled path directly.
 */
export function searchFiles(
  cwd: string,
  query: string,
  limit = 20
): FileSearchHit[] {
  const cwdReal = realpathSync(cwd);

  let stdout: string;
  try {
    stdout = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      {
        cwd: cwdReal,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 3000,
        // Route git's stderr to a pipe (discarded via the catch) instead of
        // inheriting the console, so a non-git cwd can't leak a raw
        // `fatal: not a git repository` line to a customer's console. Mirrors
        // src/lib/environment/workspace-context.ts / src/lib/instance/git-ops.ts.
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch {
    // Not a git repo, or git missing, or timeout — degrade to empty list.
    return [];
  }

  const q = query.trim().toLowerCase();
  const hits: Array<FileSearchHit & { score: number }> = [];

  for (const rel of stdout.split("\n")) {
    if (!rel) continue;
    // Defensive: ensure the resolved path stays within cwd. `git ls-files`
    // should never emit such a path, but stat-ing anything outside cwd
    // would bypass the .gitignore guarantee anyway.
    const abs = resolve(cwdReal, rel);
    if (!abs.startsWith(cwdReal)) continue;

    const relLower = rel.toLowerCase();
    const baseLower = basename(rel).toLowerCase();
    let score: number;
    if (q === "") {
      score = 1;
    } else if (baseLower.includes(q)) {
      score = 3;
    } else if (relLower.includes(q)) {
      score = 2;
    } else {
      continue;
    }

    let sizeBytes = 0;
    let mtime = 0;
    try {
      const s = statSync(abs);
      sizeBytes = s.size;
      mtime = s.mtimeMs;
    } catch {
      // File disappeared between ls-files and stat — skip.
      continue;
    }

    hits.push({ path: rel, sizeBytes, mtime, score });
  }

  hits.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return b.mtime - a.mtime;
  });

  return hits.slice(0, limit).map(({ path, sizeBytes, mtime }) => ({
    path,
    sizeBytes,
    mtime,
  }));
}
