/**
 * cross-runtime-contract.test.ts — TDR-035 §6 drift heuristics (T18).
 *
 * These tests grep the source tree for patterns that would silently regress
 * the plugin-MCP cross-runtime contract. Unit tests verify BEHAVIOR; these
 * tests verify the SHAPE of the source — catching refactor-induced drift
 * that would pass behavior tests but break the contract.
 *
 * Each heuristic includes a "positive case" self-check against an in-memory
 * fixture that SHOULD trigger — proving the grep is actually working.
 *
 * Tag: drift-heuristic (used by /architect drift detection mode — run
 * independently with `npm test -- -t drift-heuristic`).
 *
 * Spec anchor: features/chat-tools-plugin-kind-1.md "Core security posture"
 * + TDR-035 §6 "Drift heuristics" + handoff/2026-04-19-m3-phase-b-complete-
 * handoff.md "Regression guards".
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Repo root = this-file/../../../..
//   __tests__ -> plugins -> lib -> src -> <root>
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const agentsRoot = path.join(repoRoot, "src", "lib", "agents");
const pluginsRoot = path.join(repoRoot, "src", "lib", "plugins");

/**
 * Recursively list `.ts` files under `dir`, excluding `node_modules` and
 * `__tests__` subdirectories. Used by heuristics 2 and 3.
 */
function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  function walk(current: string): void {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
    }
  }
  walk(dir);
  return out;
}

/**
 * Extract the body of an exported async/sync function whose name matches
 * `fnName` from a source string. Returns the substring between the opening
 * brace (after the signature) and its matching closing brace. Brace-balanced
 * so nested blocks do not break the extraction.
 */
