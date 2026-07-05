import { describe, expect, it } from "vitest";
import { workflowHubKit } from "../kits/workflow-hub";
import type { AppDetail, AppManifest } from "@/lib/apps/registry";
import type { RuntimeState } from "../types";

function makeApp(manifest: Partial<AppManifest>): AppDetail {
  const m: AppManifest = {
    id: "demo",
    name: "Demo",
    description: "demo",
    profiles: [],
    blueprints: [],
    tables: [],
    schedules: [],
    ...manifest,
  } as AppManifest;
  return {
    id: "demo",
    name: "Demo",
    description: "demo",
    rootDir: "/tmp/demo",
    primitivesSummary: "",
    profileCount: 0,
    blueprintCount: m.blueprints.length,
    tableCount: m.tables.length,
    scheduleCount: m.schedules.length,
    scheduleHuman: null,
    createdAt: 0,
    files: [],
    manifest: m,
  };
}

describe("workflowHubKit.resolve", () => {
  it("projects blueprintIds and scheduleIds from the manifest", () => {
    const app = makeApp({
      blueprints: [{ id: "bp-1" }, { id: "bp-2" }],
      schedules: [{ id: "sch-1", cron: "0 9 * * *" }],
    });
    const proj = workflowHubKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    expect(proj.blueprintIds).toEqual(["bp-1", "bp-2"]);
    expect(proj.scheduleIds).toEqual(["sch-1"]);
  });

  it("returns empty arrays when manifest has nothing", () => {
    const app = makeApp({});
    const proj = workflowHubKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    expect(proj.blueprintIds).toEqual([]);
    expect(proj.scheduleIds).toEqual([]);
  });

  // HANDOFF.md F3: workflow-hub kit was dropping manifest-declared KPIs because
  // its projection did not surface them as `kpiSpecs`, so loadRuntimeState's
  // `loadEvaluatedKpis(projection.kpiSpecs ?? [])` always saw [].
  it("surfaces view.bindings.kpis as kpiSpecs for the runtime evaluator", () => {
    const app = makeApp({
      tables: [{ id: "tbl-1" }],
      view: {
        kit: "workflow-hub",
        bindings: {
          kpis: [
            {
              id: "total-market-value",
              label: "Total Market Value",
              source: { kind: "tableSum", table: "tbl-1", column: "market_value" },
              format: "currency",
            },
            {
              id: "total-positions",
              label: "Total Positions",
              source: { kind: "tableCount", table: "tbl-1" },
              format: "int",
            },
          ],
        },
      },
    });
    const proj = workflowHubKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    expect(proj.kpiSpecs).toHaveLength(2);
    expect((proj.kpiSpecs as Array<{ id: string }>)[0].id).toBe(
      "total-market-value"
    );
  });

  it("defaults kpiSpecs to [] when the manifest has no view.bindings.kpis", () => {
    const app = makeApp({});
    const proj = workflowHubKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    expect(proj.kpiSpecs).toEqual([]);
  });

  // FEAT-5/6: "Start here" must skip row-insert (fires on its own) and
  // schedule-driven (runs itself, poor first click) blueprints. For Agency
  // Pro's shape this lands on new-business, not month-end-close.
  it("picks a manual, unscheduled blueprint as primaryBlueprintId", () => {
    const app = makeApp({
      blueprints: [
        { id: "month-end-close" },
        { id: "intake", trigger: { kind: "row-insert", table: "intake" } },
        { id: "new-business" },
      ],
      schedules: [{ id: "s1", cron: "0 6 1 * *", runs: "month-end-close" }],
    });
    const proj = workflowHubKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    // month-end-close is the schedule's target; intake is row-insert; the
    // first blueprint clearing both filters is new-business.
    expect(proj.primaryBlueprintId).toBe("new-business");
  });

  it("falls back to a manual blueprint when all manual ones are scheduled", () => {
    const app = makeApp({
      blueprints: [
        { id: "only-scheduled" },
        { id: "row", trigger: { kind: "row-insert", table: "t" } },
      ],
      schedules: [{ id: "s1", cron: "0 6 * * *", runs: "only-scheduled" }],
    });
    const proj = workflowHubKit.resolve({
      manifest: app.manifest,
      columns: [],
    }) as Record<string, unknown>;
    // No unscheduled-manual candidate → fall back to the first manual one.
    expect(proj.primaryBlueprintId).toBe("only-scheduled");
  });
});

