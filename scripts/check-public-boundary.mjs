// Public-repository boundary guard (G-050).
//
// The same fail-closed policy is applied to three release surfaces:
//   tracked  — the current Git index/worktree (`git ls-files`)
//   archive  — a real `git archive --format=tar` artifact
//   npm      — a real `npm pack` .tgz artifact
//
// Usage:
//   node scripts/check-public-boundary.mjs tracked
//   node scripts/check-public-boundary.mjs archive /path/to/repo.tar
//   node scripts/check-public-boundary.mjs npm /path/to/package.tgz
//
// The policy intentionally does not reject a retired product name by itself.
// Migration code, tests, and changelog history need those names to remain
// intelligible. It rejects actionable identity residue instead: retired domains,
// personal repository/contact details, machine paths, private peer-workspace
// references, and operational continuity documents.
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const INTERNAL_PATHS = [
  /^\.archive\/handoff(?:\/|$)/,
  /^HANDOFF\.md$/,
  /^CODEX-CC\.md$/,
  /^OPERATOR-REQUIREMENTS\.md$/,
  /^docs\/superpowers\/(?:plans|specs)(?:\/|$)/,
];

const RULES = [
  {
    id: "machine-path",
    pattern:
      /(?:\/Users\/manavsehgal(?:\/|\b)|~\/orionfold(?:\/|\b)|\/Users\/[^/\s`]+\/(?:Developer|orionfold)(?:\/|\b))/giu,
    message: "operator- or machine-specific filesystem path",
  },
  {
    id: "private-peer-project",
    pattern:
      /(?:~\/orionfold|\/Users\/manavsehgal\/orionfold)\/(?:strategy|website|marketing|consulting|llc|self-wealth|self-health|books)(?:\/|\b)/giu,
    message: "private peer-project/workspace reference",
  },
  {
    id: "retired-domain",
    pattern: /(?:https?:\/\/)?(?:buy\.)?(?:ainative\.io|stagent\.io)(?:[/:?#][^\s)`>\]]*)?/giu,
    message: "retired public domain",
  },
  {
    id: "personal-contact",
    pattern: /\b(?:manav@orionfold\.com|sehgal\.manav@gmail\.com)\b/giu,
    message: "direct personal/support contact",
  },
  {
    id: "personal-repository",
    pattern: /(?:https?:\/\/)?github\.com\/manavsehgal\/(?:stagent|ainative)(?:\.git|\/[A-Za-z0-9._~!$&'()*+,;=:@%/?#-]*)?/giu,
    message: "retired personal repository identity",
  },
  {
    id: "personal-handle",
    pattern: /\bmanavsehgal\b/giu,
    message: "direct personal account handle",
  },
  {
    id: "operational-continuity-reference",
    pattern:
      /(?:\.archive\/handoff\/|\.claude\/plans\/|\b(?:HANDOFF|CODEX-CC|OPERATOR-REQUIREMENTS)\.md\b)/gu,
    message: "internal operational-continuity reference",
    appliesTo: (entryPath) => entryPath.endsWith(".md") || entryPath === "screengrabs/manifest.json",
  },
];

// Every exception is rule + path scoped. Content substrings are deliberately
// not globally allowlisted: a new occurrence in a new file must be classified.
const ALL_RULE_IDS = new Set(RULES.map(({ id }) => id));
export const ALLOWLIST = new Map([
  // The executable rule definitions and their regression negatives must name
  // every forbidden class. No other script or test receives this exception.
  ["scripts/check-public-boundary.mjs", ALL_RULE_IDS],
  ["scripts/check-public-boundary.test.mjs", ALL_RULE_IDS],
  // Public authorship/license attribution is intentional and portable.
  ["README.md", new Set(["personal-handle"])],
  // The classification receipt must name the excluded continuity paths so a
  // contributor can understand and audit the boundary.
  [
    "docs/public-repository-boundary.md",
    new Set(["operational-continuity-reference"]),
  ],
  // Existing pack privacy tests contain literal forbidden examples so they can
  // prove generated public templates do not contain them.
  [
    "src/lib/packs/__tests__/relay-marketing-bundle-template.test.ts",
    new Set(["machine-path", "personal-handle"]),
  ],
  [
    "src/lib/packs/__tests__/relay-web-designer-template.test.ts",
    new Set(["machine-path", "personal-handle"]),
  ],
  // Immutable production-signature compatibility vector. Changing its payload
  // invalidates the Ed25519 signature; public docs and runtime assertions derive
  // the value instead of repeating it.
  [
    "src/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json",
    new Set(["personal-contact"]),
  ],
]);

function normalizeEntryPath(entryPath) {
  return entryPath.replace(/^\.\//, "").replace(/^package\//, "");
}

function isProbablyText(buffer) {
  if (buffer.includes(0)) return false;
  // Release artifacts may contain large generated assets. The boundary rules
  // are textual; decoding an arbitrarily large binary blob is neither useful
  // nor safe. NUL-free files remain text regardless of extension.
  return true;
}

function lineNumber(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function excerpt(value) {
  return value.replace(/\s+/gu, " ").slice(0, 120);
}

/** Scan `{ path, content: Buffer|string }` entries with the shared policy. */
export function scanEntries(entries, { surface = "entries" } = {}) {
  const findings = [];

  for (const entry of entries) {
    const entryPath = normalizeEntryPath(entry.path);
    if (!entryPath || entryPath.endsWith("/")) continue;

    if (INTERNAL_PATHS.some((pattern) => pattern.test(entryPath))) {
      findings.push({
        surface,
        path: entryPath,
        rule: "internal-path",
        line: 1,
        excerpt: entryPath,
        message: "internal history/continuity surface is present in a public artifact",
      });
      continue;
    }

    const buffer = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(String(entry.content), "utf8");
    if (!isProbablyText(buffer)) continue;
    const text = buffer.toString("utf8");
    const allowedRules = ALLOWLIST.get(entryPath) ?? new Set();

    for (const rule of RULES) {
      if (allowedRules.has(rule.id)) continue;
      if (rule.appliesTo && !rule.appliesTo(entryPath)) continue;
      rule.pattern.lastIndex = 0;
      for (const match of text.matchAll(rule.pattern)) {
        findings.push({
          surface,
          path: entryPath,
          rule: rule.id,
          line: lineNumber(text, match.index ?? 0),
          excerpt: excerpt(match[0]),
          message: rule.message,
        });
      }
    }
  }

  return findings;
}

/** Minimal POSIX/ustar reader sufficient for git-archive and npm-pack output. */
export function readTarEntries(tarBuffer) {
  const entries = [];
  let offset = 0;
  let pendingLongName = null;
  let pendingPax = {};
  let globalPax = {};

  const readPax = (content, entryName) => {
    const attributes = {};
    let cursor = 0;
    while (cursor < content.length) {
      const space = content.indexOf(0x20, cursor);
      if (space < 0) throw new Error(`malformed PAX length in ${entryName}`);
      const length = Number.parseInt(content.subarray(cursor, space).toString("ascii"), 10);
      if (!Number.isSafeInteger(length) || length <= 0 || cursor + length > content.length) {
        throw new Error(`invalid PAX record length in ${entryName}`);
      }
      const record = content.subarray(space + 1, cursor + length - 1).toString("utf8");
      const equals = record.indexOf("=");
      if (equals <= 0) throw new Error(`malformed PAX record in ${entryName}`);
      attributes[record.slice(0, equals)] = record.slice(equals + 1);
      cursor += length;
    }
    return attributes;
  };

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const readString = (start, length) =>
      header
        .subarray(start, start + length)
        .toString("utf8")
        .replace(/\0.*$/su, "");
    const rawSize = readString(124, 12).trim();
    const size = rawSize ? Number.parseInt(rawSize.replace(/\0/g, "").trim(), 8) : 0;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`invalid tar entry size at byte ${offset}: ${JSON.stringify(rawSize)}`);
    }
    const rawChecksum = readString(148, 8).replace(/\0/g, "").trim();
    const expectedChecksum = Number.parseInt(rawChecksum, 8);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    let actualChecksum = 0;
    for (const byte of checksumHeader) actualChecksum += byte;
    if (!Number.isSafeInteger(expectedChecksum) || expectedChecksum !== actualChecksum) {
      throw new Error(`invalid tar header checksum at byte ${offset}`);
    }

    const name = readString(0, 100);
    const prefix = readString(345, 155);
    const type = readString(156, 1) || "0";
    const linkName = readString(157, 100);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > tarBuffer.length) {
      throw new Error(`truncated tar entry ${name || "<unnamed>"}`);
    }
    const content = tarBuffer.subarray(bodyStart, bodyEnd);

    if (type === "L") {
      pendingLongName = content.toString("utf8").replace(/\0.*$/su, "");
    } else if (type === "x" || type === "g") {
      const attributes = readPax(content, name || "PAX header");
      if (type === "g") globalPax = { ...globalPax, ...attributes };
      else pendingPax = attributes;
    } else {
      const attributes = { ...globalPax, ...pendingPax };
      const fullName =
        pendingLongName ?? attributes.path ?? (prefix ? `${prefix}/${name}` : name);
      pendingLongName = null;
      pendingPax = {};
      if (type === "0" || type === "\0") entries.push({ path: fullName, content });
      else if (type === "2") {
        entries.push({ path: fullName, content: attributes.linkpath ?? linkName });
      }
    }

    offset = bodyStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

export function scanTarBuffer(buffer, { compressed = false, surface = "tar" } = {}) {
  const tarBuffer = compressed ? gunzipSync(buffer) : buffer;
  const entries = readTarEntries(tarBuffer);
  if (entries.length === 0) throw new Error(`${surface} contains no files`);
  return scanEntries(entries, { surface });
}

export function trackedEntries(root = repoRoot) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  const names = output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  return names.map((name) => {
    try {
      const fullPath = path.join(root, name);
      const stat = lstatSync(fullPath);
      return {
        path: name,
        content: stat.isSymbolicLink() ? readlinkSync(fullPath) : readFileSync(fullPath),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`tracked file could not be read (${name}): ${detail}`);
    }
  });
}

