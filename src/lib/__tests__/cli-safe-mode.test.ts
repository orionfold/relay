/**
 * cli-safe-mode.test.ts — T13 drift heuristic test for the --safe-mode CLI flag.
 *
 * Following the grep-based pattern used in other bin/cli.ts integration tests
 * (TDR-035). The full bin/cli.ts cannot be spawned cheaply in the test runner
 * (DB migrations, dist build, port allocation), so we assert the source-level
 * contract: the flag is declared, parsed, and propagated into the child
 * process env as RELAY_SAFE_MODE=true.
 *
 * Three assertions cover:
 *   1. Flag is declared on the commander program
 *   2. The parsed `opts.safeMode` is used to set process.env.RELAY_SAFE_MODE
 *   3. The child spawn env explicitly includes RELAY_SAFE_MODE
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const CLI_PATH = resolve(PROJECT_ROOT, "bin", "cli.ts");

describe("bin/cli.ts --safe-mode flag (T13)", () => {
  it("bin/cli.ts exists", () => {
    expect(existsSync(CLI_PATH)).toBe(true);
  });

  it("declares the --safe-mode flag via commander .option()", () => {
    const content = readFileSync(CLI_PATH, "utf-8");
    // Exact match: .option("--safe-mode", ...)
    expect(content).toMatch(/\.option\(\s*"--safe-mode"/);
  });

  it("propagates opts.safeMode into process.env.RELAY_SAFE_MODE", () => {
    const content = readFileSync(CLI_PATH, "utf-8");
    // The module-top-level apply block — matches:
    //   process.env.RELAY_SAFE_MODE = "true";
    expect(content).toMatch(/process\.env\.RELAY_SAFE_MODE\s*=\s*"true"/);
    // And the branching condition uses opts.safeMode
    expect(content).toMatch(/opts\.safeMode/);
  });

  it("explicitly passes RELAY_SAFE_MODE into the Next.js child spawn env", () => {
    const content = readFileSync(CLI_PATH, "utf-8");
    // Expect the conditional spread in the spawn env object:
    //   ...(opts.safeMode ? { RELAY_SAFE_MODE: "true" } : {}),
    expect(content).toMatch(
      /opts\.safeMode\s*\?\s*\{\s*RELAY_SAFE_MODE:\s*"true"\s*\}/,
    );
  });
});
