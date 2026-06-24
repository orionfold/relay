/**
 * Resolve the app root directory.
 * - import.meta.dirname works under npx (real path to installed package)
 * - Turbopack compiles it to /ROOT/... (virtual, doesn't exist) → fall back to process.cwd()
 *
 * Uses dynamic require() for fs/path to avoid bundling Node built-ins
 * into client components that may share modules importing this helper.
 */
export function getAppRoot(metaDirname: string | undefined, depth: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { existsSync } = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("path") as typeof import("path");

  if (metaDirname) {
    const candidate = join(metaDirname, ...Array(depth).fill(".."));
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  return process.cwd();
}
