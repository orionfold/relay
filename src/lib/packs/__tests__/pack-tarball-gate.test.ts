import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect } from "vitest";
// The gate's CLI entry only runs under import.meta.url === argv[1]; the pure
// exports are safe to import directly.
import {
  runCheck,
  dirSizeBytes,
} from "../../../../scripts/check-pack-tarball.mjs";

// R4 pack-tarball-diet — the size + allowlist gate. Exercises the pure runCheck
// core against synthetic templates trees + a fixture bundled.json, covering the
// clean pass and each drift class: undeclared-on-disk, declared-but-missing,
// and over-budget (the deferral trigger).

const cleanups: Array<() => void> = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** Stage a templates/ tree with the given pack dirs (each holding a sized file)
 * and a bundled.json declaring `declared` with `budgetKb`. */
function stage(opts: {
  present: Array<{ id: string; bytes: number }>;
  declared: string[];
  budgetKb: number;
}): { templatesDir: string; bundledJsonPath: string } {
  const root = tempDir("tarball-gate-");
  const templatesDir = path.join(root, "templates");
  mkdirSync(templatesDir, { recursive: true });
  for (const p of opts.present) {
    const dir = path.join(templatesDir, p.id);
    mkdirSync(path.join(dir, "base"), { recursive: true });
    writeFileSync(path.join(dir, "base", "manifest.yaml"), "x".repeat(p.bytes));
  }
  const bundledJsonPath = path.join(root, "bundled.json");
  writeFileSync(
    bundledJsonPath,
    JSON.stringify({ bundledPackIds: opts.declared, sizeBudgetKb: opts.budgetKb }),
  );
  return { templatesDir, bundledJsonPath };
}

describe("dirSizeBytes", () => {
  it("sums file bytes recursively", () => {
    const { templatesDir } = stage({
      present: [{ id: "a", bytes: 1000 }],
      declared: ["a"],
      budgetKb: 10,
    });
    expect(dirSizeBytes(templatesDir)).toBe(1000);
  });
});

describe("runCheck", () => {
  it("clean: declared === present and under budget → no findings", () => {
    const { templatesDir, bundledJsonPath } = stage({
      present: [
        { id: "relay-a", bytes: 2048 },
        { id: "relay-b", bytes: 2048 },
      ],
      declared: ["relay-a", "relay-b"],
      budgetKb: 100,
    });
    const r = runCheck({ templatesDir, bundledJsonPath });
    expect(r.findings).toEqual([]);
    expect(r.overBudget).toBe(false);
  });

  it("undeclared drift: a pack on disk not in the allowlist → finding", () => {
    const { templatesDir, bundledJsonPath } = stage({
      present: [
        { id: "relay-a", bytes: 100 },
        { id: "relay-sneaky", bytes: 100 },
      ],
      declared: ["relay-a"],
      budgetKb: 100,
    });
    const r = runCheck({ templatesDir, bundledJsonPath });
    expect(r.findings.some((f) => /undeclared.*relay-sneaky/.test(f))).toBe(true);
  });

  it("missing drift: a declared pack with no template dir → finding", () => {
    const { templatesDir, bundledJsonPath } = stage({
      present: [{ id: "relay-a", bytes: 100 }],
      declared: ["relay-a", "relay-ghost"],
      budgetKb: 100,
    });
    const r = runCheck({ templatesDir, bundledJsonPath });
    expect(r.findings.some((f) => /missing.*relay-ghost/.test(f))).toBe(true);
  });

  it("over-budget: total templates size exceeds the budget → finding (the deferral trigger)", () => {
    const { templatesDir, bundledJsonPath } = stage({
      present: [
        { id: "relay-a", bytes: 60 * 1024 },
        { id: "relay-b", bytes: 60 * 1024 },
      ],
      declared: ["relay-a", "relay-b"],
      budgetKb: 100, // 120 KB present > 100 KB budget
    });
    const r = runCheck({ templatesDir, bundledJsonPath });
    expect(r.overBudget).toBe(true);
    expect(r.findings.some((f) => /size budget exceeded/.test(f))).toBe(true);
  });

  it("the real templates/ + committed bundled.json is clean", () => {
    const r = runCheck();
    expect(r.findings).toEqual([]);
  });
});
