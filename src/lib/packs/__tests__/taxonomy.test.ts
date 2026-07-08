import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  loadTaxonomy,
  ownerOfTable,
  ownerOfSchedule,
  registeredColumns,
  TaxonomySchema,
  TAXONOMY,
} from "../taxonomy";

// The codified owned-primitive registry (R1). These tests pin the three
// invariants the R3 CI gate stands on: the data validates, the lookups answer
// correctly, and the checked-in JSON (what the plain-node .mjs gate reads) is
// in lockstep with the typed TS source (what the product + skill read).

describe("loadTaxonomy", () => {
  it("round-trips the shipped registry through TaxonomySchema.parse", () => {
    expect(() => loadTaxonomy()).not.toThrow();
    const t = loadTaxonomy();
    expect(Object.keys(t.tables)).toHaveLength(18);
    expect(Object.keys(t.schedules)).toHaveLength(3);
  });

  it("rejects a malformed record with a Zod error", () => {
    // A table entry missing its required `columns` contract.
    const bad = {
      tables: { clients: { owner: "relay-agency", kind: "persona" } },
      schedules: {},
    };
    expect(() => TaxonomySchema.parse(bad)).toThrow();
  });

  it("rejects an unknown pack kind", () => {
    const bad = {
      tables: {
        clients: { owner: "relay-agency", kind: "wizard", columns: ["name"] },
      },
      schedules: {},
    };
    expect(() => TaxonomySchema.parse(bad)).toThrow();
  });

  it("rejects an empty column contract (would defeat the drift check)", () => {
    const bad = {
      tables: { clients: { owner: "relay-agency", kind: "persona", columns: [] } },
      schedules: {},
    };
    expect(() => TaxonomySchema.parse(bad)).toThrow();
  });

  it("rejects an unknown top-level key (.strict)", () => {
    const bad = { tables: {}, schedules: {}, joinKeys: {} };
    expect(() => TaxonomySchema.parse(bad)).toThrow();
  });
});

describe("lookups", () => {
  it("resolves table owners", () => {
    expect(ownerOfTable("clients")).toBe("relay-agency");
    expect(ownerOfTable("rent_roll")).toBe("relay-cre");
    expect(ownerOfTable("leads")).toBe("relay-crm");
    expect(ownerOfTable("campaigns")).toBe("relay-social");
    expect(ownerOfTable("web_pages")).toBe("relay-web-publisher");
    expect(ownerOfTable("web_sections")).toBe("relay-web-publisher");
    expect(ownerOfTable("web_templates")).toBe("relay-web-templates");
  });

  it("resolves schedule owners", () => {
    expect(ownerOfSchedule("lead-poller")).toBe("relay-crm");
    expect(ownerOfSchedule("month-end-close")).toBe("relay-agency-pro");
    expect(ownerOfSchedule("content-cadence")).toBe("relay-social");
  });

  it("returns undefined for unregistered ids", () => {
    expect(ownerOfTable("nope")).toBeUndefined();
    expect(ownerOfSchedule("nope")).toBeUndefined();
    expect(registeredColumns("nope")).toBeUndefined();
  });

  it("resolves the registered column contract, with pipeline from the real manifest", () => {
    // pipeline's columns are prose "(new-business stages)" in the markdown doc;
    // the codified registry records the REAL manifest columns so the R3
    // column-drift check has a true baseline.
    expect(registeredColumns("pipeline")).toEqual([
      "prospect",
      "stage",
      "value",
      "owner",
      "notes",
    ]);
  });
});

describe("taxonomy.json is in lockstep with taxonomy.ts", () => {
  it("deep-equals TAXONOMY (regenerate via scripts/generate-taxonomy-json.mjs on drift)", () => {
    const jsonPath = path.join(__dirname, "..", "taxonomy.json");
    const json = JSON.parse(readFileSync(jsonPath, "utf-8"));
    // JSON.parse(JSON.stringify(...)) normalizes the TS object (drops undefined,
    // fixes key order irrelevance) so the comparison is value-identity, exactly
    // what the .mjs gate sees when it JSON.parses the file.
    expect(json).toEqual(JSON.parse(JSON.stringify(TAXONOMY)));
  });
});

describe("purity — no runtime-registry-adjacent imports", () => {
  it("taxonomy.ts imports only zod (safe to import anywhere, no catalog cycle)", () => {
    // Assert by SOURCE, not by runtime probe: the module must stay a
    // zero-runtime-import leaf (pack-of.ts discipline). A regression that adds
    // an `@/lib/...` import — the module-load-cycle risk — fails here loudly.
    const src = readFileSync(path.join(__dirname, "..", "taxonomy.ts"), "utf-8");
    const importLines = src
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l));
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toMatch(/from "zod"/);
    // Belt-and-braces: no `@/` alias import, no relative sibling import.
    expect(src).not.toMatch(/from "@\//);
    expect(src).not.toMatch(/from "\.\.?\//);
  });
});
