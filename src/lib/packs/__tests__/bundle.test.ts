import { describe, expect, it } from "vitest";
import { AppManifestSchema, type AppManifest } from "@/lib/apps/registry";
import { mergeBundle } from "../bundle";
import { BundleCollisionError, type Pack, type ResolvedPack } from "../format";

/**
 * mergeBundle is a pure, synchronous compose step: it merges N resolved child
 * packs into ONE synthetic ResolvedPack whose manifest is the union of the
 * children's primitives under the BUNDLE pack's identity. These tests build
 * the children in-memory (no disk) — the merge touches no DB and no files.
 */

/** A bundle pack (id/name only; its placeholder manifest is empty). */
function bundlePack(
  id: string,
  bundle: string[],
  extra: Record<string, unknown> = {}
): Pack {
  return {
    rootDir: `/fake/${id}`,
    meta: { id, version: "0.1.0", name: id, customers: [], bundle, ...extra },
    manifest: AppManifestSchema.parse({ id, name: id }),
  };
}

/** A resolved child with a real manifest + a synthetic file list. */
function child(
  id: string,
  manifest: Partial<AppManifest>,
  relPaths: string[] = []
): ResolvedPack {
  return {
    pack: {
      rootDir: `/fake/${id}`,
      meta: { id, version: "0.1.0", name: id, customers: [] },
      manifest: AppManifestSchema.parse({ id, name: id, ...manifest }),
    },
    files: relPaths.map((relPath) => ({
      relPath,
      absPath: `/fake/${id}/base/${relPath}`,
      layer: "base" as const,
    })),
  };
}

