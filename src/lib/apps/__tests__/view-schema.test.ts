import { describe, expect, it } from "vitest";
import { AppManifestSchema, parseAppManifest } from "../registry";

const BASE = `
id: a
name: A
`;

describe("AppManifestSchema — view: field", () => {
  it("accepts a manifest with no view field (backward compatible)", () => {
    const m = parseAppManifest(BASE);
    expect(m).not.toBeNull();
    expect(m?.view).toBeUndefined();
  });

  it("accepts an explicit view.kit value from the KitId enum", () => {
    const m = parseAppManifest(`${BASE}view:\n  kit: tracker\n`);
    expect(m).not.toBeNull();
    expect(m?.view?.kit).toBe("tracker");
  });

  it("defaults view.kit to 'auto' when view block is present but kit omitted", () => {
    const m = parseAppManifest(`${BASE}view:\n  hideManifestPane: true\n`);
    expect(m).not.toBeNull();
    expect(m?.view?.kit).toBe("auto");
    expect(m?.view?.hideManifestPane).toBe(true);
  });

  it("defaults hideManifestPane to false", () => {
    const m = parseAppManifest(`${BASE}view:\n  kit: tracker\n`);
    expect(m?.view?.hideManifestPane).toBe(false);
  });

  it("defaults bindings to {} when omitted", () => {
    const m = parseAppManifest(`${BASE}view:\n  kit: tracker\n`);
    expect(m?.view?.bindings).toEqual({});
  });

  it("rejects an unknown kit id with a Zod error", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: { kit: "not-a-kit" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown top-level fields inside view (.strict() enforced)", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: { kit: "tracker", layout: "fancy" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts hero/secondary/cadence/runs binding refs of supported shapes", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          hero: { table: "habits" },
          secondary: [{ blueprint: "weekly-review" }, { schedule: "daily" }],
          cadence: { schedule: "daily" },
          runs: { blueprint: "weekly-review" },
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a binding ref with an unknown discriminator key", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: { hero: { widget: "custom-thing" } },
      },
    });
    expect(r.success).toBe(false);
  });

  it("accepts a KpiSpec with a discriminated source.kind", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [
            { id: "k1", label: "Active habits", source: { kind: "tableCount", table: "habits" } },
            { id: "k2", label: "Total spend", source: { kind: "tableSum", table: "txns", column: "amount" }, format: "currency" },
            { id: "k3", label: "Last entry", source: { kind: "tableLatest", table: "habits", column: "updated_at" } },
            { id: "k4", label: "Runs (7d)", source: { kind: "blueprintRunCount", blueprint: "weekly-review" } },
            { id: "k5", label: "Next fire", source: { kind: "scheduleNextFire", schedule: "daily" } },
          ],
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a KpiSpec with a formula-style source (no expressions allowed)", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [{ id: "k", label: "Custom", source: { kind: "formula", expr: "sum(x)" } }],
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("accepts a KpiSpec with kind: ratio composed of two leaf sources", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [
            {
              id: "avg",
              label: "Avg",
              format: "currency",
              source: {
                kind: "ratio",
                numerator: { kind: "tableSum", table: "t", column: "amount" },
                denominator: { kind: "tableCount", table: "t" },
              },
            },
          ],
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a ratio with a nested ratio (depth limited by construction)", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [
            {
              id: "x",
              label: "X",
              source: {
                kind: "ratio",
                numerator: {
                  kind: "ratio",
                  numerator: { kind: "tableCount", table: "t" },
                  denominator: { kind: "tableCount", table: "t" },
                },
                denominator: { kind: "tableCount", table: "t" },
              },
            },
          ],
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a ratio missing denominator", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [
            {
              id: "x",
              label: "X",
              source: {
                kind: "ratio",
                numerator: { kind: "tableCount", table: "t" },
              },
            },
          ],
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("defaults KpiSpec.format to 'int' when omitted", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [{ id: "k", label: "L", source: { kind: "tableCount", table: "t" } }],
        },
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.view?.bindings.kpis?.[0].format).toBe("int");
    }
  });

  it("preserves passthrough on outer manifest (e.g. unknown top-level keys allowed)", () => {
    const m = parseAppManifest(`${BASE}custom_field: anything\n`);
    expect(m).not.toBeNull();
  });

  it("accepts a chart binding with an enumerated type", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          charts: [
            { id: "c1", table: "txns", type: "bar", xColumn: "category", yColumn: "amount", aggregation: "sum" },
            { id: "c2", table: "txns", type: "pie", xColumn: "category" },
          ],
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("defaults chart title to undefined and requires id/table/type/xColumn", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          charts: [{ id: "c", table: "t", type: "line", xColumn: "date" }],
        },
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.view?.bindings.charts?.[0].type).toBe("line");
      expect(r.data.view?.bindings.charts?.[0].title).toBeUndefined();
    }
  });

  it("rejects a chart with an unknown type (enumerated, no free strings)", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          charts: [{ id: "c", table: "t", type: "sankey", xColumn: "x" }],
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a chart with an unknown field (.strict() enforced, no escape hatch)", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          charts: [{ id: "c", table: "t", type: "bar", xColumn: "x", component: "MyChart" }],
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a chart missing its required table", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          charts: [{ id: "c", type: "bar", xColumn: "x" }],
        },
      },
    });
    expect(r.success).toBe(false);
  });

  // ── TDR-039 Phase 2: generate/publish manifest seam ──────────────────

  it("accepts a generate + publish binding pair", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          generate: {
            generatorType: "static-site",
            table: "web-sections",
            siteTitle: "Acme Landing",
          },
          publish: { targetType: "github-pages" },
        },
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.view?.bindings.generate?.generatorType).toBe("static-site");
      expect(r.data.view?.bindings.generate?.table).toBe("web-sections");
      expect(r.data.view?.bindings.publish?.targetType).toBe("github-pages");
    }
  });

  it("accepts a generate arm without the optional siteTitle", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          generate: { generatorType: "static-site", table: "web-sections" },
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a generate arm missing its required table (the rewrite ref)", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          generate: { generatorType: "static-site" },
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a misspelled generate field (.strict() — no escape hatch)", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          generate: {
            generatorType: "static-site",
            table: "t",
            tabel: "typo",
          },
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a publish arm missing its required targetType", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: { publish: {} },
      },
    });
    expect(r.success).toBe(false);
  });
});
