import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
// The gate's pure core + I/O boundaries live in the publish-gate .mjs so a
// standalone `node scripts/check-pack-taxonomy.mjs` and these tests run the SAME
// reconciliation. Imported directly; the CLI entry only runs under
// import.meta.url === argv[1], never on import.
import {
  checkTaxonomy,
  declaredPrimitives,
  runCheck,
  TEMPLATES_DIR,
  TAXONOMY_JSON,
} from "../../../../scripts/check-pack-taxonomy.mjs";

// A minimal taxonomy fixture: two owned tables with column contracts, one owned
// schedule. Mirrors the shape of the real taxonomy.json.
const TAX = {
  tables: {
    clients: {
      owner: "relay-agency",
      kind: "persona",
      columns: ["name", "tier", "status"],
    },
    intake: {
      owner: "relay-agency",
      kind: "persona",
      columns: ["client", "service"],
    },
  },
  schedules: {
    "month-end-close": { owner: "relay-agency-pro", kind: "automation" },
  },
};

describe("checkTaxonomy — pure reconciliation (the three drift classes)", () => {
  it("clean: owner declares its own tables in-contract → no findings", () => {
    const packs = [
      { id: "relay-agency", tables: [{ id: "clients", columns: ["name", "tier", "status"] }], schedules: [] },
    ];
    expect(checkTaxonomy(packs, TAX)).toEqual([]);
  });

  it("legal re-list: a NON-owner declares an owned table with IDENTICAL columns → no findings", () => {
    // The Pro→spine pattern: relay-agency-pro re-lists intake verbatim because
    // it installs standalone and needs the table in its own app scope.
    const packs = [
      { id: "relay-agency-pro", tables: [{ id: "intake", columns: ["client", "service"] }], schedules: [] },
    ];
    expect(checkTaxonomy(packs, TAX)).toEqual([]);
  });

  it("(i) second owner: a non-owner declares an owned table with DIFFERENT columns", () => {
    const packs = [
      { id: "relay-rogue", tables: [{ id: "clients", columns: ["name", "vertical"] }], schedules: [] },
    ];
    const findings = checkTaxonomy(packs, TAX);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/second owner/);
    expect(findings[0]).toContain("clients");
    expect(findings[0]).toContain("relay-agency"); // the registered owner
    expect(findings[0]).toContain("relay-rogue"); // the offender
  });

  it("(ii) unregistered: a pack declares a table absent from the taxonomy", () => {
    const packs = [
      { id: "relay-agency", tables: [{ id: "mystery", columns: ["a", "b"] }], schedules: [] },
    ];
    const findings = checkTaxonomy(packs, TAX);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/unregistered table "mystery"/);
    expect(findings[0]).toContain("relay-agency");
  });

  it("(iii) column drift: the OWNER declares its own table with a drifted column set", () => {
    const packs = [
      { id: "relay-agency", tables: [{ id: "clients", columns: ["name", "tier", "status", "health"] }], schedules: [] },
    ];
    const findings = checkTaxonomy(packs, TAX);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/column drift/);
    expect(findings[0]).toContain("added [health]");
  });

  it("column order does not count as drift", () => {
    const packs = [
      { id: "relay-agency", tables: [{ id: "clients", columns: ["status", "name", "tier"] }], schedules: [] },
    ];
    expect(checkTaxonomy(packs, TAX)).toEqual([]);
  });

  it("schedule second owner: a non-owner declares an owned schedule id", () => {
    const packs = [
      { id: "relay-agency", tables: [], schedules: ["month-end-close"] },
    ];
    const findings = checkTaxonomy(packs, TAX);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/second owner: schedule "month-end-close"/);
  });

  it("unregistered schedule", () => {
    const packs = [{ id: "relay-agency", tables: [], schedules: ["ghost-poller"] }];
    const findings = checkTaxonomy(packs, TAX);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/unregistered schedule "ghost-poller"/);
  });

  it("owner declares its own schedule → no findings", () => {
    const packs = [{ id: "relay-agency-pro", tables: [], schedules: ["month-end-close"] }];
    expect(checkTaxonomy(packs, TAX)).toEqual([]);
  });
});

// ── I/O layer: declaredPrimitives walks a synthetic templates dir ────────

describe("declaredPrimitives — manifest walk + bundle skip", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "tax-gate-"));
    const templates = path.join(root, TEMPLATES_DIR);
    // A normal pack with a base/manifest.yaml declaring one table + schedule.
    const p1 = path.join(templates, "relay-agency", "base");
    mkdirSync(p1, { recursive: true });
    writeFileSync(
      path.join(p1, "manifest.yaml"),
      "tables:\n  - id: clients\n    columns: [name, tier, status]\nschedules:\n  - id: month-end-close\n",
    );
    // A bundle pack: pack.yaml only, NO base/manifest.yaml → must be skipped.
    const p2 = path.join(templates, "relay-agency-cre");
    mkdirSync(p2, { recursive: true });
    writeFileSync(path.join(p2, "pack.yaml"), "id: relay-agency-cre\nbundle:\n  - relay-agency\n  - relay-cre\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads a manifest pack's declared tables + schedules, skips the bundle pack", () => {
    const packs = declaredPrimitives(root);
    expect(packs).toHaveLength(1); // bundle pack skipped
    expect(packs[0].id).toBe("relay-agency");
    expect(packs[0].tables).toEqual([{ id: "clients", columns: ["name", "tier", "status"] }]);
    expect(packs[0].schedules).toEqual(["month-end-close"]);
  });

  it("runCheck end-to-end: clean synthetic tree with a matching taxonomy.json → no findings", () => {
    // Seed a taxonomy.json matching the synthetic pack so runCheck reconciles clean.
    writeFileSync(
      path.join(root, TAXONOMY_JSON),
      JSON.stringify({
        tables: { clients: { owner: "relay-agency", kind: "persona", columns: ["name", "tier", "status"] } },
        schedules: { "month-end-close": { owner: "relay-agency", kind: "automation" } },
      }),
    );
    const result = runCheck({ root });
    expect(result.findings).toEqual([]);
    expect(result.packCount).toBe(1);
    expect(result.tableCount).toBe(1);
    expect(result.scheduleCount).toBe(1);
  });

  it("runCheck throws loudly when taxonomy.json is missing (fail-closed local input)", () => {
    // No taxonomy.json written into the synthetic root.
    expect(() => runCheck({ root })).toThrow();
  });
});

// ── the real gate must pass against the shipped packs ────────────────────

describe("the shipped repo passes the gate", () => {
  it("runCheck against the real templates + taxonomy.json is clean", () => {
    // Default root = repo root. Proves taxonomy.ts matches every shipped
    // manifest — if this ever fails, the R1 data drifted from reality.
    const result = runCheck();
    expect(result.findings).toEqual([]);
    expect(result.packCount).toBeGreaterThan(0);
  });
});
