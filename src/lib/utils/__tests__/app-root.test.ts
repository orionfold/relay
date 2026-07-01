import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getAppRoot } from "../app-root";

/**
 * getAppRoot must resolve the orionfold-relay package root in TWO layouts:
 *   - Source tree: the depth passed by the caller lands on the repo root
 *     (which has package.json). This path must stay byte-identical to before.
 *   - Bundled dist/cli.js: every caller flattens to the same dir, so the
 *     hardcoded depth overshoots — the resolver must walk UP to the
 *     orionfold-relay package.json instead of falling back to cwd().
 */
describe("getAppRoot", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "app-root-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writePkg(dir: string, name: string) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.2.3" }));
  }

  it("resolves via the passed depth when that candidate has package.json (source tree)", () => {
    // pkgRoot/src/lib/packs/  — caller at depth 3 from packs/ lands on pkgRoot
    writePkg(root, "orionfold-relay");
    const callerDir = join(root, "src", "lib", "packs");
    mkdirSync(callerDir, { recursive: true });

    expect(getAppRoot(callerDir, 3)).toBe(root);
  });

  it("walks up to the orionfold-relay package.json when depth overshoots (bundle)", () => {
    // Simulate dist/cli.js: caller is pkgRoot/dist, but passes depth 3 (source
    // assumption). Depth-3 candidate is above pkgRoot → misses. Walk up finds it.
    writePkg(root, "orionfold-relay");
    const distDir = join(root, "dist");
    mkdirSync(distDir, { recursive: true });

    expect(getAppRoot(distDir, 3)).toBe(root);
  });

  it("skips a foreign package.json while walking up to the orionfold-relay root", () => {
    // Layout: root(orionfold-relay) / sub(foreign pkg) / dist(caller).
    // The depth given (5) overshoots above root → fast path misses. The walk
    // from dist/ hits sub/'s foreign package.json first; it must NOT stop there
    // and must continue up to root's orionfold-relay package.json.
    writePkg(root, "orionfold-relay");
    const sub = join(root, "sub");
    const distDir = join(sub, "dist");
    mkdirSync(distDir, { recursive: true });
    writePkg(sub, "some-other-package");

    expect(getAppRoot(distDir, 5)).toBe(root);
  });

  it("falls back to process.cwd() when no orionfold-relay package.json is found", () => {
    const orphan = join(root, "a", "b", "c");
    mkdirSync(orphan, { recursive: true });
    // no orionfold-relay package.json anywhere above → cwd fallback
    expect(getAppRoot(orphan, 2)).toBe(process.cwd());
  });

  it("falls back to process.cwd() when metaDirname is undefined", () => {
    expect(getAppRoot(undefined, 3)).toBe(process.cwd());
  });
});
