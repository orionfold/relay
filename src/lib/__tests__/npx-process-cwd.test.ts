import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

/**
 * Safety-net test: server-side code must NOT use process.cwd() for resolving
 * app-internal assets (docs, book, public, src). Under npx distribution,
 * process.cwd() returns the npm cache directory, not the app root.
 *
 * Allowed alternatives:
 *   - import.meta.dirname / __dirname  (resolves relative to source file)
 *   - getLaunchCwd()                    (resolves to user's working directory)
 *   - Static file conventions           (e.g., src/app/icon.png)
 *
 * Excluded:
 *   - bin/cli.ts (CLI entrypoint — it defines the cwd context)
 *   - Test files (__tests__/)
 *   - workspace-context.ts (defines getLaunchCwd itself, fallback is intentional)
 */
describe("npx safety: no process.cwd() for app-internal asset resolution", () => {
  // Project root (src/lib/__tests__/ → 3 levels up)
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

  /** Recursively collect .ts/.tsx files, skipping node_modules and __tests__ */
  function collectFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === ".next") continue;
        results.push(...collectFiles(full));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(full);
      }
    }
    return results;
  }

  // Files that are intentionally allowed to use process.cwd()
  const ALLOWED_FILES = [
    "bin/cli.ts",                                // CLI entrypoint defines cwd context
    "src/lib/environment/workspace-context.ts",   // defines getLaunchCwd fallback
    "src/lib/utils/app-root.ts",                  // validated fallback when import.meta.dirname is virtual
    "drizzle.config.ts",                          // build-time config
  ];

  /**
   * Patterns that indicate process.cwd() is used to resolve app-internal paths.
   * We look for join/resolve calls that combine process.cwd() with known app dirs.
   */
  const DANGEROUS_PATTERNS = [
    /process\.cwd\(\)\s*,\s*["'](?:public|docs|src)\b/,
    /process\.cwd\(\)\s*,\s*["'].*?\.(?:png|ico|svg|jpg|md|json)["']/,
    // Catch bare process.cwd() in docs/profiles modules (even without join)
    /process\.cwd\(\)/,
  ];

  // Files in these directories are NEVER allowed to use process.cwd()
  const STRICT_DIRS = ["src/lib/docs/", "src/lib/agents/profiles/"];

  it("server-side code does not use process.cwd() for internal asset paths", () => {
    const srcFiles = collectFiles(join(PROJECT_ROOT, "src"));
    const binFiles = collectFiles(join(PROJECT_ROOT, "bin"));
    const allFiles = [...srcFiles, ...binFiles];

    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const filePath of allFiles) {
      const relative = filePath.replace(PROJECT_ROOT + "/", "");

      // Skip allowed files
      if (ALLOWED_FILES.some((allowed) => relative.endsWith(allowed))) continue;
      // Skip test files
      if (relative.includes("__tests__")) continue;

      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const isStrictDir = STRICT_DIRS.some((d) => relative.startsWith(d));

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // In strict dirs, ANY process.cwd() in code (not comments) is a violation
        const trimmed = line.trim();
        const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
        if (isStrictDir && !isComment && /process\.cwd\(\)/.test(line)) {
          violations.push({ file: relative, line: i + 1, text: line.trim() });
          continue;
        }
        // Elsewhere, only flag process.cwd() combined with app-internal paths
        for (const pattern of DANGEROUS_PATTERNS.slice(0, 2)) {
          if (pattern.test(line)) {
            violations.push({ file: relative, line: i + 1, text: line.trim() });
          }
        }
      }
    }

    expect(
      violations,
      `Found process.cwd() used for app-internal paths (breaks under npx):\n${violations
        .map((v) => `  ${v.file}:${v.line} → ${v.text}`)
        .join("\n")}`
    ).toEqual([]);
  });

  it("dynamic icon/apple-icon files do not exist (break under npx)", () => {
    const appDir = join(PROJECT_ROOT, "src", "app");
    const dynamicIcons = ["icon.tsx", "icon.jsx", "apple-icon.tsx", "apple-icon.jsx"];

    const found = dynamicIcons.filter((name) => {
      try {
        statSync(join(appDir, name));
        return true;
      } catch {
        return false;
      }
    });

    expect(
      found,
      `Dynamic icon files found — these break under npx because they use process.cwd(). Use explicit metadata.icons in layout.tsx instead: ${found.join(", ")}`
    ).toEqual([]);
  });

  it("layout.tsx has explicit icons metadata (not convention-based)", () => {
    const layoutPath = join(PROJECT_ROOT, "src", "app", "layout.tsx");
    const content = readFileSync(layoutPath, "utf-8");

    expect(
      content.includes("icons:"),
      "layout.tsx must have explicit icons metadata — convention-based icon.png/icon.tsx files break under npx"
    ).toBe(true);
  });

  it("icon assets referenced in metadata exist in public/", () => {
    const publicDir = join(PROJECT_ROOT, "public");
    const requiredIcons = ["ainative-s-64.png", "ainative-s-128.png"];

    const missing = requiredIcons.filter((name) => {
      try {
        statSync(join(publicDir, name));
        return false;
      } catch {
        return true;
      }
    });

    expect(
      missing,
      `Missing icon assets in public/: ${missing.join(", ")}`
    ).toEqual([]);
  });
});