function extractFunctionBody(src: string, fnName: string): string | null {
  const headerRe = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${fnName}\\b[^{]*\\{`,
    "m",
  );
  const match = headerRe.exec(src);
  if (!match) return null;
  const bodyStart = match.index + match[0].length;
  let depth = 1;
  let i = bodyStart;
  // Skip strings / template literals / line + block comments so a `{` inside
  // a string does not throw off brace counting. Minimal state machine.
  while (i < src.length && depth > 0) {
    const ch = src[i];
    const next = src[i + 1];
    // Line comment
    if (ch === "/" && next === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    // Single-quote string or double-quote string
    if (ch === "'" || ch === '"') {
      i++;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === "\\") i += 2;
        else i++;
      }
      i++;
      continue;
    }
    // Template literal (no ${} nesting handling needed for our usage)
    if (ch === "`") {
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") i += 2;
        else i++;
      }
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  // i points one past the closing brace.
  return src.slice(bodyStart, i - 1);
}

describe("drift-heuristic", () => {
  // -------------------------------------------------------------------------
  // Heuristic 1: five-source merge order — ainative must spread last.
  //
  // TDR-035 §1 specifies the merge shape:
  //   { ...profileServers, ...browserServers, ...externalServers,
  //     ...pluginServers, ainative: ainativeServer }
  //
  // A refactor that accidentally moves `ainative: ainativeServer` BEFORE any
  // `...xxxServers` spread would let a plugin shadow the ainative tools (via
  // `mcpServers: { ainative: ... }` in its .mcp.json) because JS object
  // literal semantics give "last key wins" precedence.
  //
  // This heuristic checks the SOURCE TEXT of each adapter's merge helper,
  // verifying that the `ainative:` key assignment appears AFTER the last
  // `...Servers` spread.
  // -------------------------------------------------------------------------
  describe("Heuristic 1: five-source merge order — ainative spreads last", () => {
    const MERGE_HELPERS: Array<{ file: string; fn: string }> = [
      {
        file: path.join(agentsRoot, "claude-agent.ts"),
        fn: "withAinativeMcpServer",
      },
      {
        file: path.join(agentsRoot, "runtime", "anthropic-direct.ts"),
        fn: "withAnthropicDirectMcpServers",
      },
      {
        file: path.join(agentsRoot, "runtime", "openai-direct.ts"),
        fn: "withOpenAiDirectMcpServers",
      },
    ];

    for (const { file, fn } of MERGE_HELPERS) {
      it(`${path.relative(repoRoot, file)}: ${fn} places 'relay:' after all ...Servers spreads`, () => {
        expect(fs.existsSync(file)).toBe(true);
        const src = fs.readFileSync(file, "utf-8");
        const body = extractFunctionBody(src, fn);
        expect(body, `function ${fn} not found in ${file}`).not.toBeNull();

        // Locate the FIRST occurrence of `ainative:` (the merged-key assignment).
        const ainativeIdx = body!.search(/\brelay\s*:/);
        expect(ainativeIdx, `'relay:' key not found in ${fn} body`).toBeGreaterThan(-1);

        // Locate the LAST `...xxxServers` spread index. Matches any spread
        // whose identifier ends in `Servers` (pluginServers, profileServers,
        // browserServers, externalServers, or a future-added name).
        const spreadRe = /\.\.\.\s*[A-Za-z_][A-Za-z0-9_]*Servers\b/g;
        let lastSpreadIdx = -1;
        let m: RegExpExecArray | null;
        while ((m = spreadRe.exec(body!)) !== null) {
          lastSpreadIdx = m.index;
        }
        expect(
          lastSpreadIdx,
          `no ...XxxServers spread found in ${fn} body — helper shape changed?`,
        ).toBeGreaterThan(-1);

        expect(
          ainativeIdx,
          `DRIFT: 'relay:' appears BEFORE last ...Servers spread in ${fn} — ` +
            `plugins can shadow relay tools. TDR-035 §1 requires relay-last.`,
        ).toBeGreaterThan(lastSpreadIdx);
      });
    }

    it("meta-self-check: grep correctly rejects ainative-first fixture", () => {
      // Fake source where ainative: comes BEFORE ...pluginServers. The
      // extract + ordering logic MUST flag this as drift.
      const badSource = [
        "export async function badHelper(pluginServers: Record<string, unknown>) {",
        "  return {",
        "    relay: {},",
        "    ...pluginServers,",
        "  };",
        "}",
        "",
      ].join("\n");

      const body = extractFunctionBody(badSource, "badHelper");
      expect(body).not.toBeNull();

      const ainativeIdx = body!.search(/\brelay\s*:/);
      const spreadRe = /\.\.\.\s*[A-Za-z_][A-Za-z0-9_]*Servers\b/g;
      let lastSpreadIdx = -1;
      let m: RegExpExecArray | null;
      while ((m = spreadRe.exec(body!)) !== null) {
        lastSpreadIdx = m.index;
      }

      // In the drift case, ainativeIdx is LESS than lastSpreadIdx — i.e. the
      // real assertion `ainativeIdx > lastSpreadIdx` would FAIL. Confirm.
      expect(ainativeIdx).toBeGreaterThan(-1);
      expect(lastSpreadIdx).toBeGreaterThan(-1);
      expect(ainativeIdx).toBeLessThan(lastSpreadIdx);
    });
  });

  // -------------------------------------------------------------------------
  // Heuristic 2: loader authority — runtime adapters must NOT read plugin.yaml
  // or plugins.lock directly.
  //
  // The only sanctioned reader of `plugin.yaml` is `src/lib/plugins/
  // mcp-loader.ts` (and its collaborators under `src/lib/plugins/`). If a
  // contributor adds a direct read inside a runtime adapter (e.g. to skip
  // the loader for "optimization"), capabilities leak unchecked — the
  // capability gate in mcp-loader + capability-check would be bypassed.
  //
  // Heuristic: grep every `.ts` file under `src/lib/agents/` for the string
  // `plugin.yaml` or `plugins.lock`. Allowed matches: zero.
  // -------------------------------------------------------------------------
  describe("Heuristic 2: loader authority — runtime adapters don't read plugin.yaml", () => {
    const FORBIDDEN_STRINGS = ["plugin.yaml", "plugins.lock"];

    it("no file under src/lib/agents/ references plugin.yaml or plugins.lock", () => {
      const files = listTsFiles(agentsRoot);
      expect(files.length, "agents dir must contain .ts files").toBeGreaterThan(0);

      const offenders: string[] = [];
      for (const file of files) {
        const src = fs.readFileSync(file, "utf-8");
        const lines = src.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const needle of FORBIDDEN_STRINGS) {
            if (line.includes(needle)) {
              offenders.push(
                `${path.relative(repoRoot, file)}:${i + 1} — contains "${needle}"`,
              );
            }
          }
        }
      }

      expect(
        offenders,
        `DRIFT: runtime adapters must not read plugin manifests directly. ` +
          `Use src/lib/plugins/mcp-loader.ts (the sanctioned loader). Offenders:\n` +
          offenders.join("\n"),
      ).toEqual([]);
    });

    it("meta-self-check: grep correctly flags a fake adapter that references plugin.yaml", () => {
      // Simulate a drifted adapter source that references plugin.yaml directly.
      const badSource = [
        'import fs from "node:fs";',
        "export function leakyAdapter() {",
        '  return fs.readFileSync("plugin.yaml", "utf-8");',
        "}",
        "",
      ].join("\n");

      const hits: string[] = [];
      const lines = badSource.split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const needle of FORBIDDEN_STRINGS) {
          if (lines[i].includes(needle)) {
            hits.push(`line ${i + 1} — contains "${needle}"`);
          }
        }
      }
      // The meta-check MUST catch the drift.
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]).toContain("plugin.yaml");
    });
  });

  // -------------------------------------------------------------------------
  // Heuristic 3: stdio detachment — no spawn({ detached: true }) under plugins/.
  //
  // TDR-035 §6 mandates `detached: false` for all plugin subprocesses. A
  // detached child decouples its lifecycle from ainative — on shutdown, the
  // plugin orphans and accumulates as a zombie over time. Also catches
  // `shell: true` (classic fork-safety hazard — untrusted plugin args could
  // inject shell metacharacters).
  //
  // Two sub-checks:
  //   (a) No `detached: true` or `shell: true` literal anywhere under
  //       src/lib/plugins/.
  //   (b) Every `spawn(` call site under src/lib/plugins/ MUST include
  //       `detached: false` within 400 chars — forces the author to think
  //       about lifecycle explicitly.
  // -------------------------------------------------------------------------
  describe("Heuristic 3: stdio detachment — spawn() under plugins/ must be non-detached", () => {
    const SPAWN_CONTEXT_WINDOW = 400;

    function findSpawnSites(src: string): Array<{ line: number; index: number }> {
      // Match `spawn(` not inside a comment (very basic: skip if the line
      // begins with `//` or ` *` after trim). For windowing we need the
      // exact index of the match.
      const sites: Array<{ line: number; index: number }> = [];
      const re = /\bspawn\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const idx = m.index;
        // Find the line containing this index.
        const lineStart = src.lastIndexOf("\n", idx) + 1;
        const lineEnd = src.indexOf("\n", idx);
        const lineContent = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
        const trimmed = lineContent.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        const lineNum = src.slice(0, idx).split("\n").length;
        sites.push({ line: lineNum, index: idx });
      }
      return sites;
    }

    it("no file under src/lib/plugins/ contains 'detached: true' or 'shell: true'", () => {
      const files = listTsFiles(pluginsRoot);
      expect(files.length, "plugins dir must contain .ts files").toBeGreaterThan(0);

      const offenders: string[] = [];
      // Note: both patterns tolerate any whitespace (or none) between key and value.
      const forbidden = [/\bdetached\s*:\s*true\b/, /\bshell\s*:\s*true\b/];

      for (const file of files) {
        const src = fs.readFileSync(file, "utf-8");
        const lines = src.split("\n");
        for (let i = 0; i < lines.length; i++) {
          // Skip comment-only lines so doc comments like `// detached: true is bad`
          // don't false-trigger.
          const trimmed = lines[i].trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
          for (const pat of forbidden) {
            if (pat.test(lines[i])) {
              offenders.push(
                `${path.relative(repoRoot, file)}:${i + 1} — ${lines[i].trim()}`,
              );
            }
          }
        }
      }

      expect(
        offenders,
        `DRIFT: plugin subprocesses must use detached:false and shell:false per TDR-035 §6. Offenders:\n` +
          offenders.join("\n"),
      ).toEqual([]);
    });

    it("every spawn() call site under src/lib/plugins/ includes 'detached: false' within 400 chars", () => {
      const files = listTsFiles(pluginsRoot);
      const offenders: string[] = [];

      for (const file of files) {
        const src = fs.readFileSync(file, "utf-8");
        const sites = findSpawnSites(src);
        for (const site of sites) {
          const window = src.slice(site.index, site.index + SPAWN_CONTEXT_WINDOW);
          if (!/\bdetached\s*:\s*false\b/.test(window)) {
            offenders.push(
              `${path.relative(repoRoot, file)}:${site.line} — spawn() without explicit detached:false in next ${SPAWN_CONTEXT_WINDOW} chars`,
            );
          }
        }
      }

      expect(
        offenders,
        `DRIFT: every spawn() under src/lib/plugins/ must explicitly set detached:false (TDR-035 §6). Offenders:\n` +
          offenders.join("\n"),
      ).toEqual([]);
    });

    it("meta-self-check: grep correctly flags detached:true fixture", () => {
      const badSource = [
        "export function leakySpawn() {",
        '  return runProcess("cmd", [], { detached: true });',
        "}",
        "",
      ].join("\n");

      const lines = badSource.split("\n");
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        if (/\bdetached\s*:\s*true\b/.test(lines[i])) {
          found = true;
          break;
        }
      }
      expect(found, "meta-check must flag detached:true in fixture").toBe(true);
    });

    it("meta-self-check: grep correctly flags spawn() without detached:false within window", () => {
      // Fixture: a spawn() call with NO detached flag in the next 400 chars.
      const badSource = [
        "export function implicitSpawn() {",
        '  const child = spawn("cmd", [], { stdio: "pipe" });',
        "  return child;",
        "}",
        "",
      ].join("\n");

      const re = /\bspawn\s*\(/g;
      let m: RegExpExecArray | null;
      const misses: number[] = [];
      while ((m = re.exec(badSource)) !== null) {
        const lineStart = badSource.lastIndexOf("\n", m.index) + 1;
        const lineEnd = badSource.indexOf("\n", m.index);
        const lineContent = badSource.slice(
          lineStart,
          lineEnd === -1 ? badSource.length : lineEnd,
        );
        const trimmed = lineContent.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        const window = badSource.slice(m.index, m.index + 400);
        if (!/\bdetached\s*:\s*false\b/.test(window)) {
          misses.push(m.index);
        }
      }
      expect(misses.length).toBeGreaterThan(0);
    });
  });
});