describe("mergeBundle", () => {
  it("merges two children into one manifest with concatenated primitives", () => {
    const bundle = bundlePack("relay-marketing", ["relay-crm", "relay-social"]);
    const crm = child(
      "relay-crm",
      {
        profiles: [{ id: "relay-crm--rep" }],
        tables: [{ id: "leads" }],
        blueprints: [{ id: "relay-crm--nurture" }],
      },
      ["profiles/relay-crm--rep/agent.yaml", "blueprints/relay-crm--nurture.yaml"]
    );
    const social = child(
      "relay-social",
      {
        profiles: [{ id: "relay-social--writer" }],
        tables: [{ id: "posts" }],
        blueprints: [{ id: "relay-social--schedule" }],
      },
      [
        "profiles/relay-social--writer/agent.yaml",
        "blueprints/relay-social--schedule.yaml",
      ]
    );

    const merged = mergeBundle(bundle, [crm, social]);

    // Identity comes from the bundle pack.
    expect(merged.pack.meta.id).toBe("relay-marketing");
    expect(merged.pack.manifest.id).toBe("relay-marketing");
    expect(merged.pack.manifest.name).toBe("relay-marketing");

    // Primitives concatenated in bundle order.
    expect(merged.pack.manifest.profiles.map((p) => p.id)).toEqual([
      "relay-crm--rep",
      "relay-social--writer",
    ]);
    expect(merged.pack.manifest.tables.map((t) => t.id)).toEqual([
      "leads",
      "posts",
    ]);
    expect(merged.pack.manifest.blueprints.map((b) => b.id)).toEqual([
      "relay-crm--nurture",
      "relay-social--schedule",
    ]);

    // Files concatenated (namespaced dirs keep them collision-free).
    expect(merged.files.map((f) => f.relPath).sort()).toEqual([
      "blueprints/relay-crm--nurture.yaml",
      "blueprints/relay-social--schedule.yaml",
      "profiles/relay-crm--rep/agent.yaml",
      "profiles/relay-social--writer/agent.yaml",
    ]);

    // The merged manifest still validates against the strict schema.
    expect(() => AppManifestSchema.parse(merged.pack.manifest)).not.toThrow();
  });

  it("preserves a cross-child binding for the later logical→real UUID rewrite", () => {
    // The Social blueprint fires on inserts into the CRM child's `leads` table.
    const bundle = bundlePack("relay-marketing", ["relay-crm", "relay-social"]);
    const crm = child("relay-crm", { tables: [{ id: "leads" }] });
    const social = child("relay-social", {
      blueprints: [
        {
          id: "relay-social--on-lead",
          trigger: { kind: "row-insert", table: "leads" },
        },
      ],
    });

    const merged = mergeBundle(bundle, [crm, social]);

    // The trigger still names the CRM child's LOGICAL table id. install.ts's
    // rewriteTableRefs will map "leads"→its real UUID across the merged
    // manifest, so the binding resolves intra-app (no silent 0-read).
    const bp = merged.pack.manifest.blueprints.find(
      (b) => b.id === "relay-social--on-lead"
    );
    expect(bp?.trigger?.table).toBe("leads");
  });

  it("merges views with first-hero + concat-rest (bundle order)", () => {
    const bundle = bundlePack("relay-marketing", ["relay-crm", "relay-social"]);
    const crm = child("relay-crm", {
      tables: [{ id: "leads" }],
      view: {
        kit: "tracker",
        bindings: {
          hero: { table: "leads" },
          secondary: [{ blueprint: "relay-crm--nurture" }],
          kpis: [
            {
              id: "lead-count",
              label: "Leads",
              source: { kind: "tableCount", table: "leads" },
            },
          ],
        },
      },
    });
    const social = child("relay-social", {
      tables: [{ id: "posts" }],
      view: {
        kit: "workflow-hub",
        bindings: {
          hero: { table: "posts" }, // ignored — CRM declared hero first
          secondary: [{ blueprint: "relay-social--schedule" }],
          kpis: [
            {
              id: "post-count",
              label: "Posts",
              source: { kind: "tableCount", table: "posts" },
            },
          ],
        },
      },
    });

    const merged = mergeBundle(bundle, [crm, social]);
    const view = merged.pack.manifest.view!;

    // Hero from the FIRST child that declares one.
    expect(view.bindings.hero).toEqual({ table: "leads" });
    // kit from the first child with a view.
    expect(view.kit).toBe("tracker");
    // secondary + kpis concatenated in bundle order.
    expect(view.bindings.secondary).toEqual([
      { blueprint: "relay-crm--nurture" },
      { blueprint: "relay-social--schedule" },
    ]);
    expect(view.bindings.kpis?.map((k) => k.id)).toEqual([
      "lead-count",
      "post-count",
    ]);
  });

  it("carries funnel (first-wins) + charts (concat) through the merge", () => {
    // Regression: mergeBundle merged only hero/cadence/runs/secondary/kpis, so a
    // child's `funnel` (the marketing band-flow) and `charts` were SILENTLY
    // dropped from the merged app — a Principle #1 shadow-path. This pins that
    // every declarable binding survives the flatten.
    const bundle = bundlePack("relay-marketing", ["relay-crm", "relay-social"]);
    const crm = child("relay-crm", {
      tables: [{ id: "leads" }],
      view: {
        kit: "workflow-hub",
        bindings: {
          charts: [
            {
              id: "leads-by-stage",
              table: "leads",
              type: "bar",
              xColumn: "stage",
              aggregation: "count",
            },
          ],
          funnel: {
            id: "leads-funnel",
            title: "Lead funnel",
            bands: [
              {
                key: "capture",
                label: "Capture",
                table: "leads",
                count: { kind: "rowsRecent", column: "last_touch", withinDays: 28 },
              },
              {
                key: "convert",
                label: "Convert",
                table: "leads",
                count: { kind: "rowsWhereIn", column: "stage", values: ["customer"] },
                conversionFrom: "capture",
              },
            ],
          },
        },
      },
    });
    const social = child("relay-social", {
      tables: [{ id: "channels" }],
      view: {
        kit: "tracker",
        bindings: {
          charts: [
            {
              id: "reach-by-channel",
              table: "channels",
              type: "bar",
              xColumn: "platform",
              yColumn: "audience",
              aggregation: "sum",
            },
          ],
        },
      },
    });

    const merged = mergeBundle(bundle, [crm, social]);
    const view = merged.pack.manifest.view!;

    // funnel: first child that declares one wins (single analytics-header slot).
    expect(view.bindings.funnel?.id).toBe("leads-funnel");
    expect(view.bindings.funnel?.bands).toHaveLength(2);
    // charts: concatenated across children in bundle order.
    expect(view.bindings.charts?.map((c) => c.id)).toEqual([
      "leads-by-stage",
      "reach-by-channel",
    ]);
  });

  it("carries galleries plus generate + publish through the merge (TDR-039)", () => {
    // Same shadow-path class as funnel/charts: a Web Designer bundle whose child
    // declares generate:/publish: must not lose them in the flatten. First child
    // to declare each wins (a bundle is one site → one generate/publish pair).
    const bundle = bundlePack("relay-web-designer", [
      "relay-web-assets",
      "relay-web-publisher",
    ]);
    const assets = child("relay-web-assets", {
      tables: [{ id: "web-sections" }],
      view: {
        kit: "tracker",
        bindings: {
          galleries: [
            {
              id: "asset-gallery",
              table: "web_assets",
              titleColumn: "title",
            },
          ],
          generate: {
            generatorType: "static-site",
            table: "web-sections",
            siteTitle: "Acme",
          },
        },
      },
    });
    const publisher = child("relay-web-publisher", {
      view: {
        kit: "tracker",
        bindings: {
          galleries: [
            {
              id: "section-gallery",
              table: "web_sections",
              titleColumn: "heading",
            },
          ],
          publish: { targetType: "github-pages" },
        },
      },
    });

    const merged = mergeBundle(bundle, [assets, publisher]);
    const view = merged.pack.manifest.view!;

    expect(view.bindings.generate?.generatorType).toBe("static-site");
    expect(view.bindings.generate?.table).toBe("web-sections");
    expect(view.bindings.galleries?.map((g) => g.id)).toEqual([
      "asset-gallery",
      "section-gallery",
    ]);
    expect(view.bindings.publish?.targetType).toBe("github-pages");
  });

  it("takes the hero from the first child that HAS one, skipping heroless earlier children", () => {
    const bundle = bundlePack("relay-marketing", ["relay-crm", "relay-social"]);
    const crm = child("relay-crm", {
      tables: [{ id: "leads" }],
      view: { kit: "auto", bindings: { secondary: [{ table: "leads" }] } },
    });
    const social = child("relay-social", {
      tables: [{ id: "posts" }],
      view: { kit: "tracker", bindings: { hero: { table: "posts" } } },
    });

    const merged = mergeBundle(bundle, [crm, social]);
    expect(merged.pack.manifest.view!.bindings.hero).toEqual({ table: "posts" });
  });

  it("throws BundleCollisionError naming both packs when a table id collides", () => {
    const bundle = bundlePack("relay-marketing", ["relay-crm", "relay-social"]);
    const crm = child("relay-crm", { tables: [{ id: "clients" }] });
    const social = child("relay-social", { tables: [{ id: "clients" }] });

    expect(() => mergeBundle(bundle, [crm, social])).toThrow(
      BundleCollisionError
    );
    expect(() => mergeBundle(bundle, [crm, social])).toThrow(/clients/);
    expect(() => mergeBundle(bundle, [crm, social])).toThrow(/relay-crm/);
    expect(() => mergeBundle(bundle, [crm, social])).toThrow(/relay-social/);
  });

  it("throws BundleCollisionError when a profile/blueprint/schedule id collides", () => {
    const bundle = bundlePack("relay-marketing", ["relay-crm", "relay-social"]);
    const crm = child("relay-crm", { profiles: [{ id: "shared--agent" }] });
    const social = child("relay-social", { profiles: [{ id: "shared--agent" }] });

    expect(() => mergeBundle(bundle, [crm, social])).toThrow(
      BundleCollisionError
    );
    expect(() => mergeBundle(bundle, [crm, social])).toThrow(/shared--agent/);
  });

  it("throws BundleCollisionError when two children share a file relPath", () => {
    const bundle = bundlePack("relay-marketing", ["relay-crm", "relay-social"]);
    const crm = child("relay-crm", { tables: [{ id: "leads" }] }, [
      "blueprints/collide.yaml",
    ]);
    const social = child("relay-social", { tables: [{ id: "posts" }] }, [
      "blueprints/collide.yaml",
    ]);

    expect(() => mergeBundle(bundle, [crm, social])).toThrow(
      BundleCollisionError
    );
    expect(() => mergeBundle(bundle, [crm, social])).toThrow(
      /blueprints\/collide\.yaml/
    );
  });

  it("carries the bundle's entitlement onto the merged manifest", () => {
    const bundle = bundlePack("relay-marketing", ["relay-crm"], {
      entitlement: "product:orionfold-relay",
    });
    const crm = child("relay-crm", { tables: [{ id: "leads" }] });

    const merged = mergeBundle(bundle, [crm]);
    expect(merged.pack.manifest.entitlement).toBe("product:orionfold-relay");
  });
});
