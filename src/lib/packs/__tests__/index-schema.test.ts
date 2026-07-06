import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  PackIndexSchema,
  PackIndexEntrySchema,
  PackTierSchema,
  parsePackIndex,
  findIndexEntry,
} from "../index-schema";

// The canonical pack index (R1) — the `orionfold.packs/v1` machine-readable
// index. These tests pin the keystone invariants the whole distribution
// standard stands on: the schema validates a well-formed index, rejects the
// malformed shapes loudly (unknown schema string, both/neither location), the
// reader helpers answer lookups correctly, the committed fixture round-trips,
// and the module stays a zero-runtime-import leaf (no catalog module-load
// cycle).

const FIXTURE_PATH = path.join(__dirname, "fixtures", "pack-index.json");
const fixtureJson = () => readFileSync(FIXTURE_PATH, "utf-8");

describe("PackTierSchema", () => {
  it("accepts the three trust tiers", () => {
    for (const tier of ["official", "partner", "community"]) {
      expect(() => PackTierSchema.parse(tier)).not.toThrow();
    }
  });

  it("rejects an unknown tier", () => {
    expect(() => PackTierSchema.parse("blessed")).toThrow();
  });
});

describe("PackIndexEntrySchema — location refine (exactly one of path|repo)", () => {
  const base = { id: "relay-crm", tier: "official" as const, version: "1.0.0" };

  it("accepts an entry with only `path` (hosted)", () => {
    expect(() =>
      PackIndexEntrySchema.parse({ ...base, path: "packs/official/relay-crm" }),
    ).not.toThrow();
  });

  it("accepts an entry with only `repo` (community-linked)", () => {
    expect(() =>
      PackIndexEntrySchema.parse({
        ...base,
        tier: "community",
        repo: "github.com/jane/janes-invoice-pack",
      }),
    ).not.toThrow();
  });

  it("rejects an entry with BOTH path and repo", () => {
    expect(() =>
      PackIndexEntrySchema.parse({
        ...base,
        path: "packs/official/relay-crm",
        repo: "github.com/jane/janes-invoice-pack",
      }),
    ).toThrow(/exactly one of path/);
  });

  it("rejects an entry with NEITHER path nor repo", () => {
    expect(() => PackIndexEntrySchema.parse(base)).toThrow(/exactly one of path/);
  });

  it("rejects an unknown extra field (.strict)", () => {
    expect(() =>
      PackIndexEntrySchema.parse({
        ...base,
        path: "packs/official/relay-crm",
        rogue: true,
      }),
    ).toThrow();
  });
});

describe("PackIndexSchema", () => {
  it("rejects an unknown top-level schema string", () => {
    const bad = { schema: "orionfold.packs/v2", packs: [] };
    expect(() => PackIndexSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown top-level key (.strict)", () => {
    const bad = { schema: "orionfold.packs/v1", packs: [], extra: 1 };
    expect(() => PackIndexSchema.parse(bad)).toThrow();
  });

  it("accepts an empty pack list", () => {
    expect(() =>
      PackIndexSchema.parse({ schema: "orionfold.packs/v1", packs: [] }),
    ).not.toThrow();
  });
});

describe("committed fixture pack-index.json", () => {
  it("round-trips through parsePackIndex without error", () => {
    expect(() => parsePackIndex(fixtureJson())).not.toThrow();
  });

  it("carries official + partner + community entries", () => {
    const idx = parsePackIndex(fixtureJson());
    const tiers = new Set(idx.packs.map((p) => p.tier));
    expect(tiers).toEqual(new Set(["official", "partner", "community"]));
  });

  it("findIndexEntry resolves the official relay-crm entry", () => {
    const idx = parsePackIndex(fixtureJson());
    const entry = findIndexEntry(idx, "relay-crm");
    expect(entry).toBeDefined();
    expect(entry?.tier).toBe("official");
    expect(entry?.path).toBeDefined();
    expect(entry?.repo).toBeUndefined();
  });

  it("findIndexEntry returns undefined for an unknown id", () => {
    const idx = parsePackIndex(fixtureJson());
    expect(findIndexEntry(idx, "no-such-pack")).toBeUndefined();
  });
});

describe("purity — no runtime-registry-adjacent imports", () => {
  it("index-schema.ts imports only zod (safe to import anywhere, no catalog cycle)", () => {
    // Assert by SOURCE, not by runtime probe: the module must stay a
    // zero-runtime-import leaf (taxonomy.ts / pack-of.ts discipline). A
    // regression that adds an `@/lib/...` or relative sibling import — the
    // module-load-cycle risk — fails here loudly.
    const src = readFileSync(path.join(__dirname, "..", "index-schema.ts"), "utf-8");
    const importLines = src.split("\n").filter((l) => /^\s*import\s/.test(l));
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toMatch(/from "zod"/);
    expect(src).not.toMatch(/from "@\//);
    expect(src).not.toMatch(/from "\.\.?\//);
  });
});