/** Generate and scan real source + npm artifacts from committed HEAD. */
export function scanReleaseArtifacts(root = repoRoot) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "relay-public-boundary-"));
  const runChecked = (command, args, label, options = {}) => {
    try {
      return execFileSync(command, args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        ...options,
      });
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? String(error.stderr).trim()
          : "";
      const stdout =
        error && typeof error === "object" && "stdout" in error
          ? String(error.stdout).trim()
          : "";
      const detail = stderr || stdout || (error instanceof Error ? error.message : String(error));
      throw new Error(`${label} failed: ${detail}`);
    }
  };
  try {
    const archivePath = path.join(tempRoot, "relay-source.tar");
    runChecked(
      "git",
      ["archive", "--format=tar", `--output=${archivePath}`, "HEAD"],
      "git archive",
    );
    const archiveFindings = scanTarBuffer(readFileSync(archivePath), {
      surface: "Git archive",
    });

    runChecked("npm", ["pack", "--silent", "--pack-destination", tempRoot], "npm pack", {
      env: {
        ...process.env,
        npm_config_cache: path.join(tempRoot, "npm-cache"),
      },
    });
    const tarballs = readdirSync(tempRoot).filter((name) => name.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      throw new Error(`npm pack produced ${tarballs.length} tarballs; expected exactly one`);
    }
    const npmFindings = scanTarBuffer(readFileSync(path.join(tempRoot, tarballs[0])), {
      compressed: true,
      surface: "npm tarball",
    });
    return [...archiveFindings, ...npmFindings];
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function report(findings, surface) {
  if (findings.length === 0) {
    console.log(`[public-boundary] OK — ${surface} contains no classified private residue.`);
    return;
  }
  console.error(`[public-boundary] FAIL — ${findings.length} finding(s) in ${surface}:`);
  for (const finding of findings) {
    console.error(
      `  - ${finding.path}:${finding.line} [${finding.rule}] ${finding.excerpt}`,
    );
  }
  process.exitCode = 1;
}

function main() {
  const [mode = "tracked", artifactPath] = process.argv.slice(2);
  try {
    if (mode === "tracked") {
      report(scanEntries(trackedEntries(), { surface: "tracked tree" }), "tracked tree");
      return;
    }
    if (mode === "artifacts") {
      report(scanReleaseArtifacts(), "Git archive and npm tarball");
      return;
    }
    if (mode === "archive" || mode === "npm") {
      if (!artifactPath) throw new Error(`${mode} mode requires an artifact path`);
      const findings = scanTarBuffer(readFileSync(path.resolve(artifactPath)), {
        compressed: mode === "npm",
        surface: mode === "npm" ? "npm tarball" : "Git archive",
      });
      report(findings, mode === "npm" ? "npm tarball" : "Git archive");
      return;
    }
    throw new Error(
      `unknown mode ${JSON.stringify(mode)} (expected tracked, artifacts, archive, or npm)`,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[public-boundary] ERROR — guard could not run: ${detail}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) main();
