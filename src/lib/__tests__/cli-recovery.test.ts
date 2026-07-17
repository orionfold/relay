import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Relay recovery CLI", () => {
  it("short-circuits recovery commands through a dynamic import", () => {
    const source = readFileSync(new URL("../../../bin/cli.ts", import.meta.url), "utf8");
    expect(source).toContain('firstArg === "recovery"');
    expect(source).toContain('await import("../src/lib/recovery/cli")');
    expect(source).toContain("process.argv.slice(3)");
  });

  it("documents key separation and the empty-root restore path", () => {
    const source = readFileSync(new URL("../recovery/cli.ts", import.meta.url), "utf8");
    expect(source).toContain("Keep this key separate");
    expect(source).toContain("target-data-dir");
    expect(source).toContain("Orionfold cannot recover it");
  });
});
