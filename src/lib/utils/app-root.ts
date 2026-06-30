import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolve the app root directory.
 * - import.meta.dirname works under npx (real path to installed package)
 * - Turbopack compiles it to /ROOT/... (virtual, doesn't exist) → fall back to process.cwd()
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
    const candidate = join(metaDirname, ...Array(depth).fill(".."));
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  return process.cwd();
}
