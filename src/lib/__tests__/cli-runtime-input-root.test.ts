import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

describe("CLI runtime input root handoff", () => {
  it("passes the installed Relay package root to the Next child", () => {
    const source = readFileSync(resolve(PROJECT_ROOT, "bin", "cli.ts"), "utf8");
    expect(source).toMatch(/RELAY_RUNTIME_INPUT_ROOT:\s*appDir/);
  });

  it("pins the OCI runtime input root to the application filesystem", () => {
    const dockerfile = readFileSync(
      resolve(PROJECT_ROOT, "Dockerfile.relay-host"),
      "utf8",
    );
    expect(dockerfile).toContain("RELAY_RUNTIME_INPUT_ROOT=/app");
  });
});
