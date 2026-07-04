/**
 * Git-based checkpoint manager for environment write-back safety.
 * Creates git commits + tags for project-level files before sync operations.
 * Uses execFileSync (not exec) to prevent shell injection.
 */

import { execFileSync } from "child_process";

interface GitResult {
  success: boolean;
  output: string;
  error?: string;
}

/** Run a git command safely via execFileSync (no shell). */
function git(args: string[], cwd: string): GitResult {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout: 10000,
      // Route git's stderr to a pipe (discarded here) instead of inheriting
      // the console, so a non-git cwd can't leak a raw `fatal: not a git
      // repository` line to a customer's first-run log. Mirrors
      // src/lib/environment/workspace-context.ts / src/lib/instance/git-ops.ts.
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return { success: true, output };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { success: false, output: "", error };
  }
}

/** Check if a directory is inside a git repository. */
export function isGitRepo(dir: string): boolean {
  const result = git(["rev-parse", "--is-inside-work-tree"], dir);
  return result.success && result.output === "true";
}

/** Get the current HEAD commit SHA. */
export function getCurrentCommit(dir: string): string | null {
  const result = git(["rev-parse", "HEAD"], dir);
  return result.success ? result.output : null;
}

/** Get the current branch name. */
export function getCurrentBranch(dir: string): string | null {
  const result = git(["rev-parse", "--abbrev-ref", "HEAD"], dir);
  return result.success ? result.output : null;
}

/** Check if the working tree has uncommitted changes. */
export function hasUncommittedChanges(dir: string): boolean {
  const result = git(["status", "--porcelain"], dir);
  return result.success && result.output.length > 0;
}

/**
 * Create a checkpoint by tagging the current commit.
 * Does NOT commit uncommitted changes — this is a snapshot reference point.
 */
export function createGitCheckpoint(
  dir: string,
  label: string,
  checkpointType: string
): { commitSha: string; tag: string } | null {
  if (!isGitRepo(dir)) return null;

  const commitSha = getCurrentCommit(dir);
  if (!commitSha) return null;

  const tagName = `ainative/checkpoint/${checkpointType}/${Date.now()}`;

  const tagResult = git(
    ["tag", "-a", tagName, "-m", `ainative checkpoint: ${label}`],
    dir
  );

  if (!tagResult.success) return null;

  return { commitSha, tag: tagName };
}

/** Get the diff between a checkpoint commit and the current state. */
export function getCheckpointDiff(
  dir: string,
  commitSha: string
): string | null {
  const result = git(["diff", commitSha, "--stat"], dir);
  return result.success ? result.output : null;
}

/** Get the full diff for a specific file between checkpoint and current. */
export function getFileDiff(
  dir: string,
  commitSha: string,
  filePath: string
): string | null {
  const result = git(["diff", commitSha, "--", filePath], dir);
  return result.success ? result.output : null;
}

/**
 * Rollback to a checkpoint by checking out its tree state.
 * Creates a new commit to preserve history (not a hard reset).
 */
export function rollbackToCheckpoint(
  dir: string,
  commitSha: string,
  label: string
): { success: boolean; newCommitSha?: string; error?: string } {
  if (!isGitRepo(dir)) {
    return { success: false, error: "Not a git repository" };
  }

  const checkoutResult = git(["checkout", commitSha, "--", "."], dir);
  if (!checkoutResult.success) {
    return { success: false, error: checkoutResult.error };
  }

  git(["add", "-A"], dir);

  const commitResult = git(
    ["commit", "-m", `[ainative] rollback to: ${label}`, "--allow-empty", "--no-verify"],
    dir
  );

  if (!commitResult.success) {
    return { success: false, error: commitResult.error };
  }

  const newSha = getCurrentCommit(dir);
  return { success: true, newCommitSha: newSha || undefined };
}

/** List all ainative checkpoint tags in the repo. */
export function listCheckpointTags(
  dir: string
): Array<{ tag: string; commitSha: string; date: string }> {
  const result = git(
    [
      "tag",
      "-l",
      "ainative/checkpoint/*",
      "--format=%(refname:short)|%(objectname:short)|%(creatordate:iso)",
    ],
    dir
  );
  if (!result.success || !result.output) return [];

  return result.output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [tag, commitSha, date] = line.split("|");
      return { tag, commitSha, date };
    });
}

/** Delete a checkpoint tag. */
export function deleteCheckpointTag(dir: string, tagName: string): boolean {
  const result = git(["tag", "-d", tagName], dir);
  return result.success;
}
