// Verify repository-local Markdown links against the Git index.
//
// Checking `existsSync()` is insufficient for G-050: internal records remain on
// disk after `git rm --cached`, so a public link to one would appear valid in a
// maintainer checkout and break in every clean clone. This checker resolves
// links only against tracked paths.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
  // Drop an optional Markdown title after a whitespace-delimited destination.
  target = target.split(/\s+["']/u, 1)[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    // A malformed URI remains a literal target and will fail visibly below.
  }
  return target;
}

function isExternal(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(target);
}

function maskCode(text) {
  const preserveLines = (value) => value.replace(/[^\n]/gu, " ");
  return text
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, preserveLines)
    .replace(/`[^`\n]*`/gu, preserveLines);
}

/** Return unresolved local inline Markdown links. */
export function findBrokenLinks(entries, trackedPaths) {
  const tracked = trackedPaths instanceof Set ? trackedPaths : new Set(trackedPaths);
  const findings = [];

  for (const { path: sourcePath, content } of entries) {
    const text = String(content);
    const linkText = maskCode(text);
    const linkPattern = /(?<!!)\[[^\]]*\]\(([^)]+)\)/gu;
    for (const match of linkText.matchAll(linkPattern)) {
      const rawTarget = match[1];
      const normalized = normalizeTarget(rawTarget);
      if (!normalized || normalized.startsWith("#") || isExternal(normalized)) continue;

      const withoutFragment = normalized.split("#", 1)[0];
      const withoutLine = withoutFragment.replace(/:\d+(?::\d+)?$/u, "");
      const sourceDir = path.posix.dirname(sourcePath);
      const resolved = path.posix.normalize(
        withoutLine.startsWith("/")
          ? withoutLine.slice(1)
          : path.posix.join(sourceDir, withoutLine),
      );
      const directoryMatch = [...tracked].some((candidate) =>
        candidate.startsWith(`${resolved.replace(/\/$/u, "")}/`),
      );
      if (tracked.has(resolved) || directoryMatch) continue;

      const prefix = linkText.slice(0, match.index ?? 0);
      const line = 1 + (prefix.match(/\n/gu)?.length ?? 0);
      findings.push({ sourcePath, line, target: rawTarget, resolved });
    }
  }

  return findings;
}

export function trackedMarkdownEntries(root = repoRoot) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const tracked = output.split("\0").filter(Boolean);
  const markdown = tracked.filter((name) => name.endsWith(".md"));
  return {
    tracked: new Set(tracked),
    entries: markdown.map((name) => ({
      path: name,
      content: readFileSync(path.join(root, name), "utf8"),
    })),
  };
}

function main() {
  try {
    const { tracked, entries } = trackedMarkdownEntries();
    const findings = findBrokenLinks(entries, tracked);
    if (findings.length === 0) {
      console.log(
        `[doc-links] OK — ${entries.length} tracked Markdown files have no broken local links.`,
      );
      return;
    }
    console.error(`[doc-links] FAIL — ${findings.length} broken local link(s):`);
    for (const finding of findings) {
      console.error(
        `  - ${finding.sourcePath}:${finding.line} ${finding.target} -> ${finding.resolved}`,
      );
    }
    process.exitCode = 1;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[doc-links] ERROR — check could not run: ${detail}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) main();