describe("workflowHubKit.buildModel", () => {
  it("renders header + manifest footer for an empty-manifest app", () => {
    const app = makeApp({});
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = { app };
    const model = workflowHubKit.buildModel(proj, runtime);
    expect(model.header.title).toBe("Demo");
    expect(model.footer).toBeDefined();
    expect(model.kpis ?? []).toEqual([]);
  });

  it("populates KPIs from runtime.evaluatedKpis when present", () => {
    const app = makeApp({ blueprints: [{ id: "bp-1" }] });
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      evaluatedKpis: [
        { id: "k1", label: "Run rate", value: "12" },
        { id: "k2", label: "Success", value: "92%" },
      ],
    };
    const model = workflowHubKit.buildModel(proj, runtime);
    expect(model.kpis).toHaveLength(2);
    expect(model.kpis?.[0].label).toBe("Run rate");
  });

  it("renders one runnable card per blueprint card, from runtime.blueprintCards", () => {
    const app = makeApp({
      blueprints: [{ id: "bp-1" }, { id: "bp-2" }],
    });
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      blueprintCards: [
        { id: "bp-1", name: "One", description: null, variables: [], trigger: null, isPrimary: false, resolved: true },
        { id: "bp-2", name: "Two", description: null, variables: [], trigger: null, isPrimary: false, resolved: true },
      ],
      blueprintLastRuns: {
        "bp-1": {
          id: "t1",
          title: "Run",
          status: "completed",
          createdAt: 0,
          result: null,
        },
        "bp-2": null,
      },
      blueprintRunCounts: { "bp-1": 5, "bp-2": 0 },
    };
    const model = workflowHubKit.buildModel(proj, runtime);
    expect(model.secondary).toHaveLength(2);
    expect(model.secondary?.[0].id).toBe("blueprint-bp-1");
    expect(model.secondary?.[1].id).toBe("blueprint-bp-2");
  });

  it("sorts the 'Start here' primary card first regardless of manifest order", () => {
    const app = makeApp({ blueprints: [{ id: "bp-1" }, { id: "bp-2" }] });
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      blueprintCards: [
        { id: "bp-1", name: "One", description: null, variables: [], trigger: null, isPrimary: false, resolved: true },
        { id: "bp-2", name: "Two", description: null, variables: [], trigger: null, isPrimary: true, resolved: true },
      ],
    };
    const model = workflowHubKit.buildModel(proj, runtime);
    // bp-2 is primary → it leads even though bp-1 is first in the manifest.
    expect(model.secondary?.[0].id).toBe("blueprint-bp-2");
    expect(model.secondary?.[1].id).toBe("blueprint-bp-1");
  });

  it("renders no cards when blueprintCards is absent (enrichment failed)", () => {
    const app = makeApp({ blueprints: [{ id: "bp-1" }] });
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const model = workflowHubKit.buildModel(proj, { app });
    expect(model.secondary ?? []).toEqual([]);
  });

  it("emits the 1-2-3 activation steps when there are cards (CF-FEAT-6)", () => {
    const app = makeApp({ blueprints: [{ id: "bp-1" }] });
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      blueprintCards: [
        { id: "bp-1", name: "One", description: null, variables: [], trigger: null, isPrimary: true, resolved: true },
      ],
    };
    const model = workflowHubKit.buildModel(proj, runtime);
    expect(model.secondarySteps).toHaveLength(3);
    expect(model.secondarySteps?.map((s) => s.n)).toEqual([1, 2, 3]);
    // Step 3 signposts Monitor, matching the post-run toast (CF-FEAT-8).
    expect(model.secondarySteps?.[2].text).toMatch(/monitor/i);
  });

  it("omits the activation steps when there are no cards (CF-FEAT-6)", () => {
    const app = makeApp({ blueprints: [{ id: "bp-1" }] });
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const model = workflowHubKit.buildModel(proj, { app });
    expect(model.secondarySteps).toBeUndefined();
  });

  it("populates activity slot when failed tasks exist", () => {
    const app = makeApp({});
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const runtime: RuntimeState = {
      app,
      failedTasks: [
        {
          id: "t1",
          title: "Failed run",
          status: "failed",
          createdAt: 0,
          result: "error",
        },
      ],
    };
    const model = workflowHubKit.buildModel(proj, runtime);
    expect(model.activity).toBeDefined();
  });

  it("omits activity slot when no failed tasks", () => {
    const app = makeApp({});
    const proj = workflowHubKit.resolve({ manifest: app.manifest, columns: [] });
    const model = workflowHubKit.buildModel(proj, { app });
    expect(model.activity).toBeUndefined();
  });
});
