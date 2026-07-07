import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  BUNDLED_PACK_IDS,
  BUNDLED_TEMPLATES_SIZE_BUDGET_KB,
  isBundledPack,
} from "../bundled";

// R4 pack-tarball-diet — the bundled-pack SSOT. These tests hold the two
// invariants the size gate (scripts/check-pack-tarball.mjs) relies on: the
// checked-in JSON mirror stays in lockstep with the typed source, and the
// declared allowlist stays equal to what physically ships under templates/.

describe("BUNDLED_PACK_IDS", () => {
  it("is a non-empty, unique, sorted list", () => {
    expect(BUNDLED_PACK_IDS.length).toBeGreaterThan(0);
    const arr = [...BUNDLED_PACK_IDS];
    expect(new Set(arr).size).toBe(arr.length); // no dupes
    expect(arr).toEqual([...arr].sort()); // stable, sorted for reviewable diffs
  });

  it("isBundledPack matches membership", () => {
    expect(isBundledPack(BUNDLED_PACK_IDS[0])).toBe(true);
    expect(isBundledPack("relay-does-not-exist")).toBe(false);
  });

  it("exactly equals the physical template dirs (the files-allowlist invariant)", () => {
    const templatesDir = path.join(__dirname, "..", "templates");
    const present = readdirSync(templatesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect([...BUNDLED_PACK_IDS].sort()).toEqual(present);
  });
});

describe("bundled.json is in lockstep with bundled.ts", () => {
  it("mirrors BUNDLED_PACK_IDS + the size budget (regenerate via scripts/generate-bundled-json.mjs on drift)", () => {
    const jsonPath = path.join(__dirname, "..", "bundled.json");
    const json = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(json.bundledPackIds).toEqual([...BUNDLED_PACK_IDS]);
    expect(json.sizeBudgetKb).toBe(BUNDLED_TEMPLATES_SIZE_BUDGET_KB);
  });
});
