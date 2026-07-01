import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const PKG_NAME = "orionfold-relay";

/**
 * Resolve the app root directory.
 * - import.meta.dirname works under npx (real path to installed package)
 * - Turbopack compiles it to /ROOT/... (virtual, doesn't exist) → fall back to process.cwd()
 *
 * Two layouts must resolve correctly:
 *   1. Source tree — the `depth` a caller passes lands exactly on the repo
 *      root (e.g. src/lib/packs/ → depth 3). This is the fast path and stays
 *      byte-identical to the original behavior.
 *   2. Bundled dist/cli.js — tsup flattens every module into one file, so
 *      `import.meta.dirname` is `dist/` for ALL callers regardless of the
 *      depth they pass (a source-tree assumption). Depth then overshoots and
 *      the depth candidate misses. Rather than fix depth math at every call
 *      site (fragile — 5 sites, different depths), we walk UP from the caller
 *      until we find the `orionfold-relay` package.json. This makes the passed
 *      `depth` a hint, not a hard requirement, so all call sites resolve in the
 *      bundle without per-site changes.
 *
 * The upward walk verifies `name === "orionfold-relay"` (not just any
 * package.json) so that under npx it anchors to OUR package, never a foreign
 * package.json in the user's launch dir.
 *
 * Uses static `node:` built-in imports. These resolve natively in every
 * server context that consumes this helper — Next.js server modules, the
 * instrumentation hook, and the tsup ESM CLI bundle. (An earlier version used
 * dynamic `require("fs")` to keep built-ins out of *client* bundles, but no
 * client component imports this module — every importer is under src/lib/**
 * server code — and the `require` form crashed the ESM CLI bundle with
 * "Dynamic require of \"fs\" is not supported" the moment a CLI subcommand
 * pulled the apps-registry chain in. The `node:` prefix is the portable fix.)
 */
export function getAppRoot(metaDirname: string | undefined, depth: number): string {
  if (metaDirname) {
    // Fast path — source tree: the passed depth lands on the package root.
    const candidate = join(metaDirname, ...Array(depth).fill(".."));
    if (isPackageRoot(candidate)) return candidate;

    // Bundle fallback: walk up until we hit the orionfold-relay package root.
    let dir = metaDirname;
    while (true) {
      if (isPackageRoot(dir)) return dir;
      const parent = dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
  }
  return process.cwd();
}

/** True if `dir` holds the orionfold-relay package.json. */
function isPackageRoot(dir: string): boolean {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
    return pkg.name === PKG_NAME;
  } catch {
    return false;
  }
}
